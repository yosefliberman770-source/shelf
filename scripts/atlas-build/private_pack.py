#!/usr/bin/env python3
"""Assemble the private data pack: one file the owner loads into Shelf on their own device.

It holds the datasets Shelf may use privately but must not republish (no licence to republish found, or terms
that forbid it): their map tiles and their place-index files, built by sites.py / world.py into
data/private-pack/build/, plus the Atlas of Rural Settlement tiles built by england.py.

  data/private-pack/shelf-private-data.pack    (git-ignored; never deployed)

Format (read by src/atlas/privateData.ts):
  "SHELFPK1" · uint32 LE header length · header JSON · file bytes
  header = { version: 1, built, datasets: [{id, name, records, licence}], files: {path: [offset, length]}, crc32 }

  python3 scripts/atlas-build/private_pack.py
"""
import json
import os
import struct
import sys
import zlib
from collections import Counter
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
BUILD = os.path.join(ROOT, 'data', 'private-pack', 'build')
OUT = os.path.join(ROOT, 'data', 'private-pack', 'shelf-private-data.pack')
PART = 25 * 1000 * 1000  # bytes per part file
EXTRA_TILES = [os.path.join(ROOT, 'public', 'world', 'tiles', 'rural-settlement.pmtiles')]

# id → (name, licence as recorded in the vault). Names match src/atlas/gazetteer.ts.
DATASETS = {
    'tib': ('Tabula Imperii Byzantini — Maps of Power (ÖAW)', 'data licence not stated'),
    'mfairs': ('Letters, Markets and Fairs in England and Wales to 1516', 'not stated (SAS-Space: unspecified)'),
    'afontium': ('Atlas Fontium — Crown of Poland, 2nd half of the 16th c. (IH PAN)', 'not specified'),
    'ran': ('Repertoriul Arheologic Național — Romania (CIMEC)', 'OGL per data.gov.ro (not verified)'),
    'dicotopo': ('Dictionnaire topographique de la France (CTHS, École des chartes)', 'CC BY-NC-ND 3.0 FR'),
    'dkff': ('Fund og Fortidsminder — Denmark (Slots- og Kulturstyrelsen)', 'not stated'),
    'darmc': ('DARMC scholarly datasets (Harvard)', 'not stated'),
    'ebidat': ('EBIDAT castle database (Europäisches Burgeninstitut)', 'not stated'),
    'raa': ('Riksantikvarieämbetet — Swedish ancient remains', 'not verified'),
    'ruralsettlement': ('Atlas of Rural Settlement in England (Roberts & Wrathmell)', 'personal and business use; no republishing'),
}


def main():
    files = []
    for dirpath, _, names in os.walk(BUILD):
        for n in sorted(names):
            full = os.path.join(dirpath, n)
            files.append((os.path.relpath(full, BUILD).replace(os.sep, '/'), full))
    for t in EXTRA_TILES:
        if os.path.exists(t):
            files.append((f'tiles/{os.path.basename(t)}', t))
    if not files:
        sys.exit('Nothing to pack: run `python3 build.py world` first.')
    counts = Counter()
    for rel, full in files:
        if rel.startswith('places/c/'):
            for r in json.load(open(full, encoding='utf-8')):
                counts[r[0]] += 1
    if any(rel.endswith('rural-settlement.pmtiles') for rel, _ in files):
        counts['ruralsettlement'] = counts.get('ruralsettlement', 0)
    datasets = [{'id': k, 'name': DATASETS.get(k, (k, ''))[0], 'records': counts[k], 'licence': DATASETS.get(k, ('', 'not stated'))[1]}
                for k in DATASETS if k in counts]
    index, offset, crc = {}, 0, 0
    for rel, full in files:
        size = os.path.getsize(full)
        index[rel] = [offset, size]
        offset += size
        with open(full, 'rb') as f:
            for b in iter(lambda: f.read(1 << 20), b''):
                crc = zlib.crc32(b, crc)  # the app checks this while copying the pack, so a damaged part is refused
    header = json.dumps({'version': 1, 'built': date.today().isoformat(), 'datasets': datasets, 'files': index, 'crc32': crc},
                        ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as out:
        out.write(b'SHELFPK1')
        out.write(struct.pack('<I', len(header)))
        out.write(header)
        for _, full in files:
            with open(full, 'rb') as f:
                while True:
                    b = f.read(1 << 20)
                    if not b:
                        break
                    out.write(b)
    print(f'{OUT}: {os.path.getsize(OUT) / 1e6:.1f} MB, {len(files)} files')
    # Also in parts small enough to send to a phone; the app joins parts it is given together (by name order).
    for old in os.listdir(os.path.dirname(OUT)):
        if old.startswith('shelf-private-data.part'):
            os.remove(os.path.join(os.path.dirname(OUT), old))
    with open(OUT, 'rb') as f:
        n = 0
        while True:
            chunk = f.read(PART)
            if not chunk:
                break
            n += 1
            open(OUT.replace('.pack', f'.part{n}.pack'), 'wb').write(chunk)
    print(f'  split into {n} parts of at most {PART / 1e6:.0f} MB')
    for d in datasets:
        print(f"  {d['id']:16} {d['records']:>7}  {d['name']}")


if __name__ == '__main__':
    main()
