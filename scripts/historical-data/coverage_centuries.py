#!/usr/bin/env python3
"""Coverage matrix: REGION × CENTURY CHECKPOINT × CATEGORY, scored 0–100, from the records Shelf actually holds.

  python3 scripts/historical-data/coverage_centuries.py
    → data/historical/coverage-centuries.json   (every cell: score, counts, dating mix, sources)
    → data/historical/weak-cells.csv            (every cell scoring below 70)
    → docs/COVERAGE_CENTURIES.md                (tables)

A record counts at checkpoint Y when its own interval overlaps Y−50…Y+49. Nothing is counted at a checkpoint from a
dataset's self-described period unless that is all the record has, and then it is weighted as such (see DATING).
Regions are present-day units (Natural Earth map units, so England, Wales and Scotland are separate): a counting
convenience, never a historical claim.

Score (0–100) for a cell with n records:
  Q  = quantity against a target for that category, scaled by the region's area (log scale, capped at 1)
  D  = mean dating weight of the records (DATING)
  V  = distinct sources, capped at 3
  score = 100 · Q^0.8 · (0.55 + 0.30·D + 0.15·V/3)
So a region full of records dated only by "the dataset covers 1000–1500" cannot reach 70, however many it has.
"""
import json
import math
import os
import re
import sys
from collections import defaultdict
from datetime import date

from shapely.geometry import Point, shape
from shapely.ops import transform
from shapely.strtree import STRtree

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PUB = os.path.join(ROOT, 'public')
CACHE = os.path.join(ROOT, 'scripts', 'atlas-build', '.cache')
PRIVATE_PLACES = os.path.join(ROOT, 'data', 'private-pack', 'build', 'places', 'c')
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'atlas-build'))

CHECKPOINTS = list(range(200, 2000, 100))
CATEGORIES = ['Settlements', 'Political', 'Religious', 'Military', 'Transport', 'Economic', 'Maritime', 'Physical', 'Archaeology', 'Population',
              'Names', 'Events']

# Region → Natural Earth map units (GEOUNIT). Western Russia is cut at 45°E.
REGIONS = {
    'England': ['England', 'Isle of Man', 'Jersey', 'Guernsey'], 'Wales': ['Wales'], 'Scotland': ['Scotland'],
    'Ireland': ['Ireland', 'Northern Ireland'], 'France': ['France', 'Monaco'], 'Low Countries': ['Netherlands', 'Flemish Region', 'Walloon Region', 'Brussels Capital Region', 'Luxembourg'],
    'Germany': ['Germany'], 'Austria': ['Austria', 'Liechtenstein'], 'Switzerland': ['Switzerland'], 'Italy': ['Italy', 'San Marino', 'Vatican', 'Malta'],
    'Spain': ['Spain', 'Andorra', 'Gibraltar'], 'Portugal': ['Portugal', 'Madeira'], 'Denmark': ['Denmark', 'Faroe Islands'], 'Sweden': ['Sweden', 'Aland'],
    'Norway': ['Norway'], 'Finland': ['Finland'], 'Iceland': ['Iceland'], 'Poland': ['Poland'], 'Czechia': ['Czechia'], 'Slovakia': ['Slovakia'],
    'Hungary': ['Hungary'], 'Romania & Moldova': ['Romania', 'Moldova'], 'Bulgaria': ['Bulgaria'], 'Serbia, Kosovo & Montenegro': ['Serbia', 'Vojvodina', 'Kosovo', 'Montenegro'],
    'Croatia': ['Croatia'], 'Slovenia': ['Slovenia'], 'Bosnia & Herzegovina': ['Bosnia and Herzegovina', 'Republic Srpska', 'Brcko District'],
    'North Macedonia & Albania': ['North Macedonia', 'Albania'], 'Greece': ['Greece'], 'Estonia': ['Estonia'], 'Latvia': ['Latvia'], 'Lithuania': ['Lithuania'],
    'Belarus': ['Belarus'], 'Ukraine': ['Ukraine'], 'Western Russia': ['Russia'], 'Turkey': ['Turkey'], 'Cyprus': ['Cyprus', 'Northern Cyprus', 'Cyprus No Mans Area', 'Akrotiri Sovereign Base Area', 'Dhekelia Sovereign Base Area'],
    'Caucasus': ['Georgia', 'Ajaria', 'Armenia', 'Azerbaijan'], 'Levant': ['Israel', 'West Bank', 'Gaza', 'Lebanon', 'Syria', 'Jordan'], 'Egypt': ['Egypt'],
    'Maghreb': ['Morocco', 'Algeria', 'Tunisia', 'Libya', 'Western Sahara'],
}
LANDLOCKED = {'Austria', 'Switzerland', 'Czechia', 'Slovakia', 'Hungary', 'Belarus', 'Serbia, Kosovo & Montenegro'}  # Maritime is n/a there

