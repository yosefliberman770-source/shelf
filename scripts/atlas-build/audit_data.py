#!/usr/bin/env python3
"""Audit the built atlas data: coordinates, geometry, dates, provenance, index integrity, tiles, coverage.

Reads what the build wrote — nothing is downloaded or changed:
  public/world/places/{c,n,i}        public gazetteer index           public/world/tiles/*.pmtiles
  data/private-pack/build/places     private gazetteer index (local)  data/private-pack/build/tiles/*.pmtiles
  public/atlas/*.json                GeoJSON packs (roads, coasts, provinces…)
Writes:
  data/historical/audit/data-quality.json   every count, and flagged public records (capped per check, with totals)
  data/private-pack/audit-private.json      flagged private records (git-ignored, never published)
  docs/DATA_QUALITY.md                      the same, summarised — generated, never edited by hand

Flags are for review: nothing is deleted here. What the build rejects is decided by quality.py.

  python3 scripts/atlas-build/audit_data.py            (add --no-tiles to skip decoding the tile archives)
"""
from __future__ import annotations

import glob
import gzip
import json
import math
import os
import re
import statistics
import sys
import time
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import quality  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUBLIC_PLACES = os.path.join(ROOT, 'public', 'world', 'places')
PRIVATE_PLACES = os.path.join(ROOT, 'data', 'private-pack', 'build', 'places')
TILE_DIRS = [('public', os.path.join(ROOT, 'public', 'world', 'tiles')), ('private', os.path.join(ROOT, 'data', 'private-pack', 'build', 'tiles'))]
OUT_JSON = os.path.join(ROOT, 'data', 'historical', 'audit', 'data-quality.json')
OUT_MD = os.path.join(ROOT, 'docs', 'DATA_QUALITY.md')
OUT_PRIVATE = os.path.join(ROOT, 'data', 'private-pack', 'audit-private.json')  # git-ignored
CAP = 40  # flagged examples kept per check (totals are always complete)
CELL = 2

# Approximate regions (lon/lat boxes, first match wins) — for coverage summaries only, not for any decision.
REGIONS = [
    ('British Isles', -11, 49.8, 2, 61), ('Low Countries', 2.5, 49.5, 7.3, 53.6), ('Iberia', -10, 35.8, 3.4, 43.9),
    ('France', -5, 42.3, 8.3, 51.1), ('Italy', 6.6, 36.6, 18.6, 46.6), ('Bohemia & Austria', 12, 46.3, 17.2, 51.1),
    ('Hungary & Carpathian basin', 16, 45.5, 26.7, 49.6), ('Romania & Moldavia', 20, 43.6, 30, 48.3),
    ('Scandinavia & Baltic Sea', 4.5, 54.8, 31.6, 71.5), ('Germany', 5.8, 47.2, 15.1, 55.1), ('Poland & Baltic lands', 14, 49, 28, 59),
    ('Greece & Aegean', 19, 34.8, 29.6, 41.8), ('Balkans', 13, 39, 29.7, 46.5), ('Anatolia', 26, 35.8, 45, 42.2),
    ('Levant', 34, 29, 40, 37.2), ('Egypt', 24.7, 22, 35, 31.7), ('North Africa', -17, 20, 24.7, 37.5),
    ('Ukraine, Belarus & Rus’', 22, 44, 50, 60), ('Middle East & Iran', 38, 12, 65, 40),
]


def region(lon, lat):
    for name, w, s, e, n in REGIONS:
        if w <= lon <= e and s <= lat <= n:
            return name
    return 'Other'


