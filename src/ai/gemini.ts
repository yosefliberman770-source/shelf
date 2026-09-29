// "On this device" Google Gemini: the user's own key is kept only in this
// browser (localStorage, never in backups) and requests go straight from the
// phone to Google. Used when Shelf runs as a hosted web app without its server.
export const DEVICE_GEMINI = 'gemini-device';

const KEY = 'shelf.geminiKey';
const MODEL_CACHE = 'shelf.geminiModel';
const API = 'https://generativelanguage.googleapis.com/v1beta';

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setGeminiKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY, key.trim());
    else {
      localStorage.removeItem(KEY);
      localStorage.removeItem(MODEL_CACHE);
    }
  } catch {
    /* storage unavailable */
  }
}

interface ModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

/** Rank models so a current, general-purpose "flash" model is preferred. */
function score(name: string): number {
  const n = name.replace('models/', '');
  if (!n.startsWith('gemini')) return -1;
  if (/embedding|image|tts|audio|live|vision|thinking-exp|robotics|computer|learnlm|aqa/.test(n)) return -1;
  const version = Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  let s = version * 10;
  if (/flash/.test(n) && !/lite/.test(n)) s += 5;
  else if (/flash-lite/.test(n)) s += 2;
  else if (/pro/.test(n)) s += 1;
  if (/preview|exp/.test(n)) s -= 3;
  if (/latest$/.test(n)) s += 0.5;
  return s;
}

export async function listGeminiModels(key: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error('Google didn’t accept that key. Check you copied the whole key.');
  if (!res.ok) throw new Error(`Google returned an error (${res.status}). Try again in a minute.`);
  const data = (await res.json()) as { models?: ModelInfo[] };
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && score(m.name) >= 0)
    .map((m) => m.name.replace('models/', ''))
    .sort((a, b) => score(b) - score(a));
}

async function pickModel(key: string, preferred: string, signal?: AbortSignal): Promise<string> {
  if (preferred) return preferred;
  try {
    const cached = localStorage.getItem(MODEL_CACHE);
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  const models = await listGeminiModels(key, signal);
  if (!models.length) throw new Error('No Gemini model is available for this key.');
  try {
    localStorage.setItem(MODEL_CACHE, models[0]);
  } catch {
    /* ignore */
  }
  return models[0];
}

export interface GeminiResult {
  text: string;
  model: string;
  refused?: boolean;
  truncated?: boolean;
}

/**
 * Keep "thinking" short so it doesn't eat the answer. Flash models can skip it
 * entirely; Pro models need a small budget; Gemini 3 uses a thinking level.
 */
export function thinkingFor(model: string): Record<string, unknown> | undefined {
  const m = model.toLowerCase();
  if (/gemini-3/.test(m)) return { thinkingLevel: 'low' };
  if (/gemini-2\.5-.*flash/.test(m) || /gemini-2\.5-flash/.test(m)) return { thinkingBudget: 0 };
  if (/gemini-2\.5-pro/.test(m)) return { thinkingBudget: 128 };
  return undefined;
}

export async function geminiComplete(
  req: { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; json?: boolean; maxTokens?: number },
  preferredModel: string,
  signal?: AbortSignal,
): Promise<GeminiResult> {
  const key = getGeminiKey();
  if (!key) throw Object.assign(new Error('Add your free Gemini key in Settings → AI & privacy.'), { kind: 'unconfigured' });
  const model = await pickModel(key, preferredModel, signal);
  const call = (m: string) =>
    fetch(`${API}/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system + (req.json ? '\n\nRespond with a single valid JSON value only — no prose, no code fences.' : '') }] },
        contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: {
          // Generous room: "thinking" models spend part of this before answering.
          maxOutputTokens: Math.max(8192, (req.maxTokens ?? 2000) * 3),
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
          ...(useThinking ? { thinkingConfig: thinkingFor(m) } : {}),
        },
      }),
    });
  let useThinking = !!thinkingFor(model);
  let res = await call(model);
  if (res.status === 400 && useThinking) {
    // Older models reject thinking settings: ask again without them.
    useThinking = false;
    res = await call(model);
  }
  if (res.status === 404 && !preferredModel) {
    // The cached model was retired: pick a fresh one once.
    try {
      localStorage.removeItem(MODEL_CACHE);
    } catch {
      /* ignore */
    }
    res = await call(await pickModel(key, '', signal));
  }
  if (res.status === 429) throw new Error('You’ve reached Gemini’s free limit for now. Try again later (limits reset daily).');
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const body = await res.text();
    throw new Error(/API key|API_KEY/i.test(body) ? 'Google didn’t accept your Gemini key. Update it in Settings → AI & privacy.' : `Gemini couldn’t handle this request (${res.status}).`);
  }
  if (!res.ok) throw new Error(`Gemini error (${res.status}). Try again in a minute.`);
  const data = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const c = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || !c || c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') return { text: '', model, refused: true };
  const text = (c.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error(c.finishReason === 'MAX_TOKENS' ? 'The answer was too long and got cut off. Try a shorter question.' : 'Gemini sent back an empty answer. Try again.');
  return { text, model, truncated: c.finishReason === 'MAX_TOKENS' };
}
