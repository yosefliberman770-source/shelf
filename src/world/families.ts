// Which records are independent witnesses (RM-07). A dataset id is not an evidence family: datasets built from the same
// upstream (Wikidata and Shelf's Wikidata extracts), versions and sister selections of one register, and records that
// carry exactly the same coordinates (one copied the other) are one witness, however many rows they make (A9-001,
// A9-004, A9-005, A10-016, X-01). "Confirmed" needs two independent families (PR-2).
import { km } from '../atlas/data';

/** Datasets that share an upstream source: the family they belong to. Any dataset not listed is its own family. */
const UPSTREAM: Record<string, string> = {
  wikidata: 'wikidata', wdextra: 'wikidata', wd: 'wikidata',
  // the Swedish geometric maps are one survey programme published in two selections
  swegeo: 'swedish-geometric-maps', swegeo2: 'swedish-geometric-maps',
  // the historical urban population series (Reba et al.) and Buringh's estimates are separate scholarship
  hurbpop: 'reba', buringh: 'buringh',
  // the Austrian Generalkarte gazetteer and the Russian 3-verst gazetteer are independent surveys; the Ottoman registers
  // are one administration's records
  ottomannfs: 'ottoman-registers', plovdiv: 'ottoman-registers', oetrtemettuat: 'ottoman-registers',
};

export const familyOf = (dataset: string) => UPSTREAM[dataset] ?? dataset;

/** Same coordinates to about 10 m: one record copied the other's position, so they are not two witnesses (A9-004). */
export const sameCoordinates = (a: { lon?: number; lat?: number }, b: { lon?: number; lat?: number }) =>
  a.lon !== undefined && b.lon !== undefined && a.lat !== undefined && b.lat !== undefined &&
  Math.abs(a.lon - b.lon) < 1e-4 && Math.abs(a.lat - b.lat) < 1e-4;

/** Two records are independent witnesses: different families, and not an exact coordinate copy. */
export function independent(a: { family: string; lon?: number; lat?: number }, b: { family: string; lon?: number; lat?: number }): boolean {
  return familyOf(a.family) !== familyOf(b.family) && !sameCoordinates(a, b);
}

/** Within this distance two independent records agree on the location; further apart they name the same place but place it differently. */
export const AGREE_KM = 2;

/** The independent families among records: copies and same-family records collapse into the first of them. */
export function witnesses<T extends { family: string; lon?: number; lat?: number }>(records: T[]): T[] {
  const out: T[] = [];
  for (const r of records) if (out.every((w) => independent(w, r))) out.push(r);
  return out;
}

/** Whether independent witnesses also agree on the location (within AGREE_KM of each other). */
export const agreeOnLocation = (ws: { lon?: number; lat?: number }[]) =>
  ws.every((a) => ws.every((b) => a.lon === undefined || b.lon === undefined || km([a.lon, a.lat!], [b.lon, b.lat!]) <= AGREE_KM));
