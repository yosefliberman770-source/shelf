#!/usr/bin/env python3
"""Write SOURCE.md and LICENSE.md in each data/historical/raw/<dataset>/ folder.

The descriptions below were taken from each dataset's official page when it
was downloaded. The file list, sizes and checksums come from manifest.json.
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical')
RAW = os.path.join(ROOT, 'raw')
LARGE = 25 * 1024 * 1024  # files above this are not committed; fetch.py restores them

ADS_TERMS = 'ADS Terms of Use and Access: https://archaeologydataservice.ac.uk/terms-and-conditions/'

DATASETS = {
    'tribal-hidage': {
        'name': 'Census Data from Beyond the Tribal Hidage: the early Anglo-Saxon kingdoms of southern Britain AD 450–650',
        'source': 'Archaeology Data Service (ADS), University of York. Creators: Sue Harrington, Stuart Brookes (UCL Institute of Archaeology).',
        'page': 'https://archaeologydataservice.ac.uk/archives/collections/view/1008598/downloads.cfm',
        'doi': 'https://doi.org/10.5284/1136515',
        'version': 'First released 7 October 2025 (data created 2006–2019).',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'Data copyright © Dr Stuart Brookes, Dr Sue Harrington. ' + ADS_TERMS,
        'cite': 'Harrington, S., Brookes, S. (2025) Census Data from Beyond the Tribal Hidage: the early Anglo-Saxon kingdoms of southern Britain AD 450-650 [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1136515',
        'area': 'Southern England (south of the Humber–Mersey line).',
        'period': 'c. AD 450–650.',
        'contents': 'Early Anglo-Saxon burial census: 834 burial sites (Sites_data.csv, with coordinates), 12,379 buried individuals (Individuals_Data.csv) and 26,043 grave objects (Objects_Data.csv); a general guide (PDF) and a plot of burial sites (JPG). The collection has no kingdom boundary polygons — only these census tables.',
    },
    'domesday': {
        'name': 'Domesday Shires and Hundreds of England',
        'source': 'Archaeology Data Service (ADS). Creator: Stuart Brookes (Landscapes of Governance project, UCL / Nottingham / Winchester).',
        'page': 'https://archaeologydataservice.ac.uk/archives/collections/view/1003676/downloads.cfm',
        'doi': 'https://doi.org/10.5284/1058999',
        'version': 'First released 31 January 2020 (data created 2010–2017).',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'Data copyright © Dr Stuart Brookes unless otherwise stated. ' + ADS_TERMS,
        'cite': 'Brookes, S. (2020) Domesday Shires and Hundreds of England [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1058999',
        'area': 'England and parts of Wales.',
        'period': 'AD 1086 (as recorded in Domesday Book).',
        'contents': 'All three ESRI shapefiles offered: DBshires (shires), DBinter (intermediate districts, where they existed) and DBhundreds (hundreds and wapentakes); plus the general guide (PDF).',
    },
    'medieval-bridges': {
        'name': 'Bridges of Medieval England to c.1250',
        'source': 'Archaeology Data Service (ADS). Creators: Stuart Brookes, Eleanor Rye, Eljas Oksanen (Early Medieval Atlas; Travel and Communications in Anglo-Saxon England project).',
        'page': 'https://archaeologydataservice.ac.uk/archives/collections/view/1003426/downloads.cfm',
        'doi': 'https://doi.org/10.5284/1053676',
        'version': 'First released 25 July 2019.',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'Data copyright © UCL Institute of Archaeology unless otherwise stated. ' + ADS_TERMS,
        'cite': 'Brookes, S., Rye, E., Oksanen, E. (2019) Bridges of Medieval England to c.1250 [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1053676',
        'area': 'England.',
        'period': 'Early medieval to c. AD 1250.',
        'contents': 'Bridges and fording points attested in documents, archaeological surveys and place-names: Bridges1250 as a shapefile (ZIP) and CSV, plus the general guide (PDF).',
    },
    'inland-navigation': {
        'name': 'Inland Navigation in England and Wales before 1348: GIS Database',
        'source': 'Archaeology Data Service (ADS). Creator: Eljas Oksanen (Early Medieval Atlas).',
        'page': 'https://archaeologydataservice.ac.uk/archives/collections/view/1003427/downloads.cfm',
        'doi': 'https://doi.org/10.5284/1057497',
        'version': 'First released 8 November 2019.',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'Data copyright © UCL Institute of Archaeology unless otherwise stated. ' + ADS_TERMS,
        'cite': 'Oksanen, E. (2019) Inland Navigation in England and Wales before 1348: GIS Database [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1057497',
        'area': 'England and Wales.',
        'period': '11th century to 1348.',
        'contents': 'Navigable rivers and canals: direct evidence (documents, finds, canal building), indirect evidence (mainly place-names), heads of navigation, and place-names relating to river traffic — each a shapefile in a ZIP; plus the general guide (PDF) and an overview map (PNG).',
    },
    'gough-map': {
        'name': 'The Routes and Roads of the Gough Map: GIS Database',
        'source': 'Archaeology Data Service (ADS). Creators: Eljas Oksanen (University of Helsinki), Stuart Brookes (UCL Institute of Archaeology).',
        'page': 'https://archaeologydataservice.ac.uk/archives/collections/view/1007268/downloads.cfm',
        'doi': 'https://doi.org/10.5284/1124312',
        'version': 'First released 13 November 2024 (data created 2015–2024).',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'Data copyright © Eljas Oksanen, Dr Stuart Brookes unless otherwise stated. ' + ADS_TERMS,
        'cite': 'Oksanen, E., Brookes, S. (2024) The Routes and Roads of the Gough Map: GIS Database [data-set]. York: Archaeology Data Service [distributor] https://doi.org/10.5284/1124312',
        'area': 'England and Wales (Great Britain as drawn on the Gough Map).',
        'period': 'The Gough Map (c. 14th–15th century), with routes matched to Roman, medieval and post-medieval evidence.',
        'contents': 'Complete GIS set: the red lines drawn on the map (gough_red_lines), the settlements they connect (gough_way_stations, 179 points) and the reconstructed routeways (gough_routes), as zipped shapefiles; plus the general guide, the map image and introduction (PDFs) and a website image (PNG).',
    },
    'viabundus': {
        'name': 'Viabundus map of premodern European transport and mobility (Viabundus 2)',
        'source': 'Viabundus project (Bart Holterman, Maria Carina Dengg, Kasper H. Andersen and others), deposited on Zenodo by the project. Project site: https://www.viabundus.eu/',
        'page': 'https://zenodo.org/records/16611998',
        'doi': 'https://doi.org/10.5281/zenodo.16611998',
        'version': 'Version 2, published 25 April 2025 (latest version on Zenodo when downloaded).',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': '',
        'cite': 'Holterman, B. et al. (2025) Viabundus map of premodern European transport and mobility, version 2. Zenodo. https://doi.org/10.5281/zenodo.16611998',
        'area': 'Northern and central Europe (the Hanseatic area and beyond: Low Countries, Germany, Denmark, Scandinavia, the Baltic, Poland and neighbours).',
        'period': '1350–1650.',
        'contents': 'The complete Zenodo release (all 21 files): road and waterway edges (edges.csv plus GeoJSON and GML), places (nodes.csv), towns, town outlines, fairs, tolls and descriptions, population figures, alternative names, the 1500 waterway layer, literature and links, and documentation (PDFs).',
    },
    'itinere': {
        'name': 'Itiner-e: A High-Resolution Dataset of Roads of the Roman Empire',
        'source': 'Itiner-e project (Pau de Soto, Adam Pažout, Tom Brughmans, Peter Bjerregaard Vahlstrup and others; Aarhus University). Project site: https://itiner-e.org/',
        'page': 'https://zenodo.org/records/17122148 and https://itiner-e.org/about (nightly export)',
        'doi': 'https://doi.org/10.5281/zenodo.17122148',
        'version': 'Static version 2024, release 1.3 (Zenodo, 15 September 2025), documented in de Soto et al. 2025, Scientific Data, https://doi.org/10.1038/s41597-025-06140-z. Plus the nightly full export from itiner-e.org on the download date.',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'Stated on https://itiner-e.org/about: "Itiner-e: the digital atlas of ancient roads © 2024 by Brughmans, Pažout, de Soto and Bjerregaard Vahlstrup is licensed under CC BY 4.0". The Zenodo record itself carries no licence field.',
        'cite': 'de Soto, P. et al. (2025) A High-Resolution Dataset of Roads of the Roman Empire: Itiner-e static version 2024. Zenodo. https://doi.org/10.5281/zenodo.17122148',
        'area': 'The Roman Empire (Europe, North Africa, the Near East).',
        'period': 'c. 300 BCE – 300 CE.',
        'contents': 'The complete static release: all roads as GeoPackage, GeoJSON and a full shapefile set, the bibliography (BibTeX) and a field description (DOCX). nightly-export/ holds the project\'s own full nightly export (NDJSON, one route segment per line, including rivers and sea lanes and nearby Pleiades places), which grows as the project adds data.',
    },
    'pleiades': {
        'name': 'Pleiades: a gazetteer of past places',
        'source': 'Pleiades (Institute for the Study of the Ancient World, NYU, and contributors). Official downloads: https://atlantides.org/downloads/pleiades/',
        'page': 'https://atlantides.org/downloads/pleiades/',
        'doi': '',
        'version': 'Daily export of 29 September 2026 (files are dated in their names).',
        'licence': 'Creative Commons Attribution (CC BY)',
        'licence_url': 'https://creativecommons.org/licenses/',
        'licence_note': 'Stated on https://pleiades.stoa.org/: "Pleiades content is governed by the copyrights of the individual contributors responsible for its creation. Some rights are reserved. All content is distributed under the terms of a Creative Commons Attribution license (cc-by)." The licence version is not stated on that page.',
        'cite': 'Pleiades: A Gazetteer of Past Places. https://pleiades.stoa.org/ (daily export, 29 September 2026).',
        'area': 'The ancient Mediterranean, Near East and beyond (Europe, North Africa, western and central Asia).',
        'period': 'Mainly c. 1000 BCE – AD 640, with some earlier and later places.',
        'contents': 'The complete GIS package (pleiades_gis_data.zip: places, names, locations and connections as CSV/GIS tables), the comprehensive JSON of all places (pleiades-places-*.json.gz) and the errata JSON, and the daily CSV dumps of places, names and locations with their README.',
    },
    'al-thurayya': {
        'name': 'al-Ṯurayyā Gazetteer (v1.0)',
        'source': 'al-Ṯurayyā project (Masoumeh Seydi, Maxim Romanov, Leipzig; after Georgette Cornu, Atlas du monde arabo-islamique à l\'époque classique, 1983). Official repository: https://github.com/althurayya/althurayya.github.io',
        'page': 'https://github.com/althurayya/althurayya.github.io/tree/f244e65ddf782baef08e410870c61c8096ff9f90/master',
        'doi': '',
        'version': 'Repository commit f244e65ddf782baef08e410870c61c8096ff9f90 (22 September 2026).',
        'licence': 'Data: Creative Commons Attribution 4.0 International (CC BY 4.0), see DATA-LICENSE.md. Code: Apache License 2.0, see LICENSE.',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'The README says source-derived and third-party material is excluded from CC BY 4.0 unless its own terms allow it. The original DATA-LICENSE.md, LICENSE and README.md are kept in original/.',
        'cite': 'Seydi, M., Romanov, M. et al. al-Ṯurayyā Gazetteer, v1.0. https://althurayya.github.io/',
        'area': 'The early Islamic world, from al-Andalus and the Maghreb to Central Asia.',
        'period': 'Classical Islamic period, 9th–10th centuries CE (after Cornu).',
        'contents': 'The data files the map uses (master/): places (GeoJSON/JSON, in several structures, over 2,000 toponyms), routes (JSON, almost as many route sections) and regions. The World Historical Gazetteer copy could not be checked: whgazetteer.org refused automated access (HTTP 403).',
    },
    'living-with-machines': {
        'name': 'Living with Machines: railspace and building datasets (MapReader)',
        'source': 'Living with Machines (The Alan Turing Institute / British Library), using National Library of Scotland maps. Listed on the NLS Data Foundry: https://data.nls.uk/data/map-spatial-data/living-with-machines-railspace-building/ — the data itself is on Zenodo.',
        'page': 'https://data.nls.uk/data/map-spatial-data/living-with-machines-railspace-building/',
        'doi': 'https://doi.org/10.5281/zenodo.7147906 (linked from the Data Foundry); https://doi.org/10.5281/zenodo.11241371; https://doi.org/10.5281/zenodo.14522926',
        'version': 'SIGSPATIAL 2022 data v0.3.3 (5 October 2022); annotations 2024 (22 May 2024); railspace v2 (19 December 2024).',
        'licence': 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
        'licence_note': 'All three Zenodo records and the Data Foundry page state CC BY 4.0.',
        'cite': 'Living with Machines / MapReader. MapReader_Data_SIGSPATIAL_2022 (Zenodo 7147906); MapReader_railspace_and_building_annotations_2024 (Zenodo 11241371); MapReader_railspace_v2 (Zenodo 14522926).',
        'area': 'England, Wales and Scotland.',
        'period': 'Ordnance Survey six-inch 2nd edition maps, 1888–1913.',
        'contents': 'sigspatial-2022: the dataset the Data Foundry links to (gold-standard annotations and machine-labelled 100 m patches for railspace and buildings). annotations-2024: post-processed railspace and building annotations, including georeferenced CSVs. railspace-v2: updated railspace predictions for 586,276 patches. Not downloaded: maps.zip and slice_meters_100_100.zip from the 2024 record (3.4 GB of map image tiles, not spatial data).',
    },
    'historic-england': {
        'name': 'National Heritage List for England (NHLE) — Historic England open data',
        'source': 'Historic England Open Data Hub: https://opendata-historicengland.hub.arcgis.com/ (item 767f279327a24845bf47dfe5eae9862b)',
        'page': 'https://opendata-historicengland.hub.arcgis.com/datasets/767f279327a24845bf47dfe5eae9862b',
        'doi': '',
        'version': 'Export made on the download date (Historic England says the data is updated daily). Re-downloading gives a newer export with a different checksum.',
        'licence': 'Open Government Licence v3.0, under the Historic England Open Data Hub Terms and Conditions',
        'licence_url': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
        'licence_note': 'Item metadata: "© Crown Copyright 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. Released under OGL." Licence field: "Historic England Open Data Hub Terms and Conditions". The terms page on historicengland.org.uk refused automated access (bot check), so its full text is not saved here.',
        'cite': '© Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. National Heritage List for England.',
        'area': 'England.',
        'period': 'Designated heritage from prehistory to the 20th century; designation dates from the 1880s onward.',
        'contents': 'GeoPackage exports (British National Grid, EPSG:27700) of the six requested designations: Listed Buildings (points, 379,685, and polygons for entries listed or amended since April 2011), Scheduled Monuments, Registered Parks and Gardens, Registered Battlefields, Protected Wreck Sites and World Heritage Sites.',
    },
    'cshapes': {
        'name': 'CShapes 2.0',
        'source': 'ETH Zürich, International Conflict Research (Schvitz, Girardin, Rüegger, Weidmann, Cederman, Gleditsch). https://icr.ethz.ch/data/cshapes/',
        'page': 'https://icr.ethz.ch/data/cshapes/',
        'doi': '',
        'version': 'CShapes 2.0 (see ChangeLog.txt).',
        'licence': 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0)',
        'licence_url': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        'licence_note': 'NON-COMMERCIAL ONLY. Anything built from it must be shared under the same licence. Fine for personal, non-commercial use of Shelf; it must not be used if Shelf is ever sold or monetised.',
        'cite': 'Schvitz, G., Girardin, L., Rüegger, S., Weidmann, N. B., Cederman, L.-E., Gleditsch, K. S. (2022) Mapping the International System, 1886-2019: The CShapes 2.0 Dataset. Journal of Conflict Resolution 66(1).',
        'area': 'World (independent states and dependent territories); CShapes-Europe from 1816.',
        'period': '1886–2019 (Europe from 1816).',
        'contents': 'State borders and capitals with validity dates: shapefile (ZIP), GeoJSON, CSV, the Europe-from-1816 GeoJSON, the codebook (PDF), the readme text and the changelog. The SQL, XLSX and R-package formats were skipped as duplicates.',
    },
}

MANUAL = {
    'gb1900': {
        'name': 'GB1900 Complete Gazetteer',
        'status': 'NOT DOWNLOADED — needs a manual download.',
        'why': 'The only download is on the Vision of Britain site (https://www.visionofbritain.org.uk/data/), which did not respond from the build environment (connection timed out). The NLS Data Foundry page for GB1900 only links back to Vision of Britain.',
        'action': 'Open https://www.visionofbritain.org.uk/data/#tabgb1900 in a browser, download the COMPLETE gazetteer (about 2.55 million rows, CSV), and place the unchanged file in original/ here.',
        'licence': 'Conflicting statements: search summaries of the Vision of Britain page say CC BY-SA 4.0; the NLS Data Foundry page says CC0. Record whatever the downloaded file and its page say.',
        'area': 'England, Wales and Scotland.',
        'period': 'Ordnance Survey six-inch 2nd edition maps, 1888–1914.',
    },
    'atlas-rural-settlement': {
        'name': 'Atlas of Rural Settlement in England GIS (Roberts & Wrathmell)',
        'status': 'NOT DOWNLOADED — needs a manual download.',
        'why': 'Both official copies are behind a Cloudflare bot check ("Just a moment…"): Historic England (https://historicengland.org.uk/research/current/heritage-science/atlas-of-rural-settlement-in-england/) and ADS (https://archaeologydataservice.ac.uk/archives/view/atlasrural_he_2015/downloads.cfm, DOI https://doi.org/10.5284/1031493). It is not on the Historic England Open Data Hub.',
        'action': 'Open the ADS downloads page in a browser, accept the terms if asked, and download the Shapefile data (and the province descriptions and data dictionary). Place the unchanged files in original/ here.',
        'licence': 'DataCite record: "ADS Terms and Conditions apply to reuse". Check the collection metadata page for the exact licence.',
        'area': 'England.',
        'period': 'Settlement patterns mapped from 19th-century maps, used to study medieval and earlier settlement.',
    },
    'kepn': {
        'name': 'Key to English Place-Names (KEPN)',
        'status': 'EXTERNAL REFERENCE ONLY — no legitimate bulk download.',
        'why': 'The official site (https://kepn.nottingham.ac.uk/, Institute for Name-Studies, University of Nottingham) offers search and browse only. No download, export or API is offered; the site says "© 2026 University of Nottingham. All Rights Reserved"; and its robots.txt disallows automated access to everything except /about. Scraping it would break those terms.',
        'action': 'None. Use it as an online source (link to its search page for a place-name). If bulk use is ever needed, ask the Institute for Name-Studies for permission.',
        'licence': 'All rights reserved.',
        'area': 'England (pre-1974 counties).',
        'period': 'Names of cities, towns and villages, most of them "well over a thousand years old" (KEPN about page).',
    },
    'pase': {
        'name': 'PASE — Prosopography of Anglo-Saxon England',
        'status': 'EXTERNAL REFERENCE ONLY — no downloadable dataset, and the licence does not permit copying.',
        'why': 'The official site (https://pase.ac.uk/) offers no download or export. Its copyright page says: "All material is made available free of charge for individual, non-commercial use only, provided this publication is acknowledged. … All other use is prohibited without the express written consent of the Project Directors."',
        'action': 'None. Link to PASE person records instead of copying them. Copying the database would need written consent from the Project Directors.',
        'licence': 'Individual, non-commercial use only; all other use needs written consent.',
        'area': 'Anglo-Saxon England.',
        'period': 'Anglo-Saxon period to the late 11th century, including people recorded in Domesday Book.',
    },
}


def human(n):
    for unit in ('bytes', 'KB', 'MB', 'GB'):
        if n < 1024 or unit == 'GB':
            return f'{n:.0f} {unit}' if unit == 'bytes' else f'{n:.1f} {unit}'
        n /= 1024


def write_gitignore(manifest):
    # Keep downloaded files out of git unless they are recorded and small;
    # large ones are restored by fetch.py from their official URLs.
    small = sorted(k for k, v in manifest.items() if v['bytes'] <= LARGE)
    lines = ['# Generated by scripts/historical-data/describe.py', '*.lock', '*.part', '*.tmp',
             'raw/*/original/**', 'raw/*/nightly-export/**', '!raw/*/original/**/', '!raw/*/nightly-export/**/']
    lines += [f'!raw/{k}' for k in small]
    open(os.path.join(ROOT, '.gitignore'), 'w').write('\n'.join(lines) + '\n')


def main():
    manifest = json.load(open(os.path.join(ROOT, 'manifest.json')))
    write_gitignore(manifest)
    for ds, d in DATASETS.items():
        folder = os.path.join(RAW, ds)
        os.makedirs(folder, exist_ok=True)
        rows = sorted((k[len(ds) + 1:], v) for k, v in manifest.items() if k.startswith(ds + '/'))
        dates = sorted({v['downloaded'] for _, v in rows})
        total = sum(v['bytes'] for _, v in rows)
        lines = [
            f"# {d['name']}", '',
            f"- **Official source:** {d['source']}",
            f"- **Dataset page:** {d['page']}",
        ]
        if d['doi']:
            lines.append(f"- **DOI:** {d['doi']}")
        lines += [
            f"- **Version / date:** {d['version']}",
            f"- **Licence:** {d['licence']} — {d['licence_url']} (see LICENSE.md)",
            f"- **Geographic coverage:** {d['area']}",
            f"- **Historical date range:** {d['period']}",
            f"- **Download date:** {', '.join(dates) if dates else 'not yet downloaded'}",
            f"- **Total size:** {human(total)} in {len(rows)} files",
            '', '## What it contains', '', d['contents'], '',
            '## Files', '',
            'Saved unchanged in `original/` (or `nightly-export/`). Files over 25 MB are not stored in git; run `python3 scripts/historical-data/fetch.py ' + ds + '` to download them again and check them against these SHA-256 checksums.',
            '', '| File | Size | In git | Download URL | SHA-256 |', '| --- | --- | --- | --- | --- |',
        ]
        for path, v in rows:
            lines.append(f"| `{path}` | {human(v['bytes'])} | {'yes' if v['bytes'] <= LARGE else 'no'} | {v['url']} | `{v['sha256']}` |")
        missing = [f['path'] for s in json.load(open(os.path.join(ROOT, 'sources.json'))) if s['id'] == ds for f in s['files'] if f"{ds}/{f['path']}" not in manifest]
        if missing:
            lines += ['', '**Not yet downloaded:** ' + ', '.join(f'`{m}`' for m in missing)]
        lines += ['', '## How to cite', '', d['cite'], '']
        open(os.path.join(folder, 'SOURCE.md'), 'w').write('\n'.join(lines))
        lic = [f"# Licence — {d['name']}", '', f"**{d['licence']}**", '', d['licence_url'], '']
        if d['licence_note']:
            lic += [d['licence_note'], '']
        lic += ['Required attribution:', '', d['cite'], '']
        open(os.path.join(folder, 'LICENSE.md'), 'w').write('\n'.join(lic))
    for ds, d in MANUAL.items():
        folder = os.path.join(RAW, ds)
        os.makedirs(folder, exist_ok=True)
        lines = [
            f"# {d['name']}", '', f"**{d['status']}**", '',
            f"- **Why:** {d['why']}",
            f"- **What to do:** {d['action']}",
            f"- **Licence:** {d['licence']}",
            f"- **Geographic coverage:** {d['area']}",
            f"- **Historical date range:** {d['period']}",
            '- **Checked on:** 2026-09-29', '',
        ]
        open(os.path.join(folder, 'SOURCE.md'), 'w').write('\n'.join(lines))


if __name__ == '__main__':
    main()
