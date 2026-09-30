// Combining evidence for a place name, instead of taking whichever database
// answers first.
//
// Every record that could be the place — from the offline gazetteers
// (Pleiades, Viabundus, al-Ṯurayyā) and from the World Historical Gazetteer —
// becomes a *claim* with its source, location, names and dates. Claims at the
// same spot (within 25 km) are grouped into one candidate identification.
// Each group is weighed by how many *independent* sources support it (WHG's
// copy of Pleiades is not a second witness to Pleiades), how well the name
// matches, and whether its dates fit the year being read about. The result
// says, in plain words, who identifies the place as what, where sources agree
// or disagree, and how the date changes what is plausible.
//
// Missing data is never evidence: a source with no record says nothing about
// whether a place existed, and an undated record is "unknown", not "outside".
import { km } from '../atlas/data';
import { GAZETTEERS, gazetteerInfo, type GazetteerId, type GazPlace, placesByName, recordFit } from '../atlas/gazetteer';
import type { Disagreement } from '../atlas/resolve';
import { yearLabel } from '../atlas/time';
import { norm } from '../lib/history/assess';
import { contextFit, type GeoContext } from '../atlas/geocontext';
import { type WhgAttestation, type WhgLookup, whgLookup, whgNameMatch, type WhgOptions } from './whg';

export type DateFit = 'within' | 'possible' | 'unknown' | 'outside';
export type EvidenceStatus = 'identified' | 'ambiguous' | 'date-conflict' | 'no-evidence';
export type EvidenceConfidence = 'strong' | 'moderate' | 'weak' | 'none';

export interface Claim {
  /** Independent source family: the same underlying source reached twice counts once. */
  family: string;
  /** Shown to the reader, e.g. "Pleiades", "WHG · GeoNames". */
  source: string;
  kind: 'gazetteer' | 'whg';
  id: string;
  title: string;
  names: string[];
  lat?: number;
  lon?: number;
  /** Year spans (no year 0). Empty = the source gives no dates. */
  spans: [number, number][];
  /** The dates are a dataset-wide period, not this place's own. */
  periodOnly?: boolean;
  types: string[];
  url?: string;
  licence?: string;
  licenceUrl?: string;
  /** Source forbids redistribution: only the link is kept. */
  restricted?: boolean;
  nameMatch: 'exact' | 'variant' | 'none';
  dateFit: DateFit;
  weight: number;
  gaz?: GazPlace;
  whg?: WhgAttestation;
}

export interface EvidenceCluster {
  /** How well its location fits the places already identified in the book (1 = fits, lower = far away). */
  geoFit?: number;
  /** Supported only by present-day reference gazetteers with no dates — says nothing about the period read about. */
  modernOnly?: boolean;
  lat: number;
  lon: number;
  title: string;
  claims: Claim[];
  families: string[];
  score: number;
  dateFit: DateFit;
  /** Largest distance between two claims in the group (km). */
  spreadKm: number;
}

export interface PlaceEvidence {
  written: string;
  year?: number;
  status: EvidenceStatus;
  confidence: EvidenceConfidence;
  /** Best first. */
  clusters: EvidenceCluster[];
  /** Records with no location (can't be placed on a map, still reported). */
  unlocated: Claim[];
  statements: string[];
  disagreements: Disagreement[];
  consulted: { source: string; result: 'found' | 'none' | 'unavailable' | 'not-configured'; note?: string }[];
  whg?: { status: WhgLookup['status']; api: string; accessed: string; fromCache?: boolean; error?: string };
}

const SAME_KM = 25;
const SLACK = 25;

/** Which underlying source a WHG record comes from (so Pleiades via WHG isn't a second witness). */
export function whgFamily(a: WhgAttestation): string {
  const ns = (a.namespace ?? '').toLowerCase();
  if (ns === 'pl' || ns.startsWith('pleiades')) return 'pleiades';
  if (ns === 'tgn' || ns.startsWith('tgn')) return 'tgn';
  if (ns === 'gn') return 'geonames';
  if (ns === 'wd') return 'wikidata';
  return ns || `whg:${a.whgId}`;
}

