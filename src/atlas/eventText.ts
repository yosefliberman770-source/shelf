// How an event's record is worded on the map popup and the event card (Stage 4 part 7): precision, sides,
// duplicates, the other source's record and contradictions in the data, each said as the data has it.
export type Props = Record<string, unknown>;
const pstr = (p: Props, k: string) => (p[k] === undefined || p[k] === null || p[k] === '' ? undefined : String(p[k]));
const pnum = (p: Props, k: string) => (p[k] === undefined || p[k] === null || p[k] === '' ? undefined : Number(p[k]));
/** How precisely the source dates the event (TM-6, PA-005): Wikidata's own precision, said every time. */
export const eventPrecision = (yp?: string) => (yp ? `Date known only to the ${yp}` : 'Date known to the year (the source gives no finer precision here)');
/** Winner and loser as HCED records them; before 1600 they are often present-day countries, said as such (A8-037). */
export function sides(p: Props): string[] {
  const win = pstr(p, 'win');
  if (!win) return [];
  const early = (pnum(p, 'y') ?? 0) < 1600;
  return [`Winner: ${win}${pstr(p, 'los') ? ` · loser: ${pstr(p, 'los')}` : ''} (as HCED names them${early ? ' — often by present-day country, not the polity of the time' : ''})`];
}
/** What else is recorded about the event: its duplicate items, HCED's record of it and where HCED puts it. */
export function eventNotes(p: Props): string[] {
  const out: string[] = [];
  const dq = pstr(p, 'dq');
  if (dq) out.push(`Also recorded in Wikidata as ${dq.replace(/[[\]"]/g, '').split(',').join(', ')} — the same event, drawn once${pnum(p, 'dd') ? ` (that item places it ${pnum(p, 'dd')} km away)` : ''}`);
  if (pstr(p, 'h')) out.push(`Also in the Historical Conflict Event Dataset${pnum(p, 'hd') ? `, which places it ${pnum(p, 'hd')} km from here — the two sources disagree on where it was` : ''}`);
  out.push(...sides(p));
  return out;
}
/** Contradictions the data itself shows (A8-012, A8-006). */
export function eventCaution(p: Props): string | undefined {
  const notes: string[] = [];
  if (pnum(p, 'u')) notes.push('The date is only known approximately.');
  const wo = pstr(p, 'wo');
  if (wo === 'sign') notes.push('Its year falls outside its war’s years, but inside them with the era reversed — one of the dates probably has BCE/CE the wrong way round.');
  else if (wo) notes.push('Its year falls outside the years Wikidata gives its war — one of the two dates is wrong.');
  if (pnum(p, 'nl')) notes.push('Wikidata’s label for it doesn’t read as an event’s name; it may have been vandalised.');
  return notes.length ? notes.join(' ') : undefined;
}
