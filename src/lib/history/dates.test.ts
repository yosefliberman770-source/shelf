import { describe, expect, it } from 'vitest';
import { dateContextFor, detectPlaces } from './placeDetect';
import { addYears, findDatesInText, formatHistoricalDate, parseHistoricalDate, toOhmDate, toOhmYear } from './dates';

describe('historical dates', () => {
  it('parses BCE/BC/CE/AD without a year zero', () => {
    expect(parseHistoricalDate('218 BCE')).toEqual({ year: -218 });
    expect(parseHistoricalDate('218 B.C.')).toEqual({ year: -218 });
    expect(parseHistoricalDate('1 BCE')).toEqual({ year: -1 });
    expect(parseHistoricalDate('1 CE')).toEqual({ year: 1 });
    expect(parseHistoricalDate('AD 43')).toEqual({ year: 43 });
    expect(parseHistoricalDate('1066')).toEqual({ year: 1066 });
    expect(parseHistoricalDate('-218')).toEqual({ year: -218 });
    expect(parseHistoricalDate('c. 50 BC')).toEqual({ year: -50, approximate: true });
    expect(parseHistoricalDate('3rd century BC')).toEqual({ year: -250, approximate: true });
    expect(parseHistoricalDate('0')).toBeUndefined();
    expect(parseHistoricalDate('hello')).toBeUndefined();
  });
  it('formats years', () => {
    expect(formatHistoricalDate(-218)).toBe('218 BCE');
    expect(formatHistoricalDate(-1)).toBe('1 BCE');
    expect(formatHistoricalDate(1)).toBe('1 CE');
    expect(formatHistoricalDate(1066)).toBe('1066 CE');
    expect(formatHistoricalDate(undefined)).toBe('Historical date unknown');
    expect(formatHistoricalDate(-50, { approximate: true, style: 'bc' })).toBe('c. 50 BC');
  });
  it('steps across the BCE/CE boundary without year 0', () => {
    expect(addYears(-1, 1)).toBe(1);
    expect(addYears(1, -1)).toBe(-1);
    expect(addYears(-218, 2)).toBe(-216);
  });
  it('converts to OpenHistoricalMap / ISO years (which have a year 0)', () => {
    expect(toOhmYear(-1)).toBe(0);
    expect(toOhmYear(-218)).toBe(-217);
    expect(toOhmDate(-218)).toBe('-0217');
    expect(toOhmDate(1500)).toBe('1500');
    expect(toOhmDate(43)).toBe('0043');
  });
  it('finds dates written in a passage', () => {
    const found = findDatesInText('In 218 BC Hannibal crossed the Alps; by 216 B.C. he was at Cannae. Rome fell in 1453? No, Constantinople did, in 1453.');
    expect(found.map((d) => d.year)).toEqual([-218, -216, 1453, 1453]);
    expect(findDatesInText('He had 300 men and 12 ships.')).toEqual([]);
  });
});


describe('place detection and date context', () => {
  it('offers known places and names that read like places, not every capitalised word', () => {
    const text = 'The Roman army marched from Rome toward Capua. Hannibal waited near Cannae while Fabius watched. Later they besieged Syracuse.';
    const found = detectPlaces(text, ['Rome'], ['Hannibal', 'Fabius']);
    // "Roman" is offered as an adjective (demonym) — which polity it means, if any, is decided later from data.
    expect(found.filter((p) => !p.evidence.demonym).map((p) => p.name)).toEqual(['Rome', 'Capua', 'Cannae', 'Syracuse']);
    expect(found.find((p) => p.name === 'Roman')?.evidence.demonym).toBe(true);
  });
  it('prefers a date written near the place, then the chapter, then the book period', () => {
    expect(dateContextFor({ bookId: 'x1', passage: 'In 216 BC the armies met at Cannae.' })).toMatchObject({ year: -216, source: 'nearby' });
    expect(dateContextFor({ bookId: 'x1', passage: 'They met at Cannae.', chapterText: 'It was 218 BC. Much later...' })).toMatchObject({ year: -218, source: 'chapter' });
    expect(dateContextFor({ bookId: 'x1', item: { histStart: -264, histEnd: -146 } })).toMatchObject({ year: -205, source: 'book' });
    expect(dateContextFor({ bookId: 'x1' })).toEqual({ source: 'none' });
  });
});

describe('spans in a passage are read whole (A12-008)', () => {
  it.each([
    ['The abbey was rebuilt between 1270 and 1290 by the monks.', 1280, 1270, 1290],
    ['In the 12th–13th centuries the town grew.', 1200, 1101, 1300],
    ['The war of 218–201 BC ended at Zama.', -209, -218, -201],
  ])('%s', (text, year, from, to) => {
    const [d] = findDatesInText(text);
    expect(d).toMatchObject({ year, approximate: true, from, to });
  });
  it('a lone year next to a span is still found', () => {
    expect(findDatesInText('Built between 1270 and 1290; burned in 1340.').map((d) => d.year)).toEqual([1280, 1340]);
  });
});
