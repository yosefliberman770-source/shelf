// Deciding whether a lookup can be accepted without asking the reader.
// Follows the World Historical Gazetteer's documented auto-confirm rule
// (a candidate needs evidence in the spelling and no rival that ties it),
// then uses the book's context — the date and nearby places — to rule out
// candidates. It never picks a place just because it ranked first.
import { distanceKm } from './geometry';
import type { Confidence, PlaceCandidate, PlaceQuery } from './types';

export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Similarity of two names (0–1), from shared letter pairs. */
export function nameSimilarity(a: string, b: string): number {
  const pairs = (s: string) => { const n = norm(s).replace(/ /g, ''); const out: string[] = []; for (let i = 0; i < n.length - 1; i++) out.push(n.slice(i, i + 2)); return out; };
  const x = pairs(a);
  const y = pairs(b);
  if (!x.length || !y.length) return norm(a) === norm(b) ? 1 : 0;
  const pool = [...y];
  let hit = 0;
  for (const p of x) { const i = pool.indexOf(p); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (x.length + y.length);
}

const pointOf = (c: PlaceCandidate) => (c.place.latitude !== undefined && c.place.longitude !== undefined ? { lat: c.place.latitude, lon: c.place.longitude } : undefined);

/** Did the place exist (as far as its record says) around this year? A record without dates can't rule it out. */
function existedAt(c: PlaceCandidate, year: number, slack = 50): boolean {
  const s = c.place.historicalStartYear;
  const e = c.place.historicalEndYear;
  if (s !== undefined && year < s - slack) return false;
  if (e !== undefined && year > e + slack) return false;
  return true;
}

/** Same place from two sources (same name and description, or within a few km). */
function samePlace(a: PlaceCandidate, b: PlaceCandidate): boolean {
  if (norm(a.place.canonicalName) === norm(b.place.canonicalName) && (a.place.description ?? '') === (b.place.description ?? '')) return true;
  const pa = pointOf(a);
  const pb = pointOf(b);
  return !!pa && !!pb && distanceKm(pa, pb) < 15 && nameSimilarity(a.place.canonicalName, b.place.canonicalName) > 0.6;
}

/** An abbreviation ("Mass.", "MA", "N.Y.") is an alias for writing, not a name a book would use for a place. */
const isAbbreviation = (x: string) => /\.$/.test(x.trim()) || /^[A-Z]{1,3}$/.test(x.trim()) || /^([A-Z]\.){1,4}$/.test(x.trim());

/**
 * Evidence that a candidate carries the name as written: the same name or a
 * full alias (not an abbreviation), or — for WHG — a measured name-match
 * confidence at the level of a derived head-word (≥ 87). Prefix hits
 * ("Guild" → "Guilderland") and look-alike spellings are not evidence.
 */
export function hasSpellingEvidence(c: PlaceCandidate, name: string): boolean {
  if (nameMatches(c, name)) return true;
  if (c.nameConfidence !== undefined) return c.nameConfidence >= 87;
  return false;
}

export function nameMatches(c: PlaceCandidate, name: string): boolean {
  const n = norm(name);
  return [c.place.canonicalName, ...c.place.alternativeNames].some((x) => !isAbbreviation(x) && norm(x) === n);
}

export interface Assessment {
  status: Confidence;
  /** Index into the (filtered, reordered) candidate list of the accepted one. */
  chosen?: PlaceCandidate;
  /** Candidates left to show the reader, best first. */
  candidates: PlaceCandidate[];
  /** Why — for the "why this place?" line. */
  reason: string;
}

export function assessCandidates(all: PlaceCandidate[], q: PlaceQuery & { nearbyPoints?: { lat: number; lon: number }[]; prominence?: (c: PlaceCandidate) => number | undefined }): Assessment {
  // Only places with a location can be mapped; keep the rest only if nothing has one.
  const located = all.filter((c) => pointOf(c) || c.place.boundingBox);
  let cands = located.length ? located : all;
  // Merge the same place reported by several sources.
  cands = cands.filter((c, i) => !cands.slice(0, i).some((d) => samePlace(c, d)));
  if (!cands.length) return { status: 'UNRESOLVED', candidates: [], reason: 'No place by that name was found.' };

  const withEvidence = cands.filter((c) => hasSpellingEvidence(c, q.name));
  if (!withEvidence.length) return { status: 'UNRESOLVED', candidates: cands.slice(0, 6), reason: `No place is recorded with exactly the name “${q.name}” — only different or partly matching names, which aren’t evidence.` };
  // The period: places founded (or first recorded) well after the year can't be meant.
  let usable = withEvidence;
  if (q.date !== undefined) {
    const alive = withEvidence.filter((c) => existedAt(c, q.date!));
    if (!alive.length) return { status: 'UNRESOLVED', candidates: withEvidence.slice(0, 6), reason: `The places named “${q.name}” that were found are recorded only from after ${q.date < 0 ? `${-q.date} BCE` : `${q.date} CE`}.` };
    usable = alive;
  }
  // The book's geography: places already identified in the book (and nearby names in the passage).
  const ctx = [...(q.contextPoints ?? []), ...(q.nearbyPoints ?? [])];
  const far = (c: PlaceCandidate) => { const p = pointOf(c); return !!p && ctx.length > 0 && Math.min(...ctx.map((n) => distanceKm(p, n))) > 3000; };

  // Rivals: candidates the provider could not separate from the top one.
  const top = usable[0];
  const scored = top.score !== undefined;
  let rivals = usable.filter((c, i) => {
    if (i === 0) return true;
    if (scored) return (c.score ?? 0) >= (top.score ?? 0) - 1e-9 && !(top.exactName && !c.exactName);
    // Unscored providers: any other place that carries the same name is a rival.
    return nameMatches(c, q.name);
  });
  const reasons: string[] = [];

  if (q.date !== undefined && usable.length < withEvidence.length) reasons.push('matches the period you are reading about');
  // Context: the book's geography points to one region.
  if (rivals.length > 1 && ctx.length) {
    const near = (c: PlaceCandidate) => { const p = pointOf(c); return p ? Math.min(...ctx.map((n) => distanceKm(p, n))) : Infinity; };
    const sorted = [...rivals].sort((a, b) => near(a) - near(b));
    if (near(sorted[0]) < 1500 && near(sorted[1]) > 3 * near(sorted[0]) + 300) { rivals = [sorted[0]]; reasons.push('is near the other places in this book'); }
  }
  // Context 3 (unscored providers only): one candidate vastly better known than the rest.
  if (rivals.length > 1 && !scored && q.prominence) {
    const ranked = [...rivals].sort((a, b) => (q.prominence!(b) ?? 0) - (q.prominence!(a) ?? 0));
    const p0 = q.prominence(ranked[0]) ?? 0;
    const p1 = q.prominence(ranked[1]) ?? 0;
    if (p0 >= 60 && p0 >= 8 * Math.max(1, p1)) { rivals = [ranked[0]]; reasons.push('by far the best-known place of that name'); }
  }

  if (rivals.length > 1) {
    return { status: 'AMBIGUOUS', candidates: [...rivals, ...withEvidence.filter((c) => !rivals.includes(c))].slice(0, 8), reason: 'Several places share this name.' };
  }
  const chosen = rivals[0];
  // A lone candidate far from everything else in the book isn't accepted on its name alone.
  if (far(chosen)) return { status: 'LOW', chosen, candidates: [chosen, ...cands.filter((c) => c !== chosen).slice(0, 6)], reason: `The only place found with this name is far from the other places in this book, so it isn’t assumed to be the one meant.` };
  const exact = nameMatches(chosen, q.name) || (chosen.nameConfidence ?? 0) >= 90;
  const supported = reasons.length > 0 && !reasons.includes('by far the best-known place of that name');
  const status: Confidence = exact && supported ? 'HIGH' : exact ? 'MEDIUM' : 'LOW';
  const others = cands.filter((c) => c !== chosen).slice(0, 6);
  return { status, chosen, candidates: [chosen, ...others], reason: reasons.length ? `Chosen because it ${reasons.join(' and ')}.` : exact ? 'The only place found with this name.' : 'Closest name match.' };
}
