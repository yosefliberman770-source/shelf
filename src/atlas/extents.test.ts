// Imperial extent snapshots: one label per outline, and an outline from another
// year says so instead of passing for the border in the year shown.
import { readFileSync } from 'node:fs';
import { featureFilter, type FilterSpecification } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { AWMC_EXTENTS, extentsFor, type LayerCtx, LAYERS, SOURCE_SPECS } from './catalog';

const ctx = (year: number): LayerCtx => ({ base: '/atlas/', year, eventWindow: 25 });
const territories = LAYERS.find((l) => l.id === 'territories')!;

describe('imperial extent snapshots', () => {
  it('has one label point for every extent outline in the data, and no others', () => {
    const data = JSON.parse(readFileSync('public/atlas/awmc-snapshots.json', 'utf8')) as { features: { properties: { n: string; k: string } }[] };
    const names = data.features.filter((f) => f.properties.k === 'extent').map((f) => f.properties.n).sort();
    expect(AWMC_EXTENTS.map((e) => e.n).sort()).toEqual(names);
    const labels = SOURCE_SPECS['awmc-snapshot-labels'](ctx(117)) as { data: { features: unknown[] } };
    expect(labels.data.features).toHaveLength(names.length);
  });

  it('labels the outline from the label points, not from every piece of the outline', () => {
    const label = territories.specs(ctx(117)).find((s) => s.id === 'territories-label')!;
    expect((label as { source: string }).source).toBe('awmc-snapshot-labels');
  });

  it('at 68 CE shows the 117 CE outline and says it is 49 years later', () => {
    const shown = extentsFor(68);
    expect(shown.map((e) => e.n)).toEqual(['Roman Empire at its greatest extent, 117 CE']);
    expect(shown[0].label).toContain('outline from 49 years after 68 CE');
  });

  it('adds no note in the year an outline depicts', () => {
    expect(extentsFor(117)).toEqual([{ n: 'Roman Empire at its greatest extent, 117 CE', label: 'Roman Empire at its greatest extent, 117 CE' }]);
  });

  it('draws only the nearest Roman outline where two are within 50 years', () => {
    expect(extentsFor(160).map((e) => e.n)).toEqual(['Roman Empire, 200 CE']);
    expect(extentsFor(150).map((e) => e.n)).toEqual(['Roman Empire at its greatest extent, 117 CE']);
  });

  it('counts years across the BCE/CE boundary without a year 0', () => {
    // 4 BCE → 10 CE is 13 years, not 14.
    expect(extentsFor(10).find((e) => e.n.startsWith('Herod'))?.label).toContain('outline from 13 years before 10 CE');
    expect(extentsFor(-60)[0].label).toBe('Roman territory, 60 BCE');
  });

  it('at 68 CE the map draws one outline and one label (filters run on the real data)', () => {
    const data = JSON.parse(readFileSync('public/atlas/awmc-snapshots.json', 'utf8')) as { features: { type: string; properties: Record<string, unknown>; geometry: { type: string } }[] };
    const specs = territories.specs(ctx(68)) as { id: string; filter: FilterSpecification }[];
    const count = (id: string, feats: { properties: Record<string, unknown>; geometry: { type: string } }[]) => {
      const f = featureFilter(specs.find((s) => s.id === id)!.filter);
      return feats.filter((x) => f.filter({ zoom: 4 }, { type: x.geometry.type === 'Point' ? 1 : 3, properties: x.properties } as never)).length;
    };
    expect(count('territories-fill', data.features)).toBe(1);
    const labels = (SOURCE_SPECS['awmc-snapshot-labels'](ctx(68)) as { data: { features: { properties: Record<string, unknown>; geometry: { type: string } }[] } }).data.features;
    expect(count('territories-label', labels)).toBe(1);
  });

  it('shows nothing far from every snapshot', () => {
    expect(extentsFor(800)).toEqual([]);
    expect(territories.specs(ctx(800)).length).toBeGreaterThan(0); // layers stay valid with an empty list
  });
});