def century(y):
    """-218 → '-3', 1100 → '11' (the century a year falls in, BCE negative)."""
    return str(-((-y - 1) // 100 + 1)) if y < 0 else str((y - 1) // 100 + 1)


def registry():
    """Gazetteer ids, boxes and coverage from src/atlas/gazetteer.ts (the one registry the app uses)."""
    src = open(os.path.join(ROOT, 'src', 'atlas', 'gazetteer.ts'), encoding='utf-8').read()
    out = {}
    for m in re.finditer(r"\{ id: '(\w+)', name: '([^']*)'.*?coverage: \[(-?\d+), (-?\d+)\], core: \[(-?\d+), (-?\d+)\], box: \[([-\d., ]+)\]", src):
        out[m.group(1)] = {'name': m.group(2), 'coverage': [int(m.group(3)), int(m.group(4))], 'box': [float(x) for x in m.group(7).split(',')],
                           'private': '(private data)' in m.group(2)}
    return out


def flag(bucket, key, example):
    b = bucket.setdefault(key, {'count': 0, 'examples': []})
    b['count'] += 1
    if len(b['examples']) < CAP:
        b['examples'].append(example)


def cell_of(lon, lat):
    return f'{int(math.floor((lon + 180) / CELL))}_{int(math.floor((lat + 90) / CELL))}'


def norm(s):
    import unicodedata
    s = unicodedata.normalize('NFD', s)
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').lower()
    s = re.sub(r'^the\s+', '', s).replace('’', "'")
    return re.sub(r'\s+', ' ', s).strip()


# ── Gazetteer index ────────────────────────────────────────────────────────

def audit_index(base, reg, land, label):
    rows, flags = [], {}
    if not os.path.isdir(base):
        return rows, {'present': False}
    by_key = {}
    for f in sorted(glob.glob(os.path.join(base, 'c', '*.json'))):
        cell = os.path.basename(f)[:-5]
        for r in json.load(open(f, encoding='utf-8')):
            src, pid, title, lon, lat = r[:5]
            key = f'{src}:{pid}'
            ex = {'key': key, 'title': title, 'lon': lon, 'lat': lat}
            if key in by_key:
                flag(flags, 'duplicate id', ex)
            by_key[key] = (cell, r)
            rows.append(r)
            info = reg.get(src)
            if not info:
                flag(flags, 'dataset not in the registry', ex)
            why = quality.position_problem(lon, lat)
            if why:
                flag(flags, f'position: {why}', ex)
                continue
            if cell_of(lon, lat) != cell:
                flag(flags, 'stored in the wrong map cell', ex)
            if info and not quality.in_box(lon, lat, info['box'], margin=1.0):
                # Swapped only when the given point is at sea and the exchanged one on land inside the dataset's region
                # (a real place outside the region, e.g. Great Zimbabwe in Pleiades, is not a swapped pair).
                is_swapped = quality.swapped(lon, lat, info['box']) and land is not None and land(lon, lat) > 25 and land(lat, lon) == 0
                flag(flags, 'swapped latitude/longitude' if is_swapped else 'outside the dataset’s documented region', {**ex, 'dataset': src})
            if min(quality.decimals(lon), quality.decimals(lat)) < 2:
                flag(flags, 'coarse position (under 2 decimals)', ex)
            if not title or not str(title).strip():
                flag(flags, 'no name', ex)
            if pid is None or str(pid) == '':
                flag(flags, 'no source id', ex)
            dp = quality.date_problem(r[7], r[8])
            if dp:
                flag(flags, f'dates: {dp}', {**ex, 'from': r[7], 'to': r[8]})
            env = (r[13] or {}).get('env')
            if env:
                ep = quality.date_problem(env[0], env[1])
                if ep:
                    flag(flags, f'evidence period: {ep}', {**ex, 'env': env})
            if r[7] is None and r[8] is not None and not env:
                flag(flags, 'end date only (shown only at its end; unevidenced before)', {**ex, 'to': r[8]})
            if land is not None:
                d = land(lon, lat)
                kind = (r[13] or {}).get('k') or r[6] or ''
                # Natural Earth's 1:50m land leaves out small islands and smooths coasts, so only points well out at sea
                # are listed; features that belong at sea (wrecks, islands, bays, provinces drawn by a label point) are not.
                if d > 25 and not re.search(r'wreck|sea|island|archipelago|harbou?r|port|anchorage|cape|promontor|bay|gulf|strait|reef|lighthouse|water|province|region',
                                            str(kind) + ' ' + str(r[6]) + ' ' + str(title), re.I):
                    flag(flags, 'more than 25 km offshore (review)', {**ex, 'km': round(d, 1), 'kind': kind})
    # Same dataset, same exact position, several records: listed for review (a register's parish centroid, or real).
    pos = Counter((r[0], r[3], r[4]) for r in rows)
    for (src, lon, lat), n in pos.items():
        if n >= 5:
            flag(flags, 'five or more records of one dataset at one exact position', {'dataset': src, 'lon': lon, 'lat': lat, 'records': n})
    # Index integrity: names → records, ids → cells, every record reachable by name and id.
    named = set()
    for f in glob.glob(os.path.join(base, 'n', '*.json')):
        for nn, src, pid, cell, _ in json.load(open(f, encoding='utf-8')):
            key = f'{src}:{pid}'
            hit = by_key.get(key)
            if not hit or hit[0] != cell:
                flag(flags, 'name index points to a missing record', {'name': nn, 'key': key, 'cell': cell})
            named.add(key)
    id_cells = {}
    for f in glob.glob(os.path.join(base, 'i', '*.json')):
        src = os.path.basename(f).rsplit('-', 1)[0]
        for pid, cell in json.load(open(f, encoding='utf-8')).items():
            id_cells[f'{src}:{pid}'] = cell
    for key, (cell, r) in by_key.items():
        if id_cells.get(key) != cell:
            flag(flags, 'record not reachable by its id', {'key': key})
        if key not in named and len(norm(r[2])) >= 2:
            flag(flags, 'record not reachable by its name', {'key': key, 'title': r[2]})
    for key, cell in id_cells.items():
        if key not in by_key:
            flag(flags, 'id index points to a missing record', {'key': key, 'cell': cell})
    return rows, {'present': True, 'records': len(rows), 'flags': flags}


def land_distance():
    """Distance (km) from a point to the nearest land; 0 on land (quality.land_distance, shared with the loader)."""
    return quality.land_distance(ROOT)


# ── Tiles ──────────────────────────────────────────────────────────────────

def audit_tiles(path, time_budget=240):
    from pmtiles.reader import MmapSource, Reader, all_tiles
    import mapbox_vector_tile
    from shapely.geometry import shape
    out = {'file': os.path.relpath(path, ROOT), 'bytes': os.path.getsize(path)}
    flags = {}
    with open(path, 'rb') as fh:
        rd = Reader(MmapSource(fh))
        h, meta = rd.header(), rd.metadata()
        out.update({'minZoom': h['min_zoom'], 'maxZoom': h['max_zoom'], 'bounds': [h['min_lon_e7'] / 1e7, h['min_lat_e7'] / 1e7, h['max_lon_e7'] / 1e7, h['max_lat_e7'] / 1e7],
                    'layers': [l['id'] for l in meta.get('vector_layers', [])], 'attribution': meta.get('attribution')})
        if quality.geometry_problem(out['bounds']):
            flag(flags, 'archive bounds impossible', out['bounds'])
        start = time.time()
        feats_at_max, ids, props_seen, geom_types = 0, set(), Counter(), Counter()
        tiles_read, complete = 0, True
        temporal = Counter()
        for (z, x, y), data in all_tiles(MmapSource(fh)):
            if time.time() - start > time_budget:
                complete = False
                break
            tiles_read += 1
            try:
                layers = mapbox_vector_tile.decode(gzip.decompress(data))
            except Exception as e:  # noqa: BLE001
                flag(flags, 'undecodable tile', f'{z}/{x}/{y}: {e}')
                continue
            for lname, layer in layers.items():
                ext = layer.get('extent', 4096)
                for ft in layer['features']:
                    g = ft['geometry']
                    gt = g['type']
                    if gt in ('Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'):
                        try:
                            sg = shape(g)
                        except Exception:  # noqa: BLE001
                            flag(flags, 'unreadable geometry in a tile', f'{z}/{x}/{y}')
                            continue
                        if 'Polygon' in gt and not sg.is_valid:
                            flag(flags, 'invalid polygon in a tile', {'tile': f'{z}/{x}/{y}', 'id': ft['properties'].get('i')})
                        if 'Line' in gt and sg.length == 0:
                            flag(flags, 'zero-length line in a tile', {'tile': f'{z}/{x}/{y}', 'id': ft['properties'].get('i')})
                    if z != h['max_zoom']:
                        continue
                    p = ft['properties']
                    fid = p.get('i', ft.get('id'))
                    # One feature cut across tiles is counted once: by its id, or by its properties when it has no id.
                    key = (lname, gt, fid) if fid not in (None, '') else (lname, gt, json.dumps(p, sort_keys=True, default=str))
                    if key in ids:
                        continue
                    ids.add(key)
                    feats_at_max += 1
                    geom_types[gt] += 1
                    props_seen.update(p.keys())
                    f, t, ef, et = p.get('f'), p.get('t'), p.get('ef'), p.get('et')
                    temporal['own dates' if f is not None or t is not None else 'evidence period' if ef is not None or et is not None else 'no dates'] += 1
                    if f is None and t is not None:
                        temporal['end only'] += 1
                    for a, b in ((f, t), (ef, et)):
                        dp = quality.date_problem(a if isinstance(a, (int, float)) else None, b if isinstance(b, (int, float)) else None)
                        if dp:
                            flag(flags, f'dates: {dp}', {'id': fid, 'f': a, 't': b})
                    if gt == 'Point':
                        px, py = g['coordinates']
                        n = 1 << z
                        lon = (x + px / ext) / n * 360 - 180
                        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1 - py / ext) / n))))
                        if quality.position_problem(lon, lat):
                            flag(flags, 'point decodes to an impossible position', {'id': fid})
        out.update({'tilesRead': tiles_read, 'complete': complete, 'featuresAtMaxZoom': feats_at_max, 'geometry': dict(geom_types),
                    'temporal': dict(temporal), 'properties': sorted(props_seen), 'flags': flags})
    return out


