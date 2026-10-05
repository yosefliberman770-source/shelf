// "What am I looking at?" — facts about a point and a year, each taken from a
// named dataset: the polity whose territory contains it (Cliopatria), the
// region it lies in (Pleiades), recorded battles and wars nearby (Wikidata),
// and roads, rivers and places around it (Pleiades, AWMC). Nothing is
// inferred beyond what those records say.
import { contains, distanceToLine, type FC, type Feature, km, type Pos, pack } from './data';
import { existedAround, type GazPlace, nearbyPlaces } from './gazetteer';
import { type HistYear, shiftYear } from './time';

/** Dataset rows keep dates as f/t. */
const span = (x: { f?: number; t?: number }) => ({ from: x.f, to: x.t });

export interface Polity {
  n: string; q?: string; c?: string; f: HistYear; t: HistYear;
  /** The point is just outside the (simplified) outline, not inside it. */ edge?: boolean;
  /** A Cliopatria grouping (its name is in parentheses) rather than a polity. */ g?: 1;
  /** Groupings this polity belongs to (";"-separated). */ m?: string;
  /** Polities whose outlines overlap this one in the same years with no recorded relationship (";"-separated): source uncertainty, not a claim. */ x?: string;
  /** Recorded relationships (allegiance, vassalage, personal union…) that explain an overlap. */ xr?: string;
  /** A small outlying piece of the polity's outline. */ op?: 1;
  /** Area of the outline, km². */ a?: number;
  /** The everyday English name when `n` is a formal title ("Third Hellenic Republic" → Greece). */ cn?: string;
  /** Groupings containing this point that the polity belongs to, without parentheses. */ partOf?: string[];
  /** The point is inside, but this close (km) to the outline's edge: the simplified outline can't settle who held it (A16-005). */ border?: number;
}
/** Within this distance of an outline's edge, the outline alone doesn't say which side a place was on. */
export const BORDER_KM = 15;

/** A polity's name for display: Cliopatria's parentheses removed from groupings. */
export const polityDisplayName = (p: Pick<Polity, 'n' | 'cn'>) => p.cn ?? p.n.replace(/^\(|\)$/g, '');
/**
 * Cliopatria names some areas by a convention, not a state: many small units under one label ("Holy Roman Empire
 * Minor States", "Mayan City-States"), a population or movement ("Viking settlements", "Hungarian Nationalists").
 * Said as such, never as a ruler (A11-004, X-22).
 */
export function polityConvention(name: string): string | undefined {
  if (/\b(?:minor states|city-states|states|kingdoms|principalities|chiefdoms|lordships)\b/i.test(name) && !/^(?:united|confederate|papal|federated|the united) /i.test(name) && !/^(?:kingdom|state|states|principality) of /i.test(name)) return 'Cliopatria’s label for many small units drawn as one area, not a single state';
  if (/\b(?:settlements|tribes|peoples|nationalists|communists|rebels|magnates|warlords|clans)\b/i.test(name)) return 'Cliopatria’s label for a population, movement or faction, not a state with fixed borders';
  return undefined;
}
export interface AtlasEvent {
  q: string; n: string; k: 'battle' | 'siege' | 'campaign' | 'revolt' | 'expedition' | 'coup' | 'treaty' | string; y: HistYear; /** End year, for events that lasted. */ y2?: HistYear; pos: Pos; w?: string; wn?: string; u?: number; yp?: string;
  /** HCED's id: the event is in the Historical Conflict Event Dataset (alone when q is "hced:…"). */ h?: string;
  /** Winner and loser as HCED names them. */ win?: string; los?: string;
  /** HCED's own position and its distance from Wikidata's, when they disagree. */ hp?: Pos; hd?: number;
  /** Other Wikidata items for the same event, and how far apart they place it. */ dq?: string[]; dd?: number;
  /** Dated outside its own war (1), or inside it with the era reversed ('sign'). */ wo?: 1 | 'sign';
  /** Wikidata's label doesn't read as an event name. */ nl?: 1;
}
/** Which dataset an event comes from, for display. */
export const eventSource = (e: Pick<AtlasEvent, 'q' | 'h'>) => (e.q.startsWith('hced:') ? 'Historical Conflict Event Dataset' : e.h ? 'Wikidata; Historical Conflict Event Dataset' : 'Wikidata');
export interface War { q: string; n: string; f: HistYear | null; t: HistYear | null }

