#!/usr/bin/env python3
"""Audit the raw vault and what each dataset actually does in Shelf.

For every dataset in data/historical/sources.json (plus the query snapshots):
  raw files present · URL, size, SHA-256 and date recorded · checksum still matches ·
  SOURCE.md / LICENSE.md present · kept out of git when local-only ·
  processed by which script · rows in the public place index · tiles built · map layer.

Writes data/historical/audit/vault-audit.json and prints a table.

  python3 scripts/historical-data/audit_vault.py
"""
import hashlib
import json
import os
import re
import subprocess
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
HIST = os.path.join(ROOT, 'data', 'historical')
RAW = os.path.join(HIST, 'raw')

# dataset → (gazetteer id in the place index, tiles, processing script)
USE = {
    'pleiades': ('pleiades', ['pleiades.pmtiles'], 'atlas-build/build.py, world.py'),
    'viabundus': ('viabundus', ['viabundus-nodes.pmtiles', 'viabundus-edges.pmtiles'], 'atlas-build/world.py'),
    'al-thurayya': ('althurayya', ['thurayya-places.pmtiles', 'thurayya-routes.pmtiles'], 'atlas-build/world.py'),
    'itinere': (None, ['itinere.pmtiles'], 'atlas-build/world.py'),
    'domesday': (None, ['domesday.pmtiles'], 'atlas-build/england.py'),
    'gough-map': (None, ['gough.pmtiles'], 'atlas-build/england.py'),
    'inland-navigation': (None, ['navigation.pmtiles'], 'atlas-build/england.py'),
    'atlas-rural-settlement': (None, ['rural-settlement.pmtiles'], 'atlas-build/england.py (local builds only)'),
    'wikidata-medieval': ('wikidata', ['medieval-sites.pmtiles'], 'atlas-build/sites.py'),
    'germania-sacra': ('germaniasacra', ['medieval-sites.pmtiles', 'gs-dioceses.pmtiles'], 'atlas-build/sites.py'),
    'buringh-urban': ('buringh', ['towns.pmtiles'], 'atlas-build/sites.py'),
    'hced': (None, [], 'atlas-build/sites.py → public/atlas/hced-battles.json'),
    'princes-townspeople': ('hre', ['hre-towns.pmtiles'], 'atlas-build/regional.py'),
    'merimee': ('merimee', ['medieval-sites.pmtiles'], 'atlas-build/regional.py'),
    'finland-heritage': ('finreg', ['medieval-sites.pmtiles'], 'atlas-build/regional.py'),
    'western-bohemia-toponyms': ('wbohemia', ['medieval-sites.pmtiles'], 'atlas-build/regional.py'),
    'medieval-bridges': ('bridges1250', ['medieval-sites.pmtiles'], 'atlas-build/regional.py'),
    'tib-maps-of-power': (None, ['local-sites.pmtiles'], 'atlas-build/regional.py (local builds only)'),
    'atlas-fontium-poland': (None, ['local-sites.pmtiles'], 'atlas-build/regional.py (local builds only)'),
    'markets-fairs': (None, ['local-sites.pmtiles'], 'atlas-build/regional.py (local builds only)'),
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def main():
    sources = json.load(open(os.path.join(HIST, 'sources.json')))
    manifest = json.load(open(os.path.join(HIST, 'manifest.json')))
    tracked = set(subprocess.run(['git', 'ls-files', 'data/historical/raw'], cwd=ROOT, capture_output=True, text=True).stdout.split())
    rows = Counter()
    cdir = os.path.join(ROOT, 'public', 'world', 'places', 'c')
    for f in os.listdir(cdir):
        for r in json.load(open(os.path.join(cdir, f), encoding='utf-8')):
            rows[r[0]] += 1
    catalog = open(os.path.join(ROOT, 'src', 'atlas', 'catalog.ts'), encoding='utf-8').read()
    ids = sorted({d['id'] for d in sources} | {k.split('/')[0] for k in manifest} | set(os.listdir(RAW)))
    local_only = {d['id'] for d in sources if d.get('local_only')}
    out = {}
    for ds in ids:
        folder = os.path.join(RAW, ds)
        recs = {k: v for k, v in manifest.items() if k.startswith(ds + '/')}
        present = [k for k in recs if os.path.exists(os.path.join(RAW, k))]
        mism = [k for k in present if os.path.getsize(os.path.join(RAW, k)) < 300_000_000 and sha256(os.path.join(RAW, k)) != recs[k]['sha256']]
        gaz, tiles, script = USE.get(ds, (None, [], None))
        tiles_ok = [t for t in tiles if os.path.exists(os.path.join(ROOT, 'public', 'world', 'tiles', t))]
        if ds == 'hced' and os.path.exists(os.path.join(ROOT, 'public', 'atlas', 'hced-battles.json')):
            tiles_ok = ['atlas/hced-battles.json']
        leaked = [k for k in recs if ds in local_only and f'data/historical/raw/{k}' in tracked]
        out[ds] = {
            'filesRecorded': len(recs), 'filesPresent': len(present), 'checksumMismatch': mism,
            'allHaveUrlDateSha': all(v.get('url') and v.get('sha256') and v.get('downloaded') for v in recs.values()) if recs else False,
            'sourceMd': os.path.exists(os.path.join(folder, 'SOURCE.md')), 'licenseMd': os.path.exists(os.path.join(folder, 'LICENSE.md')),
            'localOnly': ds in local_only, 'localFilesInGit': leaked,
            'processedBy': script, 'placeIndexRows': rows.get(gaz, 0) if gaz else 0, 'tiles': tiles_ok,
            'layerInCatalog': bool(tiles_ok and any(re.search(re.escape(t.split('/')[-1]), catalog) for t in tiles_ok)),
        }
        o = out[ds]
        if ds == 'atlas-rural-settlement':
            o['localOnly'] = True  # handled by england.py / vite.config.ts
        o['status'] = ('integrated' if (o['placeIndexRows'] or o['tiles']) and not o['localOnly'] else
                       'integrated (local builds only)' if o['localOnly'] and o['tiles'] else
                       'raw only' if o['filesPresent'] else 'recorded, files not present here' if o['filesRecorded'] else 'metadata only')
    json.dump(out, open(os.path.join(HIST, 'audit', 'vault-audit.json'), 'w'), indent=1)
    write_doc_table(out)
    print(f"{'dataset':28} {'files':>7} {'sha':>4} {'docs':>5} {'rows':>7} {'status'}")
    for ds, o in out.items():
        print(f"{ds:28} {o['filesPresent']:>3}/{o['filesRecorded']:<3} {'ok' if o['allHaveUrlDateSha'] and not o['checksumMismatch'] else '—':>4} "
              f"{'ok' if o['sourceMd'] and o['licenseMd'] else '—':>5} {o['placeIndexRows']:>7} {o['status']}{' LEAK' if o['localFilesInGit'] else ''}")


def write_doc_table(out):
    """The integration table of docs/MEDIEVAL_EUROPE_DATA_AUDIT.md (between the VAULT markers)."""
    doc_path = os.path.join(ROOT, 'docs', 'MEDIEVAL_EUROPE_DATA_AUDIT.md')
    if not os.path.exists(doc_path):
        return
    doc = open(doc_path, encoding='utf-8').read()
    if '<!-- VAULT:START' not in doc:
        return
    ok = lambda b: '✓' if b else '✗'  # noqa: E731
    L = ['<!-- VAULT:START (generated by scripts/historical-data/audit_vault.py) -->', '',
         '| Dataset | Files present / recorded | URL, date, SHA-256 recorded; checksums match | SOURCE.md + LICENSE.md | Local-only (kept out of git) | Processed by | Place-index rows | Tiles | Status |',
         '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for ds, o in out.items():
        L.append(f"| {ds} | {o['filesPresent']}/{o['filesRecorded']} | {ok(o['allHaveUrlDateSha'] and not o['checksumMismatch']) if o['filesRecorded'] else '—'} | "
                 f"{ok(o['sourceMd'] and o['licenseMd'])} | {('yes' + (' — LEAKED INTO GIT' if o['localFilesInGit'] else '')) if o['localOnly'] else 'no'} | "
                 f"{o['processedBy'] or '—'} | {o['placeIndexRows'] or '—'} | {', '.join(o['tiles']) or '—'} | {o['status']} |")
    L += ['', '<!-- VAULT:END -->']
    doc = re.sub(r'<!-- VAULT:START.*?<!-- VAULT:END -->', lambda m: '\n'.join(L), doc, flags=re.S)
    open(doc_path, 'w', encoding='utf-8').write(doc)


if __name__ == '__main__':
    main()
