// "What changed?" between two dates at one place — each change taken from a
// dataset and worded as the data allows: a settlement "first recorded" or
// "no longer recorded" (the datasets record evidence, not foundations or
// abandonments), a polity boundary that differs between reconstructions, a
// name recorded for one date and not the other.
import { type AtlasEvent, eventsNear, type Polity, politiesAt, polityDisplayName } from '../atlas/context';
import type { Pos } from '../atlas/data';
import { existedAround, type GazPlace, gazetteerInfo, namesAround, nearbyPlaces } from '../atlas/gazetteer';
import { normName } from '../atlas/gazetteer';
import { polityIndex, polityLabelAt } from '../atlas/mention';
import { km } from '../atlas/data';
import { type HistYear, yearLabel } from '../atlas/time';
import { AROUND_KINDS } from '../atlas/context';
import { histogisWhereWas, type HistogisUnit } from './live';

export interface Change { kind: 'political' | 'administrative' | 'settlement' | 'name' | 'event'; text: string; source: string }
export interface WhatChanged { a: HistYear; b: HistYear; changes: Change[]; unchanged: string[]; notes: string[] }

const names = (ps: Polity[]) => ps.map(polityDisplayName);

/**
 * Every polity that differs between the two dates is the same state as one on the other side: the same Wikidata
 * item (an id not shared with an unrelated polity), or one's name recorded as the other's alias.
 */
async function sameUnderOtherName(pa: Polity[], pb: Polity[]): Promise<boolean> {
  const a = pa.filter((x) => !pb.some((y) => y.n === x.n));
  const b = pb.filter((x) => !pa.some((y) => y.n === x.n));
  if (!a.length || a.length !== b.length) return false;
  const idx = await polityIndex();
  const row = (p: Polity) => idx.find((r) => r.n === p.n && (r.q ?? '') === (p.q ?? ''));
  const same = (x: Polity, y: Polity) => {
    const rx = row(x);
    const ry = row(y);
    if (x.q && x.q === y.q && !rx?.qx && !ry?.qx) return true;
    const names = (r: typeof rx, p: Polity) => [p.n, ...(r?.al ?? [])].map((n) => normName(n.replace(/^\(|\)$/g, '')));
    if (names(rx, x).includes(normName(y.n.replace(/^\(|\)$/g, ''))) || names(ry, y).includes(normName(x.n.replace(/^\(|\)$/g, '')))) return true;
    // One name ends the year before the other begins, labelled in the same place: the reconstruction switches the name
    // it uses ("Eastern Roman Empire" to 632, "Byzantine Empire" from 633, with nearly the same outline).
    if (!rx || !ry || rx.t + 1 !== ry.f) return false;
    const [ax, bx] = [polityLabelAt(rx, rx.t), polityLabelAt(ry, ry.f)];
    return !!ax && !!bx && km(ax, bx) < 300;
  };
  return a.every((x) => b.some((y) => same(x, y)));
}

