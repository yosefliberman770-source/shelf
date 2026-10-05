// The private data pack: datasets Shelf may use privately but must not republish reach the app only through a file
// the owner loads on their device — never through the public site. These tests build a pack in memory in the same
// format scripts/atlas-build/private_pack.py writes, and check that the app reads it and that nothing private is public.
import { SPEC_DATASETS } from './spec-datasets';
import 'fake-indexeddb/auto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LAYERS, SOURCE_SPECS, type LayerCtx } from './catalog';
import { assembleParts, closePrivateData, installPrivateData, loadPrivateData, openPrivateData, PrivateDataError, privateHas, privateHeader, privateJSON, privateTileSource, readHeader, removePrivateData } from './privateData';

const ROOT = join(__dirname, '../..');
const enc = new TextEncoder();

/** CRC-32 as Python's zlib.crc32 computes it (private_pack.py writes it into the header). */
function crc32(bytes: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const b of bytes) for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
/** A pack with the given files, laid out exactly as private_pack.py does. */
function pack(files: Record<string, Uint8Array | string>, datasets = [{ id: 'dicotopo', name: 'DicoTopo', records: 1, licence: 'CC BY-NC-ND' }], opts: { built?: string; version?: number; crc?: boolean } = {}): Blob {
  const parts = Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v] as const);
  let off = 0;
  const index: Record<string, [number, number]> = {};
  for (const [k, v] of parts) { index[k] = [off, v.length]; off += v.length; }
  const header = enc.encode(JSON.stringify({ version: opts.version ?? 1, built: opts.built ?? '2026-10-01', datasets, files: index,
    ...(opts.crc === false ? {} : { crc32: crc32(parts.map(([, v]) => v)) }) }));
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
    expect(castles.sources).toEqual(['medieval-sites', 'register-sites', 'spec-sites']);
    await openPrivateData(pack({ 'tiles/rural-settlement.pmtiles': new Uint8Array(8), 'tiles/private-sites.pmtiles': new Uint8Array(8) }));
    expect(rural.unavailable).toBeUndefined();
    expect(castles.sources).toContain('private-sites');
    expect(castles.specs(ctx).some((s) => 'source' in s && s.source === 'private-sites')).toBe(true);
    // Private tiles are read from the pack on the device, never requested from the website.
    expect(String((SOURCE_SPECS['private-sites'](ctx) as { url: string }).url)).toBe('pmtiles://shelf-private/private-sites.pmtiles');
  });
});

describe('installing a pack on the device', () => {
  const places = (name: string) => ({ 'places/c/5_46.json': JSON.stringify([['dicotopo', 'P1', name, 4.8, 46.3, 1, 'settlement', 946, null, 0, [], [], [], {}]]), 'tiles/private-sites.pmtiles': new Uint8Array(4096).fill(7) });
  afterEach(async () => { await removePrivateData(); });

  it('survives a restart: stored, then read back from the device', async () => {
    await installPrivateData(pack(places('Aisne')));
    closePrivateData(); // what a page reload does to memory
    expect((await loadPrivateData())?.built).toBe('2026-10-01');
    expect((await privateJSON<unknown[][]>('places/c/5_46.json'))?.[0]?.[2]).toBe('Aisne');
    expect(new Uint8Array((await privateTileSource('private-sites.pmtiles').getBytes(4000, 10)).data)).toEqual(new Uint8Array(10).fill(7));
  });
  it('a damaged part is refused by its checksum, and the pack already on the device stays', async () => {
    await installPrivateData(pack(places('Aisne')));
    const bytes = new Uint8Array(await pack(places('Somme'), undefined, { built: '2026-10-02' }).arrayBuffer());
    bytes[bytes.length - 100] ^= 0xff; // one flipped byte inside the tiles
    await expect(installPrivateData(new Blob([bytes]))).rejects.toMatchObject({ code: 'damaged' });
    closePrivateData();
    expect((await loadPrivateData())?.built).toBe('2026-10-01');
    expect((await privateJSON<unknown[][]>('places/c/5_46.json'))?.[0]?.[2]).toBe('Aisne');
  });
  it('an incomplete file is refused before anything is stored', async () => {
    const bytes = new Uint8Array(await pack(places('Aisne')).arrayBuffer());
    await expect(installPrivateData(new Blob([bytes.slice(0, bytes.length - 10)]))).rejects.toMatchObject({ code: 'size' });
    closePrivateData();
    expect(await loadPrivateData()).toBeNull();
  });
  it('an older pack does not silently replace a newer one; the owner can still choose it', async () => {
    await installPrivateData(pack(places('New'), undefined, { built: '2026-10-05' }));
    const old = pack(places('Old'), undefined, { built: '2026-09-01' });
    const e = await installPrivateData(old).catch((x) => x);
    expect(e).toBeInstanceOf(PrivateDataError);
    expect(e.code).toBe('older');
    expect(privateHeader()?.built).toBe('2026-10-05');
    await installPrivateData(old, { allowOlder: true });
    expect(privateHeader()?.built).toBe('2026-09-01');
  });
  it('a pack from a newer format is refused with a plain message', async () => {
    await expect(installPrivateData(pack(places('X'), undefined, { version: 2 }))).rejects.toThrow(/newer version of Shelf/);
  });
  it('packs built before checksums were added still install', async () => {
    await installPrivateData(pack(places('Aisne'), undefined, { crc: false }));
    expect(privateHeader()?.crc32).toBeUndefined();
  });
  it('parts in any order → one pack → installed → private tiles read by byte range', async () => {
    const bytes = new Uint8Array(await pack(places('Aisne')).arrayBuffer());
    const third = Math.ceil(bytes.length / 3);
    const parts = [2, 0, 1].map((i) => Object.assign(new Blob([bytes.slice(i * third, (i + 1) * third)]), { name: `download (${i})` }));
    const r = await assembleParts(parts);
    expect(r.state).toBe('complete');
    if (r.state !== 'complete') return;
    await installPrivateData(r.blob);
    closePrivateData();
    await loadPrivateData();
    expect(new Uint8Array((await privateTileSource('private-sites.pmtiles').getBytes(0, 4)).data)).toEqual(new Uint8Array(4).fill(7));
  });
});

