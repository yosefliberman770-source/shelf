#!/usr/bin/env python3
"""Download the raw historical datasets listed in data/historical/sources.json.

Files are saved unchanged under data/historical/raw/<dataset>/<path>. Each
download is recorded in data/historical/manifest.json with its URL, size,
SHA-256 and download date, so a later run can verify or re-fetch the exact
same file. Large files are kept out of git (see data/historical/.gitignore)
and are restored by running this script again.

  python3 scripts/historical-data/fetch.py            # fetch anything missing
  python3 scripts/historical-data/fetch.py domesday   # one dataset
  python3 scripts/historical-data/fetch.py --verify   # check checksums only

Requests are made one at a time with a pause between them.
"""
import datetime
import fcntl
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical')
RAW = os.path.join(ROOT, 'raw')
SOURCES = os.path.join(ROOT, 'sources.json')
MANIFEST = os.path.join(ROOT, 'manifest.json')
PAUSE = 2


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def load(path, default):
    return json.load(open(path)) if os.path.exists(path) else default


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    verify = '--verify' in sys.argv
    sources = load(SOURCES, [])
    manifest = load(MANIFEST, {})
    bad = 0
    for ds in sources:
        if args and ds['id'] not in args:
            continue
        for f in ds.get('files', []):
            rel = f"{ds['id']}/{f['path']}"
            dest = os.path.join(RAW, rel)
            rec = manifest.get(rel)
            if os.path.exists(dest):
                if rec and sha256(dest) != rec['sha256']:
                    print('CHANGED ', rel)
                    bad += 1
                elif not rec and not verify:
                    manifest[rel] = record(f['url'], dest, None)
                    save(manifest)
                continue
            if verify:
                print('MISSING ', rel)
                bad += 1
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            print('fetch   ', rel)
            time.sleep(PAUSE)
            tmp = dest + '.part'
            curl = ['curl', '-sS', '-L', '--fail', '--retry', '3', '--http1.1', '-m', '3600', '-o', tmp, f['url']]
            r = subprocess.run(curl[:1] + ['-C', '-'] + curl[1:])
            if r.returncode == 33:  # the server can't resume a partial file: start again
                os.remove(tmp)
                r = subprocess.run(curl)
            if r.returncode:
                print('FAILED  ', rel)
                bad += 1
                continue  # a partial .part file is resumed next run
            os.replace(tmp, dest)
            if rec and rec['sha256'] != sha256(dest):
                print('DIFFERS from the recorded download (the source has changed):', rel)
                bad += 1
            manifest[rel] = record(f['url'], dest, rec)
            save(manifest)
    sys.exit(1 if bad else 0)


def record(url, dest, rec):
    digest = sha256(dest)
    return {
        'url': url,
        'bytes': os.path.getsize(dest),
        'sha256': digest,
        'downloaded': rec['downloaded'] if rec and rec['sha256'] == digest else datetime.date.today().isoformat(),
    }


def save(manifest):
    # Written after every file so an interrupted run keeps what it fetched.
    # Merged under a lock, so runs for different datasets can go in parallel.
    with open(MANIFEST + '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        merged = load(MANIFEST, {})
        merged.update(manifest)
        manifest.update(merged)
        with open(MANIFEST + '.tmp', 'w') as f:
            json.dump(dict(sorted(merged.items())), f, indent=1)
        os.replace(MANIFEST + '.tmp', MANIFEST)


if __name__ == '__main__':
    main()
