import { describe, expect, it } from 'vitest';
import { candidateNames, planChunks } from './chunk';
import { appearsIn, keepGrounded, parseExtraction } from './extractPrompt';
import { entityUpTo, parseName, resolveBook } from './resolve';
import { retrievePassages } from './retrieve';
import { locTitle, paraAtCfi, partRange } from './text';
import type { ChunkExtraction, RawEntity } from './types';

const ent = (name: string, extra: Partial<RawEntity> = {}): RawEntity => ({ name, type: 'character', paras: [0], facts: [], ...extra });
const chunk = (index: number, chapter: number, entities: RawEntity[], rest: Partial<ChunkExtraction> = {}) => ({ index, chapter, result: { entities, relations: [], events: [], ...rest } });

describe('names', () => {
  it('strips honorifics and keeps gender', () => {
    expect(parseName('Mr. Darcy')).toMatchObject({ core: 'darcy', gender: 'male' });
    expect(parseName('Mrs. Bennet')).toMatchObject({ core: 'bennet', gender: 'female' });
    expect(parseName("Captain Ahab's")).toMatchObject({ core: 'ahab' });
    expect(parseName('Miss Elizabeth Bennet').core).toBe('elizabeth bennet');
  });
});

describe('entity resolution', () => {
  it('merges Mr. Darcy / Darcy / Fitzwilliam Darcy but not Georgiana Darcy', () => {
    const g = resolveBook('b', [
      chunk(0, 1, [ent('Mr. Darcy'), ent('Elizabeth Bennet', { gender: 'female', aliases: ['Lizzy'] })]),
      chunk(1, 2, [ent('Darcy', { gender: 'male' }), ent('Lizzy'), ent('Georgiana Darcy', { gender: 'female' })]),
      chunk(2, 3, [ent('Fitzwilliam Darcy', { gender: 'male' })]),
    ]);
    const names = g.entities.map((e) => e.name).sort();
    expect(names).toEqual(['Elizabeth Bennet', 'Fitzwilliam Darcy', 'Georgiana Darcy']);
    const darcy = g.entities.find((e) => e.name === 'Fitzwilliam Darcy')!;
    expect(darcy.aliases).toEqual(expect.arrayContaining(['Mr. Darcy', 'Darcy']));
    expect(darcy.chapters).toEqual([1, 2, 3]);
    expect(darcy.firstChapter).toBe(1);
  });

  it('keeps Mr. and Mrs. Bennet apart, and leaves an ambiguous bare surname separate', () => {
    const g = resolveBook('b', [
      chunk(0, 0, [ent('Mr. Bennet'), ent('Mrs. Bennet'), ent('Bennet'), ent('Jane Bennet', { gender: 'female' }), ent('Elizabeth Bennet', { gender: 'female' })]),
    ]);
    const names = g.entities.map((e) => e.name).sort();
    expect(names).toEqual(['Bennet', 'Elizabeth Bennet', 'Jane Bennet', 'Mr. Bennet', 'Mrs. Bennet']);
    expect(g.entities.find((e) => e.name === 'Bennet')!.uncertainMerge?.length).toBeGreaterThan(1);
  });

  it('keeps provenance and certainty on facts, links relations and dedupes facts', () => {
    const g = resolveBook('b', [
      chunk(0, 4, [ent('Emma', { gender: 'female', facts: [{ text: 'Emma is handsome, clever and rich', para: 0, quote: 'handsome, clever, and rich', certainty: 'explicit' }, { text: 'Emma is lonely', para: 2, certainty: 'inferred' }] }), ent('Highbury', { type: 'place' })],
        { relations: [{ a: 'Emma', b: 'Highbury', type: 'lives in', para: 1, certainty: 'explicit' }] }),
      chunk(1, 5, [ent('Emma Woodhouse', { gender: 'female', facts: [{ text: 'Emma is handsome, clever and rich.', para: 3 }] })]),
    ], (c, p) => `cfi(${c},${p})`);
    const emma = g.entities.find((e) => e.name === 'Emma Woodhouse')!;
    expect(emma.facts).toHaveLength(2);
    expect(emma.facts[0]).toMatchObject({ chapter: 4, para: 0, cfi: 'cfi(4,0)', certainty: 'explicit', quote: 'handsome, clever, and rich' });
    expect(emma.facts[1].certainty).toBe('inferred');
    expect(g.relations).toEqual([expect.objectContaining({ from: emma.key, type: 'lives in', loc: { chapter: 4, para: 1, cfi: 'cfi(4,1)' } })]);
    expect(g.relations[0].to).toBe(g.entities.find((e) => e.name === 'Highbury')!.key);
  });

  it('never shows what happens after your chapter', () => {
    const g = resolveBook('b', [
      chunk(0, 1, [ent('Pip', { facts: [{ text: 'Pip is an orphan', para: 0 }] })]),
      chunk(1, 9, [ent('Pip', { facts: [{ text: 'Pip learns who his benefactor is', para: 0 }] }), ent('Magwitch')]),
    ]);
    const pip = entityUpTo(g.entities.find((e) => e.name === 'Pip')!, 3)!;
    expect(pip.facts.map((f) => f.text)).toEqual(['Pip is an orphan']);
    expect(entityUpTo(g.entities.find((e) => e.name === 'Magwitch')!, 3)).toBeUndefined();
  });
});