# Targets for a France-sized region (≈550,000 km²) at which quantity reaches 1; scaled by (area/550,000)^0.7.
TARGET = {'Settlements': 2000, 'Political': 15, 'Religious': 800, 'Military': 400, 'Transport': 300, 'Economic': 200, 'Maritime': 100,
          'Physical': 60, 'Archaeology': 500, 'Population': 30, 'Names': 1000, 'Events': 30}

# Dating weight: how well a record's own dates say when it existed.
DATING = {'exact': 1.0, 'attested': 0.8, 'period-narrow': 0.6, 'period-broad': 0.35, 'dataset': 0.15}

KIND_CAT = {'settlement': 'Settlements', 'town': 'Settlements', 'church': 'Religious', 'monastery': 'Religious', 'cathedral': 'Religious', 'diocese': 'Religious',
            'university': 'Religious', 'castle': 'Military', 'fortification': 'Military', 'market': 'Economic', 'hoard': 'Economic', 'mine': 'Economic',
            'mill': 'Economic', 'building': 'Settlements', 'wreck': 'Maritime', 'harbour': 'Maritime', 'port': 'Maritime', 'lighthouse': 'Maritime', 'road': 'Transport', 'bridge': 'Transport', 'canal': 'Transport', 'station': 'Transport', 'site': 'Archaeology'}


def pleiades_cat(t):
    if re.search(r'port|harbo|anchorage|lighthouse|shipshed', t):
        return 'Maritime'
    if re.search(r'temple|sanctuar|church|monaster|shrine|mosque|synagog|cathedral|abbey|priory', t):
        return 'Religious'
    if re.search(r'fort|castle|camp|wall|tower|castell|barrack|citadel', t):
        return 'Military'
    if re.search(r'road|bridge|station|aqueduct|canal|pass\b', t):
        return 'Transport'
    if re.search(r'river|mountain|lake|island|cape|bay|spring|forest|plain|valley|hill|marsh|lagoon|water', t):
        return 'Physical'
    if re.search(r'market|mine|quarr|kiln|mill|agora|forum|macellum|production', t):
        return 'Economic'
    if re.search(r'province|region|people|ethnic|territor', t):
        return 'Political'
    if re.search(r'archaeolog|tell|ruin|tumulus|cemetery|tomb|nuraghe|cairn|earthwork', t):
        return 'Archaeology'
    if re.search(r'settlement|urban|polis|villa|vicus|city|town|village|oppidum', t):
        return 'Settlements'
    return None


def category(src, types, ex):
    t = (types or '').lower()
    k = ex.get('k')
    if src == 'pleiades':
        return pleiades_cat(t)
    if src == 'viabundus':
        if re.search(r'\b(town|settlement)\b', t):
            return 'Settlements'
        if 'harbour' in t:
            return 'Maritime'
        if re.search(r'\b(toll|fair|staple)\b', t):
            return 'Economic'
        if re.search(r'\b(bridge|ferry|lock)\b', t):
            return 'Transport'
        return 'Settlements'
    if src == 'althurayya':
        return 'Transport' if 'waystation' in t else 'Political' if 'region' in t else 'Settlements'
    if src in ('hre', 'wbohemia', 'buringh'):
        return 'Settlements'
    if src == 'germaniasacra':
        return 'Religious'
    return KIND_CAT.get(k)


