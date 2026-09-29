// Settings → AI: mode, providers (keys, tests, models), routing, usage, advanced.
// Keys are typed here and kept only on this device (see ai/manager.ts); they are
// never shown back in full, logged, exported or sent anywhere but the provider.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { AUTO } from '../ai/client';
import {
  type AIConfig, type AIMode, clearAICache, clearCooldown, cooldownInfo, effectiveTier, getKey, type Health, isConfigured, lastTest, loadConfig,
  modelsFor, onAIEvent, providerHealth, refreshModels, refreshServerProviders, saveConfig, setKey, testProvider,
} from '../ai/manager';
import { type AITask, keyMismatch, PROVIDER_DEFS, type ProviderDef, type ProviderId, providerDef, TASKS, type Tier } from '../ai/providers/catalog';
import { updateSettings } from '../db/actions';
import { db } from '../db/db';
import type { AIUsageRow } from '../db/types';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { Switch, Tabs } from './common';

type Section = 'mode' | 'providers' | 'models' | 'routing' | 'usage' | 'advanced';

/** Live AI config that re-renders whenever anything changes it. */
function useAIConfig(): [AIConfig, (fn: (c: AIConfig) => void) => void] {
  const [cfg, setCfg] = useState(loadConfig);
  useEffect(() => onAIEvent((e) => { if (e.type === 'config') setCfg(loadConfig()); }), []);
  const update = (fn: (c: AIConfig) => void) => { const c = loadConfig(); fn(c); saveConfig(c); setCfg(c); };
  return [cfg, update];
}

const HEALTH: Record<Health, { dot: string; label: string }> = {
  available: { dot: '🟢', label: 'Available' },
  limited: { dot: '🟡', label: 'Limited / resting' },
  unavailable: { dot: '🔴', label: 'Unavailable' },
  'not-configured': { dot: '⚪', label: 'Not configured' },
};

const TIER_CHIP: Record<Tier, { cls: string; label: string }> = {
  free: { cls: 'good', label: 'Free' },
  paid: { cls: 'bad', label: 'Paid' },
  unknown: { cls: 'warn', label: 'Cost unknown' },
  local: { cls: 'accent', label: 'Local · free' },
};

export function TierChip({ tier }: { tier: Tier }) {
  const t = TIER_CHIP[tier];
  return <span className={`chip ${t.cls}`} style={{ minHeight: 22, fontSize: 11.5, padding: '0 8px' }}>{t.label}</span>;
}

export function AIProviderSettings() {
  const [section, setSection] = useState<Section>('mode');
  const [cfg, update] = useAIConfig();
  const idx = useLibrary();
  const ai = idx.settings.ai;
  // Once any provider is ready, the app's AI features use the automatic manager.
  useEffect(() => {
    const ready = PROVIDER_DEFS.some((d) => isConfigured(d.id, cfg));
    if (ready && ai.provider !== AUTO && (ai.provider === '' || ai.provider === 'device-gemini')) void updateSettings({ ai: { ...ai, provider: AUTO, model: '', enabled: true } });
  }, [cfg, ai]);
  useEffect(() => { void refreshServerProviders(); }, []);
  return (
    <div className="card">
      <div className="card-head"><h3>✦ AI providers</h3></div>
      <p className="small muted mb-8">Shelf can use several free AI services and switches between them automatically when one hits its limit. It never uses paid AI unless you turn that on.</p>
      <Tabs<Section> value={section} onChange={setSection} tabs={[
        { id: 'mode', label: 'Mode' }, { id: 'providers', label: 'Providers' }, { id: 'models', label: 'Models' },
        { id: 'routing', label: 'Routing' }, { id: 'usage', label: 'Usage' }, { id: 'advanced', label: 'Advanced' },
      ]} />
      <div className="mt-16">
        {section === 'mode' && <ModeSection cfg={cfg} update={update} />}
        {section === 'providers' && <ProvidersSection cfg={cfg} update={update} />}
        {section === 'models' && <ModelsSection cfg={cfg} update={update} />}
        {section === 'routing' && <RoutingSection cfg={cfg} update={update} />}
        {section === 'usage' && <UsageSection cfg={cfg} />}
        {section === 'advanced' && <AdvancedSection cfg={cfg} update={update} />}
      </div>
    </div>
  );
}

