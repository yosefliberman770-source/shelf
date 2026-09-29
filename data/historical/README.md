# Historical data library (raw sources)

Original, unmodified files from official sources, kept for later processing into
Shelf's spatial and temporal indexes. Nothing here is loaded by the app.

- `raw/<dataset>/SOURCE.md` — what the dataset is, where it came from, version,
  licence, coverage, download date, and every file with its size, URL and SHA-256.
- `raw/<dataset>/LICENSE.md` — the licence and the required attribution.
- `raw/<dataset>/original/` — the files exactly as downloaded.
- `sources.json` — the download list (official URLs only).
- `manifest.json` — size, SHA-256 and download date of every file.

## Large files

Files over 25 MB are not stored in git (GitHub refuses files over 100 MB, and
large files would slow every clone and deploy). They are listed in `.gitignore`
and restored, byte for byte, with:

    python3 scripts/historical-data/fetch.py            # everything missing
    python3 scripts/historical-data/fetch.py viabundus  # one dataset
    python3 scripts/historical-data/fetch.py --verify   # check checksums

A re-download that no longer matches its recorded checksum is reported, because
it means the source has published a different file. Historic England exports are
regenerated daily, so their checksums change on every download.

`python3 scripts/historical-data/describe.py` rewrites the SOURCE.md and
LICENSE.md files from the manifest.

## Datasets that need a manual step

See `raw/gb1900/SOURCE.md` and `raw/atlas-rural-settlement/SOURCE.md`. Their
official download pages refuse automated access, so the files must be
downloaded in a browser and placed in `original/` unchanged. After adding them,
add them to `sources.json` and run `fetch.py` to record their checksums.

`raw/kepn/` and `raw/pase/` record why those sources stay online-only.
