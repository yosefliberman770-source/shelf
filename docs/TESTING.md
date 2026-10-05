# Tests

## Running them

| Command | What it runs |
|---|---|
| `npm test` | every app test (Vitest) |
| `npm run test:answers` | only the **expected-answer** tests |
| `npm run test:rules` | only the **current-rule** tests (titles starting `[rule]`) |
| `npm run test:build` | the data-build tests in `scripts/atlas-build` (Python, standard library + `requirements.txt`) |

GitHub runs all of them, plus `tsc -b`, `vite build` and a check that the built site ships nothing private:
- on every pull request (`.github/workflows/test.yml`);
- again before every deploy (`.github/workflows/pages.yml`).

## Two kinds of test

**Expected answers.** These say what is true and what the reader must see. Examples:
- Capua is inside the Roman Republic in 218 BCE;
- there is no year 0;
- a failed lookup is never reported as "no such place".

A failing expected-answer test is a regression. Change its expected value only with evidence from a source, and say so in the commit.

**Current rules** (title starts with `[rule]`). These pin a rule Shelf applies today that is a design choice, not a fact. Several are rules the audits recommend changing in later stages. Examples:
- a site is drawn 60 years before its first record;
- an HCED battle within 50 km and a year of a Wikidata battle is dropped as a duplicate;
- a snapshot outline is shown within 50 years of its date.

When a stage changes one of these rules on purpose, its test is expected to fail. Update or replace the test in the same change, and name the checklist item the change implements.

A new test that pins a count or a behaviour Shelf might deliberately change later should be a `[rule]` test.

## Agreements between the build and the app

Some logic exists twice: once in the Python build and once in the TypeScript app. Each pair has a test that runs both:
- name keys and name shards: `scripts/atlas-build/names.py` ↔ `normName`/`nameShard`, tested in `src/atlas/names-parity.test.ts`;
- site types: `siteGroup` ↔ `siteGroupExpr`, tested in `src/atlas/site-types.test.ts`.

## Rebuilding the data

`python3 scripts/atlas-build/build.py` (packages: `scripts/atlas-build/requirements.txt`). It now checks its inputs before and after building.

**Before building:** every file in `data/historical/raw` must match its entry in `data/historical/manifest.json` (size and SHA-256), and every file must be listed there. A changed, missing or unlisted file stops the build.
- To list new files, run `python3 scripts/historical-data/record_vault.py`.
- To build anyway, add `--accept-changed-inputs`.
- To check the vault on its own, run `python3 scripts/atlas-build/inputs.py`.

**While building:** a reader whose optional input is missing records it. At the end, the build lists all of them and exits with code 2, so a clean checkout can't quietly build a smaller map. Add `--allow-missing` to accept that.

**Same output every time:**
- The place index is written in a fixed order, independent of input order. When one source id has several records, which one keeps the bare id is decided by content.
- Tiles carry no timestamps.
- The index is written next to the old one and swapped in only when complete.

**Problem records:**
- A malformed record is set aside with its reason (`rejected` in the build report). It never stops the build.
- A record that looks wrong but is possible stays in the index and is listed under `flagged`, with the reason on the record (`extra.qa`). Examples: swapped coordinates, a lost minus sign, a placeholder title.

**What the manifest records:** `public/atlas/manifest.json` and `public/world/manifest.json` list each dataset's input files with URL, checksum and download date. `retrieved` is that download date, not the build date. The manifests also record the Python and package versions used.

`scripts/atlas-build/test_reproducible.py` tests all of this.

## Short keys

Tile and index properties use one- or two-letter keys. `l` means two different things:
- in `pleiades.pmtiles` it is the place's layer list (`build.py`, "settlement,port");
- in the world route and node tiles it is a type or label (`world.py`).

Read `l` in the context of its tile set. Renaming it is part of the Stage 4 data migration, together with the key mapping for bookmarks (C3).
