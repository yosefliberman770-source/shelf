import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { AIExhausted, type AIEvent, clearAICache, defaultConfig, getKey, loadConfig, onAIEvent, providerHealth, route, runAI, saveConfig, setKey, testProvider } from './manager';
import { chat, classify, listModels } from './providers/adapters';

// A tiny in-memory localStorage for the node test environment.
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });

type Handler = (url: string, body: Record<string, unknown>, headers: Record<string, string>) => Response;
let calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
function mockFetch(h: Handler) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), body, headers });
    return h(String(url), body, headers);
  }));
}
const ok = (content: string) => new Response(JSON.stringify({ model: 'm', choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }), { status: 200 });
const geminiOk = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 3 } }), { status: 200 });
const status = (code: number, body = '{"error":"x"}', headers: Record<string, string> = {}) => new Response(body, { status: code, headers });
const noServer = (url: string) => url.includes('/api/ai/status') ? status(404, 'nope') : undefined;

function setup(providers: Parameters<typeof saveConfig>[0]['providers'], extra: Partial<Parameters<typeof saveConfig>[0]> = {}) {
  const c = { ...defaultConfig(), providers, ...extra };
  saveConfig(c);
  return c;
}

beforeEach(async () => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  mem.clear();
  calls = [];
  await db.aiUsage.clear(); await db.aiLog.clear(); await clearAICache();
});
afterEach(() => vi.unstubAllGlobals());

const REQ = { system: 'Be brief.', messages: [{ role: 'user' as const, content: 'What does patrician mean?' }] };

