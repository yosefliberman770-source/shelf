// The master list of site types on the historical map (docs/SITE_TYPES.md) and the
// map group each one is drawn in. The build gives every record a short kind ('church',
// 'site', 'mill'…) and keeps the source's own type text ('st', or 'ty' in the private
// pack); the groups below are read from both at display time, so moving a type to
// another group needs no rebuild of the tiles. Only the type text is read, never the
// place's name, and no record's dates or facts are changed — only where it is drawn.
import type { ExpressionSpecification } from 'maplibre-gl';

export type SiteGroup = 'religious' | 'castle' | 'care' | 'learning' | 'burial' | 'industry' | 'archaeology';

/** A word in a source's type text, optionally not counted when one of `not` is there too ("hospital", not "hospitaller"). */
type Word = string | { w: string; not: string[] };

/** One type of site, as the reader sees it, and the group it is drawn in. */
export interface SiteType { name: string; group: SiteGroup; words: Word[] }

/**
 * Types moved out of the group their kind would give them. Words are lower case and matched
 * inside the type text (English plus the register languages that use them: Norwegian, Polish,
 * Finnish, Lithuanian, Latvian, Slovene, Croatian, French, German).
 */
export const SITE_TYPES: SiteType[] = [
  // Care
  { name: 'Hospital', group: 'care', words: [{ w: 'hospital', not: ['hospitaller', 'hospitalier'] }, 'hôpital', { w: 'szpital', not: ['przyszpital'] }, 'sykehus', 'sykehjem', 'infirmary', 'hôtel-dieu', 'hospice'] },
  { name: 'Almshouse', group: 'care', words: ['almshouse', 'alms house', 'alms-house', 'bedehouse', 'poorhouse', 'poor house'] },
  { name: 'Leper house', group: 'care', words: ['leper', 'lazar house', 'lazar-house', 'lazaret', 'leprosarium', 'léproserie', 'maladrerie'] },
  // Learning
  { name: 'University', group: 'learning', words: ['universit'] },
  { name: 'College', group: 'learning', words: [{ w: 'college', not: ['collegiate'] }, 'collège'] },
  { name: 'School', group: 'learning', words: ['school', 'szkoła', 'schule', 'skole', 'skola', 'mokykla', 'šola', 'école'] },
  // Burial
  { name: 'Cemetery / graveyard', group: 'burial', words: ['graveyard', 'churchyard', 'burial', 'cemetery', 'cmentarz', 'kirkegård', 'kirkegard', 'friedhof', 'cimetière', 'kapinės', 'kapinynas', 'kapsēt', 'groblj', 'grobišč', 'hautapaik', 'kalmisto'] },
  { name: 'Grave', group: 'burial', words: [{ w: 'grave', not: ['gravel', 'engrav'] }, 'gravminne', 'gravfelt', 'gravplass', 'gravfält', 'sépulture'] },
  { name: 'Barrow / burial mound', group: 'burial', words: ['barrow', 'tumul', 'burial mound', 'gravhaug', 'gravhøj', 'kurgan', 'kurhan', 'pilkap', 'grabhügel'] },
  { name: 'Cairn', group: 'burial', words: [{ w: 'cairn', not: ['clearance', 'marker', 'boundary', 'cairnfield'] }, 'gravrøys'] },
  { name: 'Cist', group: 'burial', words: [{ w: 'cist', not: ['cistercian', 'cistern'] }] },
  { name: 'Tomb / mausoleum', group: 'burial', words: ['tomb', 'mausoleum', 'necropol', 'nécropole'] },
  // Industry & work (kinds 'mill', 'mine' and 'fishery' are here whole; these words catch the rest)
  { name: 'Mill', group: 'industry', words: [{ w: 'mill', not: ['millenn'] }, 'moulin', 'młyn', 'mølle', 'kvarn'] },
  { name: 'Mine', group: 'industry', words: [{ w: 'mine', not: ['mineral'] }, 'colliery', 'kopalnia', 'gruve', 'jernvinne'] },
  { name: 'Quarry', group: 'industry', words: ['quarry', 'kamieniołom', 'steinbrudd'] },
  { name: 'Kiln', group: 'industry', words: ['kiln', 'kalkovn', 'wapiennik'] },
  { name: 'Forge / furnace / metalworking', group: 'industry', words: ['forge', 'furnace', 'smithy', 'bloomery', 'ironworks', 'iron works', 'smelt'] },
  { name: 'Salt works', group: 'industry', words: ['saltpan', 'salt pan', 'saltworks', 'salt works', 'salina', 'saline'] },
  { name: 'Charcoal production', group: 'industry', words: ['charcoal', 'kullfremstilling', 'kullgrop'] },
  { name: 'Brewery / distillery / tannery', group: 'industry', words: ['brewery', 'distillery', 'tannery'] },
];

/**
 * Religious words: a record of a church kind that names one of these stays a church however
 * else it is described ("Church and graveyard", "Chapel, hospital") — the church is the main
 * thing there. Words are matched with spaces around the text, so 'kirke ' is not 'kirkegård'.
 */
const RELIGIOUS: Word[] = ['church', 'chapel', 'kirk ', 'kirk,', 'kirke ', 'kirke,', 'kirkested', 'abbey', 'priory', 'friary', 'nunnery', 'convent', 'monaster', 'cathedral',
  'mosque', 'synagogue', 'religious house', 'ecclesiastical', 'preceptory', 'oratory', 'kościół', 'kaplica', 'kapliczka', 'kapela', 'kapelica', 'cerkev', 'samostan', 'kirkko', 'kirkon', 'klasztor', 'kloster', 'église', 'chapelle', 'cerkiew', 'temple'];

