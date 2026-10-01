// The built tile archives, decoded as the app decodes them, with the app's own layer filters.
// Catches data that is present but never drawn (a placeholder date that no year satisfies) and dates no year can have.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { PMTiles, type Source } from 'pmtiles';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { LAYERS, type LayerCtx } from './catalog';

const TILES = join(__dirname, '../../public/world/tiles');
const fileSource = (path: string): Source => {
  const buf = readFileSync(path);
  return { getKey: () => path, getBytes: async (offset, length) => ({ data: buf.buffer.slice(buf.byteOffset + offset, buf.byteOffset + offset + length) as ArrayBuffer }) };
};

/** Every feature's properties in the archive's tiles at zoom z (features cut across tiles are counted once by id). */
async function features(file: string, z: number): Promise<Record<string, unknown>[]> {
  const pm = new PMTiles(fileSource(join(TILES, file)));
  const h = await pm.getHeader();
  const n = 1 << z;
  const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const lat2y = (lat: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  const out = new Map<string, Record<string, unknown>>();
  for (let x = lon2x(h.minLon); x <= lon2x(h.maxLon); x++) {
    for (let y = lat2y(h.maxLat); y <= lat2y(h.minLat); y++) {
      const t = await pm.getZxy(z, x, y);
      if (!t?.data) continue;
      const raw = new Uint8Array(t.data);
      const vt = new VectorTile(new Pbf(raw[0] === 0x1f ? gunzipSync(raw) : raw));
      for (const name of Object.keys(vt.layers)) {
        const layer = vt.layers[name];
        for (let i = 0; i < layer.length; i++) {
          const p = layer.feature(i).properties as Record<string, unknown>;
          out.set(String(p.i ?? `${z}/${x}/${y}/${name}/${i}`), p);
        }
      }
    }
  }
  return [...out.values()];
}

describe('the built tiles', () => {
  it('no public tile carries a year 0 or an end before its start', async () => {
    for (const file of readdirSync(TILES).filter((f) => f.endsWith('.pmtiles') && !/rural-settlement|local-sites/.test(f))) {
      const bad = (await features(file, 4)).filter((p) => [p.f, p.t, p.ef, p.et].includes(0)
        || (typeof p.f === 'number' && typeof p.t === 'number' && p.t < p.f)
        || (typeof p.ef === 'number' && typeof p.et === 'number' && p.et < p.ef));
      expect(bad.length, file).toBe(0);
    }
  });
  it('Roman roads are drawn at 100 CE (an unknown date stored as 0 once hid nine in ten of them)', async () => {
    const roads = await features('itinere.pmtiles', 5);
    const drawn = (year: number) => {
      const spec = LAYERS.find((l) => l.id === 'roads-roman')!.specs({ year, base: '/atlas/' } as LayerCtx).find((s) => s.id === 'roads-roman-land') as { filter: unknown };
      const f = featureFilter(spec.filter as never);
      return roads.filter((p) => f.filter({ zoom: 5 } as never, { type: 2, properties: p } as never));
    };
    const at100 = drawn(100);
    expect(roads.length).toBeGreaterThan(1000);
    expect(at100.length / roads.length).toBeGreaterThan(0.5);
    // The date changes what is drawn: roads recorded only for a later period are not drawn at 100 CE.
    expect(drawn(-500).length).toBeLessThan(at100.length);
  });
});
