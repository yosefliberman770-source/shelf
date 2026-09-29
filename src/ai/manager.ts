// AIManager — the one place that decides which AI answers.
//
//   app → complete() → AIManager → [cache] → routing → adapter → provider
//
// Defaults are free-first and never spend money: paid models are skipped
// unless "Allow paid AI" is on AND the monthly limit (default $0) has room.
// When a provider hits a rate limit or its free allowance, it is rested for a
// while and the next eligible provider is tried. Keys stay on this device (or
// on Shelf's server for providers that can't be called from a browser) and are
// never logged.
import { db } from '../db/db';
import { type ChatRequest, type ChatResult, chat, type Credentials, type FailureKind, ProviderFailure } from './providers/adapters';
import { type AITask, type ModelInfo, PROVIDER_DEFS, type ProviderId, providerDef, TASKS, type Tier } from './providers/catalog';

export type AIMode = 'free' | 'quality' | 'fastest' | 'manual';

export interface ProviderSettings {
  enabled: boolean;
  model?: string;
  /** Models discovered from the provider (or edited by you). */
  models?: ModelInfo[];
  /** Gemini: your key's Google project has billing on → treat as paid. */
  billingEnabled?: boolean;
  accountId?: string;
  baseUrl?: string;
}

export interface AIConfig {
  version: 2;
  mode: AIMode;
  order: ProviderId[];
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  manual?: { provider: ProviderId; model: string };
  tasks: Partial<Record<AITask, { provider: ProviderId; model: string }>>;
  allowPaid: boolean;
  /** USD per calendar month. */
  monthlyLimit: number;
  fallback: boolean;
  cache: boolean;
}

const CONFIG_KEY = 'shelf.aiConfig.v2';
const KEYS_KEY = 'shelf.aiKeys.v2';
const STATE_KEY = 'shelf.aiState.v2';

const DEFAULT_ORDER: ProviderId[] = ['gemini', 'groq', 'cerebras', 'mistral', 'openrouter', 'cloudflare', 'nvidia', 'huggingface', 'cohere', 'ollama'];

export function defaultConfig(): AIConfig {
  return { version: 2, mode: 'free', order: DEFAULT_ORDER, providers: {}, tasks: {}, allowPaid: false, monthlyLimit: 0, fallback: true, cache: true };
}

const store = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

// ── Config & keys ──────────────────────────────────────────────────────

export function loadConfig(): AIConfig {
  const c = store.get<AIConfig>(CONFIG_KEY, defaultConfig());
  // New providers added later join the end of your order.
  for (const id of DEFAULT_ORDER) if (!c.order.includes(id)) c.order.push(id);
  c.order = c.order.filter((id) => providerDef(id));
  // The original "Gemini on this device" key carries over automatically.
  try {
    const legacy = localStorage.getItem('shelf.geminiKey');
    if (legacy && !getKey('gemini')) { setKey('gemini', legacy); c.providers.gemini = { enabled: true, ...c.providers.gemini }; saveConfig(c); }
  } catch { /* ignore */ }
  return c;
}

export function saveConfig(c: AIConfig) {
  store.set(CONFIG_KEY, c);
  emit({ type: 'config' });
}

/** Keys are kept apart from the rest of the settings and are never exported, logged or synced. */
export function getKey(id: ProviderId): string {
  return store.get<Record<string, string>>(KEYS_KEY, {})[id] ?? '';
}
export function setKey(id: ProviderId, key: string | null) {
  const all = store.get<Record<string, string>>(KEYS_KEY, {});
  if (key && key.trim()) all[id] = key.trim();
  else delete all[id];
  store.set(KEYS_KEY, all);
  if (id === 'gemini') { try { if (key) localStorage.setItem('shelf.geminiKey', key.trim()); else localStorage.removeItem('shelf.geminiKey'); } catch { /* ignore */ } }
  clearCooldown(id);
  emit({ type: 'config' });
}

// ── Runtime state: cooldowns & health ──────────────────────────────────

export type Health = 'available' | 'limited' | 'unavailable' | 'not-configured';
interface Runtime { cooldowns: Record<string, { until: number; reason: FailureKind; strikes: number }>; lastTest: Record<string, { ok: boolean; ms?: number; model?: string; message?: string; at: number }>; serverProviders?: string[] }

function runtime(): Runtime { return store.get<Runtime>(STATE_KEY, { cooldowns: {}, lastTest: {} }); }
function saveRuntime(r: Runtime) { store.set(STATE_KEY, r); }

function nextUtcMidnight() { const d = new Date(); d.setUTCHours(24, 0, 5, 0); return d.getTime(); }