describe('chunking', () => {
  it('splits on paragraph boundaries within chapters and numbers paragraphs', () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'x'.repeat(900)}`);
    const plans = planChunks([{ chapter: 0, paras }, { chapter: 1, paras: ['Short chapter.'] }], 10_000);
    expect(plans.length).toBeGreaterThan(2);
    expect(plans.every((p) => p.text.length <= 10_000 + 1000)).toBe(true);
    const ch0 = plans.filter((p) => p.chapter === 0);
    expect(ch0[0].paraStart).toBe(0);
    for (let i = 1; i < ch0.length; i++) expect(ch0[i].paraStart).toBe(ch0[i - 1].paraEnd);
    expect(ch0[ch0.length - 1].paraEnd).toBe(30);
    expect(plans[plans.length - 1]).toMatchObject({ chapter: 1, text: '[0] Short chapter.' });
  });

  it('spots names locally, ignoring ordinary sentence-initial words', () => {
    const names = candidateNames('The rain fell. Mr. Darcy looked at Elizabeth. However, Elizabeth smiled at Jane Bennet in Meryton. Then they left.').map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(['Mr. Darcy', 'Elizabeth', 'Jane Bennet', 'Meryton']));
    expect(names).not.toContain('However');
    expect(names).not.toContain('Then');
  });
});

describe('parsing AI output', () => {
  it('accepts compact and long keys, fixes types and drops out-of-range paragraphs', () => {
    const r = parseExtraction({
      entities: [
        { name: 'Ishmael', type: 'person', desc: 'the narrator', facts: [{ t: 'He goes to sea', p: '12', c: 'inferred' }, 'Wants to see the world'], p: [12, 99] },
        { name: 'Nantucket', kind: 'town', description: 'an island' },
        { name: '' },
      ],
      relationships: [{ from: 'Ishmael', to: 'Queequeg', relation: 'friend of' }],
      events: [{ event: 'Sailing', who: 'Ishmael' }],
    }, [10, 20]);
    expect(r.entities).toHaveLength(2);
    expect(r.entities[0]).toMatchObject({ type: 'character', description: 'the narrator', paras: [12] });
    expect(r.entities[0].facts![0]).toMatchObject({ text: 'He goes to sea', para: 12, certainty: 'inferred' });
    expect(r.entities[1].type).toBe('place');
    expect(r.relations[0]).toMatchObject({ a: 'Ishmael', b: 'Queequeg', type: 'friend of' });
    expect(r.events[0].who).toEqual(['Ishmael']);
  });
});

describe('ranks and surnames', () => {
  it('keeps Colonel Fitzwilliam apart from Fitzwilliam Darcy, but Mr. Darcy joins him', () => {
    const g = resolveBook('b', [chunk(0, 0, [ent('Fitzwilliam Darcy', { gender: 'male' }), ent('Colonel Fitzwilliam', { gender: 'male' }), ent('Mr. Darcy')])]);
    expect(g.entities.map((e) => e.name).sort()).toEqual(['Colonel Fitzwilliam', 'Fitzwilliam Darcy']);
  });
  it('hides facts until the paragraph where they appear', () => {
    const g = resolveBook('b', [chunk(0, 2, [ent('Anna', { paras: [5], facts: [{ text: 'early', para: 5 }, { text: 'late', para: 40 }] })])]);
    const anna = g.entities[0];
    expect(entityUpTo(anna, 2, 4)).toBeUndefined();
    expect(entityUpTo(anna, 2, 10)!.facts.map((f) => f.text)).toEqual(['early']);
    expect(entityUpTo(anna, 3)!.facts).toHaveLength(2);
  });
});

describe('book text helpers', () => {
  it('finds chapters inside a section and names locations by them', () => {
    const row = { title: 'Volume I', paras: ['Volume I', 'CHAPTER I.', 'It is a truth…', 'More.', 'CHAPTER II.', 'Mr. Bennet was…'], heads: [1, 4] };
    expect(locTitle(row, 3)).toBe('CHAPTER I.');
    expect(locTitle(row, 5)).toBe('CHAPTER II.');
    expect(locTitle(row, 0)).toBe('Volume I');
    expect(partRange(row, 2)).toEqual([1, 4]);
    expect(partRange(row, 5)).toEqual([4, 6]);
  });
  it('finds the paragraph at a reading position', () => {
    const cfis = ['a1', 'a3', 'a5', 'a7'];
    const cmp = (x: string, y: string) => Number(x.slice(1)) - Number(y.slice(1));
    expect(paraAtCfi(cfis, 'a4', cmp)).toBe(1);
    expect(paraAtCfi(cfis, 'a7', cmp)).toBe(3);
    expect(paraAtCfi(cfis, 'a0', cmp)).toBe(0);
  });
  it('retrieves relevant passages only up to the reader', () => {
    const rows = [
      { id: 'b|0', bookId: 'b', chapter: 0, href: '', title: 'One', cfis: [], paras: ['The garden at Longbourn was quiet.', 'Nothing here.'] },
      { id: 'b|1', bookId: 'b', chapter: 1, href: '', title: 'Two', cfis: [], paras: ['Elizabeth walked to the garden at Longbourn with Jane.'] },
    ];
    expect(retrievePassages(rows, 'Longbourn garden', 0).map((p) => p.chapter)).toEqual([0]);
    expect(retrievePassages(rows, 'Longbourn garden', 1).map((p) => p.chapter).sort()).toEqual([0, 1]);
    expect(retrievePassages(rows, 'Longbourn garden', 1, 6, [], -1).map((p) => p.chapter)).toEqual([0]);
  });
});

describe('grounding', () => {
  it('drops names the AI made up and keeps ones written in the text', () => {
    const passage = '[0] Élodie met Mr. Darcy near Pemberley. Darcyville is elsewhere.';
    expect(appearsIn(passage, 'Darcy')).toBe(true);
    expect(appearsIn(passage, 'élodie')).toBe(true);
    expect(appearsIn(passage, 'Arcy')).toBe(false);
    const r = keepGrounded({ entities: [ent('Mr. Darcy'), ent('Wickham'), ent('Elizabeth Bennet', { aliases: ['Élodie'] })], relations: [], events: [] }, passage);
    expect(r.entities.map((e) => e.name)).toEqual(['Mr. Darcy', 'Elizabeth Bennet']);
  });
});
