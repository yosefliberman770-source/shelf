// The master list of site types: which map group each record is drawn in, read from its
// kind and the source's own type text — and the map layers' filter agreeing with it.
import { expression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, LAYERS, type LayerCtx } from './catalog';
import { siteGroup, siteGroupExpr } from './site-types';

const exprGroup = (p: Record<string, unknown>) => {
  const e = expression.createExpression(siteGroupExpr() as never);
  if (e.result !== 'success') throw new Error('bad expression');
  return e.value.evaluate({ zoom: 8 } as never, { type: 1, properties: p } as never) as string;
};
const ctx = (year: number): LayerCtx => ({ year, base: '/atlas/', showUndated: false } as LayerCtx);
const inLayer = (id: string, p: Record<string, unknown>) => {
  const spec = LAYERS.find((l) => l.id === id)!.specs(ctx(1300)).find((s) => s.type === 'circle')! as { filter: unknown };
  return featureFilter(spec.filter as never).filter({ zoom: 8 } as never, { type: 1, properties: { f: 1200, ...p } } as never);
};

// [kind, type text, group]
const CASES: [string, string, string][] = [
  // Care: out of the religious and archaeology layers
  ['monastery', 'Hospital', 'care'],
  ['site', 'HOSPITAL (MEDIEVAL)', 'care'],
  ['site', 'ALMSHOUSE (19TH CENTURY)', 'care'],
  ['site', 'LEPER HOSPITAL (MEDIEVAL)', 'care'],
  ['building', 'szpital · 1809 r.', 'care'],
  // Learning
  ['university', '', 'learning'],
  ['site', 'SCHOOL (19TH CENTURY)', 'learning'],
  ['site', 'COLLEGE (16TH CENTURY)', 'learning'],
  ['building', 'szkoła · XVIII w.', 'learning'],
  // Burial
  ['church', 'Graveyard', 'burial'],
  ['church', 'BURIAL GROUND (MEDIEVAL)', 'burial'],
  ['church', 'cmentarz rzymskokatolicki · 1820 r.', 'burial'],
  ['church', 'Kirkegård', 'burial'],
  ['site', 'Gravhaug', 'burial'],
  ['site', 'CAIRN (BRONZE AGE)', 'burial'],
  ['site', 'LONG CIST (EARLY MEDIEVAL)', 'burial'],
  // Industry
  ['mill', '', 'industry'],
  ['mine', '', 'industry'],
  ['site', 'LIME KILN (19TH CENTURY)', 'industry'],
  ['site', 'QUARRY (POST MEDIEVAL)', 'industry'],
  // Mixed records stay with their main thing: the church
  ['church', 'BURIAL GROUND (MEDIEVAL), CHAPEL (MEDIEVAL)', 'religious'],
  ['church', 'church · church building · former hospital', 'religious'],
  ['church', 'CHAPEL (MEDIEVAL), HOSPITAL (MEDIEVAL)', 'religious'],
  ['church', 'Kirkested', 'religious'],
  ['monastery', 'Religious house - Knights Hospitallers', 'religious'],
  ['church', 'pokopališka kapela, sv. Lazar', 'religious'],
  ['monastery', 'ABBEY (MEDIEVAL)', 'religious'],
  // Words that only look like the new groups
  ['site', 'CLEARANCE CAIRN (PERIOD UNASSIGNED)', 'archaeology'],
  ['site', 'CAIRNFIELD (PERIOD UNASSIGNED)', 'archaeology'],
  ['site', 'GRAVEL', 'archaeology'],
  ['monastery', 'Cistercian abbey', 'religious'],
  ['building', 'cmentarz przyszpitalny', 'burial'],
  // Country houses filed as castles; castles later made into country houses stay castles
  ['castle', 'dwór · XVI - XVIII', 'archaeology'],
  ['castle', 'COUNTRY HOUSE (19TH CENTURY), TOWER HOUSE (MEDIEVAL)', 'castle'],
  ['castle', 'castle ruin', 'castle'],
  ['fortification', 'ringfort - rath', 'castle'],
];

describe('the master list of site types', () => {
  it.each(CASES)('%s “%s” is drawn as %s', (k, st, group) => {
    expect(siteGroup({ k, st })).toBe(group);
  });
  it('the map expression gives the same group as the list, in st or the private pack’s ty', () => {
    for (const [k, st, group] of CASES) {
      expect(exprGroup({ k, st })).toBe(group);
      expect(exprGroup({ k, ty: st })).toBe(group);
    }
  });
  it('only the type is read, never the place name: a village called Millton stays a settlement', () => {
    expect(siteGroup({ k: 'settlement', n: 'Millton', st: 'village' })).toBeUndefined();
    expect(exprGroup({ k: 'settlement', n: 'Millton', st: 'village' })).toBe('');
    expect(siteGroup({ k: 'site', n: 'Hospital Farm', st: 'FARMSTEAD' })).toBe('archaeology');
  });
});

describe('each group is its own map layer', () => {
  const LAYER: Record<string, string> = { religious: 'religious-houses', castle: 'castles', archaeology: 'medieval-archaeology', care: 'care-houses', learning: 'learning', burial: 'burial-sites', industry: 'industry-sites' };
  it('a record is drawn in exactly the layer of its group', () => {
    for (const [k, st, group] of CASES) {
      for (const [g, id] of Object.entries(LAYER)) expect(inLayer(id, { k, st })).toBe(g === group);
    }
  });
  it('the new layers credit the datasets they draw from', () => {
    for (const id of ['care-houses', 'learning', 'burial-sites', 'industry-sites']) {
      expect(LAYERS.find((l) => l.id === id)!.datasets).toEqual(expect.arrayContaining(['canmore', 'irlsmr', 'wikidata']));
    }
  });
  it('care and learning are on by default; the large burial and industry groups are off, as archaeology was', () => {
    expect(DEFAULT_LAYERS).toEqual(expect.arrayContaining(['care-houses', 'learning']));
    expect(DEFAULT_LAYERS).not.toContain('burial-sites');
    expect(DEFAULT_LAYERS).not.toContain('industry-sites');
  });
});
