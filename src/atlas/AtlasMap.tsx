// The Historical Atlas map: independent, toggleable layers from scholarly
// datasets, all following one timeline. Nothing is drawn without a source;
// uncertain or undated things are drawn differently and say so when tapped.
import type { GeoJSONSource, LayerSpecification, Map as MLMap, MapGeoJSONFeature, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AtlasLayerDef, BURINGH_YEARS, credit, DATASET_CREDIT, type DatasetId, DEFAULT_LAYERS, DRAW_ORDER, labelKey, GROUPS, type LayerCtx, layerById, LAYERS, OFM_SOURCE, OHM_LATIN_LANGS, PALETTE, POLITY_PALETTE, SOURCE_SPECS, switchTerrainToFallback, UNAVAILABLE_LABEL } from './catalog';
import { assembleParts, installPrivateData, loadPrivateData, PrivateDataError, privateHeader, privateLoadError, privateTileSource, privateTiles, removePrivateData } from './privateData';
import { isLatinScript, isolate } from './names';
import { getJSON } from './data';
import { ENVELOPE_LABEL, type EnvelopeBasis, type HistYear, yearLabel } from './time';
import { Timeline, type TimelineMark } from './Timeline';

export interface AtlasFocus { name: string; lat: number; lon: number; certainty?: 'known' | 'approximate' | 'uncertain' | 'disputed'; note?: string }
export interface AtlasPin { name: string; lat: number; lon: number; key?: string }
export interface AtlasView { lat: number; lon: number; zoom: number; bbox?: [number, number, number, number] }
/** Reader overlays: places from the book (numbered in reading order for a route), nearby results, a search radius. */
export interface AtlasOverlay {
  route?: AtlasPin[];
  /** Draw the connecting line (always labelled as reconstructed from the text). */
  routeLine?: boolean;
  markers?: AtlasPin[];
  circle?: { lat: number; lon: number; km: number };
}
export interface AtlasPick { key: string; name: string; lat: number; lon: number }