def dating(a, b, ex):
    """(from, to, class) for a record, from its own fields only."""
    env = ex.get('env') or ex.get('period')
    if a is not None or b is not None:
        fb = (ex.get('fb') or '').lower()
        return a, b, 'attested' if ('first' in fb or 'mention' in fb or 'grant' in fb) and b is None else 'exact'
    if env:
        lo, hi = env[0], env[1]
        basis = env[2] if len(env) > 2 else 'source'
        if basis == 'dataset':
            return lo, hi, 'dataset'
        width = (hi if hi is not None else 2000) - (lo if lo is not None else -3000)
        return lo, hi, 'period-narrow' if width <= 200 else 'period-broad'
    return None, None, None


def window_overlap(a, b, y):
    lo, hi = y - 50, y + 49
    return (a is None or a <= hi) and (b is None or b >= lo) and not (a is None and b is None)


def weight(cls, a, y):
    w = DATING[cls]
    # A first attestation says the place existed from then; centuries later it says less.
    if cls == 'attested' and a is not None and y - a > 300:
        w *= 0.5
    return w


class Cells:
    def __init__(self):
        self.n = defaultdict(int)
        self.w = defaultdict(float)
        self.cls = defaultdict(lambda: defaultdict(int))
        self.src = defaultdict(lambda: defaultdict(int))
        self.precise = defaultdict(int)

    def add(self, region, cat, a, b, cls, src, precise=True):
        if not region or not cat or cls is None:
            return
        for y in CHECKPOINTS:
            if window_overlap(a, b, y):
                key = (region, y, cat)
                self.n[key] += 1
                self.w[key] += weight(cls, a, y)
                self.cls[key][cls] += 1
                self.src[key][src] += 1
                self.precise[key] += 1 if precise else 0


def regions():
    d = json.load(open(os.path.join(CACHE, 'ne_map_units.geojson'), encoding='utf-8'))
    unit = {u: r for r, us in REGIONS.items() for u in us}
    geoms, names, area = [], [], defaultdict(float)
    for f in d['features']:
        r = unit.get(f['properties']['GEOUNIT'])
        if r:
            g = shape(f['geometry'])
            if r == 'Western Russia':
                from shapely.geometry import box
                g = g.intersection(box(19, 40, 45, 72))
            geoms.append(g)
            names.append(r)
            # Area in km², roughly (equal-area by latitude cosine).
            c = g.centroid.y
            area[r] += g.area * 111.32 * 111.32 * math.cos(math.radians(c))
    tree = STRtree(geoms)

    def at(lon, lat):
        pt = Point(lon, lat)
        for i in tree.query(pt):
            if geoms[i].contains(pt):
                return names[i]
        return None
    return at, dict(area)


def first_coord(g):
    cs = (g or {}).get('coordinates')
    while isinstance(cs, list) and cs and isinstance(cs[0], list):
        cs = cs[0] if not isinstance(cs[0][0], (int, float)) else cs[0]
        if isinstance(cs, list) and cs and isinstance(cs[0], (int, float)):
            break
    return cs if cs and isinstance(cs[0], (int, float)) else None


def representative(g):
    try:
        p = shape(g).representative_point()
        return p.x, p.y
    except Exception:  # noqa: BLE001
        c = first_coord(g)
        return (c[0], c[1]) if c else (None, None)


REGISTER_SRCS = {'canmore', 'irlsmr', 'nid', 'ivillaris', 'ottomannfs', 'generalkarte', 'cassini', 'lutsch', 'sirkd', 'lvmon', 'hrreg', 'r3verst', 'rohgis', 'transice', 'dissiloc', 'swegeo', 'tyrolmine', 'arkas', 'wdextra'}


