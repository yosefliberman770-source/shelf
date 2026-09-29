// Screens of the Historical World system inside the atlas: original maps,
// data coverage and sources, "What changed?", extra context for a place,
// and "The world of this book". Each fact names its source; gaps in data are
// explained as gaps in data.
import { useEffect, useMemo, useRef, useState } from 'react';
import { complete } from '../../ai/client';
import { nearbyPlaces } from '../../atlas/gazetteer';
import type { ReaderPlace } from '../../atlas/resolve';
import { type HistYear, yearLabel } from '../../atlas/time';
import { DATA_TYPES, type DataType, PERIODS, periodLabel, QUALITY_LABEL, QUALITY_MARK, regionAt, regionLabel } from '../../world/axes';
import type { BookWorldRow } from '../../db/types';
import { cellAt, cell } from '../../world/coverage';
import { crossCheck, type CrossCheck, chgisFor } from '../../world/crosscheck';
import { whatChanged, type WhatChanged } from '../../world/changes';
import { EVIDENCE, explainEmpty } from '../../world/evidence';
import { formatDate } from '../../world/histdate';
import { type ChgisPlace, type HistogisUnit, histogisWhereWas, spanLabel } from '../../world/live';
import { findGeoref, type HistMap, imageLimits, mapDateLabel, type Overlay, overlayFor, searchMaps, viewerUrl } from '../../world/maps';
import { SOURCES, TIER_LABEL } from '../../world/registry';
import { selectSources } from '../../world/select';
import type { WorldProfile } from '../../world/bookWorld';
import { parseHistoricalDate } from '../../lib/history/dates';

// ── Why a list is empty ───────────────────────────────────────────────────

export function EmptyNote({ type, at, year }: { type: DataType; at?: { lat: number; lon: number }; year: HistYear }) {
  if (!at) return null;
  const e = explainEmpty(type, at.lon, at.lat, year);
  return <div className="atlas-gap"><span>{e.mark}</span> {e.text}</div>;
}

// ── Original historical maps ──────────────────────────────────────────────

const SUBJECTS = [
  { id: '', label: 'Any' }, { id: 'city plan', label: 'City plans' }, { id: 'military', label: 'Military' }, { id: 'railroad', label: 'Railways' },
  { id: 'nautical chart', label: 'Sea charts' }, { id: 'administrative', label: 'Administrative' }, { id: 'atlas', label: 'Atlases' },
];
const SPANS = [10, 25, 50, 100, 0];

export interface ActiveOverlay { id: string; map: HistMap; overlay: Overlay; opacity: number }