const LAYERS_KEY = 'shelf.atlas.layers';
let pmtilesReady = false;
// Label fonts (OpenHistorical, CC0) are served by Shelf itself (public/fonts), so labels don't depend on another
// site. Chinese, Japanese and Korean are drawn with the device's own fonts (MapLibre's default), so those ranges aren't shipped.
const GLYPHS = `${typeof location === 'undefined' ? '' : location.origin}${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`;
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const TOP = 'focus-halo';
const SEA = '#cddde4';
const LAND = '#efe7d4';
/** Detailed water from OpenStreetMap, kept just above the political layers. */
const WATER = 'water-detail';
const WATER_FALLBACK = 'water-osm';

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
      // Europe's coast from OpenStreetMap (to zoom 8), drawn over the coarse world outline when the detailed tiles can't load.
      'osm-land': SOURCE_SPECS['osm-land']({ base, year: 1, eventWindow: 0 }),
      'osm-water': SOURCE_SPECS['osm-water']({ base, year: 1, eventWindow: 0 }),
      // Detailed coastlines and water (OpenStreetMap via OpenFreeMap: free, no key). Only water is used — shapes,
      // named rivers and water names (layers in catalog.ts); no modern roads, borders or places. Offline, the
      // coarse Natural Earth coast underneath remains.
      ofm: OFM_SOURCE,
      focus: { type: 'geojson', data: EMPTY },
      pins: { type: 'geojson', data: EMPTY },
      route: { type: 'geojson', data: EMPTY },
      radius: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': SEA } },
      { id: 'land', type: 'fill', source: 'ne-land', paint: { 'fill-color': LAND } },
      { id: 'land-osm', type: 'fill', source: 'osm-land', 'source-layer': 'land', paint: { 'fill-color': LAND } },
      // Drawn above the reconstructed borders (moved into place in sync), so their simplified outlines don't
      // spill into the sea and coastal places sit on the true coast.
      { id: WATER, type: 'fill', source: 'ofm', 'source-layer': 'water', filter: ['!=', ['get', 'class'], 'swimming_pool'], paint: { 'fill-color': SEA } },
      // Europe's sea from OpenStreetMap (to zoom 8), only while the detailed tiles can't load; kept with WATER above politics.
      { id: WATER_FALLBACK, type: 'fill', source: 'osm-water', 'source-layer': 'water', layout: { visibility: 'none' }, paint: { 'fill-color': SEA } },
      // Everything the atlas adds goes below this layer; the reader's own marks stay on top.
      { id: TOP, type: 'fill', source: 'radius', paint: { 'fill-color': '#d84315', 'fill-opacity': 0.05 } },
      { id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#d84315', 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.7 } },
      // A route read from the book: thin dashed line, labelled as reconstructed.
      { id: 'route-line', type: 'line', source: 'route', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#6a1b9a', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } },
      { id: 'route-line-label', type: 'symbol', source: 'route', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-font': ['OpenHistorical Italic'], 'text-size': 11, 'text-offset': [0, -0.8] }, paint: { 'text-color': '#6a1b9a', 'text-halo-color': PALETTE.halo, 'text-halo-width': 1.4 } },
      { id: 'route-pt', type: 'circle', source: 'route', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 10, 'circle-color': '#ffffff', 'circle-stroke-color': '#6a1b9a', 'circle-stroke-width': 2 } },
      { id: 'route-num', type: 'symbol', source: 'route', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['to-string', ['get', 'ord']], 'text-font': ['OpenHistorical Bold'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#6a1b9a' } },
      { id: 'route-label', type: 'symbol', source: 'route', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 'name'], 'text-font': ['OpenHistorical Bold'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#4a126b', 'text-halo-color': PALETTE.halo, 'text-halo-width': 1.6 } },
      { id: 'pins-pt', type: 'circle', source: 'pins', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#d84315', 'circle-stroke-width': 2.2 } },
      { id: 'pins-label', type: 'symbol', source: 'pins', layout: { 'text-field': ['get', 'name'], 'text-font': ['OpenHistorical Bold'], 'text-size': 12, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#8a2c0d', 'text-halo-color': PALETTE.halo, 'text-halo-width': 1.6 } },
      // The selected place. Known: a solid dot. Approximate: a soft area around it.
      // Uncertain or disputed: a dashed ring, a hollow centre and "?" after the name.
      { id: 'focus-area', type: 'circle', source: 'focus', filter: ['==', ['get', 'cert'], 'approximate'], paint: { 'circle-radius': 30, 'circle-color': '#d84315', 'circle-opacity': 0.12, 'circle-stroke-color': '#d84315', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.5 } },
      { id: 'focus-ring', type: 'circle', source: 'focus', filter: ['in', ['get', 'cert'], ['literal', ['uncertain', 'disputed']]], paint: { 'circle-radius': 22, 'circle-opacity': 0, 'circle-stroke-color': '#d84315', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.8 } },
      { id: 'focus-pt', type: 'circle', source: 'focus', paint: { 'circle-radius': 8, 'circle-color': ['case', ['in', ['get', 'cert'], ['literal', ['uncertain', 'disputed']]], '#ffffff', '#d84315'], 'circle-stroke-color': ['case', ['in', ['get', 'cert'], ['literal', ['uncertain', 'disputed']]], '#d84315', '#ffffff'], 'circle-stroke-width': 2.5 } },
      { id: 'focus-label', type: 'symbol', source: 'focus', layout: { 'text-field': ['get', 'name'], 'text-font': ['OpenHistorical Bold'], 'text-size': 15, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#8a2c0d', 'text-halo-color': PALETTE.halo, 'text-halo-width': 2 } },
    ],
  };
}

// ── Data used in panels (wars list, war sequence) ─────────────────────────
interface War { q: string; n: string; f: HistYear | null; t: HistYear | null }
type EventFeature = { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { q: string; n: string; k: string; y: HistYear; w?: string; wn?: string; u?: number; yp?: string } };

function circleRing(lat: number, lon: number, radiusKm: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (radiusKm / 110.57) * Math.sin(a)]);
  }
  return pts;
}

export function AtlasMap({ view, year, onYearChange, focus, pins, marks, className, overlay, war: warProp, onWarChange, onReady, onPickPlace, onPickEvent, onPickMarker, layersRequest, onLayersChange, mapOverlays, children }: {
  view?: AtlasView;
  year: HistYear;
  onYearChange: (y: HistYear) => void;
  focus?: AtlasFocus;
  pins?: AtlasPin[];
  marks?: TimelineMark[];
  className?: string;
  overlay?: AtlasOverlay;
  /** The selected war (controlled when onWarChange is given). */
  war?: string;
  onWarChange?: (q: string | undefined) => void;
  /** The map, once loaded (for saving bookmarks, reading the view). */
  onReady?: (map: MLMap) => void;
  /** A dataset place was tapped and the reader asked for its history. */
  onPickPlace?: (p: AtlasPick) => void;
  onPickEvent?: (q: string) => void;
  onPickMarker?: (key: string) => void;
  /** Switch to these layers (e.g. from a bookmark); n changes each time. */
  layersRequest?: { layers: string[]; n: number };
  onLayersChange?: (layers: string[]) => void;
  /** Original historical maps laid over the reconstruction (image placed by its four corners). */
  mapOverlays?: { id: string; url: string; tiles?: string; minzoom?: number; coordinates: [[number, number], [number, number], [number, number], [number, number]]; opacity: number }[];
  /** Shown over the map (e.g. the "What am I looking at?" chip). */
  children?: React.ReactNode;
}) {
  const base = `${import.meta.env.BASE_URL}atlas/`;
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const managed = useRef(new Map<string, string[]>()); // layer def id → maplibre layer ids
  const paintSeen = useRef(new Map<string, string>());
  const clioSlice = useRef<string>('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);
  const [panel, setPanel] = useState(false);
  const [eventWindow, setEventWindow] = useState(0);
  const [showUndated, setShowUndated] = useState(false);
  const [warOwn, setWarOwn] = useState<string | undefined>();
  const war = onWarChange ? warProp : warOwn;
  const setWar = onWarChange ?? setWarOwn;
  const [info, setInfo] = useState<Info | null>(null);
  const ctx: LayerCtx = useMemo(() => ({ year, base, world: `${import.meta.env.BASE_URL}world/`, eventWindow, war, showUndated }), [year, base, eventWindow, war, showUndated]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => { try { localStorage.setItem(LAYERS_KEY, JSON.stringify(enabled)); } catch { /* ignore */ } onLayersChange?.(enabled); }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (layersRequest) setEnabled(layersRequest.layers.filter((id) => layerById(id) && !layerById(id)!.unavailable)); }, [layersRequest?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create the map once ──
  useEffect(() => {
    let dead = false;
    let map: MLMap | undefined;
    (async () => {
      try {
        const ml = await import('maplibre-gl');
        // Vector tiles are read from PMTiles archives by range request: only what's on screen is fetched.
        if (!pmtilesReady) {
          const { Protocol, PMTiles } = await import('pmtiles');
          const protocol = new Protocol();
          // Tiles from the owner's private data pack, if one was loaded on this device, are read from it by range.
          await loadPrivateData();
          for (const f of privateTiles()) protocol.add(new PMTiles(privateTileSource(f)));
          ml.addProtocol('pmtiles', protocol.tile);
          pmtilesReady = true;
        }
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
          onReadyRef.current?.(map!);
        });
        // Base map: once the detailed water tiles arrive, land is the background and only real water is
        // painted, so coastal places (Portsmouth on Portsea Island) sit on land. If they can't load
        // (offline, service down), fall back to the coarse Natural Earth land shape on a sea background.
        const detailedBase = (on: boolean) => {
          if (!map?.getLayer('sea')) return;
          map.setPaintProperty('sea', 'background-color', on ? LAND : SEA);
          map.setLayoutProperty('land', 'visibility', on ? 'none' : 'visible');
          map.setLayoutProperty('land-osm', 'visibility', on ? 'none' : 'visible');
          map.setLayoutProperty(WATER_FALLBACK, 'visibility', on ? 'none' : 'visible');
        };
        map.on('sourcedata', (e) => { if (e.sourceId === 'ofm' && e.tile && e.isSourceLoaded) detailedBase(true); });
        // Relief: if the primary terrain tiles keep failing, switch to the fallback tiles in the same place.
        let terrainErrors = 0;
        const terrainFailed = () => {
          if (++terrainErrors < 3 || !switchTerrainToFallback() || !map) return;
          const layers = map.getStyle().layers;
          const i = layers.findIndex((l) => l.id === 'terrain-hillshade');
          if (i >= 0) map.removeLayer('terrain-hillshade');
          if (map.getSource('terrain')) map.removeSource('terrain');
          if (i >= 0) {
            map.addSource('terrain', SOURCE_SPECS.terrain(ctxRef.current));
            map.addLayer(layers[i], layers[i + 1]?.id);
          }
        };
        map.on('error', (e) => {
          if ((e as { sourceId?: string }).sourceId === 'terrain') terrainFailed();
          else if ((e as { sourceId?: string }).sourceId === 'ofm') detailedBase(false);
          else if (!map?.loaded()) console.warn('atlas', e.error?.message);
        });
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

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  /** Which layer definition added a map layer. */
  const managedDef = (layerId: string) => [...managed.current].find(([, ids]) => ids.includes(layerId))?.[0];
  /** The lowest label layer we manage (the start of the label band). */
  const labelBandStart = (map: MLMap) => map.getStyle().layers.find((l) => l.type === 'symbol' && managedDef(l.id) !== undefined)?.id;

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
      let existing = managed.current.get(def.id);
      // A setting can change which map layers a definition has (the grey undated-sites layer exists only while
      // "Include undated records" is on): then it is put back whole, in its place in the drawing order.
      if (existing && (existing.length !== specs.length || specs.some((s) => !existing!.includes(s.id)))) {
        for (const lid of existing) if (map.getLayer(lid)) map.removeLayer(lid);
        managed.current.delete(def.id);
        existing = undefined;
      }
      if (existing) {
        for (const spec of specs) {
          if (!map.getLayer(spec.id)) continue;
          if ('filter' in spec && spec.filter) map.setFilter(spec.id, spec.filter);
          // Paint can depend on the year too (dated vs. only-evidenced styling): re-apply what changed.
          for (const [k, v] of Object.entries(('paint' in spec && spec.paint) || {})) {
            const key = `${spec.id}|${k}`;
            const json = JSON.stringify(v);
            if (paintSeen.current.get(key) !== json) { map.setPaintProperty(spec.id, k, v); paintSeen.current.set(key, json); }
          }
        }
        continue;
      }
      // Geometry goes below the next layer in draw order that's already on
      // the map. Labels go in one band above all geometry, ordered by the
      // label hierarchy, so a polity's name isn't hidden by a shire's.
      const isLabel = (id: string) => map.getLayer(id)?.type === 'symbol';
      const geomAfter = DRAW_ORDER.slice(DRAW_ORDER.indexOf(def.id) + 1).map((id) => managed.current.get(id)?.find((l) => !isLabel(l))).find(Boolean)
        ?? labelBandStart(map) ?? TOP;
      const rank = labelKey(def.id);
      const labelAfter = map.getStyle().layers.find((l) => l.type === 'symbol' && managedDef(l.id) !== undefined && labelKey(managedDef(l.id)!) > rank)?.id ?? TOP;
      for (const spec of specs) if (!map.getLayer(spec.id)) map.addLayer(spec as LayerSpecification, spec.type === 'symbol' ? labelAfter : geomAfter);
      managed.current.set(def.id, specs.map((s) => s.id));
    }
    // Keep the detailed water just above the political layers (fills, outlines, shires) and below
    // everything else — coasts, rivers, roads, places and all labels.
    if (map.getLayer(WATER)) {
      const isLabel = (id: string) => map.getLayer(id)?.type === 'symbol';
      const firstAfterPolitics = DRAW_ORDER.slice(DRAW_ORDER.indexOf('rural-settlement') + 1).map((id) => managed.current.get(id)?.find((l) => !isLabel(l))).find(Boolean);
      map.moveLayer(WATER, firstAfterPolitics ?? labelBandStart(map) ?? TOP);
      map.moveLayer(WATER_FALLBACK, firstAfterPolitics ?? labelBandStart(map) ?? TOP);
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
    const cert = focus?.certainty ?? 'known';
    (map.getSource('focus') as GeoJSONSource).setData(focus ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [focus.lon, focus.lat] }, properties: { name: cert === 'uncertain' || cert === 'disputed' ? `${focus.name} ?` : focus.name, approx: cert !== 'known', cert } }] } : EMPTY);
    const pts = [...(pins ?? []), ...(overlay?.markers ?? [])];
    (map.getSource('pins') as GeoJSONSource).setData({ type: 'FeatureCollection', features: pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { name: p.name, key: p.key ?? '' } })) });
    const route = overlay?.route ?? [];
    (map.getSource('route') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [
        ...route.map((p, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }, properties: { name: p.name, ord: i + 1, key: p.key ?? '' } })),
        ...(overlay?.routeLine && route.length > 1 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: route.map((p) => [p.lon, p.lat]) }, properties: { label: 'Route reconstructed from the text' } }] : []),
      ],
    });
    const c = overlay?.circle;
    (map.getSource('radius') as GeoJSONSource).setData(c ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circleRing(c.lat, c.lon, c.km)] }, properties: {} } : EMPTY);
  }, [ready, focus?.name, focus?.lat, focus?.lon, focus?.certainty, pins, overlay]);

  // ── Original maps over the reconstruction ──
  const shownOverlays = useRef(new Set<string>());
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const want = new Map((mapOverlays ?? []).map((o) => [o.id, o]));
    for (const id of [...shownOverlays.current]) {
      if (want.has(id)) continue;
      if (map.getLayer(`ov-${id}`)) map.removeLayer(`ov-${id}`);
      if (map.getSource(`ov-${id}`)) map.removeSource(`ov-${id}`);
      shownOverlays.current.delete(id);
    }
    for (const o of want.values()) {
      if (!map.getSource(`ov-${o.id}`)) {
        if (o.tiles) {
          // a tiled scan: streamed from its publisher, only within its extent
          const [[w, n], , [e, s]] = o.coordinates;
          map.addSource(`ov-${o.id}`, { type: 'raster', tiles: [o.tiles], tileSize: 256, bounds: [w, s, e, n], minzoom: o.minzoom ?? 0, maxzoom: 19 });
        } else map.addSource(`ov-${o.id}`, { type: 'image', url: o.url, coordinates: o.coordinates });
        map.addLayer({ id: `ov-${o.id}`, type: 'raster', source: `ov-${o.id}`, paint: { 'raster-opacity': o.opacity, 'raster-fade-duration': 0 } }, TOP);
        shownOverlays.current.add(o.id);
      } else map.setPaintProperty(`ov-${o.id}`, 'raster-opacity', o.opacity);
    }
  }, [ready, mapOverlays]);

  // ── Move to a new place ──
  const viewKey = view ? `${view.lat.toFixed(4)},${view.lon.toFixed(4)},${view.zoom}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !view) return;
    if (view.bbox) map.fitBounds([[view.bbox[0], view.bbox[1]], [view.bbox[2], view.bbox[3]]], { padding: 40, maxZoom: view.zoom > 9 ? view.zoom : 9, duration: 700 });
    else map.flyTo({ center: [view.lon, view.lat], zoom: view.zoom, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, ready]);

  // ── Tap a feature for its details and source ──
  const onClickRef = useRef<(e: MapMouseEvent) => void>(() => {});
  onClickRef.current = (e) => {
    const map = mapRef.current;
    if (!map) return;
    const box: [[number, number], [number, number]] = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
    const mine = map.queryRenderedFeatures(box, { layers: ['route-pt', 'pins-pt', 'focus-pt'].filter((l) => map.getLayer(l)) });
    const hitKey = mine.map((f) => f.properties?.key as string | undefined).find(Boolean);
    if (hitKey && onPickMarker) { onPickMarker(hitKey); return; }
    const ids = [...managed.current.values()].flat().filter((id) => map.getLayer(id) && map.getLayer(id)!.type !== 'hillshade');
    const hits = map.queryRenderedFeatures(box, { layers: ids });
    // Points before lines before areas.
    const rank = (f: MapGeoJSONFeature) => (f.layer.type === 'circle' ? 0 : f.layer.type === 'symbol' ? 1 : f.layer.type === 'line' ? 2 : 3);
    const f = hits.sort((a, b) => rank(a) - rank(b))[0];
    setInfo(f ? withPosition(describe(f, ctxRef.current.year), f) : null);
  };

  const toggle = (id: string) => setEnabled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (failed) return <div className="hmap-empty">{failed}</div>;
  return (
    <div className={`atlas ${className ?? ''}`}>
      <div className="atlas-map">
        <div className="atlas-canvas" ref={host} />
        <button className="btn sm atlas-layers-btn" onClick={() => setPanel(!panel)} aria-expanded={panel}>☰ Layers</button>
        {!ready && <div className="atlas-loading">Loading the atlas…</div>}
        {children}
        {panel && <LayerPanel enabled={enabled} toggle={toggle} year={year} eventWindow={eventWindow} setEventWindow={setEventWindow} war={war} setWar={setWar} base={base} showUndated={showUndated} setShowUndated={setShowUndated} onClose={() => setPanel(false)} />}
      </div>
      <Timeline year={year} onChange={onYearChange} marks={marks} />
      {info && <FeatureCard info={info} onClose={() => setInfo(null)}
        onHistory={info.pick && onPickPlace ? () => { onPickPlace(info.pick!); setInfo(null); } : undefined}
        onEvent={info.event && onPickEvent ? () => { onPickEvent(info.event!); setInfo(null); } : undefined} />}
      <AtlasSources enabled={enabled} />
      <PrivateDataControl />
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

function LayerPanel({ enabled, toggle, year, eventWindow, setEventWindow, war, setWar, base, showUndated, setShowUndated, onClose }: {
  enabled: string[]; toggle: (id: string) => void; year: HistYear; eventWindow: number; setEventWindow: (n: number) => void;
  war?: string; setWar: (q: string | undefined) => void; base: string; showUndated: boolean; setShowUndated: (v: boolean) => void; onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="atlas-panel" role="dialog" aria-label="Map layers">
      <div className="row between">
        <b>Layers</b>
        <button className="btn xs ghost" onClick={onClose} aria-label="Close layers">✕</button>
      </div>
      <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={showUndated} onChange={(e) => setShowUndated(e.target.checked)} aria-label="Include undated records" />
        <span>Include undated records <span className="tiny faint">— records with no temporal evidence at all (no dates, nothing dated linked to them, no source period). Shown faint at any date and marked undated. Off by default: such a record isn’t evidence that something existed in {yearLabel(year)}. Records without exact dates but with a known period (e.g. a place from the Barrington Atlas, or a village with a dated temple) are shown inside that period anyway.</span></span>
      </label>
      <div className="tiny faint">How positions are drawn: a blurred dot is a position the source gives only roughly; a larger dot with “×12” is 12 records the source puts on one point (a parish, a grid square), not 12 sites side by side.</div>
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
                      {d.unavailable && <span className="tiny faint"> — {d.unavailableKind ? UNAVAILABLE_LABEL[d.unavailableKind] : 'not available'}</span>}
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
        <div>Bigger dots and names that appear first — places with a larger recorded role (capital, administrative centre, urban, port, road hub, sites recorded there). Based on the evidence available, not population, which the sources don’t record</div>
        <div className="mt-4"><b>Political map</b></div>
        <div className="row wrap" style={{ gap: 3 }} aria-hidden="true">{POLITY_PALETTE.map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 2, background: c, opacity: 0.55, border: `1px solid ${c}` }} />)}</div>
        <div>Each colour marks one polity, kept through time; neighbours get different colours. Colour doesn’t mean empire, kingdom or republic — those are the separate layers above, and each polity’s type is in its details.</div>
        <div><span style={{ borderBottom: '2px dashed #555', paddingBottom: 1 }}>Dashed outline, no fill</span> — a grouping of polities (an empire’s provinces, a heptarchy, a personal union), not a separate state</div>
        <div><span style={{ borderBottom: '1px dashed #555', paddingBottom: 1, opacity: 0.7 }}>Faint, dashed</span> — the source’s outline overlaps another polity’s in the same years (it records no claims, so this is shown as uncertainty, not as a dispute), or a small detached piece far from the main territory</div>
        <div>Names appear by size: large states when zoomed out, small ones as you zoom in. Each polity is named once.</div>
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

interface Info { title: string; lines: string[]; link?: { href: string; label: string }; source: string; caution?: string; pick?: AtlasPick; event?: string }

const PERIOD_NAMES: Record<string, string> = { A: 'Archaic', C: 'Classical', H: 'Hellenistic', R: 'Roman', L: 'Late Antique' };
const periodLabel = (code?: string) => (code ? code.replace('?', '').split('').map((c) => PERIOD_NAMES[c]).filter(Boolean).join(', ') + (code.includes('?') ? ' (uncertain)' : '') : '');
const range = (f?: number, t?: number) => (f === undefined && t === undefined ? 'Dates not recorded' : `${f !== undefined ? yearLabel(f) : '?'} – ${t !== undefined ? yearLabel(t) : '?'}`);

/** What the dot's position is: one of a stack of records the source puts on one point, or approximate (A10-005, A11-008). */
export function positionNote(props: Record<string, unknown>): string | undefined {
  const sk = typeof props.sk === 'number' ? props.sk : 0;
  const stack = sk > 1 ? `${sk.toLocaleString()} records in the source share this exact position — the source's reference point (a parish, a grid square, a town), not each site's own location.` : '';
  const rough = props.u === 1 ? 'The source gives this position only approximately.' : '';
  return [stack, rough].filter(Boolean).join(' ') || undefined;
}

function withPosition(info: Info, f: MapGeoJSONFeature): Info {
  const note = positionNote(f.properties as Record<string, unknown>);
  return note ? { ...info, caution: [info.caution, note].filter(Boolean).join(' ') } : info;
}

function describe(f: MapGeoJSONFeature, year: HistYear): Info {
  const p = f.properties as Record<string, unknown>;
  const src = f.source;
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
  const pt = f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : undefined;
  const pickOf = (g: string): AtlasPick | undefined => (pt && p.i !== undefined ? { key: `${g}:${p.i}`, name: str('n') ?? 'Place', lon: pt[0], lat: pt[1] } : undefined);
  switch (src) {
    case 'pleiades-places':
    case 'pleiades-lines':
    case 'pleiades-provinces': {
      const env = str('eo') as EnvelopeBasis | undefined;
      const lines = [str('ty')?.split(',').join(', ') ?? str('k') ?? '',
        env ? `No dates of its own. Shown for ${range(num('ef'), num('et'))} — the period of ${ENVELOPE_LABEL[env]}`
          : num('f') === undefined && num('t') === undefined && src === 'pleiades-places' ? 'Undated: no dates, and nothing dated is linked to it'
          : `Attested: ${range(num('f'), num('t'))}${str('db') === 'names' ? ' (from name records)' : ''}`];
      if (str('a')) lines.push(`Also: ${str('a')!.split('|').join(' · ')}`);
      if (src === 'pleiades-places') lines.push(num('p') === 1 ? `Precise location${num('r') ? ` (± ${num('r')} m)` : ''}` : 'Rough location');
      if (str('iw')) lines.push(`Drawn prominently because it is recorded as: ${str('iw')!.split(',').join(', ')} (not a population figure)`);
      return {
        title: str('n') ?? 'Place', lines: lines.filter(Boolean),
        pick: src === 'pleiades-places' && pt ? { key: `pleiades:${num('i')}`, name: str('n') ?? 'Place', lon: pt[0], lat: pt[1] } : undefined,
        link: { href: `https://pleiades.stoa.org/places/${num('i')}`, label: 'Pleiades record ↗' }, source: credit('pleiades'),
        caution: num('u') ? 'Pleiades marks this location as less certain.' : env ? 'Approximate: exact dates aren’t known, so it is shown throughout the period its evidence allows.' : num('f') === undefined && num('t') === undefined ? 'Shown because “Include undated records” is on — there is no evidence for when it existed.' : 'Pleiades dates are broad periods, not founding or abandonment dates.',
      };
    }
    case 'cliopatria': {
      const c = str('c');
      const grouping = p.g !== undefined;
      const lines = [
        grouping ? 'A grouping of polities in Cliopatria (outlined, not a separate state)' : `${c ? c[0].toUpperCase() + c.slice(1) : 'Type not recorded'}${c ? ' (type from Wikidata)' : ''}`,
        `This outline: ${range(num('f'), num('t'))}`,
      ];
      if (str('m')) lines.push(`Part of: ${str('m')!.split(';').map((x) => x.replace(/^\(|\)$/g, '')).join(', ')}`);
      if (grouping && str('cm')) lines.push(`Made up of: ${str('cm')!.split(';').join(', ')}`);
      if (num('a')) lines.push(`Area in this outline: about ${num('a')!.toLocaleString()} km²`);
      if (str('cn')) lines.unshift(`Formal name in the source: ${str('n')}`);
      const cautions = ['One scholarly reconstruction of the territory; borders were rarely this precise.'];
      if (p.op !== undefined) cautions.unshift('A small detached piece of this polity’s outline, far from its main territory. Cliopatria includes it in the outline but doesn’t say whether it was held, briefly occupied, or is an artefact of the reconstruction.');
      if (str('x')) cautions.unshift(`Overlapping outlines: the source’s outline for this polity overlaps ${str('x')!.split(';').join(', ')} in the same years. Cliopatria records territory per period and records no claims or disputes, so this may be shared or changing control within the period, or imprecision in the reconstruction — the source doesn’t say which.`);
      if (str('xr')) cautions.unshift(`Overlap explained by a relationship Cliopatria records: ${str('xr')!.split(';').join('; ')}.`);
      return {
        title: str('cn') ?? (grouping ? (str('n') ?? '').replace(/^\(|\)$/g, '') : str('n') ?? 'Polity'), lines,
        link: str('q') ? { href: `https://www.wikidata.org/wiki/${str('q')}`, label: 'Wikidata ↗' } : undefined, source: credit('cliopatria'),
        caution: cautions.join(' '),
      };
    }
    case 'wikidata-events':
    case 'war-sequence': {
      const y = num('y');
      return {
        title: str('n') ?? 'Event', lines: [`${str('k') ?? 'event'}${y !== undefined ? ` · ${yearLabel(y)}${num('y2') !== undefined ? ` – ${yearLabel(num('y2')!)}` : ''}${str('yp') ? ` (to the ${str('yp')})` : ''}` : ''}`, ...(str('wn') ? [`Part of: ${str('wn')}`] : [])],
        link: { href: `https://www.wikidata.org/wiki/${str('q')}`, label: 'Wikidata ↗' }, source: credit('wikidata'), event: str('q'),
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
    case 'itinere': {
      const f0 = num('f');
      const t0 = num('t');
      const fe = num('fe');
      const te = num('te');
      const dates = f0 === undefined && t0 === undefined ? 'Dates not recorded' : `${f0 !== undefined ? yearLabel(f0) : '?'}${fe ? ` (± ${fe} yrs)` : ''} – ${t0 !== undefined ? yearLabel(t0) : '?'}${te ? ` (± ${te} yrs)` : ''}`;
      return {
        title: str('n') || 'Roman road', lines: [`${str('k') ?? 'Road'} · ${str('c') ?? 'certainty not given'}`, `In use: ${dates}`, ...(str('cp') ? [`Built: ${str('cp')}`] : []), ...(str('b') ? [`Bibliography: ${str('b')}`] : []), ...(str('au') ? [`Compiled by: ${str('au')}`] : [])],
        link: num('i') !== undefined ? { href: `https://itiner-e.org/route-segment/${num('i')}`, label: 'Itiner-e segment ↗' } : undefined, source: credit('itinere'),
        caution: str('c') === 'Certain' ? undefined : `Itiner-e marks this segment as ${str('c')?.toLowerCase() ?? 'uncertain'}.`,
      };
    }
    case 'viabundus-edges': {
      const c = num('c');
      return {
        title: `${str('k') === 'land' ? 'Road' : (str('k') ?? 'Route').replace(/^./, (x) => x.toUpperCase())} (Viabundus)`,
        lines: [c === 1 ? 'Very certain — drawn on the pre-modern road' : c === 2 ? 'Mediocre — more or less on the pre-modern road' : 'Uncertain — known from sources, not reconstructable in detail', num('f') || num('t') ? `In use: ${range(num('f'), num('t'))}` : 'Assumed in use throughout 1350–1650 (no dates in the source)'],
        source: credit('viabundus'), caution: c === 3 ? 'Viabundus marks this route as uncertain (or not yet checked against historical maps).' : undefined,
      };
    }
    case 'viabundus-nodes': {
      const roles = (str('l') ?? '').split(',').filter(Boolean);
      return {
        title: str('n') ?? 'Place', lines: [roles.join(', '), `Recorded: ${range(num('f'), num('t'))}`, ...(num('tf') !== undefined ? [`Town from ${yearLabel(num('tf')!)}`] : [])],
        pick: pickOf('viabundus'), source: credit('viabundus'), caution: 'Each role (town, toll, fair…) has its own dates in Viabundus — open the place history for them.',
      };
    }
    case 'inscriptions': {
      const cent = Math.floor(Math.max(100, Math.min(799, year)) / 100) * 100;
      const here = num(`c${cent}`) ?? 0;
      const byCent = [100, 200, 300, 400, 500, 600, 700].filter((c) => num(`c${c}`)).map((c) => `${c}s: ${num(`c${c}`)}`).join(' · ');
      return {
        title: str('n') ?? 'Find-spot',
        lines: [`${here} Latin inscription${here === 1 ? '' : 's'} found here dated to the ${cent}s CE`, `All dated inscriptions here, by century: ${byCent}`,
          ...(str('ty') ? [`Mostly: ${str('ty')}`] : []), ...(str('m') ? [`Modern place: ${str('m')}`] : []), ...(str('pv') ? [`Province: ${str('pv')}`] : [])],
        link: str('pl') ? { href: `https://pleiades.stoa.org/places/${str('pl')}`, label: 'Pleiades ↗' } : { href: DATASET_CREDIT.lirelist.url, label: 'Dataset ↗' },
        source: credit('lirelist'),
        caution: 'Inscriptions show that people set up texts here then; the find-spot is where the stone was found, which may not be where it first stood.',
      };
    }
    case 'spec-sites':
    case 'register-sites': {
      // National registers and historical gazetteers: each record says what its date is.
      const src = str('src') as DatasetId | undefined;
      const per = str('per');
      const snap = num('sn') !== undefined;
      const ef = num('ef');
      const et = num('et');
      const lines = [(str('st') ?? str('k') ?? 'site').replace(/^./, (x) => x.toUpperCase())];
      lines.push(snap && ef !== undefined ? `${per ?? 'Listed'} — evidence that it existed in ${yearLabel(ef)}; nothing here says when it began or ended`
        : ef !== undefined || et !== undefined ? `${per ?? 'Period named by the record'}: ${range(ef, et)}${num('cw') ? ' (from the start of the recorded construction window)' : ''}`
        : 'No date recorded in the source');
      if (src === 'nid') lines.push('Placed at its village or town (the register gives no coordinates)');
      if (src === 'hrreg') lines.push('Placed at its settlement (the register names the place, not coordinates)');
      if (src === 'lvmon') lines.push('Placed at its town, village or parish (the list gives an address, not coordinates)');
      return {
        title: str('n') ?? 'Site', lines,
        pick: pt && src ? { key: `${src}:${(str('i') ?? '').split(':').slice(1).join(':')}`, name: str('n') ?? 'Site', lon: pt[0], lat: pt[1] } : undefined,
        link: src === 'sirkd' ? { href: `https://eid.gov.si/S/${(str('i') ?? '').split(':')[1]}`, label: 'Register record ↗' } : src === 'wdextra' ? { href: `https://www.wikidata.org/wiki/${(str('i') ?? '').split(':')[1]}`, label: 'Wikidata ↗' }
          : src ? { href: DATASET_CREDIT[src].url, label: 'Dataset ↗' } : undefined,
        source: src ? credit(src) : '',
        caution: snap ? `A source that lists a place in one year is shown (lighter) within 25 years of it — a display allowance, not a claim about those years.`
          : num('u') ? 'The position is approximate in the source.'
          : ef === undefined && et === undefined ? 'Shown because “Include undated records” is on — there is no recorded date for it.' : undefined,
      };
    }
    case 'medieval-sites': {
      const kind = [str('st'), str('k')].filter(Boolean)[0] ?? 'site';
      const f0 = num('f');
      const fb = str('fb');
      const startLabel = fb === 'first mention' ? 'First mentioned' : fb === 'Germania Sacra' ? 'Earliest dated tenure (Germania Sacra)'
        : fb === 'founded' ? 'Founded / built' : 'Start recorded in Wikidata (may be a first mention)';
      const lines = [kind[0].toUpperCase() + kind.slice(1),
        f0 === undefined && num('t') === undefined ? 'No founding date or first mention recorded'
          : `${startLabel}: ${f0 !== undefined ? yearLabel(f0) : '?'}${num('t') !== undefined ? ` · dissolved / ended: ${yearLabel(num('t')!)}` : ''}`];
      if (str('o')) lines.push(`Order: ${str('o')}`);
      if (str('d')) lines.push(`Diocese: ${str('d')}`);
      const nb = str('nb');
      if (nb) lines.push(nb.startsWith('romanized') ? `No English name recorded — romanized from ${str('nl')} (${nb.replace('romanized: ', '')})` : nb === 'original script' ? 'No English or Latin-script name recorded — shown in its own script' : 'No English name recorded — shown in its own language');
      const notYet = f0 !== undefined && f0 > year && fb !== 'founded';
      const q = str('i')?.startsWith('Q') ? str('i') : undefined;
      const src = str('src') as DatasetId | undefined;
      const ownId = src && src !== 'merimee' ? str('i')!.slice(2) : str('i');
      if (str('bc')) lines.push(`Main building campaign: ${str('bc')}${str('mr') ? ' (Mérimée)' : ''}`);
      if (str('per')) lines.push(`Register period class: ${str('per')}`);
      if (str('riv')) lines.push(`River: ${str('riv')}`);
      const byPeriod = f0 === undefined && num('t') === undefined && (num('ef') !== undefined || num('et') !== undefined);
      if (byPeriod) lines[1] = `Dated only by ${src === 'merimee' ? 'the century of its main building campaign' : 'the register’s period class'}: ${range(num('ef'), num('et'))}`;
      const merimeeRef = src === 'merimee' ? str('i') : str('mr');
      return {
        title: str('n') ?? 'Site', lines,
        pick: pt ? (q ? { key: `wikidata:${q}`, name: str('n') ?? 'Site', lon: pt[0], lat: pt[1] } : src ? { key: `${src}:${ownId}`, name: str('n') ?? 'Site', lon: pt[0], lat: pt[1] } : str('gs') ? { key: `germaniasacra:${str('gs')}`, name: str('n') ?? 'Site', lon: pt[0], lat: pt[1] } : undefined) : undefined,
        link: q ? { href: `https://www.wikidata.org/wiki/${q}`, label: 'Wikidata ↗' } : merimeeRef ? { href: `https://www.pop.culture.gouv.fr/notice/merimee/${merimeeRef}`, label: 'Mérimée record ↗' } : str('gs') ? { href: `https://klosterdatenbank.germania-sacra.de/gsn/${str('gs')}`, label: 'Germania Sacra ↗' } : src ? { href: DATASET_CREDIT[src].url, label: 'Dataset ↗' } : undefined,
        source: [q ? credit('wikidata') : '', str('gs') ? credit('germaniasacra') : '', merimeeRef ? credit('merimee') : '', src && src !== 'merimee' ? credit(src) : ''].filter(Boolean).join('; '),
        caution: byPeriod ? (src === 'merimee' ? 'The date is when the present building was mainly built; the site may be older, and the building is shown from the start of that century.' : 'Dated only by the register’s broad period class, so it is shown for the whole period.')
          : num('u') ? 'The identification of this location is uncertain in the source.'
          : f0 === undefined && num('t') === undefined ? 'Shown because “Include undated records” is on — there is no recorded date for it.'
          : notYet ? `Not yet recorded in ${yearLabel(year)}: the first record is from ${yearLabel(f0!)}. It may be older, but nothing places it at this date — shown because “Include undated records” is on.`
          : num('t') === undefined ? 'No end is recorded, so it is drawn to the present; many houses and castles ended earlier than their record says.' : undefined,
      };
    }
    case 'urban-population': {
      const pop = BURINGH_YEARS.map((y) => [y, num(`p${y}`)] as const);
      // 0 = below the dataset's threshold (the town existed; its size is not estimated); no figure = not recorded (SS-2)
      const near = pop.filter(([y]) => Math.abs(y - year) <= 150 || y === pop[0][0]).map(([y, v]) => `${y}: ${v ? `${v.toLocaleString()}k` : v === 0 ? 'below threshold' : 'no estimate'}`);
      return {
        title: str('n') ?? 'Town', lines: [`${str('c') ?? ''}${str('a') ? ` · “${str('a')}” in the dataset` : ''}`, `Estimated inhabitants (thousands) — ${near.join(' · ')}`],
        pick: pt && str('i') ? { key: `buringh:${str('i')}`, name: str('n') ?? 'Town', lon: pt[0], lat: pt[1] } : undefined,
        link: str('q') ? { href: `https://www.wikidata.org/wiki/${str('q')}`, label: 'Wikidata ↗' } : { href: 'https://doi.org/10.17026/dans-xzy-u62q', label: 'Dataset ↗' }, source: credit('buringh'),
        caution: `Estimates, many proxied or imputed from other towns; the figure for the chosen year is interpolated between sample years. “Below threshold” means too small for the dataset to estimate, not that the town did not exist.${num('fx') ? ' The dataset’s coordinates for this town were wrong; the position was taken from Wikidata.' : ''}`,
      };
    }
    case 'hre-towns': {
      const rule = (str('rl') ?? '').split(';').map((x) => x.split('|')).filter((x) => x.length === 3).map(([n, a, b]) => ({ n, a: +a, b: +b }));
      const now = rule.find((r) => r.a <= year && year <= r.b);
      const lines = [
        num('f') !== undefined ? `${str('fb') === 'founded' ? 'Founded' : 'First written mention'}: ${yearLabel(num('f')!)}` : 'No first mention recorded',
        num('ch') !== undefined ? `Town charter: ${yearLabel(num('ch')!)}${str('lf') ? ` (legal family ${str('lf')})` : ''}` : 'No formal town charter recorded',
        ...(num('m') !== undefined ? [`First market grant: ${yearLabel(num('m')!)}${str('mt') ? ` — ${str('mt')}` : ''}`] : []),
        now ? `Ruled in ${yearLabel(year)} by: ${now.n} (${now.a}–${now.b})` : rule.length ? `Ruling territory recorded from ${rule[0].a}` : 'No ruling territory recorded',
      ];
      if (str('a')) lines.push(`Called “${str('a')}” in the Deutsches Städtebuch`);
      return {
        title: str('n') ?? 'Town', lines,
        pick: pt ? { key: `hre:${str('i') ?? num('i')}`, name: str('n') ?? 'Town', lon: pt[0], lat: pt[1] } : undefined,
        link: str('q') ? { href: `https://www.wikidata.org/wiki/${str('q')}`, label: 'Wikidata ↗' } : { href: 'https://doi.org/10.7910/DVN/ZGSJED', label: 'Dataset ↗' },
        source: credit('hre'),
        caution: year < 1300 ? 'Rulers are recorded year by year from 1300; the dataset’s authors consider earlier records less complete.' : 'Territories are recorded as ruling lineages, as the dataset does (e.g. a Wittelsbach line rather than “Bavaria”).',
      };
    }
    case 'private-sites': {
      const f = num('f');
      const ef = num('ef'), et = num('et');
      const when = f !== undefined ? `${str('fb') === 'founded' ? 'Built' : 'First recorded'}: ${yearLabel(f)}${num('t') !== undefined ? ` · end: ${yearLabel(num('t')!)}` : ''}`
        : num('m') !== undefined ? `First market or fair recorded: ${yearLabel(num('m')!)} · markets ${num('mk') ?? 0}, fairs ${num('fr') ?? 0}`
        : ef !== undefined || et !== undefined ? `Dated only by ${str('per') ?? 'an evidence period'}: ${ef !== undefined ? yearLabel(ef) : '…'}–${et !== undefined ? yearLabel(et) : '…'}`
        : 'No date recorded';
      const key = str('i');
      return {
        title: str('n') ?? 'Place', lines: [str('k') ?? '', when, ...(str('dt') ? [`Dating in the source: ${str('dt')}`] : []), ...(str('ty') ? [str('ty')!] : []), ...(num('u') ? ['Location approximate (placed at its commune or parish)'] : [])].filter(Boolean),
        pick: pt && key?.includes(':') ? { key, name: str('n') ?? 'Place', lon: pt[0], lat: pt[1] } : undefined,
        source: privateHeader()?.datasets.find((d) => d.id === str('src'))?.name ?? credit('localonly'),
        caution: 'From your private data file: used privately in Shelf, not published.' + (ef !== undefined && f === undefined ? ' Shown for the whole period the record is dated to — that is when evidence places it, not its founding or end.' : ''),
      };
    }
    case 'gs-dioceses':
      return { title: `Diocese of ${str('n') ?? '?'}`, lines: ['Holy Roman Empire'], source: credit('germaniasacra'), caution: 'Germania Sacra’s reconstruction for no single stated date; borders changed over the centuries.' };
    case 'hced-battles': {
      const y = num('y');
      return {
        title: str('n') ?? 'Battle', lines: [`${str('k') ?? 'battle'}${y !== undefined ? ` · ${yearLabel(y)}` : ''}`, ...(str('w') ? [`War: ${str('w')}`] : []), ...(str('win') ? [`Winner: ${str('win')}${str('los') ? ` · loser: ${str('los')}` : ''}`] : []),
          ...(str('th') && str('th') !== 'Land' ? [`${str('th')} battle`] : []), ...(num('ms') ? ['Recorded as a massacre'] : []),
          ...(num('sc') ? [`Size on the dataset’s scale (Lehmann–Zhukov): ${num('sc')} of 4`] : []), ...(str('cite') ? [`Source cited: ${str('cite')}`] : [])],
        link: { href: 'https://doi.org/10.7910/DVN/6ZFC0V', label: 'Dataset ↗' }, source: credit('hced'),
        caution: 'Year only. Located from the battle’s name and checked by the dataset’s authors. Shelf found no Wikidata battle within 50 km and a year of it, so it is drawn from this dataset alone — Wikidata may still record it under another name.',
      };
    }
    case 'thurayya-places':
      return { title: str('n') ?? 'Place', lines: [`${str('k') ?? ''}${str('rg') ? ` · ${str('rg')}` : ''}`, 'Period: 9th–10th c. (the atlas it comes from)'], pick: pickOf('althurayya'), source: credit('althurayya'), caution: 'Georeferenced from G. Cornu’s atlas; the date is the atlas’s period, not this place’s.' };
    case 'thurayya-routes':
      return { title: 'Route section', lines: [num('m') ? `${Math.round(num('m')! / 1000)} km` : '', 'Period: 9th–10th c. (Cornu’s atlas)'].filter(Boolean), source: credit('althurayya') };
    case 'domesday': {
      const k = str('k')?.replace(/-label$/, '');
      return {
        title: str('n') ?? 'Domesday unit', lines: [k === 'shire' ? 'Shire' : k === 'inter' ? `Intermediate district${str('c') ? ` · ${str('c')}` : ''}` : `Hundred / wapentake${str('c') ? ` · ${str('c')}` : ''}${str('i') ? ` (${str('i')})` : ''}`, 'As recorded in Domesday Book, 1086'],
        link: { href: 'https://doi.org/10.5284/1058999', label: 'Dataset (ADS) ↗' }, source: credit('domesday'),
        caution: 'A modern reconstruction of the 1086 units; boundaries were different before and after.',
      };
    }
    case 'gough': {
      const k = str('k');
      if (k === 'station') return { title: str('n') ?? 'Settlement', lines: [`Settlement on the Gough Map (c. 1400)${str('c') ? ` · ${str('c')}` : ''}`], link: { href: 'https://doi.org/10.5284/1124312', label: 'Dataset (ADS) ↗' }, source: credit('gough'), caution: num('lg') === 0 ? 'The name is illegible or missing on the map; the identification follows the map’s editors.' : 'Identified by the map’s editors.' };
      if (k === 'red') return { title: 'Red line on the Gough Map', lines: [num('v') !== undefined ? `Distance numeral: ${num('v')} (unit uncertain)` : 'No distance numeral', ...(str('no') ? [str('no')!] : [])], source: credit('gough'), caution: 'Drawn schematically between the settlements, as on the map — not the road’s real course.' };
      return { title: 'Route matched to a Gough Map line', lines: [`Evidence: ${str('ca') ?? 'not recorded'}${str('mg') ? ` · Margary ${str('mg')}` : ''}`, ...(str('ev') ? [str('ev')!] : []), ...(str('no') ? [str('no')!] : []), ...(num('pd') !== undefined ? [`Period code in the dataset: ${num('pd')}`] : [])], source: credit('gough'), caution: 'A reconstruction of the road the red line most likely stands for, from later and earlier evidence.' };
    }
    case 'navigation': {
      const k = str('k');
      if (k === 'head') return { title: str('n') ?? 'Head of navigation', lines: [`Head of navigation on the ${str('w') ?? 'river'}`, `Latest date: ${str('ld') ?? 'not recorded'}`, `Evidence class: ${str('cl') ?? 'not recorded'}`, ...(str('ob') ? [`Obstruction: ${str('ob')}`] : []), ...(str('no') ? [str('no')!] : []), ...(str('rf') ? [`References: ${str('rf')}`] : [])], source: credit('navigation'), caution: 'Codes are shown as the dataset records them.' };
      if (k === 'pn') return { title: str('n') ?? 'Place-name', lines: [`Place-name referring to river traffic${str('c') ? ` · ${str('c')}` : ''}`, `${str('ge') ?? ''}${str('tr') ? ` — ${str('tr')}` : ''}`, `First recorded: ${str('ce') ?? '?'} century${str('cd') ? ` (charter date ${str('cd')})` : ''}`, ...(str('rf') ? [`References: ${str('rf')}`] : [])], source: credit('navigation'), caution: 'A place-name suggests river traffic; it does not date it precisely.' };
      return { title: str('n') ?? 'Waterway', lines: [k === 'direct' ? 'Navigable before 1348 — direct evidence' : 'Possibly navigable — mainly place-name evidence', ...(str('h') ? [`Head of navigation: ${str('h')}`] : []), ...(str('co') ? [`Course drawn from: ${str('co')}`] : []), ...(str('no') ? [str('no')!] : [])], source: credit('navigation'), caution: k === 'direct' ? 'The drawn course follows modern or boundary lines where the medieval course is unknown.' : 'Inferred mostly from place-names; the period of use can’t be dated directly.' };
    }
    case 'rural-settlement': {
      const k = str('k');
      return { title: str('n') ?? (k === 'nucleation' ? str('d') ?? 'Nucleated settlement' : 'Settlement region'), lines: [k === 'province' ? 'Settlement province' : k === 'subprovince' ? `Sub-province of the ${str('p')}` : k === 'local' ? `Local region · ${str('s')}${str('ds') ? ` · dispersion: ${str('ds')}` : ''}` : `Category ${str('ca') ?? '?'}`], source: credit('ruralsettlement'), caution: 'Mapped from nineteenth-century Ordnance Survey maps; a characterisation, not a dated record.' };
    }
    case 'ohm': {
      const s = str('start_date');
      const e = str('end_date');
      // A readable name first (English, else a Latin-script one); the local-language name kept as a second line.
      const local = str('name');
      const latin = str('name_en') ?? (local && isLatinScript(local) ? local : undefined) ?? OHM_LATIN_LANGS.map((l) => str(`name_${l}`)).find(Boolean);
      const lines = [str('type') ?? '', s || e ? `Mapped for ${s ?? '?'} – ${e ?? 'present'}` : ''];
      if (local && latin && local !== latin) lines.push(`Local name: ${isolate(local)}`);
      if (local && !latin) lines.push('No English or Latin-script name is recorded for it in OpenHistoricalMap, so the map shows no label.');
      return { title: latin ?? (local ? isolate(local) : 'Feature'), lines: lines.filter(Boolean), source: credit('ohm') };
    }
    default:
      return { title: str('n') ?? str('name') ?? 'Feature', lines: [], source: '' };
  }
}

