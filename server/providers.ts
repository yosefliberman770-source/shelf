// Provider-independent AI layer. Every provider implements the same small
// interface, so models can be swapped without touching the application.
// API keys live only on the server (env vars or server/.data/ai-config.json)
// and are never sent to the browser.
import Anthropic from '@anthropic-ai/sdk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Ask for a JSON-only answer (parsed by the client). */
  json?: boolean;
}

export interface CompletionResult {
  text: string;
  model: string;
  refused?: boolean;
}

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  /** Whether a base URL is required (OpenAI-compatible / local models). */
  needsBaseUrl?: boolean;
  keyOptional?: boolean;
  complete(req: CompletionRequest, creds: ProviderCredentials): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const JSON_HINT = '\n\nRespond with a single valid JSON value only — no prose, no code fences.';

// ── Anthropic (official SDK) ───────────────────────────────────────────────

const anthropic: AIProvider = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
  defaultModel: 'claude-opus-5',
  async complete(req, creds) {
    if (!creds.apiKey) throw new ProviderError('Anthropic API key is not configured on the server.', 400);
    const client = new Anthropic({ apiKey: creds.apiKey, ...(creds.baseUrl ? { baseURL: creds.baseUrl } : {}) });
    const usesFallbacks = req.model === 'claude-opus-5' || req.model === 'claude-fable-5-1';
    try {
      const response = await client.beta.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system + (req.json ? JSON_HINT : ''),
        messages: req.messages,
        // Reading-assistant answers are short: keep latency and cost modest.
        output_config: { effort: 'medium' },
        // Server-side refusal fallback: a declined request is retried on a
        // suitable model inside the same call.
        ...(usesFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
      if (response.stop_reason === 'refusal') return { text: '', model: response.model, refused: true };
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      return { text, model: response.model };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new ProviderError('Anthropic rejected the API key.', 401);
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError('Anthropic rate limit reached — try again shortly.', 429);
      if (err instanceof Anthropic.BadRequestError) throw new ProviderError(`Anthropic rejected the request: ${err.message}`, 400);
      if (err instanceof Anthropic.APIError) throw new ProviderError(`Anthropic API error (${err.status ?? 'network'}): ${err.message}`);
      throw err;
    }
  },
};

// ── OpenAI and OpenAI-compatible (incl. local servers such as Ollama/LM Studio) ──

async function openAIChat(req: CompletionRequest, creds: ProviderCredentials, base: string, label: string): Promise<CompletionResult> {
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(creds.apiKey ? { authorization: `Bearer ${creds.apiKey}` } : {}) },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [{ role: 'system', content: req.system + (req.json ? JSON_HINT : '') }, ...req.messages],
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new ProviderError(`${label} error ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status === 401 ? 401 : 502);
  const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string; refusal?: string } }[] };
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) return { text: '', model: data.model ?? req.model, refused: true };
  return { text: (msg?.content ?? '').trim(), model: data.model ?? req.model };
}

const openai: AIProvider = {
  id: 'openai',
  name: 'OpenAI',
  models: ['gpt-5', 'gpt-5-mini'],
  defaultModel: 'gpt-5-mini',
  async complete(req, creds) {
    if (!creds.apiKey) throw new ProviderError('OpenAI API key is not configured on the server.', 400);
    return openAIChat(req, creds, creds.baseUrl ?? 'https://api.openai.com/v1', 'OpenAI');
  },
};

const compatible: AIProvider = {
  id: 'compatible',
  name: 'OpenAI-compatible / local model',
  models: [],
  defaultModel: '',
  needsBaseUrl: true,
  keyOptional: true,
  async complete(req, creds) {
    if (!creds.baseUrl) throw new ProviderError('Set a base URL for the OpenAI-compatible provider.', 400);
    return openAIChat(req, creds, creds.baseUrl, 'Model server');
  },
};

// ── Google Gemini ──────────────────────────────────────────────────────────

const gemini: AIProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  defaultModel: 'gemini-2.5-flash',
  async complete(req, creds) {
    if (!creds.apiKey) throw new ProviderError('Gemini API key is not configured on the server.', 400);
    const base = creds.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const res = await fetch(`${base}/models/${encodeURIComponent(req.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': creds.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system + (req.json ? JSON_HINT : '') }] },
        contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: req.maxTokens, ...(req.json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    if (!res.ok) throw new ProviderError(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status === 401 || res.status === 403 ? 401 : 502);
    const data = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] };
    const c = data.candidates?.[0];
    if (!c || c.finishReason === 'SAFETY') return { text: '', model: req.model, refused: true };
    return { text: (c.content?.parts ?? []).map((p) => p.text ?? '').join('').trim(), model: req.model };
  },
};

export const PROVIDERS: AIProvider[] = [anthropic, openai, gemini, compatible];

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