describe('AI manager', () => {
  it('uses the first free provider in your order', async () => {
    setKey('gemini', 'g-key'); setKey('groq', 'q-key');
    setup({ gemini: { enabled: true, model: 'gemini-2.5-flash' }, groq: { enabled: true, model: 'llama-3.1-8b-instant' } });
    mockFetch((url) => noServer(url) ?? (url.includes('generativelanguage') ? geminiOk('A noble.') : ok('groq')));
    const r = await runAI('definition', REQ);
    expect(r.provider).toBe('gemini');
    expect(r.text).toBe('A noble.');
    const g = calls.find((c) => c.url.includes('generativelanguage'))!;
    expect(g.headers['x-goog-api-key']).toBe('g-key');
  });

  it('switches provider on a rate limit, rests the limited one, and says so', async () => {
    setKey('gemini', 'g'); setKey('groq', 'q');
    setup({ gemini: { enabled: true, model: 'gemini-2.5-flash' }, groq: { enabled: true, model: 'llama-3.1-8b-instant' } });
    const events: AIEvent[] = [];
    const off = onAIEvent((e) => events.push(e));
    mockFetch((url) => noServer(url) ?? (url.includes('generativelanguage') ? status(429, '{"error":{"message":"Resource exhausted"}}', { 'retry-after': '30' }) : ok('from groq')));
    const r = await runAI('general', REQ);
    expect(r.provider).toBe('groq');
    expect(r.switchedFrom).toBe('Google Gemini');
    expect(events.some((e) => e.type === 'switched' && e.to === 'Groq')).toBe(true);
    expect(providerHealth('gemini')).toBe('limited');
    // The rested provider is not called again right away.
    calls = [];
    await runAI('general', { ...REQ, messages: [{ role: 'user', content: 'another question' }] });
    expect(calls.some((c) => c.url.includes('generativelanguage'))).toBe(false);
    off();
  });

  it('never uses paid models when paid AI is off, and stops with a clear message when free capacity is gone', async () => {
    setKey('openrouter', 'o'); setKey('groq', 'q');
    setup({ openrouter: { enabled: true, model: 'anthropic/claude-opus', models: [{ id: 'anthropic/claude-opus', tier: 'paid', quality: 5, speed: 2, pricePerMTokIn: 15, pricePerMTokOut: 75 }] }, groq: { enabled: true, model: 'llama-3.1-8b-instant' } });
    const { candidates, skipped } = await route('general');
    expect(candidates.map((c) => c.provider)).toEqual(['groq']);
    expect(skipped.join()).toMatch(/paid/);
    mockFetch((url) => noServer(url) ?? status(429, '{"error":"daily limit reached"}'));
    await expect(runAI('general', REQ)).rejects.toBeInstanceOf(AIExhausted);
    expect(calls.some((c) => c.url.includes('openrouter'))).toBe(false);
  });

  it('allows a paid model only when you turned paid AI on and the monthly limit has room', async () => {
    setKey('openrouter', 'o');
    const models = [{ id: 'paid/model', tier: 'paid' as const, quality: 5, speed: 2, pricePerMTokIn: 1, pricePerMTokOut: 1 }];
    setup({ openrouter: { enabled: true, model: 'paid/model', models } }, { allowPaid: true, monthlyLimit: 0 });
    expect((await route('general')).candidates).toHaveLength(0); // $0 limit
    setup({ openrouter: { enabled: true, model: 'paid/model', models } }, { allowPaid: true, monthlyLimit: 5 });
    expect((await route('general')).candidates.map((c) => c.model)).toEqual(['paid/model']);
  });

  it('returns a cached answer for the same question instead of calling again', async () => {
    setKey('groq', 'q');
    setup({ groq: { enabled: true, model: 'llama-3.1-8b-instant' } });
    mockFetch((url) => noServer(url) ?? ok('A member of the Roman elite.'));
    await runAI('definition', REQ);
    const n = calls.filter((c) => c.url.includes('groq')).length;
    const again = await runAI('definition', REQ);
    expect(again.cached).toBe(true);
    expect(calls.filter((c) => c.url.includes('groq')).length).toBe(n);
    // Different context → not served from the cache.
    await runAI('definition', { ...REQ, system: 'Different book context' });
    expect(calls.filter((c) => c.url.includes('groq')).length).toBe(n + 1);
  });

  it('treats a rejected key as unusable and moves on', async () => {
    setKey('mistral', 'bad'); setKey('groq', 'q');
    setup({ mistral: { enabled: true, model: 'mistral-small-latest' }, groq: { enabled: true, model: 'llama-3.1-8b-instant' } }, { order: ['mistral', 'groq', 'gemini', 'cerebras', 'openrouter', 'cloudflare', 'nvidia', 'huggingface', 'cohere', 'ollama'] });
    mockFetch((url) => noServer(url) ?? (url.includes('mistral') ? status(401, '{"message":"Unauthorized"}') : ok('ok')));
    const r = await runAI('general', REQ);
    expect(r.provider).toBe('groq');
    expect(providerHealth('mistral')).toBe('unavailable');
  });

  it('with fallback off, stops at the first failure', async () => {
    setKey('gemini', 'g'); setKey('groq', 'q');
    setup({ gemini: { enabled: true, model: 'gemini-2.5-flash' }, groq: { enabled: true, model: 'llama-3.1-8b-instant' } }, { fallback: false });
    mockFetch((url) => noServer(url) ?? (url.includes('generativelanguage') ? status(503) : ok('groq')));
    await expect(runAI('general', REQ)).rejects.toBeInstanceOf(AIExhausted);
    expect(calls.some((c) => c.url.includes('groq'))).toBe(false);
  });

  it('manual mode and task pins pick the provider you chose', async () => {
    setKey('gemini', 'g'); setKey('cerebras', 'c');
    setup({ gemini: { enabled: true, model: 'gemini-2.5-flash' }, cerebras: { enabled: true, model: 'gpt-oss-120b' } }, { tasks: { synthesis: { provider: 'cerebras', model: 'gpt-oss-120b' } } });
    expect((await route('synthesis')).candidates[0].provider).toBe('cerebras');
    setup({ gemini: { enabled: true, model: 'gemini-2.5-flash' }, cerebras: { enabled: true, model: 'gpt-oss-120b' } }, { mode: 'manual', manual: { provider: 'cerebras', model: 'gpt-oss-120b' }, fallback: false });
    expect((await route('general')).candidates.map((c) => c.provider)).toEqual(['cerebras']);
  });

  it('removing a key stops the provider from being used, and the old Gemini key carries over', async () => {
    mem.set('shelf.geminiKey', 'legacy-key');
    const c = loadConfig();
    expect(getKey('gemini')).toBe('legacy-key');
    expect(c.providers.gemini?.enabled).toBe(true);
    setKey('gemini', null);
    expect(getKey('gemini')).toBe('');
    expect((await route('general')).candidates).toHaveLength(0);
  });

  it('settings survive a restart (stored, then reloaded)', () => {
    setup({ groq: { enabled: true, model: 'openai/gpt-oss-120b' } }, { mode: 'fastest', allowPaid: false });
    const again = loadConfig();
    expect(again.mode).toBe('fastest');
    expect(again.providers.groq?.model).toBe('openai/gpt-oss-120b');
  });

  it('tests a connection with a tiny request and reports the result', async () => {
    setKey('groq', 'q');
    setup({ groq: { enabled: true, model: 'llama-3.1-8b-instant' } });
    mockFetch(() => ok('ok'));
    const r = await testProvider('groq');
    expect(r.ok).toBe(true);
    expect(calls[0].body.max_tokens).toBe(300);
    mockFetch(() => status(401));
    expect((await testProvider('groq')).message).toMatch(/didn’t accept the API key/);
  });
});

