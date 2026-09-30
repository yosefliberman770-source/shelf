// Names are not interchangeable. For one place Shelf keeps apart:
//   • the words the book uses ("Exeter")
//   • a common English name, when the data records one
//   • the names a dataset attests for a period ("Isca Dumnoniorum", Roman)
//   • names in their own script (Arabic, Hebrew, Chinese…)
//   • the dataset record's own title
// and chooses which to show by one policy (displayName). Nothing is lost:
// the others stay available as secondary information.
import type { GazName, GazPlace } from './gazetteer';
import { normName } from './gazetteer';
import type { HistYear } from './time';

/** Right-to-left scripts (Hebrew, Arabic, Syriac, Thaana, N'Ko, and their presentation forms). */
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/u;
export const hasRtl = (s: string) => RTL.test(s);
/** Written in Latin letters (with accents, digits and punctuation). */
export const isLatinScript = (s: string) => /\p{L}/u.test(s) && !/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{M}\p{S}]/u.test(s);

/**
 * Isolate a name for use inside running text, so a right-to-left (or other
 * non-Latin) name keeps its own direction and doesn't reorder the punctuation
 * around it. Uses Unicode FIRST STRONG ISOLATE … POP DIRECTIONAL ISOLATE —
 * the text itself is never reversed.
 */
export const isolate = (s: string) => (isLatinScript(s) ? s : `⁨${s}⁩`);
/** Join names for display, each isolated. */
export const joinNames = (xs: string[], sep = ' · ') => xs.map(isolate).join(sep);

export interface NameRoles {
  /** What to show. */
  display: string;
  /** Exactly as the book wrote it, when the place came from the book. */
  asWritten?: string;
  /** A recorded English name (e.g. the modern English form), when the dataset has one. */
  english?: string;
  /** The dataset record's own title and which dataset it is. */
  recordTitle: string;
  /** Names the dataset attests around the year (with their dates), excluding the display name. */
  atDate: GazName[];
  /** Names in their own (non-Latin) script. */
  nativeScript: GazName[];
  /** Why this display name was chosen. */
  rule: 'as-written' | 'english' | 'record-title' | 'latin-name' | 'record-title-nonlatin';
}

const isEnglish = (n: GazName) => /^en(g)?$/i.test(n.lang ?? '');

/**
 * The name to show for a gazetteer place, and the others to keep.
 * 1. The book's own wording, when it is one of the place's recorded names.
 * 2. Otherwise a recorded English name.
 * 3. Otherwise the record's title, if it is in Latin script.
 * 4. Otherwise the first recorded Latin-script name (a transliteration).
 * 5. Otherwise the title as it stands (no reliable Latin form exists).
 */
export function nameRoles(p: GazPlace, written?: string, year?: HistYear): NameRoles {
  const all = [{ name: p.title } as GazName, ...p.names];
  const w = written ? normName(written) : undefined;
  const recorded = w !== undefined && all.some((n) => normName(n.name) === w);
  const english = p.names.find((n) => isEnglish(n) && isLatinScript(n.name))?.name;
  let display: string;
  let rule: NameRoles['rule'];
  if (written && recorded) { display = written.trim(); rule = 'as-written'; }
  else if (english) { display = english; rule = 'english'; }
  else if (isLatinScript(p.title)) { display = p.title; rule = 'record-title'; }
  else {
    const latin = p.names.find((n) => isLatinScript(n.name))?.name;
    if (latin) { display = latin; rule = 'latin-name'; } else { display = p.title; rule = 'record-title-nonlatin'; }
  }
  const d = normName(display);
  const fits = (n: GazName) => year === undefined || (n.from === undefined && n.to === undefined) || ((n.from ?? -Infinity) - 50 <= year && year <= (n.to ?? Infinity) + 50);
  const dated = p.names.filter((n) => (n.from !== undefined || n.to !== undefined) && fits(n) && normName(n.name) !== d);
  return {
    display, rule,
    asWritten: written?.trim(),
    english: english && normName(english) !== d ? english : undefined,
    recordTitle: p.title,
    atDate: dated.filter((n, i) => dated.findIndex((x) => normName(x.name) === normName(n.name)) === i).slice(0, 6),
    nativeScript: p.names.filter((n) => !isLatinScript(n.name)).slice(0, 4),
  };
}

/** The best display name among plain strings (online records): the book's wording if listed, else Latin script first. */
export function pickDisplay(candidates: string[], written?: string): string {
  const xs = candidates.filter(Boolean);
  if (written && xs.some((x) => normName(x) === normName(written))) return written.trim();
  return xs.find(isLatinScript) ?? xs[0] ?? written ?? '';
}
