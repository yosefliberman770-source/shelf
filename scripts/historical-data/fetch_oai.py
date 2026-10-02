#!/usr/bin/env python3
"""Generic OAI-PMH harvester (many national heritage registers and archives publish this way), resumable, into the raw vault.

  python3 scripts/historical-data/fetch_oai.py <dataset-id> <base-url> <metadataPrefix> <set> [<set> ...]
    → data/historical/raw/<dataset-id>/original/<set>.xml.gz   every ListRecords page as returned, concatenated
      data/historical/raw/<dataset-id>/original/<set>.state    the last resumption token (a stopped run continues from it)

Records are stored unchanged; parsing happens in the build (registers.py / generic.py).
"""
import gzip
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw')
UA = 'ShelfAtlasBuild/1.0 (personal research)'


def get(url, tries=8):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=180) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001
            print('retry', i, str(e)[:80], flush=True)
            time.sleep(5 * (i + 1))
    return None


def harvest(ds, base, prefix, oai_set):
    d = os.path.join(ROOT, ds, 'original')
    os.makedirs(d, exist_ok=True)
    safe = oai_set.replace(':', '_')
    out_path, state_path = os.path.join(d, f'{safe}.xml.gz'), os.path.join(d, f'{safe}.state')
    token = open(state_path).read().strip() if os.path.exists(state_path) else None
    if token == 'DONE':
        print(oai_set, 'already complete', flush=True)
        return
    pages = 0
    with gzip.open(out_path, 'at', encoding='utf-8') as out:
        while True:
            url = f'{base}?verb=ListRecords&resumptionToken={urllib.parse.quote(token)}' if token else \
                f'{base}?verb=ListRecords&metadataPrefix={prefix}&set={urllib.parse.quote(oai_set)}'
            x = get(url)
            if x is None:
                print(oai_set, 'stopped: no answer after retries; resume later from', token, flush=True)
                return
            if '<error' in x and 'noRecordsMatch' not in x:
                print(oai_set, 'error', re.search(r'<error[^>]*>[^<]*', x).group(0)[:200], flush=True)
                return
            out.write(x + '\n')
            out.flush()
            m = re.search(r'<resumptionToken[^>]*?(?:completeListSize="(\d+)")?[^>]*>([^<]*)</resumptionToken>', x)
            token = m.group(2).strip() if m and m.group(2) else None
            pages += 1
            open(state_path, 'w').write(token or 'DONE')
            if pages % 50 == 0:
                print(oai_set, 'pages', pages, flush=True)
            if not token:
                print(oai_set, 'complete, pages', pages, flush=True)
                return
            time.sleep(0.5)


if __name__ == '__main__':
    ds, base, prefix, *sets = sys.argv[1:]
    for s in sets:
        harvest(ds, base, prefix, s)
