// One date grammar (TM-1): the build (scripts/atlas-build/dates.py), the map archive and cards (parseDate) and the
// year box (parseHistoricalDate) give the same answer for every case in date-battery.json.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHistoricalDate } from '../lib/history/dates';
import { type HistDate, parseDate } from './histdate';

const ROOT = join(__dirname, '..', '..');
type Case = [string, number | null, number | null, string];
const { cases } = JSON.parse(readFileSync(join(__dirname, 'date-battery.json'), 'utf8')) as { cases: Case[] };
const python = (xs: string[]): Case[] =>
  (JSON.parse(execFileSync('python3', [join(ROOT, 'scripts/atlas-build/dates.py')], { input: JSON.stringify(xs), encoding: 'utf8' })) as [number | null, number | null, string][]).map((r, i) => [xs[i], ...r]);

/** A HistDate in the battery's terms. */
export function kindOf(text: string, d: HistDate | undefined): Case {
  if (!d || d.precision === 'unknown') return [text, null, null, 'none'];
  if (d.precision === 'year' || d.precision === 'day') return [text, d.earliest!, d.latest!, 'year'];
  if (d.precision === 'circa') return [text, d.preferred!, d.preferred!, 'circa'];
  if (d.qualifier === 'after') return [text, d.earliest!, null, 'from'];
  if (d.qualifier === 'before') return [text, null, d.latest!, 'until'];
  return [text, d.earliest ?? null, d.latest ?? null, 'span'];
}

describe('one date grammar for the build, the map archive and the year box', () => {
  it('the app reads every battery case as written down', () => {
    expect(cases.map(([t]) => kindOf(t, parseDate(t)))).toEqual(cases);
  });

  it('the build reads every battery case the same way', () => {
    expect(python(cases.map(([t]) => t))).toEqual(cases);
  });

  it('the two agree on map-catalogue dates outside the battery too', () => {
    const extra = ['[ca. 1750]', '1750-1760?', 'printed 1782', 'um 1600 n. Chr.', '[between 1690 and 1700]', 'after 1525 BC', 'XVIIe s.', '17th–18th c.',
      '1648 [i.e. 1649]', 'not after 50 v. Chr.', '1. Jh. n. Chr.', 'mid 12th century', 'Anno 1612', '1612 A.D.', 'c. 300 a.C.', '1600–1700 (?)'];
    expect(extra.map((t) => kindOf(t, parseDate(t)))).toEqual(python(extra));
  });

  it('the year box reads a date as the map archive does', () => {
    for (const [t, a, b, kind] of cases) {
      const d = parseHistoricalDate(t);
      if (kind === 'year') expect(d, t).toEqual({ year: a });
      else if (kind === 'circa') expect(d, t).toEqual({ year: a, approximate: true });
      else if (kind === 'span' && a !== null && b !== null) expect(d?.approximate, t).toBe(true);
    }
  });

  it('BC in other languages is never read as AD', () => {
    for (const t of ['500 v. Chr.', '44 a.C.', '52 av. J.-C.', '100 př. n. l.', '200 f.Kr.']) expect(parseDate(t)!.latest!, t).toBeLessThan(0);
  });
});

describe('the date carries its chronology and calendar (AR-7)', () => {
  it('Kadesh is shown as about 1274 BCE, chronology-dependent', async () => {
    const { recordedYearLabel } = await import('../atlas/time');
    expect(recordedYearLabel(-1274)).toBe('c. 1274 BCE (chronology-dependent)');
    expect(recordedYearLabel(-44)).toBe('44 BCE');
    const { formatDate } = await import('./histdate');
    expect(formatDate(parseDate('1274 BC'))).toBe('1274 BCE (chronology-dependent)');
    expect(formatDate(parseDate('218 BC'))).toBe('218 BCE');
  });

  it('a Hijri year keeps its own calendar beside the converted year', async () => {
    const { formatDate } = await import('./histdate');
    expect(parseDate('AH 600')!.calendar).toBe('hijri');
    expect(formatDate(parseDate('AH 600'))).toBe('about 1204 CE (600 AH)');
  });
});
