// The Historical Atlas: a map with a time slider. Borders come from the
// open historical-basemaps dataset (approximate, and only for the years it
// covers); markers come from entities in your Knowledge Atlas that have a
// known location. Nothing here guesses a location or a route.
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Concept, ConceptKind } from '../db/types';
import { Segmented } from './common';
import { KIND_ICON, yearSpan } from './entity';

const BASEMAPS = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master';
const MIN_YEAR = -3000;
const MAX_YEAR = new Date().getFullYear();

export type AtlasLayer = 'borders' | 'place' | 'event' | 'person' | 'polity' | 'other';
export const LAYERS: { id: AtlasLayer; label: string }[] = [
  { id: 'borders', label: 'Borders' },
  { id: 'place', label: 'Cities & places' },
  { id: 'event', label: 'Battles & events' },
  { id: 'polity', label: 'States' },
  { id: 'person', label: 'People' },
  { id: 'other', label: 'Other' },
];
const layerOf = (k: ConceptKind): AtlasLayer => (k === 'place' || k === 'event' || k === 'polity' || k === 'person' ? k : 'other');

/** There is no year 0: 1 BC is followed by AD 1. */
export const noZero = (y: number) => (y === 0 ? 1 : y);
export const eraYear = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);

let indexCache: Promise<{ year: number; filename: string }[]> | undefined;
function basemapIndex() {
  indexCache ??= fetch(`${BASEMAPS}/index.json`).then((r) => (r.ok ? r.json() : { years: [] })).then((j: { years: { year: number; filename: string }[] }) => j.years.filter((y) => y.year >= MIN_YEAR)).catch(() => { indexCache = undefined; return []; });
  return indexCache;
}
const geoCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();
async function loadGeo(filename: string): Promise<GeoJSON.FeatureCollection> {
  if (!geoCache.has(filename)) {
    const url = `${BASEMAPS}/geojson/${filename}`;
    geoCache.set(filename, (async () => {
      // Kept in the browser cache so borders you've seen work offline.
      const cache = typeof caches !== 'undefined' ? await caches.open('shelf-atlas').catch(() => undefined) : undefined;
      const hit = await cache?.match(url);
      if (hit) return hit.json();
      const r = await fetch(url);
      if (!r.ok) throw new Error('Borders unavailable');
      cache?.put(url, r.clone()).catch(() => {});
      return r.json();
    })().catch((e) => { geoCache.delete(filename); throw e; }));
  }
  return geoCache.get(filename)!;
}

/** Is the entity relevant at this year? Undated things always are. */
function activeAt(c: Concept, year: number, window: number): boolean {
  if (c.start === undefined && c.end === undefined) return true;
  if (c.kind === 'event') {
    const s = c.start ?? c.end!;
    return year >= s - window && year <= (c.end ?? s) + window;
  }
  if (c.kind === 'person') {
    const s = c.start ?? c.end! - 60;
    return year >= s - window && year <= (c.end ?? s + 80) + window;
  }
  // Places, states, organisations: from founding until their end (if any).
  return (c.start === undefined || year >= c.start - window) && (c.end === undefined || year <= c.end + window);
}

const hue = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