def measure(at, place_dirs):
    cells = Cells()
    for d in place_dirs:
        for fn in os.listdir(d):
            for r in json.load(open(os.path.join(d, fn), encoding='utf-8')):
                src, _, _, lon, lat, prec, types, a, b, _, names, _, _, ex = r
                ex = ex or {}
                if src in REGISTER_SRCS:
                    continue  # counted from registers.pmtiles below (all their records, not only the indexed ones)
                region = at(lon, lat)
                if not region:
                    continue
                if src == 'buringh':
                    for yy, v in (ex.get('pop') or {}).items():
                        if v and v > 0:
                            cells.add(region, 'Population', int(yy) - 49, int(yy) + 50, 'exact' if not ex.get('est') or ex.get('q') else 'period-narrow', 'buringh')
                a2, b2, cls = dating(a, b, ex)
                precise = prec == 1 and not ex.get('pq')
                cells.add(region, category(src, types, ex), a2, b2, cls, src, precise)
                if names:
                    cells.add(region, 'Names', a2, b2, cls, src, precise)
                if src == 'hre':
                    if ex.get('fm1'):
                        cells.add(region, 'Economic', ex['fm1'][0], None, 'attested', 'hre:markets')
                    for name, ra, rb in ex.get('rule') or []:
                        pass  # counted as polities below

    # Events (Wikidata, HCED): dated to the year.
    for f, src in (('wikidata-events.json', 'wikidata'), ('hced-battles.json', 'hced')):
        for e in json.load(open(os.path.join(PUB, 'atlas', f), encoding='utf-8'))['features']:
            lon, lat = e['geometry']['coordinates'][:2]
            p = e['properties']
            region = at(lon, lat)
            y2 = p.get('y2', p['y'])
            cells.add(region, 'Events', p['y'], y2, 'exact', src)
            if p['k'] in ('battle', 'siege', 'campaign', 'expedition'):
                cells.add(region, 'Military', p['y'], y2, 'exact', src)

    # Political: distinct polities per region and checkpoint (Cliopatria label points), plus territories ruling the
    # Empire's towns (Princes and Townspeople) and Domesday hundreds (England 1086).
    pol = defaultdict(set)
    cl = os.path.join(PUB, 'atlas', 'cliopatria')
    for fn in os.listdir(cl):
        if not re.match(r'^(-?\d+)_(-?\d+)\.json$', fn):
            continue
        for f in json.load(open(os.path.join(cl, fn), encoding='utf-8'))['features']:
            p = f['properties']
            if 'lbl' not in p or f['geometry']['type'] != 'Point':
                continue
            region = at(*f['geometry']['coordinates'][:2])
            for y in CHECKPOINTS:
                if region and window_overlap(p.get('f'), p.get('t'), y):
                    pol[(region, y)].add(('clio', p.get('n')))
    for d in place_dirs:
        for fn in os.listdir(d):
            for r in json.load(open(os.path.join(d, fn), encoding='utf-8')):
                if r[0] == 'hre':
                    region = at(r[3], r[4])
                    for name, ra, rb in (r[13] or {}).get('rule') or []:
                        for y in CHECKPOINTS:
                            if region and window_overlap(ra, rb, y):
                                pol[(region, y)].add(('hre', name))
    for (region, y), names in pol.items():
        key = (region, y, 'Political')
        cells.n[key] += len(names)
        cells.w[key] += len(names) * DATING['exact']
        cells.cls[key]['exact'] += len(names)
        for s, _ in names:
            cells.src[key]['cliopatria' if s == 'clio' else 'hre'] += 1
        cells.precise[key] += len(names)

    # Lines and areas (tiles and GeoJSON): roads, waterways, dioceses, ancient shores and water.
    from pmtiles.reader import MmapSource, all_tiles
    import gzip
    import mapbox_vector_tile

    def tile_features(path, zoom):
        seen = {}
        with open(path, 'rb') as fh:
            for (z, x, y), data in all_tiles(MmapSource(fh)):
                if z != zoom:
                    continue
                for lname, layer in mapbox_vector_tile.decode(gzip.decompress(data)).items():
                    for ft in layer['features']:
                        p = ft['properties']
                        i = p.get('i', id(ft))
                        if i in seen:
                            continue
                        n = 2 ** z
                        gx, gy = ft['geometry']['coordinates'], None
                        c = first_coord(ft['geometry'])
                        if not c:
                            continue
                        ext = layer.get('extent', 4096)
                        lon = (x + c[0] / ext) / n * 360 - 180
                        lat_r = math.atan(math.sinh(math.pi * (1 - 2 * (y + 1 - c[1] / ext) / n)))
                        seen[i] = (p, lon, math.degrees(lat_r))
        return seen.values()

    for path, zoom, src, cat, default in (('domesday.pmtiles', 9, 'domesday', 'Political', (1086, 1086, 'exact')),
                                          ('gs-dioceses.pmtiles', 7, 'germaniasacra-dioceses', 'Religious', None),
                                          ('gough.pmtiles', 8, 'gough', 'Transport', (1360, 1360, 'period-narrow')),
                                          ('navigation.pmtiles', 8, 'navigation', 'Transport', (1000, 1348, 'period-broad')),
                                          ('thurayya-routes.pmtiles', 6, 'althurayya-routes', 'Transport', (800, 1000, 'dataset'))):
        f = os.path.join(PUB, 'world', 'tiles', path)
        if not os.path.exists(f):
            continue
        for p, lon, lat in tile_features(f, zoom):
            if default:
                a, b, cls = default
            else:
                a, b, cls = p.get('f'), p.get('t'), 'exact' if (p.get('f') or p.get('t')) else None
            cells.add(at(lon, lat), cat, a, b, cls, src)

    # National registers and historical gazetteers: every record in registers.pmtiles, by its own dating.
    reg_path = os.path.join(PUB, 'world', 'tiles', 'registers.pmtiles')
    if os.path.exists(reg_path):
        for p, lon, lat in tile_features(reg_path, 11):
            k = p.get('k')
            cat = KIND_CAT.get(k)
            ef, et = p.get('ef'), p.get('et')
            if p.get('sn'):
                a, b, cls = ef, ef, 'exact'  # listed in that year
            elif ef is not None or et is not None:
                width = p.get('cw') or ((et if et is not None else 2000) - (ef if ef is not None else -3000))
                a, b, cls = ef, et, 'period-narrow' if width <= 200 else 'period-broad'
            else:
                continue  # undated: not evidence for any checkpoint
            region = at(lon, lat)
            precise = not p.get('u')
            cells.add(region, cat, a, b, cls, p.get('src', 'registers'), precise)
            if k == 'settlement' and p.get('src') in ('ivillaris', 'ottomannfs', 'generalkarte', 'lutsch', 'r3verst', 'rohgis', 'transice', 'dissiloc', 'swegeo', 'tyrolmine'):
                cells.add(region, 'Names', a, b, cls, p.get('src'), precise)  # each is a historically attested place-name form
    ins = os.path.join(PUB, 'world', 'tiles', 'inscriptions.pmtiles')
    if os.path.exists(ins):
        for p, lon, lat in tile_features(ins, 10):
            region = at(lon, lat)
            for y in CHECKPOINTS:
                n = (p.get(f'c{y - 100}') or 0) + (p.get(f'c{y}') or 0)  # inscriptions dated to a century overlapping Y−50…Y+49
                if n:
                    key = (region, y, 'Archaeology')
                    if region:
                        cells.n[key] += 1
                        cells.w[key] += DATING['period-narrow']
                        cells.cls[key]['period-narrow'] += 1
                        cells.src[key]['lirelist'] += 1
                        cells.precise[key] += 1
    cas = os.path.join(PUB, 'world', 'tiles', 'cassini-roads.pmtiles')
    if os.path.exists(cas):
        for p, lon, lat in tile_features(cas, 11):
            cells.add(at(lon, lat), 'Transport', 1756, 1815, 'period-narrow', 'cassini')

    for line in open(os.path.join(CACHE, 'itinere.ndjson'), encoding='utf-8'):
        f = json.loads(line)
        c = first_coord(f.get('geometry'))
        if c:
            p = f['properties']
            a, b = p.get('lowerDate'), p.get('upperDate')
            cells.add(at(c[0], c[1]), 'Transport', a, b, 'period-broad' if a is not None else 'dataset', 'itinere')
    for f in json.load(open(os.path.join(CACHE, 'viabundus_Viabundus-2-edges.geojson'), encoding='utf-8'))['features']:
        c = first_coord(f.get('geometry'))
        if c:
            p = f['properties']
            a, b = p.get('fromyear'), p.get('toyear')
            cells.add(at(c[0], c[1]), 'Transport', a or 1350, b or 1650, 'exact' if (a or b) else 'dataset', 'viabundus')
    for fname, cat, src in (('awmc-roads.json', 'Transport', 'awmc'), ('awmc-shoreline.json', 'Physical', 'awmc'), ('awmc-inland-water.json', 'Physical', 'awmc'),
                            ('pleiades-lines.json', None, 'pleiades'), ('physical-change.json', 'Physical', 'polders')):
        for f in json.load(open(os.path.join(PUB, 'atlas', fname), encoding='utf-8'))['features']:
            lon, lat = representative(f['geometry'])
            if lon is None:
                continue
            p = f['properties']
            c = cat or ('Transport' if p.get('k') in ('road', 'aqueduct', 'canal') else 'Physical' if p.get('k') == 'river' else None)
            if src == 'polders':
                cells.add(at(lon, lat), c, p.get('f'), p.get('y'), 'period-broad', src)
            elif p.get('f') is not None or p.get('t') is not None:
                cells.add(at(lon, lat), c, p.get('f'), p.get('t'), 'period-broad', src)
            else:
                cells.add(at(lon, lat), c, -750, 640, 'dataset', src)
    return cells


