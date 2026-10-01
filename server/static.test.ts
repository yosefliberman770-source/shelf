import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { inside, resolveStatic } from './static.ts';

// A build folder, a sibling whose name starts the same way, a secret next to them, and a link pointing out.
const base = mkdtempSync(path.join(tmpdir(), 'shelf-static-'));
const dist = path.join(base, 'dist');
beforeAll(() => {
  mkdirSync(path.join(dist, 'world', 'tiles'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html>');
  writeFileSync(path.join(dist, 'world', 'tiles', 'pleiades.pmtiles'), 'tiles');
  mkdirSync(path.join(base, 'dist-private'));
  writeFileSync(path.join(base, 'dist-private', 'secret.pack'), 'private');
  writeFileSync(path.join(base, 'package.json'), '{}');
  symlinkSync(path.join(base, 'dist-private'), path.join(dist, 'escape'));
});

describe('static files are served only from the build folder', () => {
  it('serves files inside it', async () => {
    expect(await resolveStatic(dist, '/world/tiles/pleiades.pmtiles')).toMatchObject({ exists: true });
    expect(await resolveStatic(dist, '/')).toMatchObject({ exists: true });
    expect(await resolveStatic(dist, '/reading/ebooks')).toMatchObject({ exists: false }); // → SPA fallback
  });
  it.each([
    '/../package.json',
    '/%2e%2e/package.json',
    '/..%2fpackage.json',
    '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/..\\package.json',
    '/../dist-private/secret.pack', // a sibling whose name starts like "dist": a string-prefix check let this through
  ])('%s never leaves it', async (p) => {
    const r = await resolveStatic(dist, p);
    if (r) expect(inside(dist, r.file)).toBe(true);
    expect(r?.exists ?? false).toBe(false);
  });
  it('refuses a symbolic link that points outside, an undecodable path and a NUL byte', async () => {
    expect(await resolveStatic(dist, '/escape/secret.pack')).toBeNull();
    expect(await resolveStatic(dist, '/%E0%A4%A')).toBeNull();
    expect(await resolveStatic(dist, '/index.html%00.png')).toBeNull();
  });
  it('compares paths, not string prefixes', () => {
    expect(inside('/srv/dist', '/srv/dist-private/x')).toBe(false);
    expect(inside('/srv/dist', '/srv/dist/x')).toBe(true);
    expect(inside('/srv/dist', '/srv/dist')).toBe(true);
  });
});