def audit_geojson(path):
    from shapely.geometry import shape
    d = json.load(open(path, encoding='utf-8'))
    feats = d.get('features', []) if isinstance(d, dict) else []
    flags, types, temporal = {}, Counter(), Counter()
    for ft in feats:
        g, p = ft.get('geometry'), ft.get('properties') or {}
        if not g:
            flag(flags, 'no geometry', p.get('i') or p.get('n'))
            continue
        types[g['type']] += 1
        try:
            sg = shape(g)
        except Exception:  # noqa: BLE001
            flag(flags, 'unreadable geometry', p.get('i') or p.get('n'))
            continue
        why = quality.geometry_problem(sg.bounds) if not sg.is_empty else 'empty geometry'
        if why:
            flag(flags, f'geometry: {why}', p.get('i') or p.get('n'))
        elif 'Polygon' in g['type'] and not sg.is_valid:
            from shapely.validation import explain_validity
            flag(flags, 'invalid polygon', {'id': p.get('i') or p.get('n'), 'why': explain_validity(sg)[:80]})
        elif 'Line' in g['type'] and sg.length == 0:
            flag(flags, 'zero-length line', p.get('i') or p.get('n'))
        f, t = p.get('f'), p.get('t')
        temporal['own dates' if f is not None or t is not None else 'no dates'] += 1
        if f is None and t is not None:
            temporal['end only'] += 1
        dp = quality.date_problem(f if isinstance(f, (int, float)) else None, t if isinstance(t, (int, float)) else None)
        if dp:
            flag(flags, f'dates: {dp}', {'id': p.get('i') or p.get('n'), 'f': f, 't': t})
    return {'file': os.path.relpath(path, ROOT), 'features': len(feats), 'geometry': dict(types), 'temporal': dict(temporal), 'flags': flags}


