// Stage 2 (RM-15): remembered answers never leak between names, books or data builds.
import { describe, expect, it } from 'vitest';
import { choiceKey, contextFingerprint, legacyChoiceKeys, nameKey } from './keys';
import { cacheKey } from './placeService';

describe('keys for remembered answers', () => {
  it('keep every script: different names never share a key (A13-004)', () => {
    const names = ['Москва', 'Киев', 'Αθήνα', 'القاهرة', 'ירושלים', '北京', 'Łódź', 'Lodz'];
    const keys = names.map((n) => choiceKey('book', n));
    // Folded exactly as the place index folds names: accents go, letters stay (Ł is a letter, so Łódź ≠ Lodz).
    expect(new Set(keys).size).toBe(names.length);
    expect(nameKey('Αθήνα')).toBe('αθηνα');
    expect(nameKey('Saint-Étienne')).toBe('saint-etienne');
    expect(new Set(names.map((n) => cacheKey(n, 1500, 'whg'))).size).toBe(names.length);
  });
  it('a choice saved under the old Latin-only key is still found; the shared empty key never is', () => {
    expect(legacyChoiceKeys('b', 'St. Albans')).toEqual(['b|st albans']);
    expect(legacyChoiceKeys('b', 'Москва')).toEqual([]);
    expect(legacyChoiceKeys('b', 'Lincoln')).toEqual([]);
  });
  it('an online answer is cached with the book geography it was chosen with (A13-005)', () => {
    const a = contextFingerprint([{ lat: 42.36, lon: -71.06 }], ['Salem']);
    const b = contextFingerprint([{ lat: 52.97, lon: -0.02 }], ['Lincoln']);
    expect(a).not.toBe(b);
    expect(contextFingerprint([], [])).toBe('none');
    expect(contextFingerprint([{ lat: 42.36, lon: -71.06 }], ['Salem'])).toBe(a);
    expect(cacheKey('Boston', 1630, 'whg', a)).not.toBe(cacheKey('Boston', 1630, 'whg', b));
  });
});
