// The place index is written under the build's name key (Python, scripts/atlas-build/names.py)
// and looked up under the app's (normName/nameShard). Any difference makes a name unfindable.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nameShard, normName } from './gazetteer';

const ROOT = join(__dirname, '..', '..');
const python = (xs: string[]): [string, string][] =>
  JSON.parse(execFileSync('python3', [join(ROOT, 'scripts/atlas-build/names.py')], { input: JSON.stringify(xs), encoding: 'utf8', maxBuffer: 256e6 }));

const TRICKY = [
  'Lutétia', 'The Hague', 'THE  Wash', 'Saint-Étienne', 'Łódź', 'Århus', 'İstanbul', 'ΟΔΟΣ', 'ΚΑΣΤΡΟΣ ΜΕΓΑΣ', 'Ἀπολλωνία﻿', '﻿Φαληρικὸν τεῖχος',
  'Ober﻿dorf', 'a b', 'tab\tname', ' padded ', 'x y', 'ctrl\u001cchar', 'next\u0085line', 'O’Brien', "O'Brien", 'Москва', 'القاهرة', '北京', '',
  'the', 'theodosia', 'The Hague', 'ǅubrovnik', 'ẞtraße', 'Ⅻ', '１２３', 'ﬁnistère',
];

describe('build and app name keys agree', () => {
  it('on awkward spellings: accents, case, Greek final sigma, BOM and unusual spaces', () => {
    const py = python(TRICKY);
    TRICKY.forEach((x, i) => expect([x, ...py[i]]).toEqual([x, normName(x), nameShard(normName(x))]));
  });

  it('on every title in a sample of the real place index', () => {
    const dir = join(ROOT, 'public/world/places/c');
    const files = readdirSync(dir).sort();
    const sample = files.filter((_, i) => i % 25 === 0);
    const titles = [...new Set(sample.flatMap((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown[][]).map((r) => String(r[2] ?? ''))))];
    expect(titles.length).toBeGreaterThan(1000);
    const py = python(titles);
    const differ = titles.filter((t, i) => py[i][0] !== normName(t) || py[i][1] !== nameShard(normName(t)));
    expect(differ).toEqual([]);
  });
});
