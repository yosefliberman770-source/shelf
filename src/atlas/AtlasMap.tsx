// The Historical Atlas map: independent, toggleable layers from scholarly
// datasets, all following one timeline. Nothing is drawn without a source;
// uncertain or undated things are drawn differently and say so when tapped.
import type { GeoJSONSource, LayerSpecification, Map as MLMap, MapGeoJSONFeature, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AtlasLayerDef, credit, DATASET_CREDIT, DEFAULT_LAYERS, DRAW_ORDER, GROUPS, type LayerCtx, layerById, LAYERS, PALETTE, SOURCE_SPECS } from './catalog';
import { type HistYear, yearLabel } from './time';
import { Timeline } from './Timeline';

export interface AtlasFocus { name: string; lat: number; lon: number; approximate?: boolean; note?: string }
export interface AtlasPin { name: string; lat: number; lon: number }
export interface AtlasView { lat: number; lon: number; zoom: number; bbox?: [number, number, number, number] }

const LAYERS_KEY = 'shelf.atlas.layers';
const GLYPHS = 'https://www.openhistoricalmap.org/map-styles/fonts/{fontstack}/{range}.pbf';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const TOP = 'focus-halo';

/** WebGL is needed for the atlas; without it the reader falls back to the simple map. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function loadEnabled(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') as string[] | null;
    if (Array.isArray(v)) return v.filter((id) => layerById(id) && !layerById(id)!.unavailable);
  } catch { /* ignore */ }
  return DEFAULT_LAYERS;
}

function baseStyle(base: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      'ne-land': { type: 'geojson', data: base + 'ne-land.json', attribution: credit('naturalearth') },
      focus: { type: 'geojson', data: EMPTY },
      pins: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': '#cddde4' } },
      { id: 'land', type: 'fill', source: 'ne-land', paint: { 'fill-color': '#efe7d4' } },
      // Uncertain location: a soft circle instead of a sharp point.
      { id: TOP, type: 'circle', source: 'focus', filter: ['==', ['get', 'approx'], true], paint: { 'circle-radius': 34, 'circle-color': '#d84315', 'circle-opacity': 0.12, 'circle-stroke-color': '#d84315', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.5 } },
      { id: 'pins-pt', type: 'circle', source: 'pins', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#d84315', 'circle-stroke-width': 2.2 } },
      { id: 'pins-label', type: 'symbol', source: 'pins', layout: { 'text-field': ['get', 'name'], 'text-font': ['OpenHistorical Bold'], 'text-size': 12, 'text-offset': [0, 1], 'text-anchor': 'top' }, paint: { 'text-color': '#8a2c0d', 'text-halo-color': PALETTE.halo, 'text-halo-width': 1.6 } },
      { id: 'focus-pt', type: 'circle', source: 'focus', paint: { 'circle-radius': 8, 'circle-color': '#d84315', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } },
      { id: 'focus-label', type: 'symbol', source: 'focus', layout: { 'text-field': ['get', 'name'], 'text-font': ['OpenHistorical Bold'], 'text-size': 15, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#8a2c0d', 'text-halo-color': PALETTE.halo, 'text-halo-width': 2 } },
    ],
  };
}

// ── Data used in panels (wars list, war sequence) ─────────────────────────
interface War { q: string; n: string; f: HistYear | null; t: HistYear | null }
type EventFeature = { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { q: string; n: string; k: string; y: HistYear; w?: string; wn?: string; u?: number; yp?: string } };
const cache = new Map<string, Promise<unknown>>();
function getJSON<T>(url: string): Promise<T> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).catch((e) => { cache.delete(url); throw e; }));
  return cache.get(url) as Promise<T>;
}