type SectionProps = { cfg: AIConfig; update: (fn: (c: AIConfig) => void) => void };

const MODES: { id: AIMode; label: string; hint: string }[] = [
  { id: 'free', label: 'Maximum free', hint: 'Uses free providers in your priority order and moves to the next one when a limit is reached. Recommended.' },
  { id: 'quality', label: 'Best quality', hint: 'Prefers the strongest free model available (still free unless you allow paid AI).' },
  { id: 'fastest', label: 'Fastest', hint: 'Prefers the quickest models.' },
  { id: 'manual', label: 'Manual', hint: 'Always use the provider and model you pick below.' },
];

function ModeSection({ cfg, update }: SectionProps) {
  const configured = PROVIDER_DEFS.filter((d) => isConfigured(d.id, cfg));
  const manual = cfg.manual;
  return (
    <div className="col gap-12">
      {MODES.map((m) => (
        <label key={m.id} className="row" style={{ alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="radio" name="ai-mode" checked={cfg.mode === m.id} onChange={() => update((c) => { c.mode = m.id; })} style={{ marginTop: 4 }} />
          <span><b>{m.label}</b>{m.id === 'free' && <span className="chip good" style={{ marginLeft: 6, minHeight: 20, fontSize: 11 }}>Default</span>}<br /><span className="small muted">{m.hint}</span></span>
        </label>
      ))}
      {cfg.mode === 'manual' && (
        <div className="col gap-8" style={{ paddingLeft: 26 }}>
          {!configured.length && <div className="notice warn">Set up a provider first (Providers tab).</div>}
          {configured.length > 0 && (
            <div className="row wrap gap-8">
              <select className="select sm" value={manual?.provider ?? ''} onChange={(e) => update((c) => { const p = e.target.value as ProviderId; c.manual = { provider: p, model: c.providers[p]?.model ?? modelsFor(p, c)[0]?.id ?? '' }; })}>
                <option value="">Provider…</option>
                {configured.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {manual?.provider && (
                <select className="select sm" value={manual.model} onChange={(e) => update((c) => { c.manual = { provider: manual.provider, model: e.target.value }; })}>
                  {modelsFor(manual.provider, cfg).map((m) => <option key={m.id} value={m.id}>{m.label ?? m.id} — {TIER_CHIP[effectiveTier(manual.provider, m.id, cfg)].label}</option>)}
                </select>
              )}
            </div>
          )}
          <Switch label={<span className="small">If it fails, fall back to other free providers</span>} checked={cfg.fallback} onChange={(v) => update((c) => { c.fallback = v; })} />
        </div>
      )}
      <Summary cfg={cfg} />
    </div>
  );
}

function Summary({ cfg }: { cfg: AIConfig }) {
  const ready = cfg.order.filter((id) => isConfigured(id, cfg));
  if (!ready.length) return <div className="notice warn">No AI provider is set up yet. Open <b>Providers</b> and add a free key — Google Gemini is the easiest to start with.</div>;
  return (
    <div className="notice">
      <b>Order Shelf will try:</b> {ready.map((id) => `${HEALTH[providerHealth(id, cfg)].dot} ${providerDef(id)!.name}`).join(' → ')}
      <div className="tiny muted mt-8">Paid AI: {cfg.allowPaid ? `allowed up to $${cfg.monthlyLimit.toFixed(2)} a month` : 'off — only free and local models are used'}.</div>
    </div>
  );
}

function ProvidersSection({ cfg, update }: SectionProps) {
  const [open, setOpen] = useState<ProviderId | null>(null);
  const move = (i: number, d: -1 | 1) => update((c) => { const o = [...c.order]; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; c.order = o; });
  return (
    <div className="col gap-8">
      <p className="tiny muted">Top of the list is tried first. Use ↑ ↓ to change the priority.</p>
      {cfg.order.map((id, i) => {
        const def = providerDef(id)!;
        const health = providerHealth(id, cfg);
        const expanded = open === id;
        return (
          <div key={id} className="card" style={{ padding: 12, borderColor: health === 'available' ? 'var(--good)' : undefined }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <div className="col" style={{ gap: 0 }}>
                <button className="btn sm ghost" aria-label={`Move ${def.name} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ minHeight: 26, padding: '0 8px' }}>↑</button>
                <button className="btn sm ghost" aria-label={`Move ${def.name} down`} disabled={i === cfg.order.length - 1} onClick={() => move(i, 1)} style={{ minHeight: 26, padding: '0 8px' }}>↓</button>
              </div>
              <button className="grow" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(expanded ? null : id)}>
                <div><b>{i + 1}. {def.name}</b> <TierChip tier={def.tier === 'unknown' ? 'unknown' : def.tier} /></div>
                <div className="tiny muted">{HEALTH[health].dot} {HEALTH[health].label}{def.transport === 'server' ? ' · via Shelf server' : ''}</div>
              </button>
              <span className="muted">{expanded ? '▾' : '▸'}</span>
            </div>
            {expanded && <ProviderCard def={def} cfg={cfg} update={update} />}
          </div>
        );
      })}
    </div>
  );
}

function ProviderCard({ def, cfg, update }: { def: ProviderDef } & SectionProps) {
  const { toast } = useUI();
  const p = cfg.providers[def.id] ?? { enabled: false };
  const saved = getKey(def.id);
  const [key, setKeyText] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'' | 'test' | 'models'>('');
  const [err, setErr] = useState('');
  const [server, setServer] = useState<string[] | null>(null);
  const test = lastTest(def.id);
  const cd = cooldownInfo(def.id);
  const models = modelsFor(def.id, cfg);
  const setP = (patch: Partial<typeof p>) => update((c) => { c.providers[def.id] = { enabled: false, ...c.providers[def.id], ...patch }; });

  useEffect(() => { if (def.transport === 'server') refreshServerProviders().then(setServer); }, [def]);

  const saveKey = async () => {
    setKey(def.id, key);
    setKeyText('');
    setP({ enabled: true });
    toast(`${def.name} key saved on this device`);
    // Learn which models this key can use, so a retired default doesn't break it.
    await refreshModels(def.id).catch(() => {});
    await runTest();
  };
  const runTest = async () => {
    setBusy('test');
    setErr('');
    try { await testProvider(def.id); } finally { setBusy(''); }
  };
  const findModels = async () => {
    setBusy('models');
    setErr('');
    try {
      const list = await refreshModels(def.id);
      if (!list.length) setErr('No models were returned.');
      else toast(`Found ${list.length} models`);
    } catch (e) {
      setErr(def.id === 'ollama' ? 'Ollama wasn’t found at that address. Start Ollama on this computer and allow this site with OLLAMA_ORIGINS.' : (e as Error).message);
    } finally { setBusy(''); }
  };

  return (
    <div className="col gap-12 mt-12">
      <p className="small muted" style={{ margin: 0 }}>{def.freeNote} <a href={def.docsUrl} target="_blank" rel="noreferrer">Details ↗</a></p>
      <Switch label="Use this provider" checked={!!p.enabled} onChange={(v) => setP({ enabled: v })} />

      {def.transport === 'server' ? (
        <div className="notice">
          {def.name} doesn’t allow apps to call it straight from a browser, so it only works through a Shelf server you run. Put <code>{def.env.join('</code> and <code>')}</code> in the server’s <code>.env</code> file.
          <div className="mt-8"><b>Server status:</b> {server === null ? 'checking…' : server.includes(def.id) ? '✓ key configured on the server' : '✕ not configured (or no server connected)'}</div>
          <a className="btn sm mt-8" href={def.keyUrl} target="_blank" rel="noreferrer">Get API key ↗</a>
        </div>
      ) : def.transport === 'local' ? (
        <div className="col gap-8">
          <p className="small" style={{ margin: 0 }}>Install Ollama on your computer, run a model (e.g. <code>ollama pull llama3.2</code>), then start it with <code>OLLAMA_ORIGINS</code> set to this site so the browser may talk to it. Only works when Shelf is open on that same computer (or your network).</p>
          <label className="field">Ollama address<input className="input sm" value={p.baseUrl ?? ''} placeholder="http://localhost:11434/v1" onChange={(e) => setP({ baseUrl: e.target.value })} /></label>
          <div className="row wrap gap-8">
            <a className="btn sm" href={def.keyUrl} target="_blank" rel="noreferrer">Download Ollama ↗</a>
            <button className="btn sm" disabled={!!busy} onClick={findModels}>{busy === 'models' ? 'Looking…' : 'Detect Ollama & models'}</button>
          </div>
        </div>
      ) : (
        <div className="col gap-8">
          {def.needsAccountId && <label className="field">Account ID<input className="input sm" value={p.accountId ?? ''} onChange={(e) => setP({ accountId: e.target.value.trim() })} /></label>}
          <label className="field">API key
            <div className="row gap-8">
              <input className="input sm" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={key} placeholder={saved ? `Saved ••••${saved.slice(-4)}` : 'Paste your key here'} onChange={(e) => setKeyText(e.target.value)} />
              <button className="btn sm ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </label>
          {keyMismatch(def.id, key) && <div className="notice warn small">{keyMismatch(def.id, key)}</div>}
          <div className="row wrap gap-8">
            <a className="btn sm" href={def.keyUrl} target="_blank" rel="noreferrer">Get API key ↗</a>
            <button className="btn sm primary" disabled={key.trim().length < 8} onClick={saveKey}>Save key</button>
            {saved && <button className="btn sm danger" onClick={() => { setKey(def.id, null); setP({ enabled: false }); toast('Key removed from this device'); }}>Clear key</button>}
          </div>
          <p className="tiny faint" style={{ margin: 0 }}>Saved only in this browser on this device. Never included in backups, logs or anything Shelf uploads.</p>
        </div>
      )}

      {def.id === 'gemini' && (
        <Switch label={<span className="small">My Google project has billing turned on (treat Gemini as paid)</span>} checked={!!p.billingEnabled} onChange={(v) => setP({ billingEnabled: v })} />
      )}

      <div className="row wrap gap-8" style={{ alignItems: 'center' }}>
        <label className="field" style={{ flex: '1 1 220px' }}>Model
          <select className="select sm" value={p.model ?? ''} onChange={(e) => setP({ model: e.target.value || undefined })}>
            <option value="">Automatic</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label ?? m.id} — {TIER_CHIP[effectiveTier(def.id, m.id, cfg)].label}</option>)}
          </select>
        </label>
        {def.transport === 'device' && saved && <button className="btn sm" disabled={!!busy} onClick={findModels}>{busy === 'models' ? 'Loading…' : 'Find models'}</button>}
      </div>

      <div className="row wrap gap-8" style={{ alignItems: 'center' }}>
        <button className="btn sm" disabled={!!busy || !isConfigured(def.id, { ...cfg, providers: { ...cfg.providers, [def.id]: { ...p, enabled: true } } })} onClick={runTest}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
        {test && (test.ok
          ? <span className="small" style={{ color: 'var(--good)' }}>✓ Connected · {test.model} · {test.ms} ms</span>
          : <span className="small" style={{ color: 'var(--bad)' }}>✕ {test.message}</span>)}
      </div>
      {cd && (
        <div className="notice warn small">
          Resting until {new Date(cd.until).toLocaleString([], { hour: 'numeric', minute: '2-digit', weekday: 'short' })} ({cd.reason === 'quota' ? 'free allowance used up' : cd.reason === 'rate_limit' ? 'rate limit' : cd.reason === 'auth' ? 'key not accepted' : 'errors'}).
          <button className="btn sm ghost" onClick={() => { clearCooldown(def.id); update(() => {}); }}>Try again now</button>
        </div>
      )}
      {err && <div className="notice bad small">{err}</div>}
      <ProviderUsage id={def.id} />
    </div>
  );
}

function ProviderUsage({ id }: { id: ProviderId }) {
  const month = new Date().toISOString().slice(0, 7);
  const day = new Date().toISOString().slice(0, 10);
  const rows = useLiveQuery(() => db.aiUsage.where('provider').equals(id).toArray(), [id]);
  if (!rows) return null;
  const m = rows.filter((r) => r.month === month);
  if (!m.length) return <p className="tiny muted" style={{ margin: 0 }}>No requests yet this month.</p>;
  const today = m.filter((r) => r.day === day).reduce((a, r) => a + r.requests, 0);
  const total = m.reduce((a, r) => a + r.requests, 0);
  const rl = m.reduce((a, r) => a + r.rateLimits, 0);
  return <p className="tiny muted" style={{ margin: 0 }}>Today: {today} requests · This month: {total}{rl ? ` · ${rl} limit hits` : ''}. The provider’s own remaining quota isn’t shared with apps, so Shelf counts what it sent.</p>;
}

function ModelsSection({ cfg, update }: SectionProps) {
  const ids = cfg.order.filter((id) => cfg.providers[id]?.enabled);
  if (!ids.length) return <p className="small muted">Turn on a provider first — its models will be listed here.</p>;
  const setRating = (id: ProviderId, model: string, field: 'quality' | 'speed', v: number) => update((c) => {
    const list = modelsFor(id, c).map((m) => (m.id === model ? { ...m, [field]: v } : m));
    c.providers[id] = { enabled: true, ...c.providers[id], models: list };
  });
  return (
    <div className="col gap-16">
      <p className="tiny muted">Quality and speed (1–5) guide “Best quality” and “Fastest”. Adjust them if you disagree.</p>
      {ids.map((id) => (
        <div key={id}>
          <b>{providerDef(id)!.name}</b>
          <div className="col gap-4 mt-8">
            {modelsFor(id, cfg).slice(0, 60).map((m) => (
              <div key={m.id} className="row wrap gap-8" style={{ alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                <span className="grow small" style={{ minWidth: 160, wordBreak: 'break-all' }}>{m.label ?? m.id}{m.context ? <span className="tiny faint"> · {Math.round(m.context / 1000)}k</span> : null}</span>
                <TierChip tier={effectiveTier(id, m.id, cfg)} />
                {m.pricePerMTokIn ? <span className="tiny muted">${m.pricePerMTokIn.toFixed(2)}/M in</span> : null}
                <label className="tiny">Q <select className="select sm" value={m.quality} onChange={(e) => setRating(id, m.id, 'quality', Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
                <label className="tiny">S <select className="select sm" value={m.speed} onChange={(e) => setRating(id, m.id, 'speed', Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoutingSection({ cfg, update }: SectionProps) {
  const ready = cfg.order.filter((id) => isConfigured(id, cfg));
  const groups: { label: string; weight: string }[] = [
    { label: 'Quick jobs → fastest free model', weight: 'light' },
    { label: 'Everyday jobs → your chosen model', weight: 'standard' },
    { label: 'Hard jobs → strongest free model', weight: 'heavy' },
  ];
  return (
    <div className="col gap-16">
      <p className="small muted" style={{ margin: 0 }}>By default Shelf sends each kind of job to a suitable free model automatically. You can pin a job to a specific model; if that one is resting, the others are used.</p>
      {groups.map((g) => (
        <div key={g.weight}>
          <div className="small"><b>{g.label}</b></div>
          {TASKS.filter((t) => t.weight === g.weight).map((t) => {
            const pin = cfg.tasks[t.id];
            const value = pin ? `${pin.provider}|${pin.model}` : '';
            return (
              <div key={t.id} className="row wrap gap-8 mt-8" style={{ alignItems: 'center' }}>
                <span className="grow small" style={{ minWidth: 150 }}>{t.label}</span>
                <select className="select sm" style={{ maxWidth: 260 }} value={value} onChange={(e) => update((c) => {
                  if (!e.target.value) delete c.tasks[t.id as AITask];
                  else { const [provider, ...rest] = e.target.value.split('|'); c.tasks[t.id as AITask] = { provider: provider as ProviderId, model: rest.join('|') }; }
                })}>
                  <option value="">Automatic</option>
                  {ready.flatMap((id) => modelsFor(id, cfg).slice(0, 25).map((m) => <option key={`${id}|${m.id}`} value={`${id}|${m.id}`}>{providerDef(id)!.name}: {m.label ?? m.id}</option>))}
                </select>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function UsageSection({ cfg }: { cfg: AIConfig }) {
  const month = new Date().toISOString().slice(0, 7);
  const day = new Date().toISOString().slice(0, 10);
  const rows = useLiveQuery(() => db.aiUsage.where('month').equals(month).toArray(), []);
  const recent = useLiveQuery(() => db.aiLog.orderBy('at').reverse().limit(20).toArray(), []);
  if (!rows) return null;
  const sum = (f: (r: AIUsageRow) => number, list: AIUsageRow[] = rows) => list.reduce((a, r) => a + f(r), 0);
  const todayRows = rows.filter((r) => r.day === day);
  const stat = (label: string, v: string) => <div className="card" style={{ padding: 10, flex: '1 1 120px' }}><div className="tiny muted">{label}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>;
  const byProvider = [...new Set(rows.map((r) => r.provider))];
  return (
    <div className="col gap-12">
      <div className="row wrap gap-8">
        {stat('Requests today', String(sum((r) => r.requests, todayRows)))}
        {stat('This month', String(sum((r) => r.requests)))}
        {stat('Tokens (month)', `${Math.round(sum((r) => r.inTok + r.outTok) / 1000)}k`)}
        {stat('Estimated cost', `$${sum((r) => r.cost).toFixed(2)}`)}
        {stat('Successful', String(sum((r) => r.ok)))}
        {stat('Failed', String(sum((r) => r.failed)))}
        {stat('Limit hits', String(sum((r) => r.rateLimits)))}
      </div>
      <div className="col gap-4">
        {cfg.order.filter((id) => cfg.providers[id]?.enabled || byProvider.includes(id)).map((id) => {
          const pr = rows.filter((r) => r.provider === id);
          const h = HEALTH[providerHealth(id, cfg)];
          return (
            <div key={id} className="row gap-8 small" style={{ borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
              <span>{h.dot}</span><span className="grow">{providerDef(id)!.name}</span>
              <span className="muted">{pr.length ? `${sum((r) => r.requests, pr)} req · ${sum((r) => r.ok, pr)} ok · ${sum((r) => r.rateLimits, pr)} limits` : 'Usage information unavailable'}</span>
            </div>
          );
        })}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>These numbers are what Shelf sent from this device. Providers don’t tell apps how much free allowance is left, so “remaining” isn’t shown.</p>
      {!!recent?.length && (
        <details>
          <summary className="small">Recent AI requests (no keys or text are logged)</summary>
          <div className="col gap-4 mt-8">
            {recent.map((l) => (
              <div key={l.id} className="tiny row gap-8"><span className="faint">{new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className="grow">{providerDef(l.provider)?.name ?? l.provider} · {l.task}{l.cached ? ' · from cache' : ''}{l.fallbackFrom ? ` · after ${l.fallbackFrom}` : ''}</span><span style={{ color: l.ok ? 'var(--good)' : 'var(--bad)' }}>{l.ok ? `✓ ${l.ms} ms` : `✕ ${l.error}`}</span></div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AdvancedSection({ cfg, update }: SectionProps) {
  const { toast } = useUI();
  const [limit, setLimit] = useState(String(cfg.monthlyLimit));
  return (
    <div className="col gap-12">
      <Switch label={<span><b>Allow paid AI</b><br /><span className="small muted">Off by default. When off, Shelf never uses a model that costs money.</span></span>} checked={cfg.allowPaid} onChange={(v) => {
        if (v && !confirm('Allow Shelf to use paid AI models, up to your monthly limit? You can turn this off any time.')) return;
        update((c) => { c.allowPaid = v; });
      }} />
      <label className="field">Monthly paid AI limit (USD)
        <div className="row gap-8">
          <input className="input sm" inputMode="decimal" style={{ width: 120 }} value={limit} onChange={(e) => setLimit(e.target.value)} />
          <button className="btn sm" onClick={() => { const n = Math.max(0, Number(limit) || 0); update((c) => { c.monthlyLimit = n; }); setLimit(String(n)); toast(`Limit set to $${n.toFixed(2)}`); }}>Save</button>
        </div>
        <span className="tiny muted">$0 means paid AI is never used even if allowed. Costs are estimated from published prices; free models count as $0.</span>
      </label>
      <Switch label={<span><b>Automatic fallback</b><br /><span className="small muted">When a provider hits a limit, try the next one.</span></span>} checked={cfg.fallback} onChange={(v) => update((c) => { c.fallback = v; })} />
      <Switch label={<span><b>Remember answers</b><br /><span className="small muted">Identical questions are answered from this device instead of asking again (saves free quota).</span></span>} checked={cfg.cache} onChange={(v) => update((c) => { c.cache = v; })} />
      <div className="row wrap gap-8">
        <button className="btn sm" onClick={async () => { await clearAICache(); toast('Remembered answers cleared'); }}>Clear remembered answers</button>
        <button className="btn sm" onClick={async () => { await db.aiLog.clear(); await db.aiUsage.clear(); toast('Usage history cleared'); }}>Clear usage history</button>
        <button className="btn sm danger" onClick={() => { if (!confirm('Remove every AI key saved on this device?')) return; for (const d of PROVIDER_DEFS) setKey(d.id, null); toast('All keys removed from this device'); }}>Remove all keys</button>
      </div>
    </div>
  );
}