/** Castle words: a castle whose type also names one of these stays a castle, even if it later became a country house. */
const CASTLE: Word[] = ['castle', 'tower', 'motte', 'fort', 'keep', 'bastle', 'peel', 'zamek', 'burg', 'borg', 'château', 'schloss', 'bawn', 'hall house', 'moat', 'ringwork'];
/** Country houses filed as castles when nothing in their type says castle. */
const HOUSE: Word[] = ['country house', 'manor house', 'mansion', 'dwór', 'herrenhaus', 'stately home'];

/** Kinds whose records may move to another group by their type text. */
const MOVABLE = ['site', 'building', 'church', 'monastery'];
/** Of those, the church kinds: they move only when their type names no church (see RELIGIOUS). */
const CHURCHY = ['church', 'monastery'];
/** Groups a record of each movable kind may move to, in the order they are tried. */
const MOVES: Record<string, SiteGroup[]> = {
  site: ['care', 'learning', 'burial', 'industry'],
  building: ['care', 'learning', 'burial', 'industry'],
  church: ['care', 'learning', 'burial'],
  monastery: ['care', 'learning', 'burial'],
};

/** The group each kind is drawn in when nothing in its type text moves it. */
export const KIND_GROUP: Record<string, SiteGroup> = {
  castle: 'castle', fortification: 'castle',
  monastery: 'religious', cathedral: 'religious', diocese: 'religious', church: 'religious',
  university: 'learning',
  mill: 'industry', mine: 'industry', fishery: 'industry',
  site: 'archaeology', bridge: 'archaeology', hoard: 'archaeology', wreck: 'archaeology', road: 'archaeology', harbour: 'archaeology',
  building: 'archaeology', lighthouse: 'archaeology', canal: 'archaeology', station: 'archaeology',
};

const wordsOf = (g: SiteGroup) => SITE_TYPES.filter((t) => t.group === g).flatMap((t) => t.words);

// ── Plain JavaScript (counts, tests, popups) ─────────────────────────────
const textOf = (p: Record<string, unknown>) => ` ${String(p.st ?? '')} ${String(p.ty ?? '')} `.toLowerCase();
const has = (text: string, words: Word[]) => words.some((x) => typeof x === 'string' ? text.includes(x) : text.includes(x.w) && !x.not.some((n) => text.includes(n)));

/** The map group of one record (its tile properties), or undefined for kinds drawn in other layers (settlements, markets, events…). */
export function siteGroup(p: Record<string, unknown>): SiteGroup | undefined {
  const k = String(p.k ?? '');
  const text = textOf(p);
  if (MOVABLE.includes(k) && !(CHURCHY.includes(k) && has(text, RELIGIOUS))) {
    for (const g of MOVES[k]) if (has(text, wordsOf(g))) return g;
  }
  if ((k === 'castle' || k === 'fortification') && has(text, HOUSE) && !has(text, CASTLE)) return 'archaeology';
  return KIND_GROUP[k];
}

/** The kinds whose records can end up in a group: a layer tests these first, so other records cost it one lookup. */
export function groupKinds(g: SiteGroup): string[] {
  const ks = new Set(Object.entries(KIND_GROUP).filter(([, x]) => x === g).map(([k]) => k));
  for (const k of MOVABLE) if (MOVES[k].includes(g)) ks.add(k);
  if (g === 'archaeology') ['castle', 'fortification'].forEach((k) => ks.add(k));
  return [...ks];
}

// ── The same rule as a MapLibre expression (map layers) ──────────────────
// Built once per feature ('let'), then read by every word test.
const TEXT_OF: ExpressionSpecification = ['downcase', ['concat', ' ', ['to-string', ['coalesce', ['get', 'st'], '']], ' ', ['to-string', ['coalesce', ['get', 'ty'], '']], ' ']];
const TEXT: ExpressionSpecification = ['var', 'text'];
const hasExpr = (words: Word[]): ExpressionSpecification => ['any', ...words.map((x): ExpressionSpecification => typeof x === 'string'
  ? ['in', x, TEXT]
  : ['all', ['in', x.w, TEXT], ...x.not.map((n): ExpressionSpecification => ['!', ['in', n, TEXT]])])] as ExpressionSpecification;
const kindIn = (kinds: string[]): ExpressionSpecification => ['in', ['get', 'k'], ['literal', kinds]];

let built: ExpressionSpecification | undefined;
/** A layer filter: the record is drawn in group g. */
export const inGroupExpr = (g: SiteGroup): ExpressionSpecification => ['all', kindIn(groupKinds(g)), ['==', siteGroupExpr(), g]];

/** Evaluates to the record's SiteGroup (or '' for kinds drawn elsewhere); mirrors siteGroup(). */
export function siteGroupExpr(): ExpressionSpecification {
  if (built) return built;
  const cases: (ExpressionSpecification | string)[] = [];
  for (const k of MOVABLE) {
    const stays: ExpressionSpecification = CHURCHY.includes(k) ? hasExpr(RELIGIOUS) : ['boolean', false];
    for (const g of MOVES[k]) cases.push(['all', ['==', ['get', 'k'], k], ['!', stays], hasExpr(wordsOf(g))], g);
  }
  cases.push(['all', kindIn(['castle', 'fortification']), hasExpr(HOUSE), ['!', hasExpr(CASTLE)]], 'archaeology');
  const byKind = Object.entries(KIND_GROUP).flatMap(([k, g]) => [k, g]);
  const kindOnly = ['match', ['to-string', ['coalesce', ['get', 'k'], '']], ...byKind, ''];
  // The type text is read only for kinds that can move; every other kind is placed by its kind alone.
  built = ['case', ['!', kindIn([...MOVABLE, 'castle', 'fortification'])], kindOnly, ['let', 'text', TEXT_OF, ['case', ...cases, kindOnly]]] as unknown as ExpressionSpecification;
  return built;
}
