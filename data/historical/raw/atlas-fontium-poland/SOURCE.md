# Atlas historyczny Polski XVI w. — Atlas Fontium / OntoHGIS (Crown of Poland, second half of the 16th century)

- **Official source:** Department of Historical Atlas, Institute of History, Polish Academy of Sciences (IH PAN).
- **Dataset page:** https://atlasfontium.pl/ (GeoNode: https://geonode.ontohgis.pl/)
- **Version / date:** WFS snapshot of the 16th-century layers, 2026-09-30.
- **Licence:** Not specified (GeoNode licence field "not_specified"; restriction code "intellectualPropertyRights"). Licence not verified. — https://geonode.ontohgis.pl/ (see LICENSE.md)
- **Geographic coverage:** Crown of the Kingdom of Poland (without Royal Prussia's full detail and without the Grand Duchy of Lithuania).
- **Historical date range:** Second half of the 16th century (tax-register snapshot); one period for the whole layer.
- **Download date:** 2026-09-30
- **Total size:** 177.9 MB in 11 files

## What it contains

Settlements (24,092: character, ownership, owner, size band, parish, mills and inns), parishes, deaneries, archdeaconries, dioceses, districts (powiaty), voivodeships, roads with weights, rivers, forests, water bodies.

## Processed into Shelf

Settlements and parish seats → local-only site tiles, dated by the atlas period (evidence period, not the places' own dates). Other layers raw only.

## Files

Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py atlas-fontium-poland` to download them again and check them against these SHA-256 checksums.

| File | Size | In git | Download URL | SHA-256 |
| --- | --- | --- | --- | --- |
| `original/akweny.geojson` | 13.9 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:akweny&outputFormat=application/json&srsName=EPSG:4326 | `c4218374d1df3109065707b9c2ff396687fcc146f45032dc98258d75850c6ee1` |
| `original/archidiakonaty.geojson` | 1.3 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:archidiakonaty&outputFormat=application/json&srsName=EPSG:4326 | `3e6c2c93a5a7ffb9d3cb16f8e167c10a6f7f0db58fdd1cd455030e1a9ffbef5d` |
| `original/dekanaty.geojson` | 2.6 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:dekanaty&outputFormat=application/json&srsName=EPSG:4326 | `4761e7b97d13f7750b23664e5dd4e73c243a88783c81f12464276ec54957645e` |
| `original/diecezje.geojson` | 834.6 KB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:diecezje&outputFormat=application/json&srsName=EPSG:4326 | `a1bb56aa875645b9560dd12f8353cab05c098d321effb61d8add3bf8347d1265` |
| `original/drogi.geojson` | 1.9 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:drogi&outputFormat=application/json&srsName=EPSG:4326 | `48e10d833f747077038b77c4fe9a510dc90c6984c225773a75e70ee32abf4683` |
| `original/lasy.geojson` | 116.1 MB | no | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:lasy&outputFormat=application/json&srsName=EPSG:4326 | `42c94259bba49728a99fd094ff41bfa9f4a5ad2a9b1c0f37857c215cbca99196` |
| `original/miejscowosci.geojson` | 11.2 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:miejscowosci&outputFormat=application/json&srsName=EPSG:4326 | `1cf385db4ff369ea5e61c44851676c7552ceb54a77a29063b25934164985ab04` |
| `original/parafie.geojson` | 8.0 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:parafie&outputFormat=application/json&srsName=EPSG:4326 | `ed76b4586a18450768c240f55b8d3a07d185b6c882a35b099a0c12902391cf11` |
| `original/powiaty.geojson` | 2.2 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:powiaty&outputFormat=application/json&srsName=EPSG:4326 | `7878514fc917123181d5b3b5425428a78193b02f7a6d760b83691a4d6dbc7172` |
| `original/rzeki.geojson` | 18.8 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:rzeki&outputFormat=application/json&srsName=EPSG:4326 | `c5d2b569f894e9649c690117f777840b493301feb9403da1b6b3f7dcaca241d1` |
| `original/wojewodztwa.geojson` | 1.2 MB | yes | https://geonode.ontohgis.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:wojewodztwa&outputFormat=application/json&srsName=EPSG:4326 | `87cedd39f4560ff0c570ce6bea63c08d3959f60d0684180389ca7db861de1475` |

## How to cite

Atlas historyczny Polski. Mapy szczegółowe XVI wieku, IH PAN; Atlas Fontium, https://atlasfontium.pl/
