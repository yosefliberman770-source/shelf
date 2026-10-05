"""Data-quality rules shared by the build (tiler.py, world.py) and the audit (audit_data.py).

Each rule returns a reason (a short string) when a value is wrong, or None. The build rejects what a rule rejects
and says so; it never "corrects" a value unless the correction is unambiguous and stated (see sites.py for Buringh).

  python3 -m unittest scripts/atlas-build/test_quality.py
"""
from __future__ import annotations

import math
import re

# Impossible years: before the oldest archaeological sites (Pleiades dates Palaeolithic sites from 2.6 million years ago)
# or in the future. Year 0 does not exist (1 BCE = -1).
MIN_YEAR, MAX_YEAR = -3_000_000, 2100


def position_problem(lon, lat) -> str | None:
    """Why a point cannot be a real position, or None. Catches missing, non-numeric, NaN/inf, out-of-range values
    (a longitude of 36578 is a lost decimal point, not a place) and the (0, 0) "null island" of an empty field."""
    if lon is None or lat is None:
        return 'missing coordinate'
    if isinstance(lon, bool) or isinstance(lat, bool) or not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
        return 'non-numeric coordinate'
    if not (math.isfinite(lon) and math.isfinite(lat)):
        return 'non-finite coordinate'
    if not -180 <= lon <= 180:
        return 'longitude outside -180…180'
    if not -90 <= lat <= 90:
        return 'latitude outside -90…90'
    if lon == 0 and lat == 0:
        return 'position 0, 0 (an empty field)'
    return None


def geometry_problem(bounds) -> str | None:
    """Why a geometry's (lon/lat) bounds cannot be real, or None. bounds = (minx, miny, maxx, maxy)."""
    if not bounds or any(b is None for b in bounds):
        return 'empty geometry'
    minx, miny, maxx, maxy = bounds
    if not all(math.isfinite(v) for v in bounds):
        return 'non-finite coordinate'
    if minx < -180 or maxx > 180:
        return 'longitude outside -180…180'
    if miny < -90 or maxy > 90:
        return 'latitude outside -90…90'
    return None


def in_box(lon, lat, box, margin=1.0) -> bool:
    """Inside a dataset's documented box [W, S, E, N], with a margin in degrees."""
    w, s, e, n = box
    return w - margin <= lon <= e + margin and s - margin <= lat <= n + margin


def swapped(lon, lat, box, margin=1.0) -> bool:
    """Outside the dataset's box, but inside it with latitude and longitude exchanged: a swapped pair."""
    return not in_box(lon, lat, box, margin) and in_box(lat, lon, box, margin) and position_problem(lat, lon) is None


_LAND = {}


def land_distance(root: str | None = None):
    """Distance (km, approximate) from a point to the nearest land in Natural Earth's land polygons; 0 on land.
    None when shapely is not installed. Answers are kept per 0.01° cell, so a source's repeated positions cost nothing."""
    import json
    import os
    root = root or os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    if root in _LAND:
        return _LAND[root]
    try:
        from shapely.geometry import Point, shape
        from shapely.strtree import STRtree
    except ImportError:
        _LAND[root] = None
        return None
    polys = []
    for f in json.load(open(os.path.join(root, 'public', 'atlas', 'ne-land.json'), encoding='utf-8'))['features']:
        g = shape(f['geometry'])
        polys.extend(getattr(g, 'geoms', [g]))
    tree = STRtree(polys)
    memo = {}

    def dist(lon, lat):
        k = (round(lon, 2), round(lat, 2))
        if k not in memo:
            p = Point(lon, lat)
            if any(polys[i].contains(p) for i in tree.query(p)):
                memo[k] = 0.0
            else:
                memo[k] = polys[tree.nearest(p)].distance(p) * 111.0 * max(0.3, math.cos(math.radians(lat)) ** 0.5)
        return memo[k]
    _LAND[root] = dist
    return dist


# Kinds of record that belong on the water: never flagged for lying at sea.
WATER_KINDS = {'wreck', 'harbour', 'harbor', 'port', 'island', 'lighthouse', 'fishery', 'anchorage', 'reef', 'shoal', 'sea', 'bay',
               'strait', 'ford', 'lake', 'river', 'canal', 'bridge', 'crannog', 'oyster bed'}
# UTF-8 text decoded as Latin-1/Windows-1252 ("CrÃ©py", "â€™"), or characters lost to decoding (U+FFFD).
MOJIBAKE = re.compile(r'Ã[\u0080-\u00bf]|Â[\u00a0-\u00bf]|â€|\ufffd')


