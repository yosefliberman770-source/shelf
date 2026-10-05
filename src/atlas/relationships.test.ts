// Stage 4 part 5 (RM-10): containment and relationships are labelled for what the source recorded — undated, or present-day.
import { describe, expect, it } from 'vitest';
import { containedIn, relatedNote } from '../components/history/atlasParts';
import { parseExtraction } from '../lib/book/extractPrompt';
import type { ReaderPlace } from './resolve';

const place = (over: Record<string, unknown>) => ({ partOf: [], related: [], sources: [{ name: 'the source' }], ...over }) as unknown as ReaderPlace;

describe('containment is never shown as a raw source code (A16-007)', () => {
  it('drops codes and Wikidata ids, keeps names', () => {
    expect(containedIn({ partOf: ['W2890', 'Q42', 'Gallia Narbonensis', ' '] })).toEqual(['Gallia Narbonensis']);
  });
});

describe('relationships say what they are (A15-007, A9-009, X-21)', () => {
  it('Pleiades relationships are undated', () => {
    expect(relatedNote(place({ gaz: { gazetteer: 'pleiades' } }))).toMatch(/does not date them/);
  });
  it('a diocese from Wikidata is the present-day one', () => {
    expect(relatedNote(place({ related: [{ type: 'in diocese', name: 'Rouen' }] }))).toMatch(/usually the present-day one/);
  });
});

describe('a book relationship keeps the date the text gives it (A8-029)', () => {
  it('reads the date field, or a year in the relation text', () => {
    const a = parseExtraction({ relations: [{ a: 'Spain', b: 'Britain', type: 'ceded to', detail: 'by the treaty of 1713', p: 1, c: 'explicit' }] });
    expect(a.relations[0].when).toBe('1713');
    const b = parseExtraction({ relations: [{ a: 'X', b: 'Y', type: 'ruled', w: 'from 1066', p: 1 }] });
    expect(b.relations[0].when).toBe('from 1066');
    const c = parseExtraction({ relations: [{ a: 'X', b: 'Y', type: 'sister of', p: 1 }] });
    expect(c.relations[0].when).toBeUndefined();
  });
});