describe('provider adapters', () => {
  it('speaks each provider’s format', async () => {
    mockFetch((url) => url.includes('cohere') ? new Response(JSON.stringify({ message: { content: [{ type: 'text', text: 'hi' }] }, usage: { tokens: { input_tokens: 3, output_tokens: 1 } } }), { status: 200 }) : ok('hi'));
    for (const id of ['groq', 'mistral', 'openrouter', 'cerebras', 'huggingface']) await chat(id, 'm', { ...REQ, json: true }, { apiKey: 'k' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.groq.com/openai/v1/chat/completions', 'https://api.mistral.ai/v1/chat/completions', 'https://openrouter.ai/api/v1/chat/completions',
      'https://api.cerebras.ai/v1/chat/completions', 'https://router.huggingface.co/v1/chat/completions',
    ]);
    expect(calls[0].headers.authorization).toBe('Bearer k');
    expect(calls[0].body.response_format).toEqual({ type: 'json_object' });
    expect(calls[4].body.response_format).toBeUndefined(); // HF: prompt instruction instead
    const co = await chat('cohere', 'command-r7b-12-2024', REQ, { apiKey: 'k' });
    expect(co).toMatchObject({ text: 'hi', inputTokens: 3, outputTokens: 1 });
    expect(calls[5].url).toBe('https://api.cohere.com/v2/chat');
    await chat('ollama', 'llama3.2', REQ, {});
    expect(calls[6].url).toBe('http://localhost:11434/v1/chat/completions');
    expect(calls[6].headers.authorization).toBeUndefined();
  });

  it('refuses to call a provider without its key', async () => {
    expect(() => chat('groq', 'm', REQ, {})).toThrow(/No API key/);
  });

  it('recognises limits, quotas, bad keys and outages', () => {
    expect(classify(429, 'Too many requests').kind).toBe('rate_limit');
    expect(classify(429, '{"error":"You exceeded your current quota"}').kind).toBe('quota');
    expect(classify(402, 'Payment required').kind).toBe('quota');
    expect(classify(401, 'bad key').kind).toBe('auth');
    expect(classify(404, 'model not found').kind).toBe('model');
    expect(classify(503, 'overloaded').kind).toBe('unavailable');
  });

  it('reads free/paid status from OpenRouter’s published prices', async () => {
    mockFetch(() => new Response(JSON.stringify({ data: [{ id: 'x/free-one:free', pricing: { prompt: '0', completion: '0' } }, { id: 'y/paid', pricing: { prompt: '0.000003', completion: '0.000015' } }] }), { status: 200 }));
    const models = await listModels('openrouter', { apiKey: 'k' });
    expect(models.map((m) => [m.id, m.tier])).toEqual([['x/free-one:free', 'free'], ['y/paid', 'paid']]);
    expect(models[1].pricePerMTokIn).toBeCloseTo(3);
  });
});

describe('retired models', () => {
  it('picks a model the key actually has', async () => {
    const { pickAvailable } = await import('./manager');
    const m = (id: string) => ({ id, tier: 'free' as const, quality: 3, speed: 3 });
    expect(pickAvailable('gemini', [m('gemini-3-flash-preview'), m('gemini-3-flash'), m('gemini-3-flash-lite')])).toBe('gemini-3-flash');
    expect(pickAvailable('gemini', [m('gemini-9-pro'), m('gemini-2.5-flash')])).toBe('gemini-2.5-flash');
    expect(pickAvailable('groq', [m('some-model')])).toBe('some-model');
  });
});

describe('retired default model', () => {
  it('Test connection finds a model the key has and switches to it', async () => {
    setKey('gemini', 'g');
    setup({ gemini: { enabled: true } });
    mockFetch((url) => {
      if (url.includes('/models?')) return new Response(JSON.stringify({ models: [
        { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-flash-lite', supportedGenerationMethods: ['generateContent'] },
      ] }), { status: 200 });
      if (url.includes('gemini-2.5')) return status(404, '{"error":{"code":404,"message":"models/gemini-2.5-flash is not found for API version v1beta","status":"NOT_FOUND"}}');
      return geminiOk('ok');
    });
    const r = await testProvider('gemini');
    expect(r.ok).toBe(true);
    expect(loadConfig().providers.gemini?.model).toBe('gemini-3-flash');
    expect(calls.some((c) => c.url.includes('gemini-3-flash:generateContent'))).toBe(true);
  });
});
