// The entity layer: one historical place through time, assembled from source records by stored claims.
//
// Built by scripts/atlas-build/entities.py into public/world/entities (and, with the private data pack, a full build
// into the pack that replaces the public one on that device). Three levels stay apart:
//   • the source record, as its dataset published it (gazetteer.ts) — never edited
//   • the entity: records from *different* datasets joined by claims, each claim with its evidence and status
//   • the label for a year, chosen here from the entity's dated name forms (labelAt)
// Nothing is merged silently: claims that were not applied (ambiguous, refused) are kept and shown too.
import { getJSON } from './data';
import { gazetteerInfo, crc32, type GazetteerId } from './gazetteer';
import { isLatinScript } from './names';
import { loadPrivateData, privateJSON } from './privateData';
import type { HistYear } from './time';

/** Where a name form's dates come from. */
export type NameBasis = 'name' | 'record' | 'period' | '';
/** [name, from, to, lang, basis, indexes into the entity's members] */
export type NameForm = [string, number | null, number | null, string | null, NameBasis, number[]];
export type ClaimStatus = 'joined' | 'ambiguous' | 'refused';
export interface ClaimEvidence { wikidata?: string; names?: string[]; km?: number; limit?: number; kinds?: string[]; why?: string }
/** [record a, record b, basis, status, evidence] */
export type Claim = [string, string, 'id' | 'name', ClaimStatus, ClaimEvidence];
export interface Entity { id: string; m: string[]; n: NameForm[]; c: Claim[] }

export type LabelRule = 'dated-name' | 'dated-record' | 'evidence-period' | 'most-sources';
export interface EntityLabel { name: string; rule: LabelRule; form: NameForm; sources: string[] }

const ENTITY_SHARDS = 64;
/** Years either side of a name's own dates in which it still counts as current (as namesAround()). */
const SLACK = 50;
const BASIS_RANK: Record<NameBasis, number> = { name: 3, record: 2, period: 1, '': 0 };

const base = () => `${import.meta.env.BASE_URL}world/entities/`;

/** Entity files: the private pack's full build when this device has one, else the public build. */
async function entityFile<T>(rel: string): Promise<T | null> {
  const header = await loadPrivateData();
  if (header && Object.keys(header.files).some((f) => f.startsWith('entities/'))) return privateJSON<T>(`entities/${rel}`).catch(() => null);
  return getJSON<T>(`${base()}${rel}`).catch(() => null);
}

/** The entity a record belongs to, or undefined when no claim touches it (it is a place of its own). */
export async function entityOf(key: string): Promise<Entity | undefined> {
  const i = key.indexOf(':');
  const [src, id] = [key.slice(0, i), key.slice(i + 1)];
  const map = await entityFile<Record<string, string>>(`r/${src}-${crc32(id) % 16}.json`);
  const eid = map?.[id];
  if (!eid) return undefined;
  const bodies = await entityFile<Record<string, Omit<Entity, 'id'>>>(`e/${crc32(eid) % ENTITY_SHARDS}.json`);
  const body = bodies?.[eid];
  return body ? { id: eid, ...body } : undefined;
}

/** For folding identical name forms (as form_norm() in entities.py). */
const formNorm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const datasetOf = (key: string) => key.slice(0, key.indexOf(':'));

/**
 * Whether a name form is current at a year. A name given only a start year is one attestation (a register entry, a
 * first mention), current only near that year; a record's title with only a start runs on (the place persists).
 */
export function covers(f: NameForm, year: HistYear): boolean {
  let [, a, b] = f;
  if (a === null && b === null) return false;
  if (b === null && f[4] === 'name') b = a;
  return (a ?? -99999) - SLACK <= year && year <= (b ?? 99999) + SLACK;
}

const isTitle = (f: NameForm) => (f[4] === 'record' || f[4] === 'period' || f[4] === '') && !f[0].includes('/');

