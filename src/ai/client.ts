// Browser-side AI client. It talks only to Shelf's own server, which holds
// the API keys. When AI is disabled or unavailable, callers get a clear error
// and the rest of the app keeps working.
import { readSettings } from '../db/actions';
import { DEVICE_GEMINI } from './gemini';
import { AIExhausted, hasUsableProvider, runAI } from './manager';
import { ProviderFailure } from './providers/adapters';
import type { AITask } from './providers/catalog';

/** Settings value meaning "let the AI manager choose". */
export const AUTO = 'auto';

export interface ProviderStatus {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  configured: boolean;
  hasKey: boolean;
  baseUrl?: string;
  fromEnv: boolean;
  needsBaseUrl: boolean;
  keyOptional: boolean;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  json?: boolean;
  maxTokens?: number;
  /** What kind of work this is — used to pick a suitable model. */
  task?: AITask;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  refused?: boolean;
  cached?: boolean;
  /** Set when the first choice was busy and another provider answered. */
  switchedFrom?: string;
}

const NO_SERVER = 'AI features need the Shelf server, which isn’t running here (for example on the phone/web-hosted copy). Everything else works normally.';

export class AIError extends Error {
  kind: 'disabled' | 'unconfigured' | 'network' | 'provider' | 'refused' | 'parse' | 'exhausted';
  constructor(kind: AIError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

export async function fetchAIStatus(): Promise<{ providers: ProviderStatus[]; keyConfigAllowed: boolean }> {
  const res = await fetch('/api/ai/status').catch(() => undefined);
  if (!res?.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new AIError('network', NO_SERVER);
  return res.json();
}

export async function saveProviderConfig(body: { provider: string; apiKey?: string | null; baseUrl?: string | null; models?: string[] }) {
  const res = await fetch('/api/ai/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError('provider', data.error ?? 'Could not save configuration.');
  return data as { providers: ProviderStatus[] };
}

export async function complete(req: AIRequest, signal?: AbortSignal): Promise<AIResponse> {
  const s = await readSettings();
  if (!s.ai.enabled) throw new AIError('disabled', 'AI features are turned off. You can enable them in Settings → AI.');
  // The multi-provider manager (free-first, automatic fallback). The original
  // single-provider paths below stay for the Shelf server's own providers.
  if (s.ai.provider === AUTO || s.ai.provider === DEVICE_GEMINI || (!s.ai.provider && hasUsableProvider())) {
    try {
      const r = await runAI(req.task ?? 'general', { system: req.system, messages: req.messages, json: req.json, maxTokens: req.maxTokens }, signal);
      if (r.refused) throw new AIError('refused', 'The AI model declined this request.');
      return { text: r.text, model: r.model, provider: r.provider, cached: r.cached, switchedFrom: r.switchedFrom };
    } catch (e) {
      if (e instanceof AIError || (e as Error).name === 'AbortError') throw e;
      if (e instanceof AIExhausted) throw new AIError(hasUsableProvider() ? 'exhausted' : 'unconfigured', e.message);
      if (e instanceof ProviderFailure && e.kind === 'refused') throw new AIError('refused', 'The AI model declined this request.');
      throw new AIError('provider', (e as Error).message);
    }
  }
  if (!s.ai.provider) throw new AIError('unconfigured', 'Choose an AI provider in Settings → AI.');
  let res: Response;
  try {
    res = await fetch('/api/ai/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: s.ai.provider, model: s.ai.model, system: req.system, messages: req.messages, json: req.json, maxTokens: req.maxTokens ?? 2000 }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError('network', 'Could not reach the Shelf server. Your library and reading tools still work offline.');
  }
  if (res.status === 404 || res.status === 405) throw new AIError('network', NO_SERVER);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(res.status === 400 && /configured|base URL/i.test(data.error ?? '') ? 'unconfigured' : 'provider', data.error ?? `AI request failed (${res.status}).`);
  if (data.refused) throw new AIError('refused', 'The AI model declined this request.');
  return data as AIResponse;
}

/** Extract a JSON value from a model reply (tolerates code fences and surrounding prose). */
export function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const endObj = cleaned.lastIndexOf('}');
    const endArr = cleaned.lastIndexOf(']');
    const end = Math.max(endObj, endArr);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    const fixed = repairJSON(cleaned);
    if (fixed !== undefined) return fixed as T;
    throw new AIError('parse', 'The AI reply could not be read as structured data. Try again.');
  }
}

export async function completeJSON<T>(req: AIRequest, signal?: AbortSignal, fallback?: (text: string) => T): Promise<{ data: T; response: AIResponse }> {
  const response = await complete({ ...req, json: true }, signal);
  try {
    return { data: parseJSON<T>(response.text), response };
  } catch (e) {
    // A reply we can't structure is still worth showing when the caller can use plain text.
    if (fallback) return { data: fallback(response.text), response };
    throw e;
  }
}

/** Read one string field out of JSON-ish text (e.g. a cut-off reply). */
export function jsonField(text: string, field: string): string | undefined {
  const m = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(text);
  if (!m) return undefined;
  try { return JSON.parse(`"${m[1]}"`); } catch { return m[1].replace(/\\n/g, '\n'); }
}

/** Close a JSON reply that was cut off mid-way (unfinished strings, arrays, objects). */
export function repairJSON(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start < 0) return undefined;
  const src = text.slice(start);
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
    if (!inStr && (ch === ',' || ch === '{' || ch === '[' || ch === '}' || ch === ']' || ch === '"')) lastSafe = i;
  }
  const attempts = [
    src + (inStr ? '"' : '') + [...stack].reverse().join(''),
  ];
  // Otherwise cut back to the last complete value and close from there.
  let cut = src.slice(0, lastSafe + 1).replace(/[,:]\s*$/, '');
  for (let k = 0; k < 6; k++) {
    const st: string[] = [];
    let s2 = false, e2 = false;
    for (const ch of cut) {
      if (s2) { if (e2) e2 = false; else if (ch === '\\') e2 = true; else if (ch === '"') s2 = false; continue; }
      if (ch === '"') s2 = true; else if (ch === '{' || ch === '[') st.push(ch === '{' ? '}' : ']'); else if (ch === '}' || ch === ']') st.pop();
    }
    attempts.push(cut.replace(/,\s*$/, '') + [...st].reverse().join(''));
    const j = Math.max(cut.lastIndexOf(','), 0);
    if (!j) break;
    cut = cut.slice(0, j);
  }
  for (const a of attempts) {
    try { return JSON.parse(a); } catch { /* try the next */ }
  }
  return undefined;
}