function FeatureCard({ info, onClose, onHistory, onEvent }: { info: Info; onClose: () => void; onHistory?: () => void; onEvent?: () => void }) {
  return (
    <div className="card tight atlas-card">
      <div className="row between">
        <b>{info.title}</b>
        <button className="btn xs ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {info.lines.map((l, i) => <div key={i} className="small">{l}</div>)}
      {info.caution && <div className="tiny faint mt-4">{info.caution}</div>}
      {(onHistory || onEvent) && (
        <div className="row wrap gap-4 mt-4">
          {onHistory && <button className="btn xs" onClick={onHistory}>Place history</button>}
          {onEvent && <button className="btn xs" onClick={onEvent}>Event details</button>}
        </div>
      )}
      <div className="tiny faint mt-4">
        {info.link && <><a href={info.link.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{info.link.label}</a> · </>}
        <span dangerouslySetInnerHTML={{ __html: `Source: ${info.source}` }} />
      </div>
    </div>
  );
}

/**
 * The owner's private data file: datasets used privately in Shelf but not published (see privateData.ts).
 * Loading it stores it on this device; the page then reloads so every layer and lookup picks it up.
 */
function PrivateDataControl() {
  const [header, setHeader] = useState(privateHeader());
  const [picked, setPicked] = useState<File[]>([]);
  const [msg, setMsg] = useState<string>();
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => { loadPrivateData().then((h) => { setHeader(h); setLoadError(privateLoadError()); }); }, []);
  const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
  // Parts can be picked all at once or one at a time; each pick is added to what is already chosen.
  const add = async (list: FileList | null) => {
    if (!list?.length) { setMsg('No file came back from the phone’s file picker. Try again, and pick the file from “Downloads” or “Files”.'); return; }
    const all = [...picked];
    for (const f of list) if (!all.some((x) => x.name === f.name && x.size === f.size)) all.push(f);
    setPicked(all);
    setMsg('Checking…');
    try {
      const r = await assembleParts(all);
      if (r.state === 'incomplete') { setMsg(`Got ${all.length} file${all.length > 1 ? 's' : ''} (${mb(r.have)} of ${mb(r.need)}). Add the remaining part${r.need - r.have > 26e6 ? 's' : ''}.`); return; }
      if (r.state === 'needFirst') { setMsg(`Got ${all.length} file${all.length > 1 ? 's' : ''} (${mb(r.have)}). Now add the first part (…part1.pack).`); return; }
      if (r.state === 'error') { setMsg(r.message); return; }
      await save(r.blob);
    } catch (e) {
      setMsg(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  // An older file never silently replaces a newer one: the owner is asked.
  const [older, setOlder] = useState<Blob | null>(null);
  const save = async (blob: Blob, allowOlder = false) => {
    setOlder(null);
    setMsg('Checking and saving on this device…');
    try {
      await installPrivateData(blob, { allowOlder });
      setMsg('Saved and checked. Restarting the map…');
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      if (e instanceof PrivateDataError && e.code === 'older') setOlder(blob);
      setMsg(`${e instanceof PrivateDataError && e.code === 'older' ? '' : 'Could not load: '}${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <details className="hmap-sources" open={!!picked.length || undefined}>
      <summary>Your private data {header ? `· ${header.datasets.length} datasets on this device` : '· not loaded'}</summary>
      <p className="tiny">
        Some historical datasets can be used privately but not republished on a public website. They come in a separate
        file that stays on this device. {header ? `Loaded file built ${header.built}.` : 'Choose the three parts (…part1.pack, …part2.pack, …part3.pack) — all at once, or one after another.'}
      </p>
      {header && (
        <ul>
          {header.datasets.map((d) => <li key={d.id}>{d.name}: {d.records.toLocaleString()} records ({d.licence})</li>)}
        </ul>
      )}
      <label className="btn xs">
        {header ? 'Replace with a newer file' : picked.length ? 'Add another part' : 'Load private data file'}
        <input type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </label>
      {older && <button className="btn xs" onClick={() => save(older, true)}>Replace anyway</button>}
      {picked.length > 0 && <button className="btn xs" onClick={() => { setPicked([]); setMsg(undefined); setOlder(null); }}>Start over</button>}
      {header && <button className="btn xs" onClick={async () => { await removePrivateData(); location.reload(); }}>Remove from this device</button>}
      {picked.length > 0 && <ul className="tiny">{picked.map((f) => <li key={f.name + f.size}>{f.name} — {mb(f.size)}</li>)}</ul>}
      {loadError && !msg && <p className="tiny" role="status">A saved file is on this device but could not be opened: {loadError}</p>}
      {msg && <p className="tiny" role="status">{msg}</p>}
    </details>
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
