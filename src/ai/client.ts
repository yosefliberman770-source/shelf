// Browser-side AI client. It talks only to Shelf's own server, which holds
// the API keys. When AI is disabled or unavailable, callers get a clear error
// and the rest of the app keeps working.
import { getSettings } from '../db/actions';

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
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  refused?: boolean;
}

export class AIError extends Error {
  kind: 'disabled' | 'unconfigured' | 'network' | 'provider' | 'refused' | 'parse';
  constructor(kind: AIError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

export async function fetchAIStatus(): Promise<{ providers: ProviderStatus[]; keyConfigAllowed: boolean }> {
  const res = await fetch('/api/ai/status');
  if (!res.ok) throw new AIError('network', 'The Shelf server is not reachable.');
  return res.json();
}

export async function saveProviderConfig(body: { provider: string; apiKey?: string | null; baseUrl?: string | null; models?: string[] }) {
  const res = await fetch('/api/ai/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError('provider', data.error ?? 'Could not save configuration.');
  return data as { providers: ProviderStatus[] };
}

export async function complete(req: AIRequest, signal?: AbortSignal): Promise<AIResponse> {
  const s = await getSettings();
  if (!s.ai.enabled) throw new AIError('disabled', 'AI features are turned off. You can enable them in Settings → AI.');
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
    throw new AIError('parse', 'The AI reply could not be read as structured data. Try again.');
  }
}

export async function completeJSON<T>(req: AIRequest, signal?: AbortSignal): Promise<{ data: T; response: AIResponse }> {
  const response = await complete({ ...req, json: true }, signal);
  return { data: parseJSON<T>(response.text), response };
}