export function AtlasMap({ view, year, onYearChange, focus, pins, marks, className }: {
  view?: AtlasView;
  year: HistYear;
  onYearChange: (y: HistYear) => void;
  focus?: AtlasFocus;
  pins?: AtlasPin[];
  marks?: { year: HistYear; label: string }[];
  className?: string;
}) {
  const base = `${import.meta.env.BASE_URL}atlas/`;
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const managed = useRef(new Map<string, string[]>()); // layer def id → maplibre layer ids
  const clioSlice = useRef<string>('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);
  const [panel, setPanel] = useState(false);
  const [eventWindow, setEventWindow] = useState(0);
  const [war, setWar] = useState<string | undefined>();
  const [info, setInfo] = useState<Info | null>(null);
  const ctx: LayerCtx = useMemo(() => ({ year, base, eventWindow, war }), [year, base, eventWindow, war]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => { try { localStorage.setItem(LAYERS_KEY, JSON.stringify(enabled)); } catch { /* ignore */ } }, [enabled]);

  // ── Create the map once ──
  useEffect(() => {
    let dead = false;
    let map: MLMap | undefined;
    (async () => {
      try {
        const ml = await import('maplibre-gl');
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (dead || !host.current) return;
        map = new ml.Map({
          container: host.current,
          style: baseStyle(base),
          center: view ? [view.lon, view.lat] : [15, 40],
          zoom: view?.zoom ?? 4,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          maxZoom: 15,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');
        map.on('load', () => {
          if (dead) return;
          // Keep the credits folded behind the ⓘ button so they don't cover the map on a phone.
          host.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
          setReady(true);
        });
        map.on('error', (e) => { if (!map?.loaded()) console.warn('atlas', e.error?.message); });
        map.on('click', (e) => onClickRef.current(e));
        mapRef.current = map;
        (window as unknown as { __shelfAtlas?: MLMap }).__shelfAtlas = map;
      } catch (e) {
        if (!dead) setFailed((e as Error).message || 'The map couldn’t start.');
      }
    })();
    return () => { dead = true; map?.remove(); mapRef.current = null; managed.current.clear(); clioSlice.current = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keep layers in step with the toggles and the year ──
  const sync = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const c = ctxRef.current;
    const want = DRAW_ORDER.map(layerById).filter((d): d is AtlasLayerDef => !!d && !d.unavailable && enabledRef.current.includes(d.id));
    // Remove layers that were switched off.
    for (const [id, ids] of managed.current) {
      if (want.some((d) => d.id === id)) continue;
      for (const lid of ids) if (map.getLayer(lid)) map.removeLayer(lid);
      managed.current.delete(id);
    }
    for (const def of want) {
      for (const s of def.sources) if (!map.getSource(s)) map.addSource(s, SOURCE_SPECS[s](c));
      const specs = def.specs(c);
      const existing = managed.current.get(def.id);
      if (existing) {
        for (const spec of specs) if ('filter' in spec && spec.filter && map.getLayer(spec.id)) map.setFilter(spec.id, spec.filter);
        continue;
      }
      // Insert below the next layer in draw order that's already on the map.
      const after = DRAW_ORDER.slice(DRAW_ORDER.indexOf(def.id) + 1).map((id) => managed.current.get(id)?.[0]).find(Boolean) ?? TOP;
      for (const spec of specs) if (!map.getLayer(spec.id)) map.addLayer(spec as LayerSpecification, after);
      managed.current.set(def.id, specs.map((s) => s.id));
    }
    // Borders come in time slices; load the slice that covers the year.
    if (map.getSource('cliopatria')) {
      try {
        const index = await getJSON<{ from: number; to: number; file: string }[]>(c.base + 'cliopatria/index.json');
        const slice = index.find((s) => s.from <= c.year && c.year <= s.to);
        const url = slice ? c.base + slice.file : '';
        if (url !== clioSlice.current) {
          clioSlice.current = url;
          (map.getSource('cliopatria') as GeoJSONSource).setData(url || EMPTY);
        }
      } catch { /* offline: borders stay as they were */ }
    }
  }, [ready]);

  useEffect(() => { void sync(); }, [sync, enabled, ctx]);

  // ── The picked war: its battles and sieges, numbered in date order ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource('war-sequence')) return;
    const src = map.getSource('war-sequence') as GeoJSONSource;
    if (!war) { src.setData(EMPTY); return; }
    getJSON<{ features: EventFeature[] }>(base + 'wikidata-events.json').then((d) => {
      const list = d.features.filter((f) => f.properties.w === war).sort((a, b) => a.properties.y - b.properties.y);
      src.setData({ type: 'FeatureCollection', features: list.map((f, i) => ({ ...f, properties: { ...f.properties, ord: i + 1, yl: yearLabel(f.properties.y) } })) });
      if (list.length > 1) {
        const xs = list.map((f) => f.geometry.coordinates[0]);
        const ys = list.map((f) => f.geometry.coordinates[1]);
        map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 50, maxZoom: 7, duration: 600 });
      }
    }).catch(() => {});
  }, [war, ready, enabled, base]);

  // ── Focus and pins ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('focus') as GeoJSONSource).setData(focus ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [focus.lon, focus.lat] }, properties: { name: focus.name, approx: !!focus.approximate } }] } : EMPTY);
    (map.getSource('pins') as GeoJSONSource).setData({ type: 'FeatureCollection', features: (pins ?? []).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { name: p.name } })) });
  }, [ready, focus?.name, focus?.lat, focus?.lon, focus?.approximate, pins]);

  // ── Move to a new place ──
  const viewKey = view ? `${view.lat.toFixed(4)},${view.lon.toFixed(4)},${view.zoom}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !view) return;
    if (view.bbox) map.fitBounds([[view.bbox[0], view.bbox[1]], [view.bbox[2], view.bbox[3]]], { padding: 40, maxZoom: 9, duration: 700 });
    else map.flyTo({ center: [view.lon, view.lat], zoom: view.zoom, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, ready]);

  // ── Tap a feature for its details and source ──
  const onClickRef = useRef<(e: MapMouseEvent) => void>(() => {});
  onClickRef.current = (e) => {
    const map = mapRef.current;
    if (!map) return;
    const ids = [...managed.current.values()].flat().filter((id) => map.getLayer(id) && map.getLayer(id)!.type !== 'hillshade');
    const box: [[number, number], [number, number]] = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
    const hits = map.queryRenderedFeatures(box, { layers: ids });
    // Points before lines before areas.
    const rank = (f: MapGeoJSONFeature) => (f.layer.type === 'circle' ? 0 : f.layer.type === 'symbol' ? 1 : f.layer.type === 'line' ? 2 : 3);
    const f = hits.sort((a, b) => rank(a) - rank(b))[0];
    setInfo(f ? describe(f, ctxRef.current.year) : null);
  };

  const toggle = (id: string) => setEnabled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (failed) return <div className="hmap-empty">{failed}</div>;
  return (
    <div className={`atlas ${className ?? ''}`}>
      <div className="atlas-map">
        <div className="atlas-canvas" ref={host} />
        <button className="btn sm atlas-layers-btn" onClick={() => setPanel(!panel)} aria-expanded={panel}>☰ Layers</button>
        {!ready && <div className="atlas-loading">Loading the atlas…</div>}
        {panel && <LayerPanel enabled={enabled} toggle={toggle} year={year} eventWindow={eventWindow} setEventWindow={setEventWindow} war={war} setWar={setWar} base={base} onClose={() => setPanel(false)} />}
      </div>
      <Timeline year={year} onChange={onYearChange} marks={marks} />
      {info && <FeatureCard info={info} onClose={() => setInfo(null)} />}
      <AtlasSources enabled={enabled} />
    </div>
  );
}

// ── Layer panel ───────────────────────────────────────────────────────────

function coverageNote(d: AtlasLayerDef, year: HistYear): string | undefined {
  if (!d.coverage) return undefined;
  const [a, b] = d.coverage;
  if (year < a || year > b) return `No data for ${yearLabel(year)} — covers ${yearLabel(a)}–${yearLabel(b)}.`;
  return undefined;
}

function LayerPanel({ enabled, toggle, year, eventWindow, setEventWindow, war, setWar, base, onClose }: {
  enabled: string[]; toggle: (id: string) => void; year: HistYear; eventWindow: number; setEventWindow: (n: number) => void;
  war?: string; setWar: (q: string | undefined) => void; base: string; onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="atlas-panel" role="dialog" aria-label="Map layers">
      <div className="row between">
        <b>Layers</b>
        <button className="btn xs ghost" onClick={onClose} aria-label="Close layers">✕</button>
      </div>
      {GROUPS.map((g) => {
        const defs = LAYERS.filter((l) => l.group === g.id || l.alsoIn?.includes(g.id));
        return (
          <div key={g.id} className="atlas-group">
            <div className="eyebrow">{g.label}</div>
            {defs.map((d) => {
              const on = enabled.includes(d.id);
              const note = on ? coverageNote(d, year) : undefined;
              return (
                <div key={`${g.id}-${d.id}`} className="atlas-layer">
                  <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={on} disabled={!!d.unavailable} onChange={() => toggle(d.id)} aria-label={d.label} />
                    <span className="grow">
                      <span className={d.unavailable ? 'faint' : ''}>{d.label}</span>
                      {d.unavailable && <span className="tiny faint"> — no open dataset</span>}
                      {note && <span className="tiny" style={{ display: 'block', color: 'var(--warn)' }}>{note}</span>}
                    </span>
                    <button type="button" className="why-link tiny" onClick={(e) => { e.preventDefault(); setOpen(open === d.id ? null : d.id); }} aria-label={`About ${d.label}`}>ⓘ</button>
                  </label>
                  {open === d.id && (
                    <div className="tiny muted atlas-hint">
                      {d.unavailable ?? d.hint}
                      {d.datasets.length > 0 && <div className="faint">Source: {d.datasets.map((id) => `${DATASET_CREDIT[id].name} (${DATASET_CREDIT[id].license})`).join(' · ')}</div>}
                    </div>
                  )}
                </div>
              );
            })}
            {g.id === 'military' && (
              <>
                <div className="row wrap gap-4 mt-8 tiny">
                  <span className="faint">Show events within</span>
                  {[0, 1, 5, 25].map((n) => <button key={n} className={`chip ${eventWindow === n ? 'on' : ''}`} style={{ minHeight: 22, fontSize: 11, padding: '0 8px' }} onClick={() => setEventWindow(n)}>{n === 0 ? 'this year' : `±${n} yrs`}</button>)}
                </div>
                {enabled.includes('wars') && <WarList year={year} war={war} setWar={setWar} base={base} />}
              </>
            )}
          </div>
        );
      })}
      <div className="atlas-group tiny muted">
        <div className="eyebrow">Reading the map</div>
        <div>● filled — precise location · ○ hollow — rough location</div>
        <div>Faded or “?” — the source marks it uncertain, or its date isn’t recorded</div>
        <div>Dashed red road — period not recorded in the source</div>
        <div>Borders show one scholarly reconstruction; real frontiers were rarely sharp lines.</div>
      </div>
    </div>
  );
}

function WarList({ year, war, setWar, base }: { year: HistYear; war?: string; setWar: (q: string | undefined) => void; base: string }) {
  const [wars, setWars] = useState<War[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { getJSON<War[]>(base + 'wikidata-wars.json').then(setWars).catch(() => setWars([])); }, [base]);
  if (!wars) return <div className="tiny faint mt-8">Loading wars…</div>;
  const active = wars.filter((w) => w.f !== null && w.f <= year && (w.t ?? w.f) >= year);
  const shown = (q ? wars.filter((w) => w.n.toLowerCase().includes(q.toLowerCase())) : active).slice(0, 25);
  return (
    <div className="mt-8">
      <div className="tiny faint">{q ? 'Matching wars' : `Wars in ${yearLabel(year)} (${active.length})`}</div>
      <input className="input sm mt-4" placeholder="Find a war…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a war" />
      <div className="col mt-4" style={{ gap: 2 }}>
        {war && <button className="btn xs" onClick={() => setWar(undefined)}>Clear selected war</button>}
        {shown.map((w) => (
          <button key={w.q} className={`atlas-war ${war === w.q ? 'on' : ''}`} onClick={() => setWar(war === w.q ? undefined : w.q)}>
            {w.n} <span className="faint">{w.f !== null ? yearLabel(w.f) : '?'}–{w.t !== null ? yearLabel(w.t) : '?'}</span>
          </button>
        ))}
        {!shown.length && <div className="tiny faint">None recorded for this year.</div>}
      </div>
      {war && <div className="tiny faint mt-4">Numbers show the order of battles and sieges — not the route armies took.</div>}
    </div>
  );
}

// ── Feature details ───────────────────────────────────────────────────────

interface Info { title: string; lines: string[]; link?: { href: string; label: string }; source: string; caution?: string }

const PERIOD_NAMES: Record<string, string> = { A: 'Archaic', C: 'Classical', H: 'Hellenistic', R: 'Roman', L: 'Late Antique' };
const periodLabel = (code?: string) => (code ? code.replace('?', '').split('').map((c) => PERIOD_NAMES[c]).filter(Boolean).join(', ') + (code.includes('?') ? ' (uncertain)' : '') : '');
const range = (f?: number, t?: number) => (f === undefined && t === undefined ? 'Dates not recorded' : `${f !== undefined ? yearLabel(f) : '?'} – ${t !== undefined ? yearLabel(t) : '?'}`);

function describe(f: MapGeoJSONFeature, year: HistYear): Info {
  const p = f.properties as Record<string, unknown>;
  const src = f.source;
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
  switch (src) {
    case 'pleiades-places':
    case 'pleiades-lines':
    case 'pleiades-provinces': {
      const lines = [str('ty')?.split(',').join(', ') ?? str('k') ?? '', `Attested: ${range(num('f'), num('t'))}${str('db') === 'names' ? ' (from name records)' : ''}`];
      if (str('a')) lines.push(`Also: ${str('a')!.split('|').join(' · ')}`);
      if (src === 'pleiades-places') lines.push(num('p') === 1 ? `Precise location${num('r') ? ` (± ${num('r')} m)` : ''}` : 'Rough location');
      return {
        title: str('n') ?? 'Place', lines: lines.filter(Boolean),
        link: { href: `https://pleiades.stoa.org/places/${num('i')}`, label: 'Pleiades record ↗' }, source: credit('pleiades'),
        caution: num('u') ? 'Pleiades marks this location as less certain.' : num('f') === undefined && num('t') === undefined ? 'The source gives no dates; shown for the ancient period only.' : 'Pleiades dates are broad periods, not founding or abandonment dates.',
      };
    }
    case 'cliopatria': {
      const c = str('c');
      return {
        title: str('n') ?? 'Polity', lines: [`${c ? c[0].toUpperCase() + c.slice(1) : 'Type not recorded'}${c ? ' (type from Wikidata)' : ''}`, `This outline: ${range(num('f'), num('t'))}`],
        link: str('q') ? { href: `https://www.wikidata.org/wiki/${str('q')}`, label: 'Wikidata ↗' } : undefined, source: credit('cliopatria'),
        caution: 'One scholarly reconstruction of the territory; borders were rarely this precise.',
      };
    }
    case 'wikidata-events':
    case 'war-sequence': {
      const y = num('y');
      return {
        title: str('n') ?? 'Event', lines: [`${str('k') ?? 'event'}${y !== undefined ? ` · ${yearLabel(y)}${str('yp') ? ` (to the ${str('yp')})` : ''}` : ''}`, ...(str('wn') ? [`Part of: ${str('wn')}`] : [])],
        link: { href: `https://www.wikidata.org/wiki/${str('q')}`, label: 'Wikidata ↗' }, source: credit('wikidata'),
        caution: num('u') ? 'The date is only known approximately.' : undefined,
      };
    }
    case 'awmc-roads':
      return {
        title: str('n') ?? 'Road', lines: [str('pc') ? `Period: ${periodLabel(str('pc'))}` : 'Period not recorded', `Dated: ${range(num('f'), num('t'))}`],
        source: credit('awmc'), caution: str('pc') ? undefined : 'The source doesn’t give this road’s period.',
      };
    case 'awmc-shoreline':
      return { title: 'Ancient shoreline', lines: [str('pc') ? `Period: ${periodLabel(str('pc'))}` : 'Period not recorded'], source: credit('awmc'), caution: num('u') || num('as') ? 'Marked less accurate in the source.' : undefined };
    case 'awmc-snapshots':
      return { title: str('n') ?? 'Territory', lines: [`Depicts ${yearLabel(num('f') ?? year)}${str('db') === 'approximate' ? ' (approximate date)' : ''}`], source: credit('awmc'), caution: 'A snapshot of one moment, not a changing border.' };
    case 'awmc-inland-water':
      return { title: str('n') ?? (str('k') ?? 'Water').replace(/^./, (x) => x.toUpperCase()), lines: [str('k') ?? ''], source: credit('awmc'), caution: 'Outline based on modern mapping.' };
    case 'ne-rivers':
      return { title: str('n') ?? 'River', lines: ['Modern course'], source: credit('naturalearth'), caution: 'Rivers have shifted since antiquity.' };
    case 'ohm': {
      const s = str('start_date');
      const e = str('end_date');
      return { title: str('name') ?? 'Feature', lines: [str('type') ?? '', s || e ? `Mapped for ${s ?? '?'} – ${e ?? 'present'}` : ''].filter(Boolean), source: credit('ohm') };
    }
    default:
      return { title: str('n') ?? str('name') ?? 'Feature', lines: [], source: '' };
  }
}

