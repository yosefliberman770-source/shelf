import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider, PROVIDERS } from './providers.ts';

afterEach(() => vi.unstubAllGlobals());

describe('provider abstraction', () => {
  it('exposes the same interface for every provider', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['anthropic', 'openai', 'gemini', 'compatible', 'cloudflare', 'nvidia']);
    for (const p of PROVIDERS) expect(typeof p.complete).toBe('function');
  });

  it('refuses to run without credentials', async () => {
    const req = { model: 'm', system: 's', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 100 };
    await expect(getProvider('anthropic')!.complete(req, {})).rejects.toThrow(/not configured/);
    await expect(getProvider('openai')!.complete(req, {})).rejects.toThrow(/not configured/);
    await expect(getProvider('compatible')!.complete(req, {})).rejects.toThrow(/base URL/);
  });

  it('calls an OpenAI-compatible server with the system prompt first', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ model: 'local', choices: [{ message: { content: ' hello ' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await getProvider('compatible')!.complete(
      { model: 'llama', system: 'SYS', messages: [{ role: 'user', content: 'hi' }], maxTokens: 50, json: true },
      { baseUrl: 'http://localhost:11434/v1/' },
    );
    expect(res).toEqual({ text: 'hello', model: 'local' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('SYS');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('maps Gemini safety blocks to a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 })));
    const res = await getProvider('gemini')!.complete({ model: 'g', system: 's', messages: [{ role: 'user', content: 'x' }], maxTokens: 10 }, { apiKey: 'k' });
    expect(res.refused).toBe(true);
  });
});
