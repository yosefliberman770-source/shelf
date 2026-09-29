// Entity provider: resolves a name ("Hannibal", "Carthage", "Battle of Cannae")
// to ONE shared entity in the reader's knowledge graph. Identity comes from
// Wikidata, so every feature — reader, atlas, images, curricula, notes, AI —
// points at the same record. Facts are copied with their source; nothing is
// invented, and approximate dates stay marked as approximate.
import { db, uid } from '../db/db';
import type { Concept, ConceptKind, Source } from '../db/types';

export interface EntityProvider {
  search(name: string, signal?: AbortSignal): Promise<EntityCandidate[]>;
  facts(id: string, signal?: AbortSignal): Promise<EntityFacts>;
}

export interface EntityCandidate { id: string; label: string; description?: string }

export interface EntityFacts {
  id: string;
  label: string;
  description?: string;
  aliases: string[];
  kind: ConceptKind;
  start?: number;
  end?: number;
  approximate?: boolean;
  lat?: number;
  lon?: number;
  image?: string;
  wikiTitle?: string;
}

const WD = 'https://www.wikidata.org';

// Instance-of values used to classify an entity. Anything else stays a concept.
const KIND_BY_TYPE: Record<string, ConceptKind> = {
  Q5: 'person',
  Q515: 'place', Q486972: 'place', Q1549591: 'place', Q839954: 'place', Q15661340: 'place', Q2221906: 'place', Q23442: 'place', Q8502: 'place', Q4022: 'place', Q165: 'place', Q82794: 'place', Q107425: 'place',
  Q178561: 'event', Q198: 'event', Q188055: 'event', Q131569: 'event', Q124734: 'event', Q1190554: 'event', Q645883: 'event', Q180684: 'event', Q625994: 'event', Q12184: 'event', Q625298: 'event', Q750215: 'event', Q175331: 'event', Q1261499: 'event',
  Q6256: 'polity', Q3024240: 'polity', Q48349: 'polity', Q3624078: 'polity', Q7275: 'polity', Q1250464: 'polity', Q417175: 'polity', Q133442: 'polity', Q11776944: 'polity', Q1307214: 'polity', Q28171280: 'polity', Q15642541: 'polity',
  Q43229: 'organization', Q4830453: 'organization', Q7278: 'organization', Q2659904: 'organization', Q35798: 'organization',
  Q11514315: 'period', Q6428674: 'period', Q4375074: 'period', Q8432: 'period',
  Q47461344: 'source', Q7725634: 'source', Q571: 'source', Q386724: 'source', Q1371849: 'source',
  Q220659: 'object', Q860861: 'object', Q41176: 'object', Q223557: 'object', Q838948: 'object', Q15328: 'object', Q17537576: 'object',
};

function parseTime(v: { time: string; precision: number } | undefined): { year?: number; approx: boolean } {
  if (!v) return { approx: false };
  const m = /^([+-])(\d+)-/.exec(v.time);
  if (!m) return { approx: false };
  const year = (m[1] === '-' ? -1 : 1) * Number(m[2]);
  return { year: year === 0 ? undefined : year, approx: v.precision < 9 };
}

type Claims = Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
const claim = <T,>(c: Claims, p: string): T | undefined => c[p]?.[0]?.mainsnak?.datavalue?.value as T | undefined;