function FeatureCard({ info, onClose }: { info: Info; onClose: () => void }) {
  return (
    <div className="card tight atlas-card">
      <div className="row between">
        <b>{info.title}</b>
        <button className="btn xs ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {info.lines.map((l, i) => <div key={i} className="small">{l}</div>)}
      {info.caution && <div className="tiny faint mt-4">{info.caution}</div>}
      <div className="tiny faint mt-4">
        {info.link && <><a href={info.link.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{info.link.label}</a> · </>}
        <span dangerouslySetInnerHTML={{ __html: `Source: ${info.source}` }} />
      </div>
    </div>
  );
}

function AtlasSources({ enabled }: { enabled: string[] }) {
  const used = [...new Set(LAYERS.filter((l) => enabled.includes(l.id)).flatMap((l) => l.datasets))];
  return (
    <details className="hmap-sources">
      <summary>Sources & attribution</summary>
      <ul>
        {(['naturalearth', ...used.filter((d) => d !== 'naturalearth')] as (keyof typeof DATASET_CREDIT)[]).map((id) => (
          <li key={id} dangerouslySetInnerHTML={{ __html: credit(id) }} />
        ))}
        <li>Map fonts: OpenHistoricalMap styles (CC0). Rendering: MapLibre GL JS.</li>
        <li>Data are simplified for the phone. Nothing is added that isn’t in these sources; uncertain or undated records are drawn fainter.</li>
      </ul>
    </details>
  );
}