/**
 * Polities whose territory contains the point in that year (Cliopatria). The
 * outlines are simplified, so a coastal city can fall just outside its own
 * state's line; when nothing contains the point, a border within `edgeKm` is
 * reported as "at the edge of" instead.
 */
export async function politiesAt(p: Pos, year: HistYear, edgeKm = 20): Promise<Polity[]> {
  const index = await pack<{ from: number; to: number; file: string }[]>('cliopatria/index.json');
  const slice = index.find((s) => s.from <= year && year <= s.to);
  if (!slice) return [];
  const fc = await pack<FC<Polity>>(slice.file);
  const now = fc.features.filter((f) => f.properties.f <= year && f.properties.t >= year && f.geometry?.type !== 'Point');
  const seen = new Set<string>();
  const uniq = (xs: Polity[]) => xs.filter((x) => (seen.has(x.n) ? false : (seen.add(x.n), true)));
  const containingF = now.filter((f) => contains(f.geometry, p));
  const containing = containingF.map((f) => f.properties);
  // Hierarchy: groupings are reported as what the polity is part of, not as
  // rival polities. Independent polities that overlap here are an overlap in the source (see Polity.x / xr).
  const groups = containing.filter((x) => x.g);
  const members = containing.filter((x) => !x.g).sort((a, b) => (a.op ? 1 : 0) - (b.op ? 1 : 0) || (a.a ?? Infinity) - (b.a ?? Infinity));
  // A grouping with the member's own name ("(Holy Roman Empire)" around "Holy Roman Empire") adds nothing to say.
  const withParents = members.map((x) => ({ ...x, partOf: groups.filter((g) => (x.m ?? '').split(';').includes(g.n)).map(polityDisplayName).filter((n) => n !== polityDisplayName(x)) }));
  const rings = (g: Feature['geometry']) => ({ type: 'MultiLineString', coordinates: g?.type === 'Polygon' ? g.coordinates : g?.type === 'MultiPolygon' ? (g.coordinates as Pos[][][]).flat() : [] });
  // The outline that contains the point (not an outlying piece of the same polity).
  const geom = new Map(containingF.map((f) => [f.properties.n, f.geometry]));
  const inside = uniq(withParents.length ? withParents : groups).map((x) => {
    const g = geom.get(x.n);
    const d = g ? distanceToLine(rings(g), p) : Infinity;
    return d < BORDER_KM ? { ...x, border: Math.round(d) } : x;
  });
  if (inside.length || !edgeKm) return inside;
  return uniq(now.filter((f) => !f.properties.g).map((f) => ({ f, d: distanceToLine(rings(f.geometry), p) })).filter((x) => x.d <= edgeKm).sort((a, b) => a.d - b.d).slice(0, 1).map((x) => ({ ...x.f.properties, edge: true })));
}

let eventsP: Promise<AtlasEvent[]> | undefined;
/**
 * Every recorded event: Wikidata's, and the battles only the Historical Conflict Event Dataset records (A8-016) — the
 * latter keyed "hced:<id>", their war by name only. Battles both record are Wikidata's, carrying HCED's record.
 */
export function allEvents(): Promise<AtlasEvent[]> {
  eventsP ??= Promise.all([
    pack<FC<Omit<AtlasEvent, 'pos'>>>('wikidata-events.json'),
    pack<FC<Omit<AtlasEvent, 'pos' | 'q'> & { w?: string }>>('hced-battles.json').catch(() => ({ features: [] }) as unknown as FC<Omit<AtlasEvent, 'pos' | 'q'>>),
  ]).then(([wd, hc]) => [
    ...wd.features.map((f) => ({ ...f.properties, pos: (f.geometry as { coordinates: Pos }).coordinates })),
    ...hc.features.map((f) => { const { w, ...p } = f.properties as typeof f.properties & { w?: string }; return { ...p, q: `hced:${p.h}`, wn: w, pos: (f.geometry as { coordinates: Pos }).coordinates }; }),
  ]);
  eventsP.catch(() => { eventsP = undefined; });
  return eventsP;
}
export const allWars = () => pack<War[]>('wikidata-wars.json');

/** Recorded events within `radiusKm`, optionally within ±window years; nearest in time first. */
export async function eventsNear(p: Pos, radiusKm: number, year?: HistYear, window = 25): Promise<(AtlasEvent & { km: number })[]> {
  const ev = await allEvents();
  const lo = year !== undefined ? shiftYear(year, -window) : -Infinity;
  const hi = year !== undefined ? shiftYear(year, window) : Infinity;
  return ev.filter((e) => e.y <= hi && (e.y2 ?? e.y) >= lo).map((e) => ({ ...e, km: km(p, e.pos) })).filter((e) => e.km <= radiusKm)
    .sort((a, b) => (year !== undefined ? Math.abs(a.y - year) - Math.abs(b.y - year) : 0) || a.km - b.km);
}