/**
 * The name to show for an entity in a year, and why. Must match label_at() in scripts/atlas-build/entities.py.
 * 1. Name forms current at the year (their dates, ±50 years), ranked: a name dated in its own right before a record's
 *    title dated by its record, before one dated only by an evidence period (many records are titled with today's
 *    name, so a title's dates are not the name's); then the number of datasets giving the form at that year; then a
 *    record's own main title; then Latin script; then the longer-lived form.
 * 2. With none current (or no year): the form most datasets give (Latin script first).
 */
export function labelAt(e: Entity, year?: HistYear): EntityLabel {
  const sourcesOf = (f: NameForm) => f[5].map((i) => e.m[i]);
  const tally = (forms: NameForm[]) => {
    const t = new Map<string, Set<string>>();
    for (const f of forms) { const k = formNorm(f[0]); const s = t.get(k) ?? new Set(); for (const i of f[5]) s.add(datasetOf(e.m[i])); t.set(k, s); }
    return (f: NameForm) => t.get(formNorm(f[0]))?.size ?? 0;
  };
  const cur = year === undefined ? [] : e.n.filter((f) => covers(f, year));
  if (cur.length) {
    const n = tally(cur);
    const span = (f: NameForm) => (f[2] ?? 2100) - (f[1] ?? -3000);
    const key = (f: NameForm): (number | string)[] => [-BASIS_RANK[f[4]], -n(f), isTitle(f) ? 0 : 1, isLatinScript(f[0]) ? 0 : 1, -span(f), formNorm(f[0])];
    const best = cur.reduce((a, b) => (compareKeys(key(b), key(a)) < 0 ? b : a));
    const rule: LabelRule = best[4] === 'name' ? 'dated-name' : best[4] === 'record' ? 'dated-record' : 'evidence-period';
    return { name: best[0], rule, form: best, sources: sourcesOf(best) };
  }
  const n = tally(e.n);
  const key = (f: NameForm): (number | string)[] => [-n(f), isLatinScript(f[0]) ? 0 : 1, -BASIS_RANK[f[4]], formNorm(f[0])];
  const best = e.n.reduce((a, b) => (compareKeys(key(b), key(a)) < 0 ? b : a));
  return { name: best[0], rule: 'most-sources', form: best, sources: sourcesOf(best) };
}

function compareKeys(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = typeof a[i] === 'number' ? (a[i] as number) - (b[i] as number) : cmp(a[i] as string, b[i] as string);
    if (d) return d;
  }
  return 0;
}

/** Name forms current at a year (all of them, ordered as labelAt ranks them is not needed for display: by date). */
export const formsAt = (e: Entity, year: HistYear) => e.n.filter((f) => covers(f, year));

export const LABEL_RULE: Record<LabelRule, string> = {
  'dated-name': 'a name the sources date to this time',
  'dated-record': 'the title of a record dated to this time',
  'evidence-period': 'the title of a record whose evidence period includes this time',
  'most-sources': 'no name is dated to this time; the form most datasets give',
};
export const BASIS_LABEL: Record<NameBasis, string> = {
  name: 'dated name', record: 'record’s title, dated by the record', period: 'record’s title, dated by its evidence period', '': 'undated',
};
export const CLAIM_LABEL: Record<ClaimStatus, string> = { joined: 'joined', ambiguous: 'not joined — ambiguous', refused: 'not joined — refused' };

/** One line of evidence for a claim, in words. */
export function claimText(c: Claim): string {
  const [, , basis, , ev] = c;
  const what = basis === 'id' ? `same Wikidata item ${ev.wikidata}` : `shared name ${(ev.names ?? []).map((x) => `“${x}”`).join(', ')} within ${ev.km} km (limit ${ev.limit} km for ${(ev.kinds ?? []).join(' / ')})`;
  return ev.why ? `${what} — ${ev.why}` : what;
}

/** A record key's dataset name, for display. */
export const datasetName = (key: string) => { try { return gazetteerInfo(datasetOf(key) as GazetteerId).name; } catch { return datasetOf(key); } };
