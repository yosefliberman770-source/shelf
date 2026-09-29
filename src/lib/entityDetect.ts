// Recognise people, places, events and ideas in the text you're reading.
// Only names you already have (your Knowledge Atlas, plus any names found
// for this chapter) are matched — cheap, offline, and the book's own DOM is
// never modified: matches are drawn with the CSS Custom Highlight API.
import type { Concept, ConceptKind } from '../db/types';

export interface Term { name: string; kind: ConceptKind; conceptId?: string }
export interface Hit { range: Range; term: Term }

const RECOGNISE: ConceptKind[] = ['person', 'place', 'event', 'polity', 'organization', 'period', 'source', 'object', 'concept'];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Names from the knowledge graph worth underlining. */
export function termsFromConcepts(concepts: Concept[]): Term[] {
  const out: Term[] = [];
  for (const c of concepts) {
    if (!RECOGNISE.includes(c.kind)) continue;
    for (const n of [c.name, ...(c.aliases ?? [])]) {
      const name = n.trim();
      // Plain ideas only when they are distinctive (several words or capitalised).
      if (name.length < 3 || (c.kind === 'concept' && !/\s|^[A-Z]/.test(name))) continue;
      out.push({ name, kind: c.kind, conceptId: c.id });
    }
  }
  return out;
}

export interface Matcher { re: RegExp; byName: Map<string, Term> }

export function buildMatcher(terms: Term[]): Matcher | null {
  const byName = new Map<string, Term>();
  for (const t of terms) {
    const k = t.name.toLowerCase();
    const prev = byName.get(k);
    if (!prev || (!prev.conceptId && t.conceptId)) byName.set(k, t);
  }
  if (!byName.size) return null;
  // Longest first so "Battle of Cannae" wins over "Cannae". Names must start
  // with the same capital letter as written, so "Rome" never matches "rome".
  const pats = [...byName.values()].sort((a, b) => b.name.length - a.name.length).map((t) => escapeRe(t.name).replace(/\s+/g, '\\s+'));
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${pats.join('|')})(?![\\p{L}\\p{N}])`, 'gu'), byName };
}

export function findInDocument(doc: Document, m: Matcher, limit = 400): Hit[] {
  const hits: Hit[] = [];
  if (!doc.body) return hits;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node && hits.length < limit; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (text.length < 3) continue;
    m.re.lastIndex = 0;
    for (let mt = m.re.exec(text); mt; mt = m.re.exec(text)) {
      const key = mt[0].replace(/\s+/g, ' ').toLowerCase();
      const term = m.byName.get(key) ?? [...m.byName.values()].find((t) => t.name.toLowerCase().replace(/\s+/g, ' ') === key);
      if (!term) continue;
      const r = doc.createRange();
      r.setStart(node, mt.index);
      r.setEnd(node, mt.index + mt[0].length);
      hits.push({ range: r, term });
    }
  }
  return hits;
}

type HighlightWin = Window & { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...r: Range[]) => unknown };

/** Draw subtle underlines under the hits (no-op where unsupported). */
export function paintHits(win: Window, hits: Hit[]) {
  const w = win as HighlightWin;
  if (!w.CSS?.highlights || !w.Highlight) return;
  if (hits.length) w.CSS.highlights.set('shelf-entity', new w.Highlight(...hits.map((h) => h.range)));
  else w.CSS.highlights.delete('shelf-entity');
}

/** Which hit (if any) is under a tap at viewport point (x, y)? */
export function hitAt(doc: Document, hits: Hit[], x: number, y: number): Hit | undefined {
  let node: Node | null = null;
  let offset = 0;
  const d = doc as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (p) { node = p.offsetNode; offset = p.offset; }
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) { node = r.startContainer; offset = r.startOffset; }
  }
  if (!node) return undefined;
  return hits.find((h) => {
    if (h.range.startContainer !== node) return false;
    if (offset < h.range.startOffset || offset > h.range.endOffset) return false;
    // Make sure the tap is really on the word, not beside the line.
    return [...h.range.getClientRects()].some((rc) => x >= rc.left - 4 && x <= rc.right + 4 && y >= rc.top - 4 && y <= rc.bottom + 4);
  });
}

const STOP = new Set('The A An And But Or If In On At Of For To From By With As It He She They We I You His Her Their Our My Your This That These Those Then When Where While After Before Chapter Part Book Mr Mrs Ms Dr Sir Lady Lord Yes No Not So Now There Here What Who Why How All Some One Two Three First Second Third Its Which Such Even Yet Still Also Only Once Upon Into Over Under Again Although Though Because Since Until Unless Whether Perhaps Indeed Thus Therefore However Meanwhile Nevertheless Moreover January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday'.split(' '));

/**
 * Offline guess at proper names: capitalised words that aren't starting a
 * sentence. Labelled as a guess in the UI; nothing is saved until tapped.
 */
export function guessNames(text: string, max = 14): string[] {
  const counts = new Map<string, number>();
  const re = /(?<=[a-z,;:)’'"]\s+)((?:[A-Z][\p{Ll}’'-]+)(?:\s+(?:of|de|the|von|van|al|el|da|di|la|le)?\s*[A-Z][\p{Ll}’'-]+){0,3})/gu;
  for (const m of text.matchAll(re)) {
    const name = m[1].replace(/\s+/g, ' ').replace(/[’']s$/, '').trim();
    const first = name.split(' ')[0];
    if (name.length < 4 || STOP.has(first) || STOP.has(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max).map(([n]) => n);
}
