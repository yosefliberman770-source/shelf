// Historical search across the atlas datasets: places by any recorded name
// (Pleiades), battles/sieges/campaigns and wars (Wikidata), and polities —
// kingdoms, empires, republics (Cliopatria). Modern names are searched
// online separately (Wikidata / WHG) by the place service.
import { allEvents, allWars } from './context';
import { pack, type Pos } from './data';
import { type GazPlace, loadGazetteer, normName } from './gazetteer';
import type { HistYear } from './time';

export type SearchHit =
  | { kind: 'place'; key: string; title: string; matched?: string; place: GazPlace; pos: Pos }
  | { kind: 'event'; key: string; title: string; y: HistYear; eventKind: string; war?: string; q: string; pos: Pos }
  | { kind: 'war'; key: string; title: string; f: HistYear | null; t: HistYear | null; q: string }
  | { kind: 'polity'; key: string; title: string; f: HistYear; t: HistYear; c?: string; q?: string; pos: Pos };

interface PolityName { n: string; f: number; t: number; q?: string; c?: string; x: number; y: number }

const has = (hay: string, k: string) => normName(hay).includes(k);

export async function searchAtlas(query: string, limit = 12): Promise<SearchHit[]> {
  const k = normName(query);
  if (k.length < 2) return [];
  const [g, events, wars, polities] = await Promise.all([
    loadGazetteer().catch(() => undefined),
    allEvents().catch(() => []),
    allWars().catch(() => []),
    pack<PolityName[]>('cliopatria/names.json').catch(() => []),
  ]);
  const places: SearchHit[] = (g?.search(query, limit) ?? []).map((p) => {
    const alt = normName(p.title).startsWith(k) ? undefined : p.names.find((n) => normName(n.name).startsWith(k))?.name;
    return { kind: 'place', key: p.key, title: p.title, matched: alt, place: p, pos: [p.lon, p.lat] };
  });
  const starts = (s: string) => normName(s).startsWith(k) || normName(s).includes(` ${k}`);
  const ev: SearchHit[] = events.filter((e) => has(e.n, k)).sort((a, b) => Number(starts(b.n)) - Number(starts(a.n))).slice(0, limit)
    .map((e) => ({ kind: 'event', key: `wd:${e.q}`, title: e.n, y: e.y, eventKind: e.k, war: e.wn, q: e.q, pos: e.pos }));
  const wr: SearchHit[] = wars.filter((w) => has(w.n, k)).slice(0, limit).map((w) => ({ kind: 'war', key: `war:${w.q}`, title: w.n, f: w.f, t: w.t, q: w.q }));
  const po: SearchHit[] = polities.filter((p) => has(p.n, k)).sort((a, b) => Number(starts(b.n)) - Number(starts(a.n))).slice(0, limit)
    .map((p) => ({ kind: 'polity', key: `clio:${p.n}:${p.q ?? ''}`, title: p.n, f: p.f, t: p.t, c: p.c, q: p.q, pos: [p.x, p.y] }));
  return [...places, ...wr, ...ev, ...po];
}
