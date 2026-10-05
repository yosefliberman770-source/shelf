// Stage 3 (RM-14): how exact a position is, and how many records share it, is visible — not one confident dot.
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { positionNote } from './AtlasMap';
import { LAYERS, type LayerCtx, STACK_LABEL_ZOOM } from './catalog';
import { combineEvidence } from '../world/placeEvidence';
import type { GazPlace } from './gazetteer';

const ctx = (year: number): LayerCtx => ({ year, showUndated: false } as LayerCtx);

describe('stacks of records on one point (A11-008, X-24, A10-005)', () => {
  const specs = LAYERS.find((l) => l.id === 'medieval-archaeology')?.specs(ctx(1300)) ?? [];
  it('a stacked point is counted on the map from zoom 8', () => {
    const stack = specs.find((s) => /-stack/.test(s.id)) as { filter: unknown; minzoom: number; layout: Record<string, unknown> } | undefined;
    expect(stack).toBeDefined();
    expect(stack!.minzoom).toBe(STACK_LABEL_ZOOM);
    const show = (props: Record<string, unknown>) => featureFilter(stack!.filter as never).filter({ zoom: 9 } as never, { type: 1, properties: props } as never);
    expect(show({ k: 'site', f: 1200, sk: 12 })).toBe(true);
    expect(show({ k: 'site', f: 1200 })).toBe(false);
  });

  it('an approximate position is drawn blurred', () => {
    const pt = specs.find((s) => /-pt/.test(s.id)) as { paint: Record<string, unknown> };
    expect(JSON.stringify(pt.paint['circle-blur'])).toContain('"u"');
  });

  it('the popup says what a shared or rough position means', () => {
    expect(positionNote({ sk: 1953 })).toMatch(/1,953 records in the source share this exact position/);
    expect(positionNote({ u: 1 })).toMatch(/only approximately/);
    expect(positionNote({})).toBeUndefined();
  });

  it('the published site tiles carry the stack count', () => {
    const fields = JSON.parse(execFileSync('python3', ['-c', [
      'import json,sys', 'from pmtiles.reader import MmapSource, Reader',
      'out={}',
      'for n in ("medieval-sites","spec-sites","registers"):',
      '  fh=open("public/world/tiles/%s.pmtiles" % n,"rb"); out[n]=Reader(MmapSource(fh)).metadata()["vector_layers"][0]["fields"]',
      'print(json.dumps(out))'].join('\n')], { cwd: join(__dirname, '../..'), encoding: 'utf8' }));
    for (const n of ['medieval-sites', 'spec-sites', 'registers']) expect(fields[n].sk, n).toBe('Number');
  });
});

describe('which source’s position is shown does not depend on the order they were read (A9-015)', () => {
  const place = (key: string, lon: number, precise: boolean): GazPlace => ({
    key, gazetteer: key.split(':')[0], id: key.split(':')[1], title: 'Aquincum', lon, lat: 47.56, precise, types: [], names: [], partOf: [], related: [], uncertain: 0, url: '',
  } as unknown as GazPlace);
  const a = place('pleiades:1', 19.05, false);
  const b = place('wikidata:Q2', 19.2, true); // 11 km apart: one place, two positions
  it('the precise record decides, read in either order', () => {
    const one = combineEvidence({ written: 'Aquincum', local: [a, b], localSources: [] });
    const two = combineEvidence({ written: 'Aquincum', local: [b, a], localSources: [] });
    expect(one.clusters[0].lon).toBe(two.clusters[0].lon);
    expect(one.clusters[0].positionFrom).toBe(two.clusters[0].positionFrom);
  });
});