function coolDown(key: string, reason: FailureKind, retryAfter?: number) {
  const r = runtime();
  const prev = r.cooldowns[key];
  const strikes = (prev && prev.until > Date.now() - 3600_000 ? prev.strikes : 0) + 1;
  let ms: number;
  if (retryAfter) ms = retryAfter * 1000;
  else if (reason === 'quota') ms = Math.max(15 * 60_000, nextUtcMidnight() - Date.now());
  else if (reason === 'rate_limit') ms = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000][Math.min(strikes - 1, 3)];
  else if (reason === 'auth') ms = 12 * 3600_000;
  else if (reason === 'model') ms = 24 * 3600_000;
  else ms = [2 * 60_000, 10 * 60_000, 30 * 60_000][Math.min(strikes - 1, 2)];
  r.cooldowns[key] = { until: Date.now() + ms, reason, strikes };
  saveRuntime(r);
}

export function clearCooldown(providerId: string) {
  const r = runtime();
  for (const k of Object.keys(r.cooldowns)) if (k === providerId || k.startsWith(`${providerId}:`)) delete r.cooldowns[k];
  saveRuntime(r);
}

function coolingUntil(provider: string, model: string): { until: number; reason: FailureKind } | undefined {
  const r = runtime();
  const now = Date.now();
  const hit = [r.cooldowns[provider], r.cooldowns[`${provider}:${model}`]].filter((c) => c && c.until > now).sort((a, b) => b!.until - a!.until)[0];
  return hit ?? undefined;
}

export function providerHealth(id: ProviderId, cfg = loadConfig()): Health {
  const def = providerDef(id)!;
  if (!isConfigured(id, cfg)) return 'not-configured';
  const cd = coolingUntil(id, cfg.providers[id]?.model ?? '');
  if (cd) return cd.reason === 'auth' ? 'unavailable' : cd.reason === 'rate_limit' || cd.reason === 'quota' ? 'limited' : 'unavailable';
  const t = runtime().lastTest[id];
  if (t && !t.ok && Date.now() - t.at < 3600_000 && def) return 'unavailable';
  return 'available';
}

export function cooldownInfo(id: ProviderId): { until: number; reason: FailureKind } | undefined {
  const cfg = loadConfig();
  return coolingUntil(id, cfg.providers[id]?.model ?? '');
}

/** When the soonest resting provider becomes usable again (for "continues at 3:40"). */
export function nextAvailableAt(cfg = loadConfig()): number | undefined {
  const now = Date.now();
  const times = PROVIDER_DEFS.filter((d) => isConfigured(d.id, cfg)).map((d) => coolingUntil(d.id, cfg.providers[d.id]?.model ?? '')?.until).filter((t): t is number => !!t && t > now);
  return times.length ? Math.min(...times) : undefined;
}

export function lastTest(id: ProviderId) { return runtime().lastTest[id]; }

// ── Server-reachable providers ─────────────────────────────────────────

let serverStatus: Promise<string[]> | undefined;
/** Providers configured on Shelf's server (needed for Cloudflare and NVIDIA). */
export function serverProviders(refresh = false): Promise<string[]> {
  if (!serverStatus || refresh) {
    serverStatus = fetch(`${apiBase()}/api/ai/status`).then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as { providers: { id: string; configured: boolean }[] }).providers.filter((p) => p.configured).map((p) => p.id) : []))
      .catch(() => []);
  }
  return serverStatus;
}
/** Re-check which providers Shelf's server has keys for, and remember it. */
export async function refreshServerProviders(): Promise<string[]> {
  const list = await serverProviders(true);
  const r = runtime();
  r.serverProviders = list;
  saveRuntime(r);
  emit({ type: 'config' });
  return list;
}
function apiBase() { try { return (localStorage.getItem('shelf.historyApi') ?? '').replace(/\/+$/, ''); } catch { return ''; } }

export function isConfigured(id: ProviderId, cfg = loadConfig()): boolean {
  const def = providerDef(id);
  const p = cfg.providers[id];
  if (!def || !p?.enabled) return false;
  if (def.transport === 'server') return (runtime().serverProviders ?? []).includes(id);
  if (def.transport === 'local') return true;
  if (def.needsAccountId && !p.accountId) return false;
  return !!getKey(id);
}

// ── Models, tiers and routing ──────────────────────────────────────────

export function modelsFor(id: ProviderId, cfg = loadConfig()): ModelInfo[] {
  const def = providerDef(id)!;
  const found = cfg.providers[id]?.models;
  return found?.length ? found : def.models;
}