/**
 * The years a war is known to have been going on: its recorded start and end; with no end, until its last recorded
 * event (A8-010); with no start, from its first (A8-011). Undefined when nothing dates it.
 */
export function warSpan(w: War, ev: AtlasEvent[]): [HistYear, HistYear] | undefined {
  const own = ev.filter((e) => e.w === w.q && !e.wo);
  const first = own.length ? Math.min(...own.map((e) => e.y)) : undefined;
  const last = own.length ? Math.max(...own.map((e) => e.y2 ?? e.y)) : undefined;
  const f = w.f ?? first ?? w.t ?? undefined;
  const t = w.t ?? (last !== undefined ? Math.max(last, f ?? last) : w.f ?? undefined);
  return f !== undefined && t !== undefined ? [f, t] : undefined;
}

/** Wars in progress in that year that have a recorded battle or siege within `radiusKm`. */
export async function warsNear(p: Pos, year: HistYear, radiusKm = 400): Promise<(War & { events: number })[]> {
  const [wars, ev] = await Promise.all([allWars(), allEvents()]);
  const active = wars.filter((w) => { const s = warSpan(w, ev); return !!s && s[0] <= year && year <= s[1]; });
  return active.map((w) => ({ ...w, events: ev.filter((e) => e.w === w.q && km(p, e.pos) <= radiusKm).length })).filter((w) => w.events > 0).sort((a, b) => b.events - a.events);
}

/** How far either side of the date a place card looks for its events — stated on the card (A8-017). */
export const PLACE_EVENT_YEARS = 100;
/** Events at the place itself (within this distance) come before the region's, whatever their date (A8-027). */
export const AT_PLACE_KM = 30;
/** Events between two dates around a place: the place's own first, then the rest by distance; dated order within each. */
export const placeEventsFirst = <T extends AtlasEvent & { km: number }>(ev: T[]) =>
  [...ev].sort((a, b) => Number(a.km > AT_PLACE_KM) - Number(b.km > AT_PLACE_KM) || (a.km > AT_PLACE_KM ? a.km - b.km : 0) || a.y - b.y);

export const eventsOfWar = async (q: string) => (await allEvents()).filter((e) => e.w === q).sort((a, b) => a.y - b.y);

/** Named roads, rivers, aqueducts and canals passing within `radiusKm` (Pleiades lines, AWMC roads). */
export async function linesNear(p: Pos, radiusKm: number, year?: HistYear): Promise<{ n: string; k: string; km: number; source: 'pleiades' | 'awmc'; i?: number }[]> {
  const [pl, aw] = await Promise.all([
    pack<FC<{ n: string; k: string; i: number; f?: number; t?: number }>>('pleiades-lines.json'),
    pack<FC<{ n?: string; f?: number; t?: number }>>('awmc-roads.json').catch(() => ({ features: [] }) as unknown as FC<{ n?: string }>),
  ]);
  const out = new Map<string, { n: string; k: string; km: number; source: 'pleiades' | 'awmc'; i?: number }>();
  for (const f of pl.features) {
    if (year !== undefined && !existedAround(span(f.properties), year, 50) && f.properties.k !== 'river') continue;
    const d = distanceToLine(f.geometry, p);
    const k = `${f.properties.k}:${f.properties.n}`;
    if (d <= radiusKm && (!out.has(k) || out.get(k)!.km > d)) out.set(k, { n: f.properties.n, k: f.properties.k, km: d, source: 'pleiades', i: f.properties.i });
  }
  for (const f of aw.features) {
    if (!f.properties.n) continue;
    if (year !== undefined && !existedAround(span(f.properties as { f?: number; t?: number }), year, 50)) continue;
    const d = distanceToLine(f.geometry, p);
    const k = `road:${f.properties.n}`;
    if (d <= radiusKm && (!out.has(k) || out.get(k)!.km > d)) out.set(k, { n: f.properties.n, k: 'road', km: d, source: 'awmc' });
  }
  return [...out.values()].sort((a, b) => a.km - b.km);
}

