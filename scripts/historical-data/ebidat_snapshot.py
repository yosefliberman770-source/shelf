#!/usr/bin/env python3
"""Snapshot EBIDAT, the castle database of the European Castle Institute (Deutsche Burgenvereinigung), into the vault.

For every castle id, two pages are saved unchanged: the overview (name, history, and the map link with its
coordinates) and the main-data page (state, type, classification, function, dating begin/end, preservation).

  data/historical/raw/ebidat/original/pages-NN.jsonl.gz   one line per id: {"id", "main", "data"}

Ids are walked from 1 until 300 consecutive ids are empty. Four requests at a time, with retries.

  python3 scripts/historical-data/ebidat_snapshot.py
"""
import gzip
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from fetch import MANIFEST, RAW, load, record, save  # noqa: E402

BASE = 'https://www.ebidat.de/cgi-bin/ebidat.pl?id={}'
DATA = 'https://www.ebidat.de/cgi-bin/ebidat.pl?m=h&id={}'
OUT = os.path.join(RAW, 'ebidat', 'original')
CHUNK = 1000


def fetch(url):
    for attempt in range(4):
        r = subprocess.run(['curl', '-sSL', '-m', '60', url], capture_output=True)
        if r.returncode == 0 and len(r.stdout) > 500:
            return r.stdout.decode('latin-1')
        time.sleep(2 ** attempt)
    return None


def one(i):
    main = fetch(BASE.format(i))
    if not main or 'maps/?q=,' in main or 'maps/?q=' not in main:
        return i, None
    return i, {'id': i, 'main': main, 'data': fetch(DATA.format(i))}


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = load(MANIFEST, {})
    start, empty = 1, 0
    with ThreadPoolExecutor(4) as pool:
        while empty < 300:
            ids = range(start, start + CHUNK)
            dest = os.path.join(OUT, f'pages-{start // CHUNK:02d}.jsonl.gz')
            if os.path.exists(dest) and os.path.getsize(dest) > 1000:  # resume: this chunk was saved by an earlier run
                empty = 0
                start += CHUNK
                continue
            got = 0
            with gzip.open(dest, 'wt', encoding='utf-8') as f:
                for i, page in pool.map(one, ids):
                    if page:
                        f.write(json.dumps(page, ensure_ascii=False) + '\n')
                        got += 1
                        empty = 0
                    else:
                        empty += 1
            print(f'ids {start}–{start + CHUNK - 1}: {got}', flush=True)
            if got:
                manifest[os.path.relpath(dest, RAW)] = record(BASE.format(f'{start}..{start + CHUNK - 1}'), dest, None)
            else:
                os.remove(dest)
            start += CHUNK
    save(manifest)


if __name__ == '__main__':
    main()
