# Plan: master list of site types + fixing wrong groupings

Status: **approved and done** (Care and Learning made two separate groups, as asked). See "What was done" at the end.

Covers options 1 and 2 from the `SITE_TYPES.md` discussion. New icons for each group (option 3) and a filter menu (option 4) are out of scope.

## How it works today (short version)

- When the map data is built, each record is given a short "kind" (castle, church, monastery, mill and so on). This happens in Python scripts under `scripts/atlas-build/`, which hold about 30 separate keyword tables, one per source.
- The app's map code (`src/atlas/catalog.ts`) then draws each layer as coloured dots based on that kind.
- The data files also keep the source's own wording, the "raw type", next to the kind. This plan relies on that.
- No tests check which kind a site ends up with.

## Step 1: one master list

- Add a single file, `src/atlas/site-types.ts`, that lists every site type in plain words. For each type it gives:
  - the clean name shown to users (e.g. "Nunnery / convent")
  - the group it belongs to
  - the words in a source's type field that identify it
- `docs/SITE_TYPES.md` will point to this file as the official list.
- The ~30 Python keyword tables stay as they are. Rebuilding the 169 MB of map tiles needs source downloads that aren't in the repo, so the fix works at display time instead.

## Step 2: fix the clearly wrong groupings

Three groups are added: **Burial**, **Care & learning** and **Industry & work**. That takes the map from 12 groups to 15. Each new group gets its own dot colour and its own on/off switch in the layers panel. The shape stays a plain dot, as now.

| What | Shown today as | Moves to |
|---|---|---|
| Hospital, almshouse, leper house | Religious house (purple) | **Care & learning** |
| University, college, school | Religious house (purple) | **Care & learning** |
| Cemetery, graveyard, burial ground, grave | Religious house (purple) | **Burial** |
| Barrow, cairn, cist, tomb, burial mound | Archaeology | **Burial** |
| Mill, watermill, windmill | Archaeology | **Industry & work** |
| Mine, quarry, kiln, forge, salt works, fishery | Archaeology | **Industry & work** |
| Country house, manor house (post-medieval) | Castle | Building (not castle) |

Rules:

- **Mixed records stay where they are.** For example, "Church and graveyard" stays a church, because the church is the main thing.
- **Matching uses only the type field, never the place name.** That way a village called "Millton" doesn't turn into a mill.
- **No dates or other facts are changed or added.** Only which group a site is drawn in changes.

## Checks before anything is pushed

- New tests:
  - each item in the table above lands in its new group
  - "Church and graveyard" stays a church
  - a place *named* "Mill…" stays a settlement
- The existing test suite must still pass.
- I'll report before and after counts per group, worked out from the real data, so the moves can be seen.
- The work goes on this branch only, with no pull request unless asked.
- The OceanofPDF line in `src/components/sheets.tsx` is not touched.

## Risks

- Source wording varies, so some sites may still land in the wrong group. The before and after counts will show how many moved.
- Another chat is auditing the same map code. If it edits `src/atlas/catalog.ts` at the same time, the two sets of changes may need merging.

## What was done

- The master list is in `src/atlas/site-types.ts`. Tests are in `src/atlas/site-types.test.ts`.
- There are four new map layers. Each has its own colour and its own on/off switch:

  | Layer | Colour | On at start? |
  |---|---|---|
  | Hospitals, almshouses & leper houses | raspberry | on |
  | Universities, colleges & schools | indigo | on |
  | Graves, cemeteries & burial mounds | blue-grey | off, like archaeology before |
  | Mills, mines, quarries & kilns | teal | off, like archaeology before |

### Records moved, counted from the real map tiles

The count covers the 872,634 public site records.

| Move | Records |
|---|---:|
| Archaeology → Industry & work | 49,102 |
| Archaeology → Burial | 23,559 |
| Religious → Burial | 7,758 |
| Archaeology → Learning | 3,872 |
| Archaeology → Care | 1,471 |
| Religious → Learning (147 of them are Wikidata universities) | 153 |
| Religious → Care | 36 |
| Castle → Building (in the archaeology layer) | 11 |

### Notes

- **Country houses.** Only 11 records are pure country houses filed as castles. Almost all the "country houses" under castle are real castles or tower houses that later became houses, so they stay castles. Wikidata "châteaux" carry no type text that can tell a castle from a country house, so they stay castles too.
- **Mixed records stay with the church.** Examples are "Burial ground, chapel" and "church · former hospital".
- **Words that only look like a match are skipped:**
  - clearance, boundary and marker cairns, and cairnfields (field clearance)
  - "Cistercian", "gravel" and "Knights Hospitallers"
  - a hospital *cemetery* (Polish *cmentarz przyszpitalny*), which goes to Burial
- **Speed.** Sorting at display time costs a little time. On the densest tile in the data, all seven site layers together take about 50 ms on a desktop computer. This work runs in the map's background worker. If it ever feels slow on a phone, the group can be stored in the data files at the next rebuild.
