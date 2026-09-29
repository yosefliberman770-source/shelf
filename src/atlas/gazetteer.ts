// Gazetteers: offline lookup of historical place names, by period.
//
// Each gazetteer covers a span of history. The reader asks every gazetteer
// that covers the book's period; today that is Pleiades (the ancient world),
// and later datasets (medieval, early modern…) plug in the same way. Names
// are only linked to a place when the dataset itself records that name for
// it — two places are never merged because their names look alike.
import { km, type Pos, pack } from './data';
import type { HistYear } from './time';

export interface GazName { name: string; from?: HistYear; to?: HistYear; lang?: string }
export interface GazPlace {
  /** "<gazetteer>:<id>", e.g. "pleiades:423025" */
  key: string;
  gazetteer: GazetteerId;
  id: number;
  title: string;
  lon: number;
  lat: number;
  precise: boolean;
  types: string[];
  from?: HistYear;
  to?: HistYear;
  /** 0 certain, 1 less certain, 2 uncertain (the source's own rating). */
  uncertain: number;
  names: GazName[];
  /** Places this one is recorded as part of (region, province…), by title. */
  partOf: string[];
  /** Other relationships the dataset records ("succeeds", "port of", "near"…), both directions. */
  related: Relation[];
  url: string;
}

export type GazetteerId = 'pleiades';
export interface Relation { title: string; key?: string; type: string; reverse?: boolean }

/** Pleiades connection types in plain words; reverse = seen from the other place. */
const REL_LABEL: Record<string, [string, string]> = {
  succeeds: ['succeeds', 'succeeded by'], same_as: ['same as', 'same as'], capital: ['capital of', 'has capital'], port_of: ['port of', 'has port'],
  founded: ['founded', 'founded by'], near: ['near', 'near'], at: ['at', 'site of'], on: ['on', 'has on it'], crosses: ['crosses', 'crossed by'],
  flows_into: ['flows into', 'receives'], route_next: ['next on route to', 'next on route from'], abuts: ['borders', 'borders'], bounds: ['bounds', 'bounded by'],
  communicates: ['connected with', 'connected with'], related: ['related to', 'related to'],
};
export const relationLabel = (r: Relation) => (REL_LABEL[r.type] ?? [r.type.replace(/_/g, ' '), r.type.replace(/_/g, ' ')])[r.reverse ? 1 : 0];
export interface GazetteerInfo { id: GazetteerId; name: string; license: string; url: string; coverage: [HistYear, HistYear]; describe: string }

/** The registry. Add a dataset for another period here, with a loader below. */
export const GAZETTEERS: GazetteerInfo[] = [
  { id: 'pleiades', name: 'Pleiades', license: 'CC BY 3.0', url: 'https://pleiades.stoa.org/', coverage: [-3000, 1500], describe: 'Ancient places, their names and dates (Greek, Roman, Near Eastern, Late Antique and some medieval).' },
];

export const gazetteersFor = (year?: HistYear) => GAZETTEERS.filter((g) => year === undefined || (year >= g.coverage[0] && year <= g.coverage[1]));

/** Lower-case, without accents or a leading "the", so "Lutétia" = "lutetia". */
export const normName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/^the\s+/, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/** Types that are not places one can put a pin on for a reader's name. */
const NOT_A_LOCATION = new Set(['people', 'ethnic-group', 'unknown', 'false', 'label']);

type Row = [number, string, number, number, 0 | 1, string, number | null, number | null, number, [string, number | null, number | null, string][], number[], [number, string][]?];

export class Gazetteer {
  readonly byKey = new Map<string, GazPlace[]>();
  readonly byId = new Map<string, GazPlace>();
  readonly all: GazPlace[] = [];
  constructor(readonly info: GazetteerInfo, rows: Row[], titles: Record<string, string>) {
    for (const r of rows) {
      const p: GazPlace = {
        key: `${info.id}:${r[0]}`, gazetteer: info.id, id: r[0], title: r[1], lon: r[2], lat: r[3], precise: r[4] === 1,
        types: r[5] ? r[5].split(',') : [], from: r[6] ?? undefined, to: r[7] ?? undefined, uncertain: r[8],
        names: r[9].map(([name, from, to, lang]) => ({ name, from: from ?? undefined, to: to ?? undefined, lang: lang || undefined })),
        partOf: [], related: [], url: `https://pleiades.stoa.org/places/${r[0]}`,
      };
      this.all.push(p);
      this.byId.set(p.key, p);
      for (const n of new Set([p.title, ...p.names.map((x) => x.name)].map(normName))) {
        if (n.length < 2) continue;
        const list = this.byKey.get(n) ?? [];
        list.push(p);
        this.byKey.set(n, list);
      }
    }
    // "Part of" titles, looked up after every place is known.
    const title = (id: number) => this.byId.get(`${info.id}:${id}`)?.title ?? titles[String(id)];
    rows.forEach((r, i) => {
      const p = this.all[i];
      p.partOf = r[10].map(title).filter((x): x is string => !!x);
      for (const [id, type] of r[11] ?? []) {
        const t = title(id);
        if (!t) continue;
        const key = `${info.id}:${id}`;
        p.related.push({ title: t, key: this.byId.has(key) ? key : undefined, type });
        this.byId.get(key)?.related.push({ title: p.title, key: p.key, type, reverse: true });
      }
    });
  }