/** Free, paid, local or unknown — as the app will treat it. */
export function effectiveTier(id: ProviderId, model: string, cfg = loadConfig()): Tier {
  const def = providerDef(id)!;
  if (def.transport === 'local') return 'local';
  if (id === 'gemini' && cfg.providers.gemini?.billingEnabled) return 'paid';
  const m = modelsFor(id, cfg).find((x) => x.id === model);
  if (id === 'openrouter') return m?.tier ?? (model.endsWith(':free') || model === 'openrouter/free' ? 'free' : 'paid');
  return m?.tier ?? def.tier;
}

function monthKey(d = new Date()) { return d.toISOString().slice(0, 7); }

export async function monthSpend(): Promise<number> {
  const rows = await db.aiUsage.where('month').equals(monthKey()).toArray().catch(() => []);
  return rows.reduce((a, r) => a + (r.cost ?? 0), 0);
}

export interface Candidate { provider: ProviderId; model: string; tier: Tier; quality: number; speed: number }

/** Ordered list of provider/model pairs to try for a task. Paid models only when allowed and within budget. */
export async function route(task: AITask, cfg = loadConfig()): Promise<{ candidates: Candidate[]; skipped: string[] }> {
  const weight = TASKS.find((t) => t.id === task)?.weight ?? 'standard';
  const spend = cfg.allowPaid ? await monthSpend() : 0;
  const paidOk = cfg.allowPaid && spend < cfg.monthlyLimit;
  const skipped: string[] = [];
  const eligible = (provider: ProviderId, model: string): Candidate | undefined => {
    if (!isConfigured(provider, cfg)) return undefined;
    const tier = effectiveTier(provider, model, cfg);
    if ((tier === 'paid' || tier === 'unknown') && !paidOk) { skipped.push(`${providerDef(provider)!.name} ${model} (${tier === 'paid' ? 'paid' : 'cost unknown'})`); return undefined; }
    const info = modelsFor(provider, cfg).find((m) => m.id === model);
    return { provider, model, tier, quality: info?.quality ?? 3, speed: info?.speed ?? 3 };
  };
  const pickModel = (provider: ProviderId): string | undefined => {
    const chosen = cfg.providers[provider]?.model;
    const models = modelsFor(provider, cfg).filter((m) => { const t = effectiveTier(provider, m.id, cfg); return paidOk || t === 'free' || t === 'local'; });
    if (cfg.mode === 'quality' || weight === 'heavy') return [...models].sort((a, b) => b.quality - a.quality)[0]?.id ?? chosen;
    if (cfg.mode === 'fastest' || (weight === 'light' && !chosen)) return [...models].sort((a, b) => b.speed - a.speed)[0]?.id ?? chosen;
    return chosen ?? models[0]?.id;
  };

  const list: Candidate[] = [];
  const push = (c?: Candidate) => { if (c && !list.some((x) => x.provider === c.provider && x.model === c.model)) list.push(c); };
  // A task you pinned to a model always goes first.
  const pinned = cfg.tasks[task];
  if (pinned) push(eligible(pinned.provider, pinned.model));
  if (cfg.mode === 'manual' && cfg.manual) push(eligible(cfg.manual.provider, cfg.manual.model));
  if (cfg.mode !== 'manual' || cfg.fallback) {
    let rest = cfg.order.map((p) => { const m = pickModel(p); return m ? eligible(p, m) : undefined; }).filter((c): c is Candidate => !!c);
    if (cfg.mode === 'quality') rest = rest.sort((a, b) => b.quality - a.quality);
    if (cfg.mode === 'fastest') rest = rest.sort((a, b) => b.speed - a.speed);
    rest.forEach(push);
  }
  return { candidates: list, skipped };
}

// ── Events (for "Gemini limit reached — switched to Groq") ─────────────

export type AIEvent =
  | { type: 'switched'; from: string; to: string; reason: FailureKind }
  | { type: 'answered'; provider: string; model: string; cached: boolean }
  | { type: 'exhausted'; message: string }
  | { type: 'config' };