def text_problem(text) -> str | None:
    """Why a name looks corrupted, or None."""
    if not isinstance(text, str):
        return None
    if '\ufffd' in text:
        return 'garbled characters (�): the source was decoded with the wrong encoding'
    if MOJIBAKE.search(text):
        return 'mis-decoded text (UTF-8 read as Windows-1252, e.g. "Ã©" for "é")'
    if any(ord(c) < 32 and c not in '\t\n\r' for c in text):
        return 'control characters in the text'
    return None


def date_problem(start, end) -> str | None:
    """Why a (start, end) pair is impossible, or None. Either may be missing (None)."""
    for v in (start, end):
        if v is None:
            continue
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            return 'non-numeric year'
        if v == 0:
            return 'year 0 (there is no year 0)'
        if isinstance(v, float) and not v.is_integer():
            return 'fractional year'
        if not MIN_YEAR <= v <= MAX_YEAR:
            return 'year out of range'
    if start is not None and end is not None and end < start:
        return 'ends before it starts'
    return None


def decimals(v: float) -> int:
    """Decimal places a coordinate was given with (0 for a whole degree): very coarse positions are flagged."""
    s = repr(float(v))
    if 'e' in s or 'E' in s:
        return 10
    return len(s.split('.')[1].rstrip('0')) if '.' in s else 0


def clean_dates(props: dict, pairs=(('f', 't'), ('ef', 'et'))) -> str | None:
    """Remove impossible dates from feature properties in place; return the reason, or None.

    A year 0 is an empty field (a shapefile integer cannot be null; there is no year 0), so only that field goes and the
    other date stays. A pair that ends before it starts is contradictory as a whole, so both go."""
    why = None
    for a, b in pairs:
        for k in (a, b):
            if props.get(k) == 0 and not isinstance(props.get(k), bool):
                props.pop(k)
                why = why or 'year 0 (an empty date field)'
        w = date_problem(props.get(a), props.get(b))
        if w:
            props.pop(a, None)
            props.pop(b, None)
            why = why or w
    return why


def dataset_registry(root: str) -> dict:
    """Each gazetteer's documented core period and region, read from the app's registry (src/atlas/gazetteer.ts)."""
    import os
    import re
    src = open(os.path.join(root, 'src', 'atlas', 'gazetteer.ts'), encoding='utf-8').read()
    return {m.group(1): {'core': [int(m.group(2)), int(m.group(3))], 'box': [float(x) for x in m.group(4).split(',')]}
            for m in re.finditer(r"\{ id: '(\w+)'.*?core: \[(-?\d+), (-?\d+)\], box: \[([-\d., ]+)\]", src)}


def site_dataset(props: dict) -> str:
    """Which dataset a site feature comes from: its src, else its id (Q… Wikidata, gs… Germania Sacra)."""
    if props.get('src'):
        return props['src']
    return 'germaniasacra' if str(props.get('i', '')).startswith('gs') else 'wikidata'


def display_window(props: dict, registry: dict) -> tuple[int, int] | None:
    """The period in which a site with no evidence at the year may still be drawn (hollow, only when the reader asks
    for unevidenced records): the period its dataset documents itself as covering — not a date for the record. A market
    record is not drawn before its first recorded grant."""
    core = (registry.get(site_dataset(props)) or {}).get('core')
    if not core:
        return None
    lo, hi = core
    if isinstance(props.get('m'), (int, float)) and props['m']:
        lo = max(lo, int(props['m']))
    return lo, hi


# What a dated Wikidata statement says about a place: evidence that it existed then, never a founding.
EVIDENCE_BASIS = {'event': 'dated event recorded in Wikidata', 'opening': 'official opening recorded in Wikidata',
                  'instance-start': 'start of its recorded use (Wikidata)'}


def wikidata_evidence(statements: list[dict], periods: dict, latest: int = 2100):
    """From one item's extra Wikidata statements: ('attested', year, basis) for its earliest dated statement, else
    ('period', from, to, basis) from the dates Wikidata records for its time period, style or culture, else None."""
    years = [(s['y'], s['prop']) for s in statements if s['prop'] in EVIDENCE_BASIS and isinstance(s.get('y'), int)
             and date_problem(s['y'], None) is None and s['y'] <= latest]
    if years:
        y, prop = min(years)
        return ('attested', y, EVIDENCE_BASIS[prop])
    spans = []
    for s in statements:
        if s['prop'] in ('period', 'style', 'culture') and s.get('v') in periods:
            a, b = periods[s['v']]
            if a is not None and date_problem(a, b) is None:
                spans.append((a, b, s['prop']))
    if not spans:
        return None
    a = min(x[0] for x in spans)
    b = None if any(x[1] is None for x in spans) else max(x[1] for x in spans)
    kinds = sorted({x[2] for x in spans})
    return ('period', a, b, 'style' if kinds == ['style'] else 'source')