  /** Every place whose recorded names include this name exactly. */
  match(name: string): GazPlace[] {
    return (this.byKey.get(normName(name)) ?? []).filter((p) => !p.types.every((t) => NOT_A_LOCATION.has(t)));
  }

  /** Places by name prefix (for search). Title matches first. */
  search(q: string, limit = 20): GazPlace[] {
    const k = normName(q);
    if (k.length < 2) return [];
    const exact = this.byKey.get(k) ?? [];
    const out = new Set(exact);
    for (const [n, ps] of this.byKey) {
      if (out.size >= limit * 3) break;
      if (n !== k && n.startsWith(k)) for (const p of ps) out.add(p);
    }
    return [...out].sort((a, b) => Number(normName(b.title) === k) - Number(normName(a.title) === k) || Number(b.precise) - Number(a.precise)).slice(0, limit);
  }

  /** Places within `radiusKm`, nearest first; with a year, only those recorded around then (or undated). */
  nearby(at: Pos, radiusKm: number, opts: { year?: HistYear; slack?: number; exclude?: string; filter?: (p: GazPlace) => boolean } = {}): { place: GazPlace; km: number }[] {
    const dLat = radiusKm / 110.57;
    const dLon = radiusKm / (111.32 * Math.max(0.1, Math.cos((at[1] * Math.PI) / 180)));
    const out: { place: GazPlace; km: number }[] = [];
    for (const p of this.all) {
      if (Math.abs(p.lat - at[1]) > dLat || Math.abs(p.lon - at[0]) > dLon || p.key === opts.exclude) continue;
      if (opts.year !== undefined && !existedAround(p, opts.year, opts.slack)) continue;
      if (opts.filter && !opts.filter(p)) continue;
      const d = km(at, [p.lon, p.lat]);
      if (d <= radiusKm) out.push({ place: p, km: d });
    }
    return out.sort((a, b) => a.km - b.km);
  }
}

/** Was the place recorded around this year? Undated places count as "maybe". */
export function existedAround(p: { from?: HistYear; to?: HistYear }, year: HistYear, slack = 0): boolean {
  if (p.from === undefined && p.to === undefined) return true;
  return (p.from === undefined || p.from - slack <= year) && (p.to === undefined || p.to + slack >= year);
}

/** Names the place had around a year, according to the dataset's own name dates. */
export function namesAround(p: GazPlace, year?: HistYear): GazName[] {
  if (year === undefined) return p.names;
  return p.names.filter((n) => existedAround(n, year, 50));
}

const loaded = new Map<GazetteerId, Promise<Gazetteer>>();
export function loadGazetteer(id: GazetteerId = 'pleiades'): Promise<Gazetteer> {
  if (!loaded.has(id)) {
    const info = GAZETTEERS.find((g) => g.id === id)!;
    const p = pack<{ rows: Row[]; titles: Record<string, string> }>('pleiades-gazetteer.json').then((d) => new Gazetteer(info, d.rows, d.titles ?? {}));
    p.catch(() => loaded.delete(id));
    loaded.set(id, p);
  }
  return loaded.get(id)!;
}

// ── Matching a name from the book ─────────────────────────────────────────

export type MatchStatus = 'unique' | 'ambiguous' | 'none';
export interface NameMatch {
  status: MatchStatus;
  place?: GazPlace;
  candidates: GazPlace[];
  /** Which recorded name matched ("Carthage" → recorded name of Carthago). */
  matchedName?: GazName & { isTitle: boolean };
  reason: string;
}

/**
 * Match a name as written in the book. A place is chosen only when exactly one
 * place in the dataset carries that name (after keeping only places recorded
 * around the year, when the year is known). Otherwise it is ambiguous and the
 * reader decides.
 */
export function matchName(g: Gazetteer, written: string, year?: HistYear): NameMatch {
  const all = g.match(written);
  if (!all.length) return { status: 'none', candidates: [], reason: `No place called “${written}” in ${g.info.name}.` };
  const inTime = year === undefined ? all : all.filter((p) => existedAround(p, year, 150));
  const pool = inTime.length ? inTime : all;
  // Places whose main title is the name outrank places that only list it among other names.
  const k = normName(written);
  const titled = pool.filter((p) => normName(p.title) === k);
  const chosen = pool.length === 1 ? pool[0] : titled.length === 1 && pool.length - titled.length <= 1 && titled[0].precise ? titled[0] : undefined;
  if (!chosen) return { status: 'ambiguous', candidates: pool.slice(0, 12), reason: `${pool.length} places in ${g.info.name} are recorded with the name “${written}”${year !== undefined && inTime.length ? ' around this date' : ''}.` };
  const isTitle = normName(chosen.title) === k;
  const nm = isTitle ? { name: chosen.title, isTitle } : { ...chosen.names.find((n) => normName(n.name) === k)!, isTitle };
  return {
    status: 'unique', place: chosen, candidates: pool.slice(0, 12), matchedName: nm,
    reason: pool.length === 1 ? `The only place in ${g.info.name} recorded with the name “${written}”${year !== undefined && inTime.length < all.length ? ' around this date' : ''}.` : `The only place in ${g.info.name} whose main name is “${written}”.`,
  };
}