export function Atlas({ concepts, focus, initialYear, height = 360, onPick, compact }: {
  concepts: Concept[];
  focus?: Concept;
  initialYear?: number;
  height?: number | string;
  onPick?: (c: Concept) => void;
  compact?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const borders = useRef<Leaflet.GeoJSON | null>(null);
  const markers = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [years, setYears] = useState<{ year: number; filename: string }[]>([]);
  const [year, setYear] = useState(() => noZero(Math.round(initialYear ?? focus?.start ?? -100)));
  const [layers, setLayers] = useState<Set<AtlasLayer>>(new Set(['borders', 'place', 'event', 'polity', 'person', 'other']));
  const [allDates, setAllDates] = useState(false);
  const [bordersNote, setBordersNote] = useState('');
  const [step, setStep] = useState<number | null>(null);

  const located = useMemo(() => concepts.filter((c) => c.lat !== undefined && c.lon !== undefined), [concepts]);
  const visible = located.filter((c) => layers.has(layerOf(c.kind)) && (allDates || activeAt(c, year, 25)));
  const events = located.filter((c) => c.kind === 'event' && c.start !== undefined).sort((a, b) => a.start! - b.start!);

  // Create the map once.
  useEffect(() => {
    let dead = false;
    (async () => {
      const mod = await import('leaflet');
      if (dead || !el.current) return;
      L.current = mod;
      const m = mod.map(el.current, { worldCopyJump: true, zoomControl: !compact, attributionControl: true }).setView([38, 20], compact ? 3 : 3);
      mod.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · modern map' }).addTo(m);
      markers.current = mod.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    })();
    basemapIndex().then((y) => !dead && setYears(y));
    return () => { dead = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the map sized to its box (bottom sheets animate open).
  useEffect(() => {
    if (!ready || !el.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el.current);
    return () => ro.disconnect();
  }, [ready]);

  // Borders for the nearest year the dataset covers.
  const nearest = years.length ? years.reduce((a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a)) : undefined;
  useEffect(() => {
    const m = map.current;
    const mod = L.current;
    if (!ready || !m || !mod) return;
    borders.current?.remove();
    borders.current = null;
    if (!layers.has('borders')) { setBordersNote(''); return; }
    if (!nearest) { setBordersNote(years.length ? '' : 'Historical borders need a connection the first time.'); return; }
    let dead = false;
    setBordersNote('Loading borders…');
    loadGeo(nearest.filename).then((geo) => {
      if (dead || !map.current) return;
      borders.current = mod.geoJSON(geo, {
        style: (f) => {
          const name = String(f?.properties?.NAME ?? '');
          return name ? { color: `hsl(${hue(name)} 45% 38%)`, weight: 1, fillColor: `hsl(${hue(name)} 55% 55%)`, fillOpacity: 0.22 } : { stroke: false, fill: false };
        },
        onEachFeature: (f, layer) => {
          const p = f.properties as { NAME?: string; SUBJECTO?: string; BORDERPRECISION?: number };
          if (!p.NAME) return;
          const prec = p.BORDERPRECISION === 1 ? 'approximate' : p.BORDERPRECISION === 2 ? 'moderately precise' : p.BORDERPRECISION === 3 ? 'fairly precise' : 'precision unknown';
          layer.bindPopup(`<b>${esc(p.NAME)}</b>${p.SUBJECTO && p.SUBJECTO !== p.NAME ? `<br>part of ${esc(p.SUBJECTO)}` : ''}<br><small>Border ${prec}. Map for ${esc(eraYear(nearest.year))}.</small>`);
        },
      }).addTo(map.current);
      borders.current.bringToBack();
      setBordersNote(nearest.year === year ? '' : `Borders shown are from the ${eraYear(nearest.year)} map — the closest available year.`);
    }).catch(() => !dead && setBordersNote('Couldn’t load historical borders (offline?).'));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nearest?.filename, layers.has('borders')]);

  // Entity markers.
  const visKey = visible.map((c) => c.id).join(',');
  useEffect(() => {
    const mod = L.current;
    const g = markers.current;
    if (!ready || !mod || !g) return;
    g.clearLayers();
    for (const c of visible) {
      const isFocus = focus?.id === c.id;
      const icon = mod.divIcon({ className: 'atlas-pin', html: `<span class="${isFocus ? 'on' : ''}">${KIND_ICON[c.kind]}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const mk = mod.marker([c.lat!, c.lon!], { icon, title: c.name }).addTo(g);
      mk.bindTooltip(`${c.name}${yearSpan(c) ? ` · ${yearSpan(c)}` : ''}`, { direction: 'top', offset: [0, -12] });
      if (onPick) mk.on('click', () => onPick(c));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, visKey, focus?.id]);

  // Fly to the focused entity.
  useEffect(() => {
    if (!ready || !focus) return;
    if (focus.lat !== undefined && focus.lon !== undefined) map.current?.flyTo([focus.lat, focus.lon], 6, { duration: 0.8 });
    if (focus.start !== undefined) setYear(noZero(focus.start));
  }, [ready, focus?.id]);

  const goStep = (i: number) => {
    const e = events[i];
    if (!e) return;
    setStep(i);
    setYear(noZero(e.start!));
    map.current?.flyTo([e.lat!, e.lon!], 6, { duration: 0.8 });
  };

  const setEra = (abs: number, bc: boolean) => setYear(noZero(Math.max(MIN_YEAR, Math.min(MAX_YEAR, bc ? -Math.abs(abs) : Math.abs(abs)))));

  return (
    <div className="col gap-8">
      <div ref={el} className="atlas-map" style={{ height }} />
      {focus && (focus.lat === undefined || focus.lon === undefined) && (
        <div className="nudge small"><div>No reliable map location is known for <b>{focus.name}</b>, so it isn’t placed on the map rather than guessed.</div></div>
      )}
      <div className="atlas-time">
        <div className="row between">
          <div className="row gap-4">
            <input className="input sm num" style={{ width: 84 }} type="number" min={1} aria-label="Year" value={Math.abs(year)} onChange={(e) => setEra(Number(e.target.value) || 1, year < 0)} />
            <Segmented size="sm" options={[{ value: 'bc', label: 'BC' }, { value: 'ad', label: 'AD' }]} value={year < 0 ? 'bc' : 'ad'} onChange={(v) => setEra(year, v === 'bc')} />
          </div>
          <span className="small muted">{eraYear(year)}</span>
        </div>
        <input type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={year} onChange={(e) => setYear(noZero(Number(e.target.value)))} aria-label="Move through time" style={{ width: '100%', accentColor: 'var(--accent)' }} />
        {years.length > 0 && (
          <div className="chips-scroll">
            {years.filter((y) => y.year >= -1500).map((y) => <button key={y.year} className={`chip ${nearest?.year === y.year ? 'on' : ''}`} style={{ minHeight: 28 }} onClick={() => setYear(noZero(y.year))}>{y.year < 0 ? `${-y.year} BC` : y.year}</button>)}
          </div>
        )}
        {bordersNote && <div className="tiny faint">{bordersNote}</div>}
      </div>
      <div className="chips-scroll" aria-label="Layers">
        {LAYERS.map((l) => <button key={l.id} className={`chip ${layers.has(l.id) ? 'on' : ''}`} onClick={() => setLayers((s) => { const x = new Set(s); if (x.has(l.id)) x.delete(l.id); else x.add(l.id); return x; })}>{l.label}</button>)}
        <button className={`chip ${allDates ? 'on' : ''}`} onClick={() => setAllDates((v) => !v)}>Ignore dates</button>
      </div>
      <div className="small muted">
        {located.length === 0
          ? 'Nothing from your Knowledge Atlas has a map location yet. Tap a person, place or battle while reading and it will appear here.'
          : `${visible.length} of ${located.length} mapped ${located.length === 1 ? 'entity' : 'entities'} shown for ${eraYear(year)}.`}
      </div>
      {events.length > 1 && (
        <div className="card" style={{ padding: 12 }}>
          <div className="row between">
            <b className="small">Follow events in order</b>
            <div className="row gap-4">
              <button className="btn xs" disabled={step === null || step <= 0} onClick={() => goStep((step ?? 1) - 1)}>‹ Prev</button>
              <button className="btn xs primary" disabled={step !== null && step >= events.length - 1} onClick={() => goStep(step === null ? 0 : step + 1)}>{step === null ? 'Start' : 'Next ›'}</button>
            </div>
          </div>
          {step !== null && <div className="small mt-8">{step + 1}/{events.length}: <b>{events[step].name}</b> · {yearSpan(events[step])}</div>}
          <div className="tiny faint mt-8">Steps through dated events from your atlas. It doesn’t draw marching routes — reliable route data isn’t available, so none is invented.</div>
        </div>
      )}
      {!compact && <div className="tiny faint">Historical borders: <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>historical-basemaps</a> (GPL-3.0) — approximate, for orientation only. Locations from Wikidata.</div>}
    </div>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
