// Shelf server: a small AI proxy (so API keys never reach the browser) plus a
// static file server for the built app. The reading engine runs entirely in
// the browser; the app keeps working when this server or the AI is down.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialsFor, keyConfigAllowed, providerStatus, saveCredentials } from './config.ts';
import { allowQueries, HistoricalError, placeGet, placeSearch, type SearchQuery, whgConfigured } from './historical.ts';
import { type ChatMessage, getProvider, ProviderError } from './providers.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', 'dist');
const PORT = Number(process.env.PORT ?? process.env.SHELF_API_PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const MAX_BODY = 1_000_000;

function send(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new ProviderError('Request too large', 413);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new ProviderError('Invalid JSON', 400);
  }
}

// Browser origins allowed to call the API: the server's own origin, the Vite
// dev server, and anything listed in SHELF_ALLOWED_ORIGINS (comma-separated).
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.SHELF_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
]);

function sameOrigin(req: IncomingMessage): boolean {
  // Block cross-site requests (a random website must not be able to spend your AI credits or replace keys).
  const origin = req.headers.origin;
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).host;
    return host === req.headers.host || host === req.headers['x-forwarded-host'];
  } catch {
    return false;
  }
}

/**
 * Historical place routes may be called from the hosted app on another origin
 * (e.g. GitHub Pages) — but only origins listed in SHELF_ALLOWED_ORIGINS.
 */
function historicalCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!sameOrigin(req)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  return true;
}

async function handleHistorical(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!historicalCors(req, res)) return send(res, 403, { error: 'Cross-origin request rejected.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (url.pathname === '/api/historical/status' && req.method === 'GET') return send(res, 200, { whg: whgConfigured() });
    if (url.pathname === '/api/historical/place-search' && req.method === 'POST') {
      const body = (await readJson(req)) as { queries?: SearchQuery[] };
      const n = Array.isArray(body.queries) ? body.queries.length : 0;
      if (!allowQueries(req.socket.remoteAddress ?? 'unknown', n)) return send(res, 429, { error: 'Too many place lookups. Try again in a minute.' });
      return send(res, 200, await placeSearch(body.queries ?? []));
    }
    if (url.pathname === '/api/historical/place' && req.method === 'GET') return send(res, 200, await placeGet(url.searchParams.get('id') ?? ''));
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof HistoricalError) {
      if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
      return send(res, err.status, { error: err.message });
    }
    throw err;
  }
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/api/health') return send(res, 200, { ok: true });
  if (url.pathname.startsWith('/api/historical/')) return handleHistorical(req, res, url);

  if (url.pathname === '/api/ai/status' && req.method === 'GET')
    return send(res, 200, { providers: await providerStatus(), keyConfigAllowed: keyConfigAllowed() });

  if (url.pathname === '/api/ai/config' && req.method === 'POST') {
    if (!keyConfigAllowed()) return send(res, 403, { error: 'Key configuration is disabled on this server.' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Cross-origin request rejected.' });
    const body = (await readJson(req)) as { provider?: string; apiKey?: string | null; baseUrl?: string | null; models?: string[] };
    if (!body.provider) return send(res, 400, { error: 'provider is required' });
    await saveCredentials(body.provider, body);
    return send(res, 200, { providers: await providerStatus() });
  }

  if (url.pathname === '/api/ai/complete' && req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'Cross-origin request rejected.' });
    const body = (await readJson(req)) as { provider?: string; model?: string; system?: string; messages?: ChatMessage[]; maxTokens?: number; json?: boolean };
    const provider = getProvider(body.provider ?? '');
    if (!provider) return send(res, 400, { error: 'Unknown or missing AI provider.' });
    const messages = (body.messages ?? []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim());
    if (!messages.length || messages[0].role !== 'user') return send(res, 400, { error: 'Conversation must start with a user message.' });
    const creds = await credentialsFor(provider.id);
    const model = body.model || provider.defaultModel || creds.models?.[0];
    if (!model) return send(res, 400, { error: 'No model selected.' });
    const result = await provider.complete(
      { model, system: String(body.system ?? ''), messages, maxTokens: Math.min(Math.max(body.maxTokens ?? 2000, 64), 16000), json: !!body.json },
      creds,
    );
    return send(res, 200, { ...result, provider: provider.id });
  }

  return send(res, 404, { error: 'Not found' });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

async function serveStatic(res: ServerResponse, url: URL) {
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'Forbidden' });
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(DIST, 'index.html'); // SPA fallback
  }
  try {
    await stat(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Build the app first: npm run build');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(res, url);
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Server error';
    if (!(err instanceof ProviderError)) console.error(err);
    if (!res.headersSent) send(res, status, { error: message });
  }
});

server.listen(PORT, HOST, () => console.log(`Shelf server on http://${HOST}:${PORT}`));