# ── Coverage ───────────────────────────────────────────────────────────────

def coverage(rows, reg):
    by_ds, by_region_century, by_kind, by_ds_kind, dated = Counter(), defaultdict(Counter), Counter(), defaultdict(Counter), Counter()
    by_ds_region = defaultdict(Counter)
    for r in rows:
        src, lon, lat = r[0], r[3], r[4]
        if quality.position_problem(lon, lat):
            continue
        extra = r[13] or {}
        kind = extra.get('k') or (r[6].split(',')[0] if r[6] else '') or 'unspecified'
        by_ds[src] += 1
        by_kind[kind] += 1
        by_ds_kind[src][kind] += 1
        reg_name = region(lon, lat)
        by_ds_region[src][reg_name] += 1
        start = r[7] if r[7] is not None else (extra.get('env') or [None])[0] if extra.get('env') else (extra.get('period') or [None])[0] if extra.get('period') else None
        dated['own dates' if r[7] is not None or r[8] is not None else 'evidence period' if extra.get('env') or extra.get('period') else 'no temporal evidence'] += 1
        if start is not None and quality.date_problem(start, None) is None:
            by_region_century[reg_name][century(int(start))] += 1
        else:
            by_region_century[reg_name]['undated'] += 1
    return {'byDataset': dict(by_ds.most_common()), 'byKind': dict(by_kind.most_common(40)), 'datedness': dict(dated),
            'byDatasetKind': {k: dict(v.most_common(12)) for k, v in by_ds_kind.items()},
            'byDatasetRegion': {k: dict(v.most_common(8)) for k, v in by_ds_region.items()},
            'byRegionFirstCentury': {k: dict(sorted(v.items(), key=lambda kv: (kv[0] == 'undated', int(kv[0]) if kv[0] != 'undated' else 0))) for k, v in by_region_century.items()}}