/** Core reference gazetteers weigh less than specialist historical ones. */
const CORE = new Set(['geonames', 'wikidata', 'tgn', 'osm', 'ohm', 'un']);
const sourceWeight = (family: string, kind: Claim['kind']) => (kind === 'gazetteer' || family === 'pleiades' ? 1 : CORE.has(family) ? 0.5 : 0.75);
const NAME_FACTOR = { exact: 1, variant: 0.9, none: 0.5 } as const;
const DATE_FACTOR: Record<DateFit, number> = { within: 1, possible: 0.85, unknown: 0.6, outside: 0.15 };

function fit(spans: [number, number][], year: number | undefined, broad: boolean): DateFit {
  if (year === undefined || !spans.length) return 'unknown';
  if (!spans.some(([a, b]) => a - SLACK <= year && year <= b + SLACK)) return 'outside';
  return broad ? 'possible' : 'within';
}

export function claimFromGaz(p: GazPlace, written: string, year?: number): Claim {
  const info = gazetteerInfo(p.gazetteer);
  // Own dates, or — for a record without them — the period its evidence allows (counts only as "possible").
  const spans: [number, number][] = p.from !== undefined || p.to !== undefined ? [[p.from ?? -99999, p.to ?? 99999]]
    : p.envelope ? [[p.envelope.from ?? info.coverage[0], p.envelope.to ?? info.coverage[1]]] : [];
  const w = norm(written);
  const nameMatch = norm(p.title) === w ? 'exact' : p.names.some((n) => norm(n.name) === w) ? 'variant' : 'none';
  // Pleiades periods and dataset-wide periods are broad: they make a date "possible", not certain.
  const dateFit = fit(spans, year, p.gazetteer === 'pleiades' || !!p.envelope);
  return {
    family: p.gazetteer, source: info.name, kind: 'gazetteer', id: p.key, title: p.title, names: p.names.map((n) => n.name),
    lat: p.lat, lon: p.lon, spans, periodOnly: !!p.envelope, types: p.types, url: p.url, licence: info.license, nameMatch, dateFit,
    weight: sourceWeight(p.gazetteer, 'gazetteer') * NAME_FACTOR[nameMatch] * DATE_FACTOR[dateFit] * (p.uncertain >= 1 ? 0.8 : 1), gaz: p,
  };
}

export function claimFromWhg(a: WhgAttestation, written: string, year?: number): Claim {
  const family = whgFamily(a);
  const nameMatch = a.restricted ? (norm(a.title) === norm(written) ? 'exact' : 'none') : whgNameMatch(a, written);
  const dateFit = fit(a.timespans, year, false);
  return {
    family, source: `WHG · ${a.source}`, kind: 'whg', id: a.whgId, title: a.title, names: a.names, lat: a.point?.[1], lon: a.point?.[0],
    spans: a.timespans, types: a.types, url: a.links.whg ?? a.links.original, licence: a.licence?.spdx ?? a.licence?.label, licenceUrl: a.licence?.url,
    restricted: a.restricted, nameMatch, dateFit, weight: sourceWeight(family, 'whg') * NAME_FACTOR[nameMatch] * DATE_FACTOR[dateFit], whg: a,
  };
}

const bestFit = (fits: DateFit[]): DateFit => (['within', 'possible', 'unknown', 'outside'] as DateFit[]).find((f) => fits.includes(f)) ?? 'unknown';
const spanText = (s: [number, number][]) => s.length ? s.slice(0, 3).map(([a, b]) => `${a <= -99999 ? '?' : yearLabel(a)}–${b >= 99999 ? '?' : yearLabel(b)}`).join(', ') + (s.length > 3 ? '…' : '') : 'no dates';
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function cluster(claims: Claim[]): EvidenceCluster[] {
  const groups: Claim[][] = [];
  for (const c of [...claims].sort((a, b) => b.weight - a.weight)) {
    const g = groups.find((x) => km([x[0].lon!, x[0].lat!], [c.lon!, c.lat!]) <= SAME_KM);
    if (g) g.push(c); else groups.push([c]);
  }
  return groups.map((cs) => {
    // Score: the strongest claim from each independent source, added up.
    const byFamily = new Map<string, number>();
    for (const c of cs) byFamily.set(c.family, Math.max(byFamily.get(c.family) ?? 0, c.weight));
    let spread = 0;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) spread = Math.max(spread, km([cs[i].lon!, cs[i].lat!], [cs[j].lon!, cs[j].lat!]));
    const lead = cs.find((c) => c.kind === 'gazetteer') ?? cs[0];
    return { lat: lead.lat!, lon: lead.lon!, title: lead.title, claims: cs, families: [...byFamily.keys()], score: [...byFamily.values()].reduce((a, b) => a + b, 0), dateFit: bestFit(cs.map((c) => c.dateFit)), spreadKm: spread };
  }).sort((a, b) => b.score - a.score);
}

