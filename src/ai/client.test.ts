import { describe, expect, it } from 'vitest';
import { jsonField, parseJSON, repairJSON } from './client';

describe('reading imperfect AI replies', () => {
  it('closes a reply that was cut off', () => {
    expect(repairJSON('{"answer":"Hello there","related":{"people":["Ann","Bo')).toEqual({ answer: 'Hello there', related: { people: ['Ann', 'Bo'] } });
    expect(parseJSON<{ a: number[] }>('```json\n{"a":[1,2,3')).toEqual({ a: [1, 2, 3] });
  });
  it('pulls a field out of broken JSON', () => {
    expect(jsonField('{"answer":"Line one\\nline \\"two\\"", "rel', 'answer')).toBe('Line one\nline "two"');
  });
});