def score(cells, region, y, cat, area):
    if cat == 'Maritime' and region in LANDLOCKED:
        return None
    key = (region, y, cat)
    n = cells.n.get(key, 0)
    if not n:
        return 0
    t = TARGET[cat] * max(0.08, min(2.5, (area / 550000) ** 0.7))
    if cat == 'Political':
        t = max(4, TARGET[cat] * max(0.3, min(2.0, (area / 550000) ** 0.5)))
    q = min(1.0, math.log1p(n) / math.log1p(t))
    d = cells.w[key] / n
    v = min(3, len(cells.src[key])) / 3
    return round(100 * q ** 0.8 * (0.55 + 0.30 * d + 0.15 * v))


def main():
    at, area = regions()
    dirs = [os.path.join(PUB, 'world', 'places', 'c')]
    private = os.path.isdir(PRIVATE_PLACES)
    cells = measure(at, dirs + ([PRIVATE_PLACES] if private else []))
    out = {'built': date.today().isoformat(), 'checkpoints': CHECKPOINTS, 'categories': CATEGORIES, 'includesPrivatePack': private,
           'method': __doc__.strip(), 'targets': TARGET, 'datingWeights': DATING, 'areaKm2': {r: round(a) for r, a in area.items()}, 'cells': []}
    weak = []
    for region in REGIONS:
        for y in CHECKPOINTS:
            for cat in CATEGORIES:
                s = score(cells, region, y, cat, area[region])
                key = (region, y, cat)
                cell = {'region': region, 'year': y, 'category': cat, 'score': s, 'records': cells.n.get(key, 0),
                        'dating': dict(cells.cls.get(key, {})), 'sources': dict(sorted(cells.src.get(key, {}).items(), key=lambda kv: -kv[1])),
                        'precisePositionShare': round(cells.precise.get(key, 0) / cells.n[key], 2) if cells.n.get(key) else None}
                out['cells'].append(cell)
                if s is not None and s < 70:
                    weak.append(cell)
    json.dump(out, open(os.path.join(ROOT, 'data', 'historical', 'coverage-centuries.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(ROOT, 'data', 'historical', 'weak-cells.csv'), 'w', encoding='utf-8') as fh:
        fh.write('region,year,category,score,records,exact,attested,period_narrow,period_broad,dataset_wide,main_sources\n')
        for c in weak:
            dm = c['dating']
            fh.write(f'"{c["region"]}",{c["year"]},{c["category"]},{c["score"]},{c["records"]},{dm.get("exact", 0)},{dm.get("attested", 0)},'
                     f'{dm.get("period-narrow", 0)},{dm.get("period-broad", 0)},{dm.get("dataset", 0)},"{"; ".join(list(c["sources"])[:4])}"\n')
    write_doc(out, weak)
    total = sum(1 for c in out['cells'] if c['score'] is not None)
    print(f'{total} cells, {len(weak)} below 70')


def write_doc(out, weak):
    by = {(c['region'], c['year'], c['category']): c for c in out['cells']}
    mark = lambda s: '–' if s is None else f'**{s}**' if s >= 70 else str(s)  # noqa: E731
    L = ['# Coverage by region, century and category', '',
         f'Generated by `scripts/historical-data/coverage_centuries.py` on {out["built"]} from the records Shelf holds'
         f'{" (public data and the private pack)" if out["includesPrivatePack"] else ""}. Every cell is in `data/historical/coverage-centuries.json`; '
         'the cells below 70 are in `data/historical/weak-cells.csv`.', '',
         '**How a cell is scored.** A record counts at checkpoint Y when its own dates overlap Y−50…Y+49. The score (0–100) combines quantity against a '
         'target for the category scaled by the region\'s area (log scale), the mean dating quality of those records, and the number of independent '
         'sources: `100 · Q^0.8 · (0.55 + 0.30·D + 0.15·V/3)`. Dating weights: exact or record-level date 1.0, first attestation 0.8 (0.4 after 300 years), '
         'record period ≤ 200 years 0.6, broader record period 0.35, only the dataset\'s own period 0.15; undated records are not counted. '
         'So many badly dated records cannot reach 70 by themselves. Regions are present-day units used only for counting. '
         'Bold = 70 or more; – = not applicable (Maritime in landlocked regions).', '',
         f'**{len(weak)} of {sum(1 for c in out["cells"] if c["score"] is not None)} cells score below 70.**', '']
    L += ['## Summary: mean score per region and checkpoint (all categories)', '', '| Region | ' + ' | '.join(str(y) for y in CHECKPOINTS) + ' |',
          '| --- |' + ' ---: |' * len(CHECKPOINTS)]
    for r in REGIONS:
        row = []
        for y in CHECKPOINTS:
            ss = [by[(r, y, c)]['score'] for c in CATEGORIES if by[(r, y, c)]['score'] is not None]
            row.append(mark(round(sum(ss) / len(ss))))
        L.append(f'| {r} | ' + ' | '.join(row) + ' |')
    for cat in CATEGORIES:
        L += ['', f'## {cat}', '', '| Region | ' + ' | '.join(str(y) for y in CHECKPOINTS) + ' |', '| --- |' + ' ---: |' * len(CHECKPOINTS)]
        for r in REGIONS:
            L.append(f'| {r} | ' + ' | '.join(mark(by[(r, y, cat)]['score']) for y in CHECKPOINTS) + ' |')
    L.append('')
    open(os.path.join(ROOT, 'docs', 'COVERAGE_CENTURIES.md'), 'w', encoding='utf-8').write('\n'.join(L))


if __name__ == '__main__':
    main()