const listeners = new Set<(e: AIEvent) => void>();
export function onAIEvent(fn: (e: AIEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit(e: AIEvent) { for (const l of listeners) { try { l(e); } catch { /* ignore */ } } }

// ── Usage, logs and cache ──────────────────────────────────────────────

async function recordUsage(provider: string, model: string, patch: { ok: boolean; rateLimited?: boolean; inTok?: number; outTok?: number; cost?: number }) {
  const day = new Date().toISOString().slice(0, 10);
  const id = `${day}|${provider}|${model}`;
  try {
    await db.transaction('rw', db.aiUsage, async () => {
      const r = (await db.aiUsage.get(id)) ?? { id, day, month: day.slice(0, 7), provider, model, requests: 0, ok: 0, failed: 0, rateLimits: 0, inTok: 0, outTok: 0, cost: 0 };
      r.requests++;
      if (patch.ok) r.ok++; else r.failed++;
      if (patch.rateLimited) r.rateLimits++;
      r.inTok += patch.inTok ?? 0;
      r.outTok += patch.outTok ?? 0;
      r.cost += patch.cost ?? 0;
      await db.aiUsage.put(r);
    });
  } catch { /* usage stats are best-effort */ }
}

async function log(entry: { provider: string; model: string; task: string; ms: number; ok: boolean; error?: string; fallbackFrom?: string; inTok?: number; outTok?: number; cached?: boolean }) {
  try {
    await db.aiLog.add({ ...entry, at: Date.now() });
    if (Math.random() < 0.05) { const n = await db.aiLog.count(); if (n > 3000) { const old = await db.aiLog.orderBy('at').limit(n - 2500).primaryKeys(); await db.aiLog.bulkDelete(old); } }
  } catch { /* logging is best-effort */ }
}

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const CACHE_DAYS = 30;
const cacheKeyFor = (task: string, req: ChatRequest) => sha(JSON.stringify([task, req.system, req.messages, !!req.json]));

export async function clearAICache() { await db.aiCache.clear(); }

// ── Running a request ──────────────────────────────────────────────────

export class AIExhausted extends Error {}
export class AIAborted extends Error {}

export interface RunResult extends ChatResult { provider: ProviderId; cached?: boolean; switchedFrom?: string }

const estimate = (s: string) => Math.ceil(s.length / 4);

async function callServer(provider: ProviderId, model: string, req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
  let r: Response;
  try {
    r = await fetch(`${apiBase()}/api/ai/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, model, system: req.system, messages: req.messages, json: req.json, maxTokens: req.maxTokens ?? 2000 }), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ProviderFailure('network', 'Couldn’t reach Shelf’s server.');
  }
  const data = (await r.json().catch(() => ({}))) as ChatResult & { error?: string; kind?: FailureKind; retryAfter?: number };
  if (!r.ok) throw new ProviderFailure(data.kind ?? (r.status === 429 ? 'rate_limit' : r.status === 401 ? 'auth' : 'unavailable'), data.error ?? `Server error ${r.status}`, r.status, data.retryAfter);
  return data;
}

function credsFor(id: ProviderId, cfg: AIConfig): Credentials {
  const p = cfg.providers[id];
  return { apiKey: getKey(id) || undefined, accountId: p?.accountId, baseUrl: p?.baseUrl };
}

/** Test one provider with the smallest sensible request. */
export async function testProvider(id: ProviderId, model?: string): Promise<{ ok: boolean; ms?: number; model?: string; message?: string }> {
  const cfg = loadConfig();
  const def = providerDef(id)!;
  const m = model ?? cfg.providers[id]?.model ?? modelsFor(id, cfg)[0]?.id;
  const t0 = performance.now();
  let out: { ok: boolean; ms?: number; model?: string; message?: string };
  if (!m) out = { ok: false, message: 'Choose a model first.' };
  else {
    try {
      const req: ChatRequest = { system: 'Reply with the single word: ok', messages: [{ role: 'user', content: 'ping' }], maxTokens: 5 };
      const res = def.transport === 'server' ? await callServer(id, m, req) : await chat(id, m, req, credsFor(id, cfg));
      out = { ok: true, ms: Math.round(performance.now() - t0), model: res.model };
      clearCooldown(id);
    } catch (e) {
      const f = e instanceof ProviderFailure ? e : new ProviderFailure('network', (e as Error).message);
      out = { ok: false, message: failureMessage(def.name, f) };
    }
  }
  const r = runtime();
  r.lastTest[id] = { ...out, at: Date.now() };
  saveRuntime(r);
  emit({ type: 'config' });
  return out;
}

export function failureMessage(name: string, f: ProviderFailure): string {
  switch (f.kind) {
    case 'auth': return `${name} didn’t accept the API key. Check that you copied the whole key.`;
    case 'rate_limit': return `${name} is rate-limiting requests right now.`;
    case 'quota': return `${name}’s free allowance is used up for now.`;
    case 'model': return `That model isn’t available on ${name}. Pick another one.`;
    case 'network': return name.startsWith('Ollama') ? 'Ollama wasn’t found. Is it running, and does OLLAMA_ORIGINS allow this site?' : `Couldn’t reach ${name}.`;
    case 'not_configured': return f.message;
    default: return `${name}: ${f.message}`;
  }
}

/**
 * Answer a request with the best eligible provider, falling back through the
 * rest on limits/outages. Throws AIExhausted when nothing free is left.
 */
export async function runAI(task: AITask, req: ChatRequest, signal?: AbortSignal): Promise<RunResult> {
  const cfg = loadConfig();
  const key = cfg.cache ? await cacheKeyFor(task, req) : '';
  if (cfg.cache) {
    const hit = await db.aiCache.get(key).catch(() => undefined);
    if (hit && Date.now() - hit.createdAt < CACHE_DAYS * 86_400_000) {
      emit({ type: 'answered', provider: hit.provider, model: hit.model, cached: true });
      void log({ provider: hit.provider, model: hit.model, task, ms: 0, ok: true, cached: true });
      return { text: hit.text, model: hit.model, provider: hit.provider as ProviderId, cached: true };
    }
  }
  const r = runtime();
  r.serverProviders = await serverProviders();
  saveRuntime(r);
  const { candidates, skipped } = await route(task, cfg);
  if (!candidates.length) {
    const msg = skipped.length
      ? 'No free AI provider is set up for this. Paid options were skipped because “Allow paid AI” is off.'
      : 'No AI provider is set up yet. Add a free key in Settings → AI.';
    emit({ type: 'exhausted', message: msg });
    throw new AIExhausted(msg);
  }
  let firstFailure: { name: string; reason: FailureKind } | undefined;
  const waits: number[] = [];
  for (const c of candidates) {
    if (signal?.aborted) throw new AIAborted('Cancelled');
    const cd = coolingUntil(c.provider, c.model);
    if (cd) { waits.push(cd.until); continue; }
    const def = providerDef(c.provider)!;
    const t0 = performance.now();
    try {
      const res = def.transport === 'server' ? await callServer(c.provider, c.model, req, signal) : await chat(c.provider, c.model, req, credsFor(c.provider, cfg), signal);
      const inTok = res.inputTokens ?? estimate(req.system + req.messages.map((m) => m.content).join(''));
      const outTok = res.outputTokens ?? estimate(res.text);
      const info = modelsFor(c.provider, cfg).find((m) => m.id === c.model);
      const cost = c.tier === 'paid' && info?.pricePerMTokIn !== undefined ? (inTok * info.pricePerMTokIn + outTok * (info.pricePerMTokOut ?? 0)) / 1e6 : 0;
      void recordUsage(c.provider, c.model, { ok: true, inTok, outTok, cost });
      void log({ provider: c.provider, model: c.model, task, ms: Math.round(performance.now() - t0), ok: true, inTok, outTok, fallbackFrom: firstFailure?.name });
      if (firstFailure) emit({ type: 'switched', from: firstFailure.name, to: def.name, reason: firstFailure.reason });
      emit({ type: 'answered', provider: c.provider, model: res.model, cached: false });
      if (cfg.cache && !res.refused) await db.aiCache.put({ id: key, text: res.text, provider: c.provider, model: res.model, task, createdAt: Date.now() }).catch(() => {});
      return { ...res, provider: c.provider, switchedFrom: firstFailure?.name };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      const f = e instanceof ProviderFailure ? e : new ProviderFailure('network', (e as Error).message);
      void recordUsage(c.provider, c.model, { ok: false, rateLimited: f.kind === 'rate_limit' || f.kind === 'quota' });
      void log({ provider: c.provider, model: c.model, task, ms: Math.round(performance.now() - t0), ok: false, error: f.kind });
      // Rest the provider (or just this model) so it isn't hammered.
      if (f.kind === 'model') coolDown(`${c.provider}:${c.model}`, f.kind, f.retryAfter);
      else if (f.kind !== 'bad_request' && f.kind !== 'refused') coolDown(c.provider, f.kind, f.retryAfter);
      if (f.kind === 'refused') throw f;
      firstFailure ??= { name: def.name, reason: f.kind };
      if (!cfg.fallback) throw new AIExhausted(failureMessage(def.name, f));
    }
  }
  const next = waits.length ? Math.min(...waits) : undefined;
  const msg = `Your free AI capacity is used up for now${next ? ` — the next provider should be available ${new Date(next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. No paid AI was used.`;
  emit({ type: 'exhausted', message: msg });
  throw new AIExhausted(msg);
}

/** True when at least one provider is set up and enabled. */
export function hasUsableProvider(cfg = loadConfig()): boolean {
  return PROVIDER_DEFS.some((d) => isConfigured(d.id, cfg) || (d.transport === 'server' && cfg.providers[d.id]?.enabled));
}