/** Categories for "What's around here?", from Pleiades place types. */
export const AROUND_KINDS: { id: string; label: string; types: string[] }[] = [
  { id: 'settlement', label: 'Cities, towns & settlements', types: ['settlement', 'urban', 'polis', 'vicus', 'fortified-settlement', 'townhouse-settlement', 'village', 'town', 'towns', 'capitals', 'villages'] },
  { id: 'port', label: 'Ports & harbours', types: ['port', 'harbor', 'anchorage', 'lighthouse', 'harbour'] },
  { id: 'fort', label: 'Forts & camps', types: ['fort', 'fort-2', 'fortlet', 'castellum', 'castle', 'hillfort', 'military-installation-or-camp-temporary', 'military-base', 'citadel'] },
  { id: 'religious', label: 'Religious sites', types: ['temple', 'temple-2', 'sanctuary', 'shrine', 'church', 'church-2', 'mosque', 'synagogue', 'monastery', 'altar'] },
  { id: 'trade', label: 'Tolls, fairs, staples, ferries & bridges', types: ['toll', 'fair', 'staple', 'ferry', 'bridge', 'lock', 'waystations', 'xroads'] },
  { id: 'water', label: 'Rivers, lakes & springs', types: ['river', 'lake', 'spring', 'lagoon', 'water-inland', 'bay', 'waters'] },
  { id: 'relief', label: 'Mountains & passes', types: ['mountain', 'hill', 'pass', 'volcano', 'plain', 'valley'] },
  { id: 'other', label: 'Other sites', types: [] },
];
export function aroundKind(p: GazPlace): string {
  return AROUND_KINDS.find((k) => k.types.length && p.types.some((t) => k.types.includes(t)))?.id ?? 'other';
}

export interface LookingAt {
  polities: Polity[];
  regions: string[];
  nearest: { place: GazPlace; km: number }[];
  wars: (War & { events: number })[];
}

/**
 * The "What am I looking at?" summary for a point and year. Nearest places
 * are settlements recorded around that year, nearest first — Pleiades records
 * no city sizes, so they are not called "major".
 */
export async function lookingAt(p: Pos, year: HistYear, opts: { exclude?: string; partOf?: string[] } = {}): Promise<LookingAt> {
  const settle = AROUND_KINDS[0].types;
  const [polities, near, wars] = await Promise.all([
    politiesAt(p, year).catch(() => []),
    nearbyPlaces(p, 60, { year, slack: 0, exclude: opts.exclude, filter: (x) => x.precise && x.from !== undefined && !x.datasetPeriod && x.title !== 'Untitled' && x.types.some((t) => settle.includes(t)) }).catch(() => []),
    warsNear(p, year).catch(() => []),
  ]);
  const nearest = near.slice(0, 4);
  // Regions only from Pleiades' own "part of" links — its province outlines are too coarse to test a point against.
  return { polities, regions: [...new Set(opts.partOf ?? [])], nearest, wars: wars.slice(0, 3) };
}

// ── Live details for one event (Wikidata) ─────────────────────────────────

export interface EventDetails { participants: string[]; locationName?: string; description?: string }
const detailCache = new Map<string, Promise<EventDetails>>();
/**
 * Participants and description of an event, read from its Wikidata item
 * (P710 "participant", P276 "location"). Only what Wikidata records is shown.
 */
export function eventDetails(q: string, signal?: AbortSignal): Promise<EventDetails> {
  if (!/^Q\d+$/.test(q)) return Promise.resolve({ participants: [] });
  if (!detailCache.has(q)) {
    const api = (ids: string, props: string) => fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=${props}&languages=en&format=json&origin=*`, { signal }).then((r) => r.json());
    const p = (async () => {
      const d = await api(q, 'claims|descriptions');
      const ent = d.entities?.[q];
      const ids = (prop: string) => ((ent?.claims?.[prop] ?? []) as { mainsnak?: { datavalue?: { value?: { id?: string } } } }[]).map((c) => c.mainsnak?.datavalue?.value?.id).filter((x): x is string => !!x);
      const part = ids('P710').slice(0, 12);
      const loc = ids('P276').slice(0, 1);
      const want = [...part, ...loc];
      const labels: Record<string, string> = {};
      if (want.length) {
        const l = await api(want.join('|'), 'labels');
        for (const id of want) labels[id] = l.entities?.[id]?.labels?.en?.value ?? id;
      }
      return { participants: part.map((id) => labels[id]), locationName: loc[0] ? labels[loc[0]] : undefined, description: ent?.descriptions?.en?.value };
    })();
    p.catch(() => detailCache.delete(q));
    detailCache.set(q, p);
  }
  return detailCache.get(q)!;
}
