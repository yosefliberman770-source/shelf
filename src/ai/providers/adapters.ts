// One adapter per wire format. Each turns Shelf's request into the provider's
// API call and back, and sorts failures into kinds the manager can act on
// (rate limit → try another provider; bad key → stop using it; …).
// Keys are passed in per call and never logged.
import { thinkingFor } from '../gemini';
import { type ModelInfo, type ProviderDef, providerDef, type Tier } from './catalog';

export interface ChatRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  json?: boolean;
  maxTokens?: number;
}

export interface Credentials {
  apiKey?: string;
  accountId?: string;
  /** Override the API base (e.g. Ollama on another machine). */
  baseUrl?: string;
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  refused?: boolean;
}

export type FailureKind = 'rate_limit' | 'quota' | 'auth' | 'model' | 'unavailable' | 'network' | 'bad_request' | 'refused' | 'not_configured';

export class ProviderFailure extends Error {
  kind: FailureKind;
  status?: number;
  /** Seconds to wait before trying this provider again, if it said. */
  retryAfter?: number;
  constructor(kind: FailureKind, message: string, status?: number, retryAfter?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const JSON_HINT = '\n\nRespond with a single valid JSON value only — no prose, no code fences.';

/** Sort an HTTP error into a failure kind, reading the provider's message where it helps. */
export function classify(status: number, body: string, headers?: Headers): ProviderFailure {
  const text = body.toLowerCase();
  const ra = Number(headers?.get('retry-after'));
  const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  const short = body.replace(/\s+/g, ' ').slice(0, 200);
  if (/quota|insufficient|credit|billing|daily limit|per day|exceeded your current|limit reached|out of free/.test(text) && (status === 429 || status === 402 || status === 403 || status === 400)) return new ProviderFailure('quota', 'Free allowance used up for now.', status, retryAfter);
  if (status === 429) return new ProviderFailure('rate_limit', 'Rate limit reached.', status, retryAfter);
  if (status === 402) return new ProviderFailure('quota', 'No credits left.', status, retryAfter);
  if (status === 401 || status === 403) return new ProviderFailure('auth', 'The API key was rejected.', status);
  if (status === 404 || /model.*(not found|does not exist|decommission|unknown)|no endpoints found/.test(text)) return new ProviderFailure('model', `Model unavailable (${short}).`, status);
  if (status >= 500 || status === 408) return new ProviderFailure('unavailable', 'The provider is temporarily unavailable.', status, retryAfter);
  if (/context length|too many tokens|maximum context|too long/.test(text)) return new ProviderFailure('bad_request', 'The request was too long for this model.', status);
  return new ProviderFailure('bad_request', `Request rejected (${status}): ${short}`, status);
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ProviderFailure('network', 'Couldn’t reach the provider (network or browser blocked the request).');
  }
}

function baseFor(def: ProviderDef, creds: Credentials): string {
  let base = creds.baseUrl?.trim() || def.baseUrl;
  if (def.needsAccountId) {
    if (!creds.accountId) throw new ProviderFailure('not_configured', 'Cloudflare needs your account id.');
    base = base.replace('{account}', encodeURIComponent(creds.accountId));
  }
  return base.replace(/\/+$/, '');
}

// ── OpenAI-compatible (Groq, Mistral, OpenRouter, Cerebras, Cloudflare, NVIDIA, Hugging Face, Ollama) ──

/** Providers known to accept response_format: json_object. Others get a prompt instruction instead. */
const JSON_MODE = new Set(['groq', 'mistral', 'openrouter', 'cerebras', 'ollama']);

async function openaiChat(def: ProviderDef, model: string, req: ChatRequest, creds: Credentials, signal?: AbortSignal): Promise<ChatResult> {
  const base = baseFor(def, creds);
  const headers: Record<string, string> = {};
  if (creds.apiKey) headers.authorization = `Bearer ${creds.apiKey}`;
  if (def.id === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/yosefliberman770-source/shelf'; headers['X-Title'] = 'Shelf'; }
  const body = (jsonMode: boolean) => ({
    model,
    max_tokens: req.maxTokens ?? 2000,
    messages: [{ role: 'system', content: req.system + (req.json ? JSON_HINT : '') }, ...req.messages],
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    // GPT-OSS "thinks" before answering; keep that short so the answer fits (Groq and Cerebras accept this).
    ...(/gpt-oss/.test(model) && (def.id === 'groq' || def.id === 'cerebras') ? { reasoning_effort: 'low' } : {}),
  });
  let res = await post(`${base}/chat/completions`, headers, body(!!req.json && JSON_MODE.has(def.id)), signal);
  if (res.status === 400 && req.json && JSON_MODE.has(def.id)) {
    // Some models don't support JSON mode; the prompt already asks for JSON.
    const t = await res.clone().text();
    if (/response_format|json/i.test(t)) res = await post(`${base}/chat/completions`, headers, body(false), signal);
  }
  if (!res.ok) throw classify(res.status, await res.text(), res.headers);
  const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) return { text: '', model: data.model ?? model, refused: true };
  const text = (msg?.content ?? '').trim();
  if (!text) throw new ProviderFailure('unavailable', data.choices?.[0]?.finish_reason === 'length' ? 'The model ran out of room before answering (it spent it thinking). Try again or pick another model.' : 'The provider returned an empty answer.');
  return { text, model: data.model ?? model, inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens };
}

// ── Google Gemini ──────────────────────────────────────────────────────

async function geminiChat(def: ProviderDef, model: string, req: ChatRequest, creds: Credentials, signal?: AbortSignal): Promise<ChatResult> {
  if (!creds.apiKey) throw new ProviderFailure('not_configured', 'No Gemini key.');
  const base = baseFor(def, creds);
  const payload = (thinking: boolean) => ({
    systemInstruction: { parts: [{ text: req.system + (req.json ? JSON_HINT : '') }] },
    contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: {
      maxOutputTokens: Math.max(8192, (req.maxTokens ?? 2000) * 3),
      ...(req.json ? { responseMimeType: 'application/json' } : {}),
      ...(thinking && thinkingFor(model) ? { thinkingConfig: thinkingFor(model) } : {}),
    },
  });
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
  let res = await post(url, { 'x-goog-api-key': creds.apiKey }, payload(true), signal);
  if (res.status === 400 && thinkingFor(model)) res = await post(url, { 'x-goog-api-key': creds.apiKey }, payload(false), signal);
  if (!res.ok) {
    const t = await res.text();
    // Google reports a bad key as 400 "API key not valid".
    if (res.status === 400 && /api key/i.test(t)) throw new ProviderFailure('auth', 'The API key was rejected.', 400);
    throw classify(res.status, t, res.headers);
  }
  const data = (await res.json()) as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  const c = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || !c || c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') return { text: '', model, refused: true };
  const text = (c.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new ProviderFailure('unavailable', c.finishReason === 'MAX_TOKENS' ? 'The answer was cut off.' : 'Empty answer.');
  return { text, model, inputTokens: data.usageMetadata?.promptTokenCount, outputTokens: data.usageMetadata?.candidatesTokenCount };
}

// ── Cohere (v2 chat) ───────────────────────────────────────────────────

async function cohereChat(def: ProviderDef, model: string, req: ChatRequest, creds: Credentials, signal?: AbortSignal): Promise<ChatResult> {
  if (!creds.apiKey) throw new ProviderFailure('not_configured', 'No Cohere key.');
  const res = await post(`${baseFor(def, creds)}/chat`, { authorization: `Bearer ${creds.apiKey}` }, {
    model,
    max_tokens: req.maxTokens ?? 2000,
    messages: [{ role: 'system', content: req.system + (req.json ? JSON_HINT : '') }, ...req.messages],
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
  }, signal);
  if (!res.ok) throw classify(res.status, await res.text(), res.headers);
  const data = (await res.json()) as { message?: { content?: { type: string; text?: string }[] }; usage?: { tokens?: { input_tokens?: number; output_tokens?: number } } };
  const text = (data.message?.content ?? []).map((c) => c.text ?? '').join('').trim();
  if (!text) throw new ProviderFailure('unavailable', 'Empty answer.');
  return { text, model, inputTokens: data.usage?.tokens?.input_tokens, outputTokens: data.usage?.tokens?.output_tokens };
}

/** Call one provider/model directly from this device. */
export function chat(providerId: string, model: string, req: ChatRequest, creds: Credentials, signal?: AbortSignal): Promise<ChatResult> {
  const def = providerDef(providerId);
  if (!def) throw new ProviderFailure('not_configured', `Unknown provider ${providerId}`);
  if (!creds.apiKey && !def.keyOptional) throw new ProviderFailure('not_configured', `No API key for ${def.name}.`);
  if (def.api === 'gemini') return geminiChat(def, model, req, creds, signal);
  if (def.api === 'cohere') return cohereChat(def, model, req, creds, signal);
  return openaiChat(def, model, req, creds, signal);
}

// ── Model discovery ────────────────────────────────────────────────────

/** Ask the provider which models this key can use. Tiers are only set where the provider says so. */
export async function listModels(providerId: string, creds: Credentials, signal?: AbortSignal): Promise<ModelInfo[]> {
  const def = providerDef(providerId);
  if (!def) return [];
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const r = await fetch(url, { headers, signal }).catch(() => { throw new ProviderFailure('network', 'Couldn’t reach the provider.'); });
    if (!r.ok) throw classify(r.status, await r.text(), r.headers);
    return r.json();
  };
  const known = (id: string) => def.models.find((m) => m.id === id);
  const merge = (id: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({ quality: 3, speed: 3, tier: def.tier === 'local' ? 'local' : def.tier === 'unknown' ? 'unknown' : def.tier, ...known(id), ...extra, id });

  if (def.id === 'gemini') {
    const j = (await get(`${baseFor(def, creds)}/models?pageSize=200`, { 'x-goog-api-key': creds.apiKey ?? '' })) as { models?: { name: string; displayName?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }[] };
    return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini|gemma/.test(m.name) && !/embedding|image|tts|audio|live|vision/.test(m.name))
      .map((m) => merge(m.name.replace('models/', ''), { label: m.displayName, context: m.inputTokenLimit }));
  }
  if (def.id === 'cohere') {
    const j = (await get('https://api.cohere.com/v1/models?endpoint=chat&page_size=100', { authorization: `Bearer ${creds.apiKey}` })) as { models?: { name: string; context_length?: number }[] };
    return (j.models ?? []).map((m) => merge(m.name, { context: m.context_length }));
  }
  if (def.id === 'ollama') {
    const base = (creds.baseUrl?.trim() || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '');
    const j = (await get(`${base}/api/tags`)) as { models?: { name: string }[] };
    return (j.models ?? []).map((m) => merge(m.name, { tier: 'local' }));
  }
  if (def.id === 'cloudflare') return def.models; // listed via the server
  const headers: Record<string, string> = creds.apiKey ? { authorization: `Bearer ${creds.apiKey}` } : {};
  const j = (await get(`${baseFor(def, creds)}/models`, headers)) as { data?: { id: string; name?: string; context_length?: number; context_window?: number; pricing?: { prompt?: string; completion?: string } }[] };
  return (j.data ?? []).map((m) => {
    let tier: Tier | undefined;
    let pin: number | undefined;
    let pout: number | undefined;
    if (def.id === 'openrouter' && m.pricing) {
      pin = Number(m.pricing.prompt) * 1e6;
      pout = Number(m.pricing.completion) * 1e6;
      // OpenRouter publishes prices: a model is free only if both are exactly zero.
      tier = pin === 0 && pout === 0 ? 'free' : 'paid';
    }
    return merge(m.id, { label: m.name, context: m.context_length ?? m.context_window, ...(tier ? { tier } : {}), pricePerMTokIn: pin, pricePerMTokOut: pout });
  });
}
