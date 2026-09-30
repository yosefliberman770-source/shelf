// The private data pack: datasets Shelf may use privately but must not republish reach the app only through a file
// the owner loads on their device — never through the public site. These tests build a pack in memory in the same
// format scripts/atlas-build/private_pack.py writes, and check that the app reads it and that nothing private is public.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LAYERS, SOURCE_SPECS, type LayerCtx } from './catalog';
import { assembleParts, closePrivateData, openPrivateData, privateHas, privateJSON, privateTileSource, readHeader } from './privateData';

const ROOT = join(__dirname, '../..');
const enc = new TextEncoder();

/** A pack with the given files, laid out exactly as private_pack.py does. */
function pack(files: Record<string, Uint8Array | string>, datasets = [{ id: 'dicotopo', name: 'DicoTopo', records: 1, licence: 'CC BY-NC-ND' }]): Blob {
  const parts = Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v] as const);
  let off = 0;
  const index: Record<string, [number, number]> = {};
  for (const [k, v] of parts) { index[k] = [off, v.length]; off += v.length; }
  const header = enc.encode(JSON.stringify({ version: 1, built: '2026-10-01', datasets, files: index }));
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, header.length, true);
  return new Blob([enc.encode('SHELFPK1'), n, header, ...parts.map(([, v]) => v)] as BlobPart[]);
}
const ctx = { year: 1300, base: '/atlas/', eventWindow: 25, showUndated: false } as LayerCtx;

afterEach(() => closePrivateData());

describe('private data pack', () => {
  it('reads the header and serves JSON files and tile byte ranges from the stored file', async () => {
    const tile = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await openPrivateData(pack({ 'places/c/5_46.json': '[["dicotopo","P1","Aisne",4.8,46.3,1,"settlement",946,null,0,[],[],[],{"k":"settlement"}]]', 'tiles/private-sites.pmtiles': tile }));
    expect(privateHas('tiles/private-sites.pmtiles')).toBe(true);
    const rows = await privateJSON<unknown[][]>('places/c/5_46.json');
    expect(rows?.[0]?.[2]).toBe('Aisne');
    const got = new Uint8Array((await privateTileSource('private-sites.pmtiles').getBytes(2, 3)).data);
    expect([...got]).toEqual([3, 4, 5]);
    expect(await privateJSON('places/c/0_0.json')).toBeNull();
  });
  it('a pack sent in parts opens once the parts are joined in order', async () => {
    const whole = pack({ 'places/c/5_46.json': '[["dicotopo","P1","Aisne",4.8,46.3,1,"settlement",946,null,0,[],[],[],{}]]' });
    const bytes = new Uint8Array(await whole.arrayBuffer());
    const cut = [0, 7, 40, bytes.length];
    const parts = cut.slice(1).map((end, i) => new Blob([bytes.slice(cut[i], end)]));
    await openPrivateData(new Blob(parts));
    expect((await privateJSON<unknown[][]>('places/c/5_46.json'))?.[0]?.[2]).toBe('Aisne');
  });
  it('parts picked in any order, with names the phone changed, are put back together; a missing part is reported', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i++) files[`places/c/${i}_0.json`] = JSON.stringify([['dicotopo', `P${i}`, `Place ${i}`, i, 0, 1, 'settlement', 900 + i, null, 0, [], [], [], {}]]);
    const bytes = new Uint8Array(await pack(files).arrayBuffer());
    const size = Math.ceil(bytes.length / 3);
    const named = (i: number, name: string) => Object.assign(new Blob([bytes.slice(i * size, (i + 1) * size)]), { name });
    const [a, b, c] = [named(0, 'IMG_0003.bin'), named(1, 'download (1)'), named(2, 'download')];
    const whole = await assembleParts([c, b, a]);
    expect(whole.state).toBe('complete');
    if (whole.state === 'complete') {
      await openPrivateData(whole.blob);
      expect((await privateJSON<unknown[][]>('places/c/39_0.json'))?.[0]?.[2]).toBe('Place 39');
    }
    const part = await assembleParts([b, a]);
    expect(part.state).toBe('incomplete');
    expect((await assembleParts([b, c])).state).toBe('needFirst');  // first part not added yet
    expect((await assembleParts([a, b, c, b])).state).toBe('error');  // a part twice
  });
  it('refuses a file that is not a Shelf pack', async () => {
    await expect(readHeader(new Blob(['PK\u0003\u0004 not a pack at all']))).rejects.toThrow(/not a Shelf private data file/);
  });
  it('layers that need private data are unavailable without the pack and switch on with it — no build flag involved', async () => {
    const rural = LAYERS.find((l) => l.id === 'rural-settlement')!;
    const castles = LAYERS.find((l) => l.id === 'castles')!;
    expect(rural.unavailable).toBeTruthy();
    expect(castles.sources).toEqual(['medieval-sites']);
    await openPrivateData(pack({ 'tiles/rural-settlement.pmtiles': new Uint8Array(8), 'tiles/private-sites.pmtiles': new Uint8Array(8) }));
    expect(rural.unavailable).toBeUndefined();
    expect(castles.sources).toContain('private-sites');
    expect(castles.specs(ctx).some((s) => 'source' in s && s.source === 'private-sites')).toBe(true);
    // Private tiles are read from the pack on the device, never requested from the website.
    expect(String((SOURCE_SPECS['private-sites'](ctx) as { url: string }).url)).toBe('pmtiles://shelf-private/private-sites.pmtiles');
  });
});

describe('nothing private reaches the public site', () => {
  const PRIVATE_SOURCES = ['tib', 'mfairs', 'afontium', 'ran', 'dicotopo', 'raa', 'ebidat', 'darmc', 'dkff'];
  it('the public place index holds no record of a private dataset', () => {
    const dir = join(ROOT, 'public/world/places/c');
    const srcs = new Set(readdirSync(dir).flatMap((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown[][]).map((r) => r[0] as string)));
    for (const s of PRIVATE_SOURCES) expect(srcs.has(s)).toBe(false);
  });
  it('no private tiles are in public/, and the pack folder is git-ignored', () => {
    expect(existsSync(join(ROOT, 'public/world/tiles/private-sites.pmtiles'))).toBe(false);
    expect(existsSync(join(ROOT, 'public/world/tiles/local-sites.pmtiles'))).toBe(false);
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toMatch(/^data\/private-pack\/$/m);
  });
  it('a pack built by private_pack.py, when present, opens in the app', async () => {
    const p = join(ROOT, 'data/private-pack/shelf-private-data.pack');
    if (!existsSync(p)) return; // built only on the owner's machine
    const h = await openPrivateData(new Blob([readFileSync(p)]));
    expect(h.datasets.length).toBeGreaterThan(0);
    expect(Object.keys(h.files).some((f) => f.startsWith('places/c/'))).toBe(true);
  });
});
