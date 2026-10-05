// Stage 5 part 1 (RM-09): years written in book text are read as the text means them.
import { describe, expect, it } from 'vitest';
import { bookPeriod, FRONT_BACK_MATTER, narrativeDates } from '../../world/bookWorld';
import { parseDate } from '../../world/histdate';
import { findDatesInText } from './dates';

const years = (t: string) => findDatesInText(t).map((d) => d.year);

describe('eras and small years (A12-002, A12-012, A8-030)', () => {
  it('a BCE year after “in”, “by”, “around” is BCE, never CE or lost', () => {
    expect(years('In 1000 BC the city fell.')).toEqual([-1000]);
    expect(years('by 500 BC it was gone')).toEqual([-500]);
    expect(years('around 2029 BC')).toEqual([-2029]);
  });
  it('three-digit CE years after a dating word are read', () => {
    expect(years('in 793 the Vikings came to Lindisfarne')).toEqual([793]);
    expect(years('In 410 Rome was sacked.')).toEqual([410]);
    expect(years('the Hijra in 622.')).toEqual([622]);
  });
  it('counts are never years (TM-4)', () => {
    expect(years('an army of 1200 men')).toEqual([]);
    expect(years('by 300 ships')).toEqual([]);
    expect(years('a population of 500.')).toEqual([]);
  });
});

describe('common event date forms (A8-034, A8-046)', () => {
  it('days, months and “the year”', () => {
    expect(years('On 14 October 1066 the battle began')).toEqual([1066]);
    expect(years('in May 1453 the city fell')).toEqual([1453]);
    expect(years('in the year 622')).toEqual([622]);
  });
  it('ranges keep both ends; “the 1200s” is a hundred years', () => {
    const r = findDatesInText('from 1346–47 the plague')[0];
    expect([r.from, r.to]).toEqual([1346, 1347]);
    const c = findDatesInText('during the 1200s')[0];
    expect([c.from, c.to]).toEqual([1200, 1299]);
    expect(parseDate('the 1350s')).toMatchObject({ earliest: 1350, latest: 1359 });
  });
});

describe('the book’s period comes from its subject, not its printing (A12-023, A8-043)', () => {
  it('copyright, edition and ISBN lines are left out', () => {
    const text = 'First published 1998\nReprinted 2005, 2011\n© 2003 Penguin Books\nISBN 978-0-14\n\nIn 1066 William crossed the Channel. By 1086 the survey was done.';
    expect(narrativeDates(text)).toEqual([1066, 1086]);
  });
  it('front and back matter sections are recognised', () => {
    for (const l of ['Copyright', 'Contents', 'Index', 'Bibliography', 'Acknowledgements', 'About the Author']) expect(FRONT_BACK_MATTER.test(l)).toBe(true);
    expect(FRONT_BACK_MATTER.test('Chapter 1: The Norman Conquest')).toBe(false);
  });
  it('a medieval book with a modern copyright page keeps a medieval period', () => {
    const row = { chapters: [{ dates: [1066, 1070, 1086, 1087, 1100] }] } as unknown as Parameters<typeof bookPeriod>[0];
    const p = bookPeriod(row);
    expect(p.latest!).toBeLessThan(1200);
  });
});