def dataset_checks(rows):
    """The recovered datasets, measured from the built rows (not from earlier reports)."""
    out = {}
    by = defaultdict(list)
    for r in rows:
        by[r[0]].append(r)
    for src, rs in sorted(by.items()):
        kinds = Counter(((r[13] or {}).get('k') or r[6] or 'unspecified') for r in rs)
        own = sum(1 for r in rs if r[7] is not None or r[8] is not None)
        env = sum(1 for r in rs if r[7] is None and r[8] is None and ((r[13] or {}).get('env') or (r[13] or {}).get('period')))
        starts = [r[7] for r in rs if r[7] is not None] + [(r[13] or {})['env'][0] for r in rs if r[7] is None and (r[13] or {}).get('env') and (r[13] or {})['env'][0] is not None]
        founded = sum(1 for r in rs if (r[13] or {}).get('fb') == 'founded')
        fixes = sum(1 for r in rs if (r[13] or {}).get('fix'))
        out[src] = {'records': len(rs), 'kinds': dict(kinds.most_common(10)), 'ownDates': own, 'evidencePeriodOnly': env, 'noTemporalEvidence': len(rs) - own - env,
                    'startsFoundingDates': founded, 'withStatedCorrection': fixes,
                    'earliestStart': min(starts) if starts else None, 'latestStart': max(starts) if starts else None,
                    'startsAfter1600': sum(1 for y in starts if y > 1600),
                    'withEndDate': sum(1 for r in rs if r[8] is not None),
                    'regions': dict(Counter(region(r[3], r[4]) for r in rs if not quality.position_problem(r[3], r[4])).most_common(6))}
    return out


