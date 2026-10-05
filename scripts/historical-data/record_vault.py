#!/usr/bin/env python3
"""Record every file in the raw vault that data/historical/manifest.json does not list yet.

Each gets its size, SHA-256 and a date, so the build can check it has not changed. The URL comes from
data/historical/sources.json when that lists the file; otherwise it is left empty and the entry says how it was
recorded. Files already recorded are not touched (a changed file is reported by scripts/atlas-build/inputs.py,
never overwritten here).

  python3 scripts/historical-data/record_vault.py          add the missing entries
  python3 scripts/historical-data/record_vault.py --check  list them only
"""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'atlas-build'))
import inputs  # noqa: E402
from fetch import save  # noqa: E402  (merges under the same lock as downloads)


def urls_from_sources():
    out = {}
    for s in json.load(open(os.path.join(inputs.HIST, 'sources.json'), encoding='utf-8')):
        for f in s.get('files', []):
            if f.get('url') and f.get('path'):
                out[f"{s['id']}/{f['path']}"] = f['url']
    return out


def main():
    manifest = json.load(open(inputs.VAULT_MANIFEST, encoding='utf-8'))
    urls = urls_from_sources()
    new = {}
    for rel in inputs.vault_files():
        if rel in manifest:
            continue
        p = os.path.join(inputs.RAW, rel)
        new[rel] = {'url': urls.get(rel), 'bytes': os.path.getsize(p), 'sha256': inputs.sha256(p),
                    'downloaded': datetime.date.fromtimestamp(os.path.getmtime(p)).isoformat(),
                    'recorded': 'after the fact: date is the file date; checksum from the file as found'}
    inputs.save_hashes()
    for rel in sorted(new):
        print(rel)
    print(f'{len(new)} unrecorded file(s)')
    if new and '--check' not in sys.argv:
        save(new)
        print('added to', os.path.relpath(inputs.VAULT_MANIFEST, inputs.ROOT))


if __name__ == '__main__':
    main()
