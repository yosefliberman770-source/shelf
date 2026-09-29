// Split a book into AI-sized chunks along chapter and paragraph boundaries,
// and spot capitalised names locally so the AI can be asked about each one.
import { ANALYSIS_VERSION, type BookTextRow } from './types';

/** ~3,500 tokens of text per request: big enough to keep requests few, small enough for every free model. */
export const CHUNK_CHARS = 14_000;

export interface ChunkPlan { chapter: number; paraStart: number; paraEnd: number; text: string }

/** Paragraphs numbered so the AI can say where each fact came from. */
export function chunkText(paras: string[], start: number, end: number): string {
  const out: string[] = [];
  for (let i = start; i < end; i++) out.push(`[${i}] ${paras[i]}`);
  return out.join('\n');
}

export function planChunks(chapters: Pick<BookTextRow, 'chapter' | 'paras'>[], max = CHUNK_CHARS): ChunkPlan[] {
  const plans: ChunkPlan[] = [];
  for (const ch of chapters) {
    let start = 0;
    let size = 0;
    for (let i = 0; i < ch.paras.length; i++) {
      const len = ch.paras[i].length + 8;
      if (size > 0 && size + len > max) {
        plans.push({ chapter: ch.chapter, paraStart: start, paraEnd: i, text: chunkText(ch.paras, start, i) });
        start = i;
        size = 0;
      }
      size += len;
    }
    // Tiny trailing pieces join the previous chunk of the same chapter.
    if (start < ch.paras.length) {
      const last = plans[plans.length - 1];
      if (last && last.chapter === ch.chapter && size < max * 0.15) {
        last.paraEnd = ch.paras.length;
        last.text = chunkText(ch.paras, last.paraStart, last.paraEnd);
      } else plans.push({ chapter: ch.chapter, paraStart: start, paraEnd: ch.paras.length, text: chunkText(ch.paras, start, ch.paras.length) });
    }
  }
  return plans;
}

export async function hashChunk(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`v${ANALYSIS_VERSION}\n${text}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const NOT_NAMES = new Set(('the a an and but or if then when while as at by for from in into of on to with without he she it they we you i his her its their our your my ' +
  'this that these those there here what which who whom whose why how yes no not all any each every some such chapter part book volume ' +
  'mr mrs miss ms dr sir lady lord saint st god oh ah well now then so after before upon over under one two three first last ' +
  'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december').split(' '));

/**
 * Capitalised words and phrases that look like names, with how often they
 * appear. Sentence-initial words only count if they also appear mid-sentence.
 */
export function candidateNames(text: string, limit = 80): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  const midSentence = new Set<string>();
  const re = /(^|[.!?:;"“”‘’(\[\n]\s*|\s)((?:(?:Mr|Mrs|Ms|Dr|St|Sir|Lady|Lord|Miss|Captain|Colonel|King|Queen|Prince|Princess|Duke|Earl|Count|Countess|Father|Sister|Brother|Uncle|Aunt)\.?\s+)?[A-Z][\p{Ll}'’-]+(?:\s+(?:de|du|van|von|of|the|la|le|da|di|al|ibn|bin)?\s*[A-Z][\p{Ll}'’-]+)*)/gu;
  for (const m of text.matchAll(re)) {
    const lead = m[1];
    const name = m[2].replace(/['’]s$/, '').trim();
    const first = name.split(/\s+/)[0].replace(/\.$/, '').toLowerCase();
    if (NOT_NAMES.has(first) && name.split(/\s+/).length === 1) continue;
    if (name.length < 3) continue;
    const sentenceStart = /[.!?:"“”\n]\s*$/.test(lead) || lead === '' || /^\s*$/.test(lead) && m.index === 0;
    if (!sentenceStart) midSentence.add(name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([n]) => midSentence.has(n) || n.includes(' '))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