def buringh_positions(rows):
    """Buringh towns: how many positions the build changed, and by how much (the reported ~7% bad positions)."""
    towns = [r for r in rows if r[0] == 'buringh']
    moved = [r for r in towns if 'km away' in str((r[13] or {}).get('fix', ''))]
    km = [int(m.group(1)) for r in moved for m in [re.search(r'(\d+) km away', r[13]['fix'])] if m]
    return {'towns': len(towns), 'positionTakenFromWikidata': len(moved), 'share': round(len(moved) / len(towns), 3) if towns else None,
            'movedKmMedian': statistics.median(km) if km else None, 'movedKmMax': max(km) if km else None,
            'note': 'Positions the source gives wrongly (lost decimals, another town of the name) are replaced by the matching Wikidata town, '
                    'and the distance is stated on the record; there is no uniform shift to correct.'}


# ── Report ─────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    reg = registry()
    land = land_distance()
    pub_rows, pub = audit_index(PUBLIC_PLACES, reg, land, 'public')
    prv_rows, prv = audit_index(PRIVATE_PLACES, reg, land, 'private')
    # Private datasets must never be in the public index; public ones never only in the private one.
    leaks = sorted({r[0] for r in pub_rows if reg.get(r[0], {}).get('private')})
    report = {'generated': time.strftime('%Y-%m-%d'), 'registry': {k: {'private': v['private'], 'box': v['box']} for k, v in reg.items()},
              'publicIndex': pub, 'privateIndex': prv, 'privateDatasetsInPublicIndex': leaks,
              'coverage': coverage(pub_rows + prv_rows, reg), 'datasets': dataset_checks(pub_rows + prv_rows), 'buringh': buringh_positions(pub_rows)}
    if '--no-tiles' not in sys.argv:
        report['tiles'] = [dict(audit_tiles(p), visibility=vis) for vis, d in TILE_DIRS for p in sorted(glob.glob(os.path.join(d, '*.pmtiles')))]
    report['geojson'] = [audit_geojson(p) for p in sorted(glob.glob(os.path.join(ROOT, 'public', 'atlas', '*.json'))) if not p.endswith('manifest.json')
                         and isinstance(json.load(open(p, encoding='utf-8')), dict) and 'features' in json.load(open(p, encoding='utf-8'))]
    report['seconds'] = round(time.time() - t0)
    # Private records (names, positions) never go into the public repository: the committed report keeps only counts
    # for the private index and private tiles; the examples go to the git-ignored private folder.
    if prv.get('present'):
        os.makedirs(os.path.dirname(OUT_PRIVATE), exist_ok=True)
        with open(OUT_PRIVATE, 'w', encoding='utf-8') as f:
            json.dump({'privateIndex': prv, 'tiles': [t for t in report.get('tiles', []) if t.get('visibility') == 'private']}, f, ensure_ascii=False, indent=1)
    public = json.loads(json.dumps(report))
    for fl in (public['privateIndex'].get('flags') or {}).values():
        fl['examples'] = []
    for t in public.get('tiles', []):
        if t.get('visibility') == 'private':
            for fl in t['flags'].values():
                fl['examples'] = []
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(public, f, ensure_ascii=False, indent=1)
    write_markdown(report)
    print(f'{OUT_JSON}\n{OUT_MD}\n{report["seconds"]} s')


def _flags_table(flags):
    if not flags:
        return 'No problems found.\n'
    return '| Check | Records |\n|---|---:|\n' + ''.join(f'| {k} | {v["count"]:,} |\n' for k, v in sorted(flags.items(), key=lambda kv: -kv[1]['count']))