export function MapArchivePanel({ at, year, bbox, overlays, setOverlays }: {
  at?: { name: string; lat: number; lon: number };
  year: HistYear;
  bbox: () => [number, number, number, number] | undefined;
  overlays: ActiveOverlay[];
  setOverlays: (o: ActiveOverlay[]) => void;
}) {
  const [q, setQ] = useState(at?.name ?? '');
  const [span, setSpan] = useState(25);
  const [subject, setSubject] = useState('');
  const [here, setHere] = useState(true);
  const [res, setRes] = useState<{ maps: HistMap[]; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<HistMap | null>(null);
  const [checking, setChecking] = useState<Record<string, 'checking' | 'none' | string>>({});
  useEffect(() => { if (at?.name) setQ(at.name); }, [at?.name]);
  const run = async () => {
    setBusy(true);
    try {
      const from = span ? year - span : undefined;
      const to = span ? year + span : undefined;
      setRes(await searchMaps({ q: q.trim() || undefined, bbox: here ? bbox() : undefined, from, to, subject: subject || undefined }));
    } finally { setBusy(false); }
  };
  const overlay = async (m: HistMap) => {
    setChecking((c) => ({ ...c, [m.id]: 'checking' }));
    const g = await findGeoref(m);
    if (!g) { setChecking((c) => ({ ...c, [m.id]: 'none' })); return; }
    const r = overlayFor(g, await imageLimits(g.imageService));
    if (!r.ok) { setChecking((c) => ({ ...c, [m.id]: r.reason })); return; }
    setChecking((c) => ({ ...c, [m.id]: 'ok' }));
    if (!overlays.some((x) => x.id === m.id)) setOverlays([...overlays, { id: m.id.replace(/[^a-z0-9]/gi, '_'), map: m, overlay: r.overlay, opacity: 0.75 }].slice(-2));
  };
  return (
    <div className="col gap-8">
      <div className="atlas-note-box">
        <b>Original maps, not reconstructions.</b> These are maps made at the time. Each shows what its maker knew, believed and chose to show — with the conventions, errors and purposes of its day. The coloured layers are modern scholarly reconstructions; the two are not interchangeable.
      </div>
      <form className="col gap-4" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <div className="row" style={{ gap: 6 }}>
          <input className="input sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Place, region or subject" aria-label="Search historical maps" />
          <button className="btn sm primary" disabled={busy}>{busy ? '…' : 'Find maps'}</button>
        </div>
        <div className="row wrap gap-4 tiny">
          <span className="faint">Made within</span>
          {SPANS.map((s) => <button type="button" key={s} className={`chip ${span === s ? 'on' : ''}`} style={{ minHeight: 24, fontSize: 11 }} onClick={() => setSpan(s)}>{s ? `±${s} yrs of ${yearLabel(year)}` : 'any date'}</button>)}
        </div>
        <div className="row wrap gap-4 tiny">
          {SUBJECTS.map((s) => <button type="button" key={s.id} className={`chip ${subject === s.id ? 'on' : ''}`} style={{ minHeight: 24, fontSize: 11 }} onClick={() => setSubject(s.id)}>{s.label}</button>)}
        </div>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={here} onChange={(e) => setHere(e.target.checked)} /> Include maps someone has georeferenced for this map area (Allmaps)</label>
      </form>

      {overlays.length > 0 && (
        <div className="card tight">
          <b className="small">On the map now</b>
          {overlays.map((o) => (
            <div key={o.id} className="mt-4">
              <div className="small">{o.map.title} <span className="faint">({mapDateLabel(o.map)})</span></div>
              <label className="row tiny" style={{ gap: 6 }}>Transparency
                <input type="range" min={0} max={1} step={0.05} value={o.opacity} onChange={(e) => setOverlays(overlays.map((x) => (x.id === o.id ? { ...x, opacity: Number(e.target.value) } : x)))} style={{ flex: 1 }} aria-label={`Opacity of ${o.map.title}`} />
                <button type="button" className="btn xs ghost" onClick={() => setOverlays(overlays.filter((x) => x.id !== o.id))}>Remove</button>
              </label>
              <div className="tiny faint">{o.overlay.note}</div>
            </div>
          ))}
          {overlays.length === 2 && <button type="button" className="btn xs mt-4" onClick={() => setOverlays(overlays.map((x) => ({ ...x, opacity: x.opacity > 0.5 ? 0 : 0.85 })))}>⇄ Flip between the two maps</button>}
          <div className="tiny faint mt-4">Slide transparency to compare the old map with the reconstruction and modern geography underneath.</div>
        </div>
      )}

      {res && (
        <>
          {res.errors.map((e) => <div key={e} className="tiny faint">{e}</div>)}
          {!res.maps.length && <><div className="small muted">No maps found for this search.</div><EmptyNote type="maps" at={at} year={year} /></>}
          <div className="atlas-maps">
            {res.maps.slice(0, 40).map((m) => (
              <div key={m.id} className="atlas-mapcard">
                <button className="atlas-mapthumb" onClick={() => setView(m)} aria-label={`View ${m.title}`}>{m.thumb ? <img src={m.thumb} alt="" loading="lazy" /> : <span>🗺</span>}</button>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 700 }}>{m.title}</div>
                  <div className="tiny faint">{mapDateLabel(m)}{m.creator ? ` · ${m.creator}` : ''}</div>
                  <div className="tiny faint">{m.holder}</div>
                  <div className="row wrap gap-4 mt-4">
                    <button className="btn xs" onClick={() => setView(m)}>View</button>
                    {checking[m.id] === 'none' ? <span className="tiny faint">Not georeferenced yet — view only</span>
                      : checking[m.id] && !['checking', 'ok'].includes(checking[m.id]) ? <span className="tiny faint">{checking[m.id]}</span>
                      : <button className="btn xs" disabled={checking[m.id] === 'checking'} onClick={() => overlay(m)}>{checking[m.id] === 'checking' ? 'Checking…' : checking[m.id] === 'ok' ? 'On the map ✓' : m.georef ? 'Overlay on map' : 'Try overlay'}</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="tiny faint">Library of Congress, David Rumsey Map Collection (CC BY-NC-SA) and georeferences from Allmaps. Rights stay with each collection — see the record.</div>
      {view && <MapViewer map={view} onClose={() => setView(null)} />}
    </div>
  );
}

/** Full-screen viewer for one original map: pinch or buttons to zoom, drag to pan. */
export function MapViewer({ map, onClose }: { map: HistMap; onClose: () => void }) {
  const [z, setZ] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const pts = useRef(new Map<number, [number, number]>());
  const last = useRef<{ d?: number; c?: [number, number] }>({});
  const [src, setSrc] = useState<string | undefined>(map.thumb);
  useEffect(() => { if (map.iiif) viewerUrl(map.iiif).then(setSrc).catch(() => {}); }, [map.iiif]);
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    const p = [...pts.current.values()];
    if (p.length === 2) {
      const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      if (last.current.d) setZ((v) => Math.max(1, Math.min(8, v * (d / last.current.d!))));
      last.current.d = d;
    } else if (p.length === 1) {
      const c = p[0];
      if (last.current.c) setPan(([x, y]) => [x + c[0] - last.current.c![0], y + c[1] - last.current.c![1]]);
      last.current.c = c;
    }
  };
  const end = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); last.current = {}; };
  return (
    <div className="map-viewer" role="dialog" aria-label={`Historical map: ${map.title}`}>
      <div className="map-viewer-bar">
        <button className="btn sm ghost" onClick={onClose}>✕ Close</button>
        <span className="row" style={{ gap: 4 }}>
          <button className="btn sm ghost" onClick={() => setZ((v) => Math.min(8, v * 1.5))} aria-label="Zoom in">+</button>
          <button className="btn sm ghost" onClick={() => setZ((v) => Math.max(1, v / 1.5))} aria-label="Zoom out">−</button>
          <button className="btn sm ghost" onClick={() => { setZ(1); setPan([0, 0]); }}>Reset</button>
        </span>
      </div>
      <div className="map-viewer-stage" onPointerDown={(e) => { pts.current.set(e.pointerId, [e.clientX, e.clientY]); (e.target as Element).setPointerCapture?.(e.pointerId); }} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}
        onWheel={(e) => setZ((v) => Math.max(1, Math.min(8, v * (e.deltaY < 0 ? 1.15 : 0.87))))}>
        {src && <img src={src} alt={map.title} draggable={false} style={{ transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${z})` }} />}
      </div>
      <div className="map-viewer-caption">
        <b>{map.title}</b>
        <div className="tiny">{mapDateLabel(map)}{map.creator ? ` · ${map.creator}` : ''} · {map.holder}</div>
        <div className="tiny">An original map of its time — it reflects its maker’s knowledge and purposes, not an objective record of everything that existed. · {map.rights} · <a href={map.page} target="_blank" rel="noreferrer">Catalogue record ↗</a></div>
      </div>
    </div>
  );
}

// ── Coverage & sources ────────────────────────────────────────────────────

const MATRIX_TYPES: DataType[] = ['places', 'names', 'settlements', 'political', 'administrative', 'physical', 'roads', 'routes', 'battles', 'religious', 'maps'];

export function CoveragePanel({ at, year }: { at?: { lat: number; lon: number }; year: HistYear }) {
  const region = at ? regionAt(at.lon, at.lat) : undefined;
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="col gap-8">
      <div className="small">
        <b>Digital data coverage{region ? ` — ${regionLabel(region)}` : ''}</b>
        <div className="tiny faint">How much open, structured digital data exists — <i>not</i> how much history happened. Left mark: what Shelf can use now; right: what exists anywhere.</div>
      </div>
      {region ? (
        <div className="atlas-matrix" role="table" aria-label="Coverage matrix">
          <div role="row" className="atlas-matrix-row head"><span role="columnheader" />{PERIODS.slice(1).map((p) => <span key={p.id} role="columnheader" className={year >= p.from && year <= p.to ? 'now' : ''}>{p.label}</span>)}</div>
          {MATRIX_TYPES.map((t) => (
            <div key={t} role="row" className="atlas-matrix-row">
              <span role="rowheader">{DATA_TYPES.find((d) => d.id === t)!.label}</span>
              {PERIODS.slice(1).map((p) => {
                const c = cell(region, p.id, t);
                return <span key={p.id} role="cell" className={year >= p.from && year <= p.to ? 'now' : ''} title={`${QUALITY_LABEL[c.inShelf]} in Shelf · ${QUALITY_LABEL[c.exists]} exists${c.sources.length ? ` · ${c.sources.slice(0, 3).map((s) => s.name).join(', ')}` : ''}`}>{QUALITY_MARK[c.inShelf]}{c.exists !== c.inShelf ? QUALITY_MARK[c.exists] : ''}</span>;
              })}
            </div>
          ))}
        </div>
      ) : <div className="small muted">Choose a place or describe the map centre to see coverage there.</div>}
      <div className="tiny faint">🟢 Excellent · 🟡 Moderate · 🟠 Limited · 🔴 Very limited / no structured data. Two marks: Shelf’s coverage, then better coverage that exists elsewhere.</div>
      {at && <SourceChoice at={at} year={year} />}
      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>All sources in the registry ({SOURCES.length})</summary>
        <div className="col mt-4" style={{ gap: 6 }}>
          {SOURCES.filter((s) => showAll || s.access !== 'excluded').map((s) => (
            <div key={s.id} className="atlas-src-row">
              <b>{s.name}</b> <span className="tiny faint">· Tier {s.tier}: {TIER_LABEL[s.tier]} · {s.access === 'offline' ? 'in Shelf (offline)' : s.access === 'live' ? 'in Shelf (live)' : s.access === 'catalogued' ? 'catalogued — not used yet' : 'excluded'}</span>
              <div className="tiny">{s.provider} · {s.license}{s.commercial === false ? ' (non-commercial)' : ''} · <a href={s.url} target="_blank" rel="noreferrer">site ↗</a></div>
              <div className="tiny faint">{s.temporal}. {s.limitations.join('. ')}{s.note ? `. ${s.note}` : ''}{s.verified ? ` · Checked ${s.verified}` : ''}</div>
            </div>
          ))}
          <button className="btn xs" onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide excluded sources' : 'Show excluded sources too'}</button>
        </div>
      </details>
    </div>
  );
}

function SourceChoice({ at, year }: { at: { lat: number; lon: number }; year: HistYear }) {
  const [type, setType] = useState<DataType>('places');
  const sel = useMemo(() => selectSources({ lon: at.lon, lat: at.lat, year, type }), [at.lat, at.lon, year, type]);
  return (
    <div className="card tight">
      <div className="row wrap gap-4 small"><b>Best sources here for</b>
        <select className="select sm" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as DataType)} aria-label="Kind of information">{DATA_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
      </div>
      <ol className="small mt-4" style={{ paddingLeft: 18, margin: 0 }}>
        {sel.choices.slice(0, 6).map((c) => <li key={c.source.id} style={{ opacity: c.usable ? 1 : 0.65 }}>{c.source.name} <span className="tiny faint">— {c.why}</span></li>)}
      </ol>
      {!sel.choices.length && <div className="small muted">{sel.explanation}</div>}
      <div className="tiny faint mt-4">{sel.explanation}</div>
    </div>
  );
}

// ── What changed? ─────────────────────────────────────────────────────────

export function WhatChangedPanel({ at, year, onShow }: { at?: { name: string; lat: number; lon: number }; year: HistYear; onShow: (y: HistYear) => void }) {
  const [b, setB] = useState<HistYear>(year + (year < 0 ? 2 : 50));
  const [a, setA] = useState<HistYear>(year);
  const [text, setText] = useState('');
  const [res, setRes] = useState<WhatChanged | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setA(year); }, [year]);
  useEffect(() => {
    setRes(null);
    if (!at) return;
    let dead = false;
    setBusy(true);
    whatChanged([at.lon, at.lat], a, b).then((r) => !dead && setRes(r)).finally(() => !dead && setBusy(false));
    return () => { dead = true; };
  }, [at?.lat, at?.lon, a, b]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!at) return <div className="small muted">Choose a place first — the comparison is for that spot.</div>;
  return (
    <div className="col gap-8">
      <div className="row wrap gap-4 small">
        <button className="btn sm" onClick={() => onShow(Math.min(a, b))}>Show {yearLabel(Math.min(a, b))}</button>
        <span className="faint">vs</span>
        <button className="btn sm" onClick={() => onShow(Math.max(a, b))}>Show {yearLabel(Math.max(a, b))}</button>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const d = parseHistoricalDate(text); if (d) { setB(d.year); setText(''); } }}>
        <input className="input sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Second date (e.g. ${year < 0 ? '216 BC' : year + 300})`} aria-label="Second date" />
        <button className="btn sm" disabled={!text.trim()}>Compare</button>
      </form>
      {busy && <div className="small muted">Comparing {at.name} in {yearLabel(Math.min(a, b))} and {yearLabel(Math.max(a, b))}…</div>}
      {res && (
        <>
          <b className="small">What changed at {at.name}, {yearLabel(res.a)} → {yearLabel(res.b)}</b>
          {res.changes.length ? (
            <ul className="atlas-facts">{res.changes.map((c, i) => <li key={i}><span>{c.kind}</span>{c.text}<small>{c.source}</small></li>)}</ul>
          ) : <div className="small muted">No differences recorded in Shelf’s data between these dates here.</div>}
          {res.unchanged.length > 0 && <div className="tiny faint">{res.unchanged.join(' ')}</div>}
          {res.notes.map((n) => <div key={n} className="tiny faint">{n}</div>)}
        </>
      )}
    </div>
  );
}

// ── Extra context for a place (political, administrative, cross-checks…) ──

export function PlaceWorldExtras({ place, year, onOpenMaps, onOpenPlace }: { place: ReaderPlace; year: HistYear; onOpenMaps: () => void; onOpenPlace: (key: string, name: string) => void }) {
  const [hg, setHg] = useState<HistogisUnit[] | null>(null);
  const [cg, setCg] = useState<ChgisPlace[] | null>(null);
  const [cc, setCc] = useState<CrossCheck | null>(null);
  const [near, setNear] = useState<{ key: string; title: string; km: number }[] | null>(null);
  const [ai, setAi] = useState<{ text?: string; busy?: boolean; error?: string } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setHg(null); setCg(null); setCc(null); setNear(null); setAi(null);
    histogisWhereWas(place.lat, place.lon, year, c.signal).then(setHg).catch(() => setHg([]));
    chgisFor(place, year, c.signal).then(setCg).catch(() => setCg([]));
    crossCheck(place, c.signal).then(setCc).catch(() => {});
    nearbyPlaces([place.lon, place.lat], 25, { year, slack: 50, exclude: place.key, filter: (p) => p.title !== 'Untitled' && p.precise }).then((n) => setNear(n.slice(0, 6).map((x) => ({ key: x.place.key, title: x.place.title, km: x.km })))).catch(() => setNear([]));
    return () => c.abort();
  }, [place.key, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const modern = place.names.filter((n) => (n.from ?? -Infinity) >= 1700 && n.name.toLowerCase() !== place.title.toLowerCase()).map((n) => n.name);
  const disagreements = [...(place.disagreements ?? []), ...(cc?.disagreements ?? [])];
  const cov = cellAt(place.lon, place.lat, year, 'places');
  const ask = async () => {
    setAi({ busy: true });
    // Only the sourced facts above are given to the AI, and its answer is labelled as an interpretation.
    const facts = [`Place: ${place.title} (${place.written} in the book)`, `Recorded: ${formatDate(place.when)}`, `Types: ${place.types.join(', ')}`, place.partOf.length ? `Part of: ${place.partOf.join(', ')}` : '', hg?.length ? `In ${year}: ${hg.map((u) => u.altName ?? u.name).join(', ')}` : '', `Year being read about: ${yearLabel(year)}`].filter(Boolean).join('\n');
    try {
      const r = await complete({ system: 'You explain the historical significance of places to a reader. Use only general, widely accepted knowledge; say when something is uncertain. Do not state coordinates, borders or precise dates beyond the facts given. 3–5 sentences.', messages: [{ role: 'user', content: `Why was this place historically significant around this time?\n${facts}` }], task: 'history', maxTokens: 400 });
      setAi({ text: r.text });
    } catch (e) { setAi({ error: (e as Error).message || 'No AI service is set up.' }); }
  };
  return (
    <div className="card tight col gap-8">
      <b className="small">More about {place.title}</b>
      <dl className="hmap-facts" style={{ margin: 0 }}>
        {modern.length > 0 && <><dt>Modern name</dt><dd>{modern.slice(0, 3).join(', ')} <span className="tiny faint">({place.sources[0]?.name})</span></dd></>}
        {cc && cc.agreeing[0]?.parent && cc.agreeing[0].title.toLowerCase() !== place.title.toLowerCase() && <><dt>Also known as</dt><dd>{cc.agreeing[0].title} <span className="tiny faint">(WHG)</span></dd></>}
        {hg && hg.length > 0 && <><dt>Political & administrative ({yearLabel(year)})</dt><dd>{hg.map((u) => `${u.altName ?? u.name}${u.unit ? ` (${u.unit})` : ''}`).join(' · ')} <span className="tiny faint">(HistoGIS — {[...new Set(hg.map((u) => u.source))].join('; ')}; valid {formatDate(hg[0].when)})</span></dd></>}
        {cg && cg.length > 0 && <><dt>Chinese administrative records</dt><dd>{cg.slice(0, 4).map((r) => `${r.name} ${r.transcription} (${r.type ?? ''}${r.parent ? `, under ${r.parent}` : ''}; ${formatDate(r.when)})`).join(' · ')} <span className="tiny faint">(CHGIS)</span></dd></>}
        {near && near.length > 0 && <><dt>Nearby places then</dt><dd>{near.map((n, i) => <span key={n.key}>{i ? ', ' : ''}<button className="why-link" onClick={() => onOpenPlace(n.key, n.title)}>{n.title}</button> <span className="tiny faint">{Math.round(n.km / 1.609)} mi</span></span>)}</dd></>}
        <dt>Evidence</dt><dd>{EVIDENCE[place.evidence ?? 'single-source'].label} — {EVIDENCE[place.evidence ?? 'single-source'].text}{cc && cc.agreeing.length ? ` WHG holds ${cc.agreeing.length} record${cc.agreeing.length === 1 ? '' : 's'} at the same spot (${[...new Set(cc.agreeing.map((r) => r.dataset))].slice(0, 4).join(', ')}).` : ''}</dd>
        <dt>Data coverage</dt><dd>{QUALITY_MARK[cov.inShelf]} {QUALITY_LABEL[cov.inShelf]} for places in {regionLabel(cov.region)}, {periodLabel(cov.period)}{cov.exists !== cov.inShelf ? ` (better data exists: ${cov.sources.find((s) => s.access === 'catalogued')?.name})` : ''}.</dd>
      </dl>
      {disagreements.length > 0 && (
        <div className="atlas-disagree">
          <b className="small">Sources differ</b>
          {disagreements.map((d, i) => (
            <div key={i} className="tiny mt-4">
              {d.claims.map((c) => <div key={c.source}>• <b>{c.source}</b>: {c.value}</div>)}
              {d.note && <div className="faint">{d.note}</div>}
            </div>
          ))}
          <div className="tiny faint mt-4">Both are shown; Shelf doesn’t average or pick one.</div>
        </div>
      )}
      {cc?.error && <div className="tiny faint">{cc.error}</div>}
      <div className="row wrap gap-4">
        <button className="btn sm" onClick={onOpenMaps}>🗺 Historical maps of {place.title}</button>
        <button className="btn sm ghost" onClick={ask} disabled={ai?.busy}>{ai?.busy ? 'Asking…' : '✨ Why was it significant? (AI)'}</button>
      </div>
      {ai?.text && <div className="atlas-ai"><div className="tiny" style={{ fontWeight: 800 }}>AI interpretation — not a historical source</div><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{ai.text}</div><div className="tiny faint">Generated from the sourced facts above plus the AI’s general knowledge. Check important claims.</div></div>}
      {ai?.error && <div className="tiny faint">{ai.error}</div>}
      {cc && cc.agreeing.length > 0 && (
        <details className="atlas-src">
          <summary>Other records of this place (World Historical Gazetteer)</summary>
          <ul>{cc.agreeing.slice(0, 10).map((r) => <li key={r.placeId}>{r.title} <span className="faint">· {r.dataset}{r.timespans.length ? ` · ${r.timespans.map(spanLabel).join(', ')}` : ''} · {r.km < 1 ? '<1' : Math.round(r.km)} km</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

// ── The world of this book ────────────────────────────────────────────────

export function BookWorldPanel({ row, profile, building, progress, onBuild, onShow, onOpenPlace, onJumpChapter, onWar, year }: {
  row?: BookWorldRow; profile?: WorldProfile | null; building: boolean; progress?: { stage: string; done: number; total: number };
  onBuild: () => void; onShow: () => void; onOpenPlace: (key: string, name: string) => void; onJumpChapter: (cfi: string) => void; onWar: (q: string, name: string) => void; year: HistYear;
}) {
  if (!row || !row.done) {
    return (
      <div className="col gap-8">
        <b>The world of this book</b>
        <div className="small muted">Shelf can read the whole book once — in the background, without leaving your page — to find every place it mentions, the dates it gives and the wars and events it names, then build a map of the book’s world. It’s saved, so it only happens once.</div>
        <div className="tiny faint">Names come from the text; locations only from historical datasets. A few online lookups may be made for names the offline gazetteers can’t settle.</div>
        {building && progress ? <div className="small">{progress.stage} {progress.done}/{progress.total}…<div className="atlas-bar"><span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div></div>
          : <button className="btn primary" onClick={onBuild}>{row ? 'Finish building this book’s world' : 'Build this book’s world'}</button>}
      </div>
    );
  }
  if (!profile) return <div className="small muted">Putting the world together…</div>;
  return (
    <div className="col gap-8">
      <div className="row between"><b>The world of this book</b><button className="btn sm primary" onClick={onShow}>🗺 Show me this world</button></div>
      <dl className="hmap-facts" style={{ margin: 0 }}>
        <dt>When</dt><dd>{formatDate(profile.period)} <span className="tiny faint">({profile.period.source})</span></dd>
        <dt>Where</dt><dd>{profile.places.length} places identified{profile.places[0] ? `, mostly around ${profile.places.slice(0, 3).map((p) => p.title).join(', ')}` : ''}</dd>
        {profile.polities.length > 0 && <><dt>Political entities then</dt><dd>{profile.polities.slice(0, 8).map((p) => p.n).join(' · ')} <span className="tiny faint">(Cliopatria, around {yearLabel(profile.period.preferred ?? year)})</span></dd></>}
      </dl>
      {profile.wars.length > 0 && <div><div className="eyebrow">Wars the book names</div>{profile.wars.map((w) => <button key={w.q} className="atlas-war" onClick={() => onWar(w.q, w.n)}>⚔ {w.n} <span className="faint">named in {w.chapters.length} section{w.chapters.length === 1 ? '' : 's'}</span></button>)}</div>}
      {profile.events.length > 0 && <div><div className="eyebrow">Events the book names</div><div className="small">{profile.events.slice(0, 12).map((e) => `${e.n} (${yearLabel(e.y)})`).join(' · ')}</div></div>}
      <div>
        <div className="eyebrow">Places in the book ({profile.places.length})</div>
        <div className="col" style={{ gap: 2 }}>
          {profile.places.slice(0, 60).map((p) => (
            <div key={p.key} className="atlas-row">
              <span className="grow" style={{ minWidth: 0 }}>
                <button className="why-link" onClick={() => onOpenPlace(p.key, p.written[0])}>{p.title}</button>
                {p.written.some((w) => w.toLowerCase() !== p.title.toLowerCase()) && <span className="tiny faint"> · “{p.written.join('”, “')}”</span>}
                <span className="tiny faint" style={{ display: 'block' }}>{p.mentions} mention{p.mentions === 1 ? '' : 's'} in {p.chapters.length} section{p.chapters.length === 1 ? '' : 's'} · {p.source}</span>
              </span>
              {p.first?.cfi && <button className="btn xs ghost" onClick={() => onJumpChapter(p.first!.cfi!)} aria-label={`Go to where ${p.title} is first mentioned`}>↩ first mention</button>}
            </div>
          ))}
        </div>
      </div>
      {profile.unresolved.length > 0 && (
        <details><summary className="small" style={{ cursor: 'pointer' }}>Names not identified with confidence ({profile.unresolved.length})</summary>
          <div className="tiny mt-4">{profile.unresolved.slice(0, 60).map((u) => u.name).join(' · ')}</div>
          <div className="tiny faint">Ambiguous names (several places share them) or names no dataset for this period records. Tap one in the book to choose.</div>
        </details>
      )}
    </div>
  );
}