export function combineEvidence(input: { written: string; year?: number; local: GazPlace[]; localSources: GazetteerId[]; whg?: WhgLookup; context?: GeoContext }): PlaceEvidence {
  const { written, year } = input;
  const claims: Claim[] = [
    ...input.local.map((p) => claimFromGaz(p, written, year)),
    ...(input.whg?.status === 'ok' ? input.whg.attestations.map((a) => claimFromWhg(a, written, year)) : []),
  ];
  const located = claims.filter((c) => c.lat !== undefined && c.lon !== undefined && !c.restricted);
  const unlocated = claims.filter((c) => !(c.lat !== undefined && c.lon !== undefined) || c.restricted);
  const clusters = cluster(located);
  // Priors: the book's own geography, and whether anything but present-day reference data supports a candidate.
  for (const c of clusters) {
    c.geoFit = contextFit(input.context, [c.lon, c.lat]);
    c.modernOnly = year !== undefined && year < 1800 && c.claims.every((x) => x.kind === 'whg' && CORE.has(x.family) && !x.spans.length);
    c.score *= c.geoFit * (c.modernOnly ? 0.5 : 1);
  }
  clusters.sort((a, b) => b.score - a.score);

  // ── Decide, from the evidence as a whole ──
  const viable = year === undefined ? clusters : clusters.filter((c) => c.dateFit !== 'outside');
  let status: EvidenceStatus;
  let confidence: EvidenceConfidence = 'none';
  if (!clusters.length) status = 'no-evidence';
  else if (!viable.length) status = 'date-conflict';
  else if (viable.length > 1 && viable[1].score >= viable[0].score * 0.6) status = 'ambiguous';
  else status = 'identified';
  if (status === 'identified') {
    const top = viable[0];
    const named = top.claims.some((c) => c.nameMatch !== 'none');
    const indep = top.families.length;
    const dated = top.dateFit === 'within' || top.dateFit === 'possible';
    confidence = indep >= 2 && named && (dated || year === undefined) && (top.geoFit ?? 1) === 1 && !top.modernOnly ? 'strong'
      : ((indep >= 2 && named) || (named && top.claims.some((c) => c.kind === 'gazetteer') && (dated || year === undefined))) && (top.geoFit ?? 1) === 1 ? 'moderate' : 'weak';
  } else if (status === 'ambiguous') confidence = 'weak';

  // ── Say it plainly ──
  const statements: string[] = [];
  const disagreements: Disagreement[] = [];
  const top = viable[0] ?? clusters[0];
  const where = (c: { lat?: number; lon?: number }) => `${c.lat!.toFixed(2)}, ${c.lon!.toFixed(2)}`;
  if (top) {
    for (const c of top.claims.filter((x) => x.kind === 'gazetteer')) {
      statements.push(`${c.source} identifies “${written}” as ${c.title}${c.nameMatch === 'variant' ? ' (a name it records for the place)' : ''}, at ${where(c)}; dates: ${c.periodOnly ? `${spanText(c.spans)} (the dataset’s period)` : spanText(c.spans)}.`);
    }
    const w = top.claims.filter((x) => x.kind === 'whg');
    if (w.length) {
      const bySource = [...new Map(w.map((c) => [c.source.replace(/^WHG · /, ''), c])).values()];
      const dated = w.filter((c) => c.spans.length);
      statements.push(`World Historical Gazetteer has ${w.length} attestation${w.length === 1 ? '' : 's'} at the same place, from ${list(bySource.map((c) => c.source.replace(/^WHG · /, '')))}${dated.length ? `; dated ${list(dated.slice(0, 3).map((c) => `${spanText(c.spans)} (${c.source.replace(/^WHG · /, '')})`))}` : '; none of them carries dates'}.`);
      const names = [...new Set(w.flatMap((c) => c.names))].filter((n) => norm(n) !== norm(written)).slice(0, 8);
      if (names.length) statements.push(`Names recorded for it there: ${names.join(', ')}.`);
    }
    if (w.some((c) => c.family === 'pleiades') && top.claims.some((c) => c.family === 'pleiades' && c.kind === 'gazetteer')) statements.push('WHG’s Pleiades record is the same source as Shelf’s Pleiades data, so it is not counted as separate confirmation.');
    statements.push(top.families.length >= 2 ? `${top.families.length} independent sources agree on this location.` : 'Only one source supports this identification.');
    if (input.context?.points.length) statements.push((top.geoFit ?? 1) === 1 ? 'It lies near the other places already identified in this book.' : 'It lies far from the other places already identified in this book, so it needs other evidence.');
    if (top.modernOnly) statements.push(`Only present-day reference gazetteers record it, with no dates — that says nothing about ${yearLabel(year!)}.`);
    if (top.spreadKm >= 2) {
      statements.push(`The sources place it up to ${top.spreadKm.toFixed(1)} km apart — often different points (centre, site, parish) of the same place.`);
      // Show the two records furthest apart, side by side (only when the gap is more than a few km).
      let pair: [Claim, Claim] | undefined;
      let far = 0;
      for (let i = 0; i < top.claims.length; i++) for (let j = i + 1; j < top.claims.length; j++) {
        const d = km([top.claims[i].lon!, top.claims[i].lat!], [top.claims[j].lon!, top.claims[j].lat!]);
        if (d > far) { far = d; pair = [top.claims[i], top.claims[j]]; }
      }
      if (pair && far >= 5) disagreements.push({ field: 'location', claims: [{ source: pair[0].source, value: where(pair[0]) }, { source: pair[1].source, value: where(pair[1]) }], note: `${far.toFixed(1)} km apart.` });
    }
    // Dates that don't overlap between sources for the same place.
    const datedTop = top.claims.filter((c) => c.spans.length && !c.periodOnly);
    for (let i = 0; i < datedTop.length; i++) for (let j = i + 1; j < datedTop.length; j++) {
      const A = datedTop[i];
      const B = datedTop[j];
      if (A.family === B.family) continue;
      const overlap = A.spans.some(([a0, a1]) => B.spans.some(([b0, b1]) => a0 <= b1 && b0 <= a1));
      if (!overlap && disagreements.filter((d) => d.field === 'date').length < 3) {
        disagreements.push({ field: 'date', claims: [{ source: A.source, value: spanText(A.spans) }, { source: B.source, value: spanText(B.spans) }], note: 'The sources date this place differently — they may record different phases or kinds of evidence.' });
      }
    }
    if (disagreements.some((d) => d.field === 'date')) statements.push('Sources disagree about its dates (shown side by side below).');
  }
  // Other identifications.
  for (const c of clusters.filter((x) => x !== top).slice(0, 4)) {
    const d = top ? Math.round(km([top.lon, top.lat], [c.lon, c.lat])) : 0;
    const srcs = list([...new Set(c.claims.map((x) => x.source))].slice(0, 3));
    statements.push(`${srcs} ${c.claims.length === 1 ? 'gives' : 'give'} a different identification: ${c.title}${top ? `, ${d} km away` : ''}${c.claims[0].whg?.ccodes.length ? ` (${c.claims[0].whg.ccodes.join(', ')})` : ''}; dates: ${spanText(c.claims.flatMap((x) => x.spans).slice(0, 3))}.`);
    if (top && d > SAME_KM && d < 300) disagreements.push({ field: 'location', claims: [{ source: top.claims[0].source, value: `${top.title} (${where(top)})` }, { source: c.claims[0].source, value: `${c.title} (${where(c)})` }], note: `Two identifications ${d} km apart.` });
  }
  // How the date matters.
  if (year !== undefined && clusters.length) {
    const fits = clusters.filter((c) => c.dateFit === 'within' || c.dateFit === 'possible');
    const outs = clusters.filter((c) => c.dateFit === 'outside');
    const unknown = clusters.filter((c) => c.dateFit === 'unknown');
    if (outs.length && fits.length) statements.push(`For ${yearLabel(year)}, ${list(fits.slice(0, 2).map((c) => c.title))} ${fits.length === 1 ? 'fits' : 'fit'} the date; ${list(outs.slice(0, 2).map((c) => `${c.title} (${spanText(c.claims.flatMap((x) => x.spans))})`))} ${outs.length === 1 ? 'is' : 'are'} attested only at other times.`);
    else if (outs.length && !fits.length && !unknown.length) statements.push(`None of the records is dated around ${yearLabel(year)}. That may mean the book refers to another place, or that the sources simply don’t record it then.`);
    if (unknown.length) statements.push(`${unknown.length === clusters.length ? 'None' : `${unknown.length} of the ${clusters.length}`} of the candidate places ${unknown.length === 1 && unknown.length !== clusters.length ? 'has' : 'have'} dated records, so the date can’t rule ${unknown.length === 1 ? 'it' : 'them'} in or out.`);
  }
  if (status === 'ambiguous') statements.push(`The evidence doesn’t settle which place “${written}” means — ${viable.length} candidates remain.`);
  if (status === 'identified') statements.push(confidence === 'strong' ? 'Confidence: strong — independent sources agree and the dates fit.' : confidence === 'moderate' ? 'Confidence: moderate — supported, but by limited or partly undated evidence.' : 'Confidence: weak — thin or indirect evidence.');

  // What was consulted, and what silence means.
  const consulted: PlaceEvidence['consulted'] = input.localSources.map((id) => ({ source: gazetteerInfo(id).name, result: input.local.some((p) => p.gazetteer === id) ? 'found' as const : 'none' as const }));
  if (input.whg) consulted.push({ source: 'World Historical Gazetteer', result: input.whg.status === 'ok' ? (input.whg.attestations.length ? 'found' : 'none') : input.whg.status, note: input.whg.error });
  const silent = consulted.filter((c) => c.result === 'none').map((c) => c.source);
  if (silent.length) statements.push(`No record for this name in ${list(silent)}. A missing record means the dataset doesn’t include it — not that the place didn’t exist.`);
  if (input.whg && input.whg.status !== 'ok') statements.push(input.whg.status === 'not-configured' ? 'World Historical Gazetteer wasn’t consulted (no Shelf server with a WHG token).' : `World Historical Gazetteer couldn’t be consulted${input.whg.error ? ` (${input.whg.error.replace(/\.$/, '')})` : ''}; this rests on the offline gazetteers only.`);
  const restricted = claims.filter((c) => c.restricted);
  if (restricted.length) statements.push(`${restricted.length} WHG record${restricted.length === 1 ? '' : 's'} come${restricted.length === 1 ? 's' : ''} from ${list([...new Set(restricted.map((c) => c.source.replace(/^WHG · /, '')))])}, whose terms don’t allow the data to be passed on — only a link to the source is kept.`);
  if (!clusters.length && !restricted.length && unlocated.length) statements.push(`${unlocated.length} record${unlocated.length === 1 ? '' : 's'} with this name ${unlocated.length === 1 ? 'has' : 'have'} no location, so ${unlocated.length === 1 ? 'it' : 'they'} can’t be placed on the map.`);

  return {
    written, year, status, confidence, clusters, unlocated, statements, disagreements, consulted,
    whg: input.whg ? { status: input.whg.status, api: input.whg.api, accessed: input.whg.accessed, fromCache: input.whg.fromCache, error: input.whg.error } : undefined,
  };
}

/**
 * Gather and weigh the evidence for a name as written: every offline gazetteer
 * record carrying the name (for the period) plus, when online, what the World
 * Historical Gazetteer holds. Works offline (WHG is then simply not consulted).
 */
export async function assessPlace(written: string, opts: { year?: number; online?: boolean; local?: GazPlace[]; context?: GeoContext } & WhgOptions = {}): Promise<PlaceEvidence> {
  const localSources = GAZETTEERS.map((g) => g.id);
  // Every gazetteer is consulted; only records attested exclusively after the year are left out.
  const local = opts.local ?? (await placesByName(written).catch(() => [])).map((h) => h.place).filter((p) => recordFit(p, opts.year) !== 'later');
  const whg = opts.online === false ? undefined : await whgLookup(written, opts).catch((e) => { if ((e as Error).name === 'AbortError') throw e; return undefined; });
  return combineEvidence({ written, year: opts.year, local, localSources, whg, context: opts.context });
}
