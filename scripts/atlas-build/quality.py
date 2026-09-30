"""Data-quality rules shared by the build (tiler.py, world.py) and the audit (audit_data.py).

Each rule returns a reason (a short string) when a value is wrong, or None. The build rejects what a rule rejects
and says so; it never "corrects" a value unless the correction is unambiguous and stated (see sites.py for Buringh).

  python3 -m unittest scripts/atlas-build/test_quality.py
"""
from __future__ import annotations

import math

# Years in the atlas: -3400 (the earliest map year) to the present. Year 0 does not exist (1 BCE = -1).
MIN_YEAR, MAX_YEAR = -3500, 2100


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


def date_problem(start, end) -> str | None:
    """Why a (start, end) pair is impossible, or None. Either may be missing (None)."""
    for v in (start, end):
        if v is None:
            continue
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            return 'non-numeric year'
        if v == 0:
            return 'year 0 (there is no year 0)'
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