describe('nothing private reaches the public site', () => {
  const PRIVATE_SOURCES = ['tib', 'mfairs', 'afontium', 'ran', 'dicotopo', 'raa', 'ebidat', 'darmc', 'dkff', 'ariadne', 'latin1772', 'amcr',
    ...Object.entries(SPEC_DATASETS).filter(([, d]) => !d.public).map(([k]) => k)];
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
  // What git actually tracks — not what .gitignore is meant to keep out.
  const tracked = (() => { try { return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 }).split('\n'); } catch { return null; } })();
  it('every dataset that reaches the app only through the private pack is local-only, and none of its source files is in git', () => {
    const vault = JSON.parse(readFileSync(join(ROOT, 'data/historical/audit/vault-audit.json'), 'utf8')) as Record<string, { status: string }>;
    const sources = JSON.parse(readFileSync(join(ROOT, 'data/historical/sources.json'), 'utf8')) as { id: string; local_only?: boolean }[];
    const privateOnly = Object.entries(vault).filter(([, v]) => v.status.includes('private data pack')).map(([k]) => k);
    expect(privateOnly).toContain('atlas-rural-settlement');
    for (const id of privateOnly) expect(sources.find((x) => x.id === id)?.local_only, id).toBe(true);
    if (!tracked) return; // no git here
    const leaked = tracked.filter((f) => privateOnly.some((id) => f.startsWith(`data/historical/raw/${id}/original/`)));
    expect(leaked).toEqual([]);
  });
  it('the committed audit reports name no private record (only counts)', () => {
    const txt = readFileSync(join(ROOT, 'data/historical/audit/data-quality.json'), 'utf8');
    expect(txt.match(new RegExp(`"(${PRIVATE_SOURCES.join('|')}):[^"]+"`, 'g')) ?? []).toEqual([]);
  });
  it('git tracks no private pack, private tiles or private build output', () => {
    if (!tracked) return;
    expect(tracked.filter((f) => /(^|\/)data\/private-pack\/|\.pack$|private-(sites|lines)\.pmtiles$|(rural-settlement|local-sites)\.pmtiles$/.test(f))).toEqual([]);
  });
  it('a production build, when present, ships nothing private', () => {
    const dist = join(ROOT, 'dist');
    // The deploy workflow runs this again after `vite build` with SHELF_REQUIRE_BUILD=1, so the
    // files actually published are checked, not skipped for want of a build.
    if (!existsSync(join(dist, 'index.html'))) {
      expect(process.env.SHELF_REQUIRE_BUILD, 'SHELF_REQUIRE_BUILD is set but dist/ has no build').toBeFalsy();
      return;
    }
    const files = (function walk(d: string): string[] {
      return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name).slice(dist.length + 1)]));
    })(dist);
    expect(files.filter((f) => /(^|\/)private-pack\/|\.pack$|private-(sites|lines|units)\.pmtiles$|(rural-settlement|local-sites)\.pmtiles$/.test(f))).toEqual([]);
    const tiles = existsSync(join(dist, 'world/tiles')) ? readdirSync(join(dist, 'world/tiles')) : [];
    expect(tiles.filter((f) => /private|rural-settlement|local-sites/.test(f))).toEqual([]);
    const cells = join(dist, 'world/places/c');
    const srcs = new Set(existsSync(cells) ? readdirSync(cells).flatMap((f) => (JSON.parse(readFileSync(join(cells, f), 'utf8')) as unknown[][]).map((r) => r[0] as string)) : []);
    for (const s of PRIVATE_SOURCES) expect(srcs.has(s), s).toBe(false);
  });
  it('a pack built by private_pack.py, when present, opens in the app', async () => {
    const p = join(ROOT, 'data/private-pack/shelf-private-data.pack');
    if (!existsSync(p)) return; // built only on the owner's machine
    const h = await openPrivateData(new Blob([readFileSync(p)]));
    expect(h.datasets.length).toBeGreaterThan(0);
    // Its checksum (Python's zlib.crc32) is the one the app computes while installing it.
    if (h.crc32 !== undefined) {
      closePrivateData();
      await installPrivateData(new Blob([readFileSync(p)]), { allowOlder: true });
      expect(privateHeader()?.crc32).toBe(h.crc32);
      await removePrivateData();
    }
    expect(Object.keys(h.files).some((f) => f.startsWith('places/c/'))).toBe(true);
  });
});
