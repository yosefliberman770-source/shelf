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

## Status (2026-10-01)

- **Downloaded automatically:** Tribal Hidage, Medieval Bridges, Viabundus, Itiner-e, Pleiades, al-Ṯurayyā,
  Living with Machines, Historic England, CShapes, and parts of the ADS collections.
- **Uploaded by hand** (ADS blocks most automated downloads): the Domesday, Gough Map and Inland Navigation
  ZIPs and the Atlas of Rural Settlement shapefile ZIP. Filed into `raw/`, checksummed, provenance recorded;
  where an automatic copy already existed it was byte-identical and kept. These entries are marked `manual` or
  `manual_copy` in `sources.json`, so `fetch.py` never re-downloads them.
- **Processed into Shelf:** Domesday, Gough Map, Inland Navigation (public tiles) and the Atlas of Rural
  Settlement (local builds only — its terms allow personal and business use, not republishing). Built by
  `scripts/atlas-build/england.py`.
- **Not yet downloaded:** a few ADS documentation files (Gough Map guide, map image PDF and website image;
  Inland Navigation overview PNG) — not needed for the data.
- **Added 2026-09-30 (Europe-wide, open licences):** a Wikidata snapshot of medieval sites (castles,
  monasteries, cathedrals, dioceses, fortifications, bridges, universities, dated settlements; queries saved
  beside results — re-run with `scripts/historical-data/wikidata_snapshot.py`), Germania Sacra (monasteries and
  dioceses of the Empire), Buringh's European urban population 700–2000, the Historical Conflict Event Dataset
  and PeriodO. Processed by `scripts/atlas-build/sites.py`; see docs/MEDIEVAL_EUROPE_DATA_AUDIT.md.
- **Added 2026-10-01 (second pass):**
  - Open licences, public:
    - Princes and Townspeople (CC0)
    - Mérimée medieval monuments (Licence Ouverte 2.0)
    - Finnish register (CC BY 4.0)
    - Western Bohemia toponyms (CC BY 4.0)
  - Licence not verified, so `local_only` (kept out of git; tiles only in local builds):
    - TIB Maps of Power (`scripts/historical-data/openatlas_snapshot.py`)
    - Markets and Fairs to 1516
    - Atlas Fontium's 16th-century Poland (WFS)
    - Denmark's Fund og Fortidsminder (raw only)
  - Regional parsers are in `scripts/atlas-build/regional.py`.
- **Recovery pass (2026-10-01).** The question for each dataset skipped
  because of licensing or access was: "is the data obtainable and historically
  useful for a private app?"
  - Acquired, public:
    - Norwegian heritage register (NLOD)
    - Nordic Spatial Humanities (CC BY 4.0)
  - Acquired, private:
    - RAN, Romania (`ran_snapshot.py`)
    - DicoTopo, France
    - EBIDAT castles (`ebidat_snapshot.py`, resumable)
    - Swedish remains
    - DARMC
    - Engel's Hungary (encrypted, not integrated)
- **Private data pack.** Datasets that must not be republished are built into
  `data/private-pack/shelf-private-data.pack` (git-ignored) by:

  ```
  python3 scripts/atlas-build/build.py world
  python3 scripts/atlas-build/private_pack.py
  ```

  The owner loads the file in the app (map → "Your private data"). Their raw
  files are flagged `local_only` in `sources.json`, so they stay out of git.
  Derived caches (`raw/*/derived-*.json`) are git-ignored too.
- **Audit files** (`audit/`), each rebuilt by its script:
  - `seed-candidates.json`, `reconciliation_entries.py` and `recovery_entries.py` → `reconciliation.json` (`reconciliation.py`)
  - `import-audit.json` (`audit_imports.py`)
  - `vault-audit.json`: files, checksums, docs, leaks into git and what the app uses (`audit_vault.py`)
- **Measured coverage:** `coverage-measured.json` (built by `scripts/historical-data/coverage.py`).
- **Skipped:** GB1900 (owner's decision).
- **Online-only:** KEPN and PASE (see their SOURCE.md). The World Historical Gazetteer is an external
  reconciliation source, queried per place name and cached on the device — never bulk-downloaded (see
  docs/HISTORICAL_DATA_AUDIT.md).

## Adding a hand-downloaded file

Put the unchanged file in `incoming/`, then file it under `raw/<dataset>/original/`, add it to `sources.json`
with `"manual": true` and its official page as `url`, and record its checksum in `manifest.json`.