export const wikidata: EntityProvider = {
  async search(name, signal) {
    const r = await fetch(`${WD}/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&uselang=en&format=json&limit=6&origin=*`, { signal });
    if (!r.ok) throw new Error('Wikidata search failed');
    const j = (await r.json()) as { search?: { id: string; label: string; description?: string }[] };
    return (j.search ?? []).map((x) => ({ id: x.id, label: x.label, description: x.description }));
  },
  async facts(id, signal) {
    const r = await fetch(`${WD}/wiki/Special:EntityData/${id}.json`, { signal });
    if (!r.ok) throw new Error('Wikidata lookup failed');
    const j = (await r.json()) as { entities: Record<string, { labels?: Record<string, { value: string }>; descriptions?: Record<string, { value: string }>; aliases?: Record<string, { value: string }[]>; claims: Claims; sitelinks?: Record<string, { title: string }> }> };
    const e = Object.values(j.entities)[0];
    const c = e.claims ?? {};
    const types = (c.P31 ?? []).map((x) => (x.mainsnak.datavalue?.value as { id?: string } | undefined)?.id).filter(Boolean) as string[];
    const RANK: ConceptKind[] = ['person', 'event', 'polity', 'place', 'organization', 'source', 'object', 'period'];
    const found = new Set(types.map((t) => KIND_BY_TYPE[t]).filter(Boolean));
    let kind: ConceptKind = RANK.find((k) => found.has(k)) ?? 'concept';
    const time = (p: string) => parseTime(claim<{ time: string; precision: number }>(c, p));
    const start = time('P569').year !== undefined ? time('P569') : time('P580').year !== undefined ? time('P580') : time('P571').year !== undefined ? time('P571') : time('P585');
    const end = time('P570').year !== undefined ? time('P570') : time('P582').year !== undefined ? time('P582') : time('P576');
    const coord = claim<{ latitude: number; longitude: number }>(c, 'P625');
    if (kind === 'concept' && time('P569').year !== undefined) kind = 'person';
    else if (kind === 'concept' && coord && time('P585').year !== undefined) kind = 'event';
    else if (kind === 'concept' && coord) kind = 'place';
    const image = claim<string>(c, 'P18');
    return {
      id,
      label: e.labels?.en?.value ?? id,
      description: e.descriptions?.en?.value,
      aliases: (e.aliases?.en ?? []).map((a) => a.value).slice(0, 12),
      kind,
      start: start.year,
      end: end.year,
      approximate: start.approx || end.approx || undefined,
      lat: coord?.latitude,
      lon: coord?.longitude,
      image: image ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=480` : undefined,
      wikiTitle: e.sitelinks?.enwiki?.title,
    };
  },
};

/** A short, neutral summary from Wikipedia (CC BY-SA), with its source. */
export async function wikiSummary(title: string, signal?: AbortSignal): Promise<{ text: string; url: string } | undefined> {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal });
  if (!r.ok) return undefined;
  const j = (await r.json()) as { extract?: string; content_urls?: { desktop?: { page?: string } } };
  return j.extract ? { text: j.extract, url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` } : undefined;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Find an existing entity by name or alias (no network). */
export async function findLocal(name: string): Promise<Concept | undefined> {
  const n = norm(name);
  if (!n) return undefined;
  const all = await db.concepts.toArray();
  return all.find((c) => norm(c.name) === n) ?? all.find((c) => (c.aliases ?? []).some((a) => norm(a) === n));
}

/** Pick the best Wikidata candidate, preferring the expected kind. */
function pick(cands: EntityCandidate[], kind?: ConceptKind): EntityCandidate | undefined {
  if (!cands.length) return undefined;
  const hints: Partial<Record<ConceptKind, RegExp>> = {
    person: /(general|politician|emperor|king|queen|writer|historian|philosopher|statesman|commander|poet|consul|dictator|saint|pope|\d{3,4}|bc|ad)/i,
    place: /(city|town|region|river|mountain|island|country|province|ancient|settlement|capital|range)/i,
    event: /(battle|war|siege|treaty|revolt|revolution|crisis|campaign|assassination)/i,
    polity: /(state|empire|kingdom|republic|dynasty|civilization|confederation)/i,
  };
  const re = kind ? hints[kind] : undefined;
  const bad = /(disambiguation|given name|family name|surname|film|album|song|band|video game|television|tv series|novel by)/i;
  const ok = cands.filter((c) => !bad.test(c.description ?? ''));
  return (re && ok.find((c) => re.test(c.description ?? ''))) ?? ok[0] ?? cands[0];
}

export interface ResolveOptions { kind?: ConceptKind; source?: Source; online?: boolean; signal?: AbortSignal; wikidataId?: string }

/**
 * Resolve a name to a single entity, creating it only if it doesn't exist yet.
 * With a connection, identity is anchored to Wikidata so “Caesar”, “Julius
 * Caesar” and “Gaius Julius Caesar” all become the same record.
 */
export async function resolveEntity(name: string, opts: ResolveOptions = {}): Promise<Concept> {
  const clean = name.trim();
  const local = opts.wikidataId ? (await db.concepts.where('wikidataId').equals(opts.wikidataId).first()) ?? (await findLocal(clean)) : await findLocal(clean);
  if (local && (local.wikidataId || opts.online === false)) return local;
  let facts: EntityFacts | undefined;
  if (opts.online !== false && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    try {
      const id = opts.wikidataId ?? pick(await wikidata.search(clean, opts.signal), opts.kind ?? local?.kind)?.id;
      if (id) facts = await wikidata.facts(id, opts.signal);
    } catch { /* offline or provider down: keep a local entity */ }
  }
  if (facts) {
    const same = await db.concepts.where('wikidataId').equals(facts.id).first();
    const target = same ?? local;
    const kind = target?.kind && target.kind !== 'concept' ? target.kind : facts.kind !== 'concept' ? facts.kind : opts.kind ?? 'concept';
    const merged: Concept = {
      id: target?.id ?? uid(),
      name: target?.name ?? facts.label,
      kind,
      description: target?.description,
      parentId: target?.parentId,
      start: target?.start ?? facts.start,
      end: target?.end ?? facts.end,
      approximate: target?.approximate ?? facts.approximate,
      wikidataId: facts.id,
      aliases: [...new Set([...(target?.aliases ?? []), ...facts.aliases, ...(norm(clean) !== norm(target?.name ?? facts.label) ? [clean] : [])])],
      lat: target?.lat ?? facts.lat,
      lon: target?.lon ?? facts.lon,
      summary: target?.summary ?? facts.description,
      summarySource: target?.summarySource ?? 'Wikidata',
      imageUrl: target?.imageUrl ?? facts.image,
      source: target?.source ?? opts.source ?? 'user',
      createdAt: target?.createdAt ?? Date.now(),
    };
    // Two local records turned out to be the same entity: merge them.
    if (same && local && same.id !== local.id) await mergeConcepts(local.id, same.id);
    await db.concepts.put(merged);
    if (facts.wikiTitle && !target?.summary) {
      wikiSummary(facts.wikiTitle).then((s) => { if (s) db.concepts.update(merged.id, { summary: s.text, summarySource: s.url }); }).catch(() => {});
    }
    return merged;
  }
  if (local) return local;
  const c: Concept = { id: uid(), name: clean, kind: opts.kind ?? 'concept', source: opts.source ?? 'user', createdAt: Date.now() };
  await db.concepts.add(c);
  return c;
}

/** Point everything that referenced `fromId` at `intoId`, then remove the duplicate. */
export async function mergeConcepts(fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) return;
  await db.transaction('rw', db.concepts, db.links, db.notes, db.media, async () => {
    const from = await db.concepts.get(fromId);
    const into = await db.concepts.get(intoId);
    if (!from || !into) return;
    await db.links.filter((l) => (l.fromType === 'concept' && l.fromId === fromId) || (l.toType === 'concept' && l.toId === fromId)).modify((l) => {
      if (l.fromType === 'concept' && l.fromId === fromId) l.fromId = intoId;
      if (l.toType === 'concept' && l.toId === fromId) l.toId = intoId;
    });
    await db.notes.filter((n) => n.conceptIds.includes(fromId)).modify((n) => { n.conceptIds = [...new Set(n.conceptIds.map((c) => (c === fromId ? intoId : c)))]; });
    await db.media.filter((m) => m.conceptIds.includes(fromId)).modify((m) => { m.conceptIds = [...new Set(m.conceptIds.map((c) => (c === fromId ? intoId : c)))]; });
    await db.concepts.where('parentId').equals(fromId).modify({ parentId: intoId });
    await db.concepts.update(intoId, { aliases: [...new Set([...(into.aliases ?? []), from.name, ...(from.aliases ?? [])])] });
    await db.concepts.delete(fromId);
  });
}

/** Names worth recognising for an entity: its name plus aliases. */
export function entityNames(c: Pick<Concept, 'name' | 'aliases'>): string[] {
  return [c.name, ...(c.aliases ?? [])].filter((n) => n && n.length >= 3);
}

export function evidenceLabel(e: string): string {
  return ({ artifact: 'Surviving artifact', contemporary: 'Contemporary depiction', archaeological: 'Archaeological evidence', photograph: 'Historical photograph', reconstruction: 'Scholarly reconstruction', modern: 'Modern illustration', ai: 'AI-generated — not evidence', unclassified: 'Not yet classified' } as Record<string, string>)[e] ?? e;
}
