# Data licences

Shelf's map and place data are built from published datasets. Each keeps its own licence, and the app credits each one under **Sources & attribution** on the map. The dataset list, with licence and attribution, is also in `public/atlas/manifest.json` and `src/atlas/spec-datasets.ts`.

## Share-alike data

The files in `public/world/places/` and `public/world/tiles/` mix records from several datasets in each file. Some of those datasets are share-alike:
- DISSILOC (CC BY-SA 4.0);
- Germania Sacra (CC BY-SA 3.0);
- ARKAS (CC BY-SA 4.0);
- HALC (CC BY-SA 4.0);
- the AWMC and OpenStreetMap derivatives (ODbL 1.0).

These derived files are therefore offered under the same terms:
- **CC BY-SA 4.0**, for the parts derived from CC BY-SA data;
- **ODbL 1.0**, for the parts derived from AWMC or OpenStreetMap.

Each keeps the attribution its source requires.

## Non-commercial data

The Lutsch road map of 1751 (CC BY-NC-SA 4.0, 271 road segments) may not be used commercially. It must be removed or kept separate before any commercial use of Shelf.

## Not published

Datasets whose terms do not allow republishing are never in this repository or on the public site. They reach the owner's phone only through the private data pack (see `scripts/atlas-build/private_pack.py`). `src/atlas/private-data.test.ts` checks this on every build.

## The code

No licence has been chosen for Shelf's own code yet.
