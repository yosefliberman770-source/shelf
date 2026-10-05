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