export async function whatChanged(at: Pos, a: HistYear, b: HistYear, radiusKm = 40): Promise<WhatChanged> {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const changes: Change[] = [];
  const unchanged: string[] = [];
  const notes: string[] = ['Settlements are compared by the dates their datasets record — “first recorded” and “no longer recorded” describe the evidence, not founding or abandonment.'];

  // Political: Cliopatria at both dates.
  const [pa, pb] = await Promise.all([politiesAt(at, lo).catch(() => []), politiesAt(at, hi).catch(() => [])]);
  const na = names(pa);
  const nb = names(pb);
  const renamed = await sameUnderOtherName(pa, pb).catch(() => false);
  if (na.join('|') === nb.join('|')) unchanged.push(na.length ? `Political entity: ${na.join(' / ')} at both dates (Cliopatria).` : 'No polity recorded here at either date (Cliopatria).');
  // "Eastern Roman Empire" (630) → "Byzantine Empire" (650) is one state under two conventional names, not a change of rule (A12-030).
  else if (renamed) unchanged.push(`Political entity: ${na.join(' / ')} (${yearLabel(lo)}) and ${nb.join(' / ')} (${yearLabel(hi)}) are the same state under the name each period’s reconstruction uses — a change of name convention in Cliopatria, not a change of rule.`);
  else changes.push({ kind: 'political', text: `${na.length ? na.join(' / ') : 'No polity recorded'} (${yearLabel(lo)}) → ${nb.length ? nb.join(' / ') : 'no polity recorded'} (${yearLabel(hi)})`, source: 'Cliopatria' });

  // Administrative: HistoGIS where it covers both dates.
  if (lo >= 1815 && hi <= 1920) {
    const [ha, hb] = await Promise.all([histogisWhereWas(at[1], at[0], lo).catch(() => [] as HistogisUnit[]), histogisWhereWas(at[1], at[0], hi).catch(() => [] as HistogisUnit[])]);
    const la = ha.map((u) => u.altName ?? u.name);
    const lb = hb.map((u) => u.altName ?? u.name);
    if (la.join('|') !== lb.join('|')) changes.push({ kind: 'administrative', text: `${la.join(', ') || '—'} → ${lb.join(', ') || '—'}`, source: `HistoGIS (${[...new Set([...ha, ...hb].map((u) => u.source))].join('; ')})` });
    else if (la.length) unchanged.push(`Administrative units unchanged: ${la.join(', ')} (HistoGIS).`);
  }

  // Settlements recorded around each date (dated records only).
  // Settlements only (not monuments or finds), and only dated records.
  const settle = AROUND_KINDS[0].types;
  const near = await nearbyPlaces(at, radiusKm, { filter: (p) => (p.from !== undefined || p.to !== undefined) && !p.datasetPeriod && p.title !== 'Untitled' && p.types.some((t) => settle.includes(t)) }).catch(() => [] as { place: GazPlace; km: number }[]);
  const inA = near.filter((n) => existedAround(n.place, lo));
  const inB = near.filter((n) => existedAround(n.place, hi));
  const onlyB = inB.filter((n) => !inA.includes(n)).slice(0, 8);
  const onlyA = inA.filter((n) => !inB.includes(n)).slice(0, 8);
  const src = (xs: { place: GazPlace }[]) => [...new Set(xs.map((x) => gazetteerInfo(x.place.gazetteer).name))].join(', ');
  if (onlyB.length) changes.push({ kind: 'settlement', text: `First recorded between the dates (within ${radiusKm} km): ${onlyB.map((n) => n.place.title).join(', ')}`, source: src(onlyB) });
  if (onlyA.length) changes.push({ kind: 'settlement', text: `Recorded in ${yearLabel(lo)} but no longer by ${yearLabel(hi)}: ${onlyA.map((n) => n.place.title).join(', ')}`, source: src(onlyA) });

  // Names recorded for one date and not the other.
  for (const n of inA.filter((x) => inB.includes(x)).slice(0, 30)) {
    const at1 = namesAround(n.place, lo).filter((x) => x.from !== undefined || x.to !== undefined).map((x) => x.name);
    const at2 = namesAround(n.place, hi).filter((x) => x.from !== undefined || x.to !== undefined).map((x) => x.name);
    const gained = at2.filter((x) => !at1.includes(x));
    const lost = at1.filter((x) => !at2.includes(x));
    if (gained.length || lost.length) changes.push({ kind: 'name', text: `${n.place.title}: ${lost.length ? `recorded as ${lost.slice(0, 3).join(', ')} in ${yearLabel(lo)}` : ''}${lost.length && gained.length ? '; ' : ''}${gained.length ? `as ${gained.slice(0, 3).join(', ')} by ${yearLabel(hi)}` : ''}`, source: gazetteerInfo(n.place.gazetteer).name });
    if (changes.filter((c) => c.kind === 'name').length >= 5) break;
  }

  // Events in between.
  const ev = (await eventsNear(at, 300).catch(() => [] as (AtlasEvent & { km: number })[])).filter((e) => e.y >= lo && e.y <= hi).sort((x, y) => x.y - y.y);
  if (ev.length) changes.push({ kind: 'event', text: `${ev.length} recorded event${ev.length === 1 ? '' : 's'} within 190 miles in between: ${ev.slice(0, 6).map((e) => `${e.n} (${yearLabel(e.y)})`).join('; ')}${ev.length > 6 ? '…' : ''}`, source: 'Wikidata' });

  notes.push('Roads and routes are drawn as map tiles — switch between the two dates on the map to see them change.');
  return { a: lo, b: hi, changes, unchanged, notes };
}
