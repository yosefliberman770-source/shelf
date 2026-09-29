// Find the passages of a book most relevant to a question, locally (no AI),
// so answers can quote the book instead of guessing. Only chapters up to
// where you are reading are searched.
import type { BookTextRow } from './types';

const STOP = new Set('the and for are but not you all any can had her was one our out his has him how its who did get may way use she they them then than that this with from have what when where which will would there their about into more some such only also very just been were said does why whom whose'.split(' '));

export const terms = (s: string) => (s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w));

export interface Passage { chapter: number; para: number; title: string; text: string; cfi?: string; score: number }

export function retrievePassages(rows: BookTextRow[], query: string, maxChapter = Infinity, k = 6, extraTerms: string[] = [], maxPara = Infinity): Passage[] {
  const q = [...new Set([...terms(query), ...extraTerms.flatMap(terms)])];
  if (!q.length) return [];
  const docs: { row: BookTextRow; i: number; words: string[] }[] = [];
  const df = new Map<string, number>();
  for (const row of rows) {
    if (row.chapter > maxChapter) continue;
    row.paras.forEach((p, i) => {
      if (row.chapter === maxChapter && i > maxPara) return;
      const words = terms(p);
      docs.push({ row, i, words });
      for (const w of new Set(words)) if (q.includes(w)) df.set(w, (df.get(w) ?? 0) + 1);
    });
  }
  const N = docs.length || 1;
  const avg = docs.reduce((a, d) => a + d.words.length, 0) / N || 1;
  const scored = docs.map((d) => {
    let score = 0;
    const tf = new Map<string, number>();
    for (const w of d.words) if (q.includes(w)) tf.set(w, (tf.get(w) ?? 0) + 1);
    for (const [w, f] of tf) {
      const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.words.length / avg))));
    }
    return { d, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  return scored.map(({ d, score }) => ({ chapter: d.row.chapter, para: d.i, title: d.row.title, text: d.row.paras[d.i].slice(0, 900), cfi: d.row.cfis[d.i] || undefined, score }));
}