def write_markdown(r):
    L = ['# Atlas data quality', '',
         f'Generated by `scripts/atlas-build/audit_data.py` on {r["generated"]} from the built data. Do not edit by hand — re-run the script.',
         'Flags are for review; nothing is deleted by the audit. The build itself rejects impossible positions and dates (scripts/atlas-build/quality.py).', '']
    for label, key in (('Public gazetteer index', 'publicIndex'), ('Private gazetteer index (this machine only)', 'privateIndex')):
        ix = r[key]
        L += [f'## {label}', '']
        if not ix.get('present'):
            L += ['Not present on this machine.', '']
            continue
        L += [f'{ix["records"]:,} records.', '', _flags_table(ix['flags']),
              'Shared and coarse positions are marked approximate by the build (with the reason); they stay listed here for review.', '']
    L += ['## Public/private separation', '', f'Private datasets found in the public index: {", ".join(r["privateDatasetsInPublicIndex"]) or "none"}.', '']
    L += ['## Datasets (measured from the built index)', '', '| Dataset | Records | Own dates | Evidence period only | No temporal evidence | Founding dates | End dates | Earliest start | Latest start | Starts after 1600 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for k, v in sorted(r['datasets'].items(), key=lambda kv: -kv[1]['records']):
        L.append(f'| {k} | {v["records"]:,} | {v["ownDates"]:,} | {v["evidencePeriodOnly"]:,} | {v["noTemporalEvidence"]:,} | {v["startsFoundingDates"]:,} | {v["withEndDate"]:,} | {v["earliestStart"] if v["earliestStart"] is not None else "—"} | {v["latestStart"] if v["latestStart"] is not None else "—"} | {v["startsAfter1600"]:,} |')
    L += ['', 'Kinds per dataset:', '']
    for k, v in sorted(r['datasets'].items()):
        L.append(f'- **{k}**: ' + ', '.join(f'{kk} {vv:,}' for kk, vv in v['kinds'].items()))
    b = r['buringh']
    L += ['', '## Buringh town positions', '', f'{b["towns"]:,} towns; {b["positionTakenFromWikidata"]:,} ({(b["share"] or 0) * 100:.1f}%) take their position from Wikidata because the source position was wrong '
          f'(median {b["movedKmMedian"]} km, largest {b["movedKmMax"]} km). {b["note"]}', '']
    cov = r['coverage']
    L += ['## Coverage by region and first century of evidence (all gazetteer records, public and private)', '',
          'Regions are approximate boxes. A record counts in the century its own dates or evidence period begin; "undated" has neither.', '']
    cents = sorted({c for v in cov['byRegionFirstCentury'].values() for c in v if c != 'undated' and -30 <= int(c) <= 20}, key=int)
    shown = [c for c in cents if int(c) >= 1]
    L.append('| Region | BCE | ' + ' | '.join(shown) + ' | undated |')
    L.append('|---|---:|' + '---:|' * len(shown) + '---:|')
    for reg_name, v in sorted(cov['byRegionFirstCentury'].items(), key=lambda kv: -sum(kv[1].values())):
        bce = sum(n for c, n in v.items() if c != 'undated' and int(c) < 0)
        L.append(f'| {reg_name} | {bce:,} | ' + ' | '.join(f'{v.get(c, 0):,}' for c in shown) + f' | {v.get("undated", 0):,} |')
    L += ['', f'Temporal evidence of all records: ' + ', '.join(f'{k} {v:,}' for k, v in cov['datedness'].items()) + '.', '']
    L += ['## Tiles', '']
    for t in r.get('tiles', []):
        L += [f'### {os.path.basename(t["file"])} ({t["visibility"]}, {t["bytes"] / 1e6:.1f} MB)', '',
              f'Zoom {t["minZoom"]}–{t["maxZoom"]}; layers {", ".join(t["layers"])}; {t["featuresAtMaxZoom"]:,} distinct features (by id, or by properties when there is no id) at the highest zoom '
              f'({", ".join(f"{k} {v:,}" for k, v in t["geometry"].items())}); dates: {", ".join(f"{k} {v:,}" for k, v in t["temporal"].items()) or "none"}. '
              f'{t["tilesRead"]:,} tiles decoded{"" if t["complete"] else " (time limit reached: partial)"}.', '', _flags_table(t['flags'])]
    L += ['## GeoJSON packs', '']
    for g in r['geojson']:
        L += [f'### {os.path.basename(g["file"])}', '', f'{g["features"]:,} features ({", ".join(f"{k} {v:,}" for k, v in g["geometry"].items())}); dates: {", ".join(f"{k} {v:,}" for k, v in g["temporal"].items())}.', '', _flags_table(g['flags'])]
    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    with open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
