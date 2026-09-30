"""
Write vector tiles (Mapbox Vector Tiles in one PMTiles archive) so the app
only downloads the part of a dataset that is on screen, at the detail its
zoom level needs.

Each feature carries its own minimum zoom (level of detail), chosen from the
dataset's own attributes where it has them (e.g. Viabundus zoom levels).
"""
from __future__ import annotations

import gzip
import json
import math
from collections import defaultdict

import mapbox_vector_tile
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from shapely.geometry import box, mapping, shape
from shapely.ops import transform, unary_union
from shapely.validation import make_valid

R = 6378137.0
ORIGIN = math.pi * R


def to_merc(x, y, z=None):
    lat = max(-85.0511, min(85.0511, y))
    return x * ORIGIN / 180.0, math.log(math.tan((90 + lat) * math.pi / 360.0)) * R


def tile_bounds(z, x, y):
    size = 2 * ORIGIN / (1 << z)
    minx = -ORIGIN + x * size
    maxy = ORIGIN - y * size
    return minx, maxy - size, minx + size, maxy


def tile_range(z, b):
    """Tiles at zoom z covering mercator bounds b."""
    size = 2 * ORIGIN / (1 << z)
    n = (1 << z) - 1
    x0 = max(0, min(n, int((b[0] + ORIGIN) // size)))
    x1 = max(0, min(n, int((b[2] + ORIGIN) // size)))
    y0 = max(0, min(n, int((ORIGIN - b[3]) // size)))
    y1 = max(0, min(n, int((ORIGIN - b[1]) // size)))
    return x0, x1, y0, y1


def build(path: str, layer: str, features: list[tuple[dict, dict, int]], max_zoom: int, name: str, attribution: str, min_zoom: int = 0):
    """features: (geojson geometry, properties, minzoom)."""
    geoms = []
    for g, props, mz in features:
        try:
            geo = transform(to_merc, shape(g))
        except Exception:
            continue
        if geo.is_empty:
            continue
        geoms.append((geo, props, max(min_zoom, mz)))
    fields: dict[str, str] = {}
    for _, p, _ in geoms:
        for k, v in p.items():
            fields.setdefault(k, 'Number' if isinstance(v, (int, float)) else 'String')
    tiles: list[tuple[int, bytes]] = []
    for z in range(min_zoom, max_zoom + 1):
        size = 2 * ORIGIN / (1 << z)
        tol = size / 4096 * 1.5  # about 1.5 px at this zoom
        buckets = defaultdict(list)
        for i, (geo, props, mz) in enumerate(geoms):
            if mz > z:
                continue
            x0, x1, y0, y1 = tile_range(z, geo.bounds)
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    buckets[(x, y)].append(i)
        simp = {}
        for (x, y), idx in buckets.items():
            b = tile_bounds(z, x, y)
            pad = (b[2] - b[0]) / 16
            clip = box(b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
            feats = []
            for i in idx:
                geo, props, _ = geoms[i]
                if geo.geom_type != 'Point':
                    if i not in simp:
                        simp[i] = geo.simplify(tol, preserve_topology=False) if z < max_zoom else geo
                    try:
                        g = simp[i].intersection(clip)
                    except Exception:  # simplification can leave an invalid ring: repair it and clip again
                        simp[i] = make_valid(simp[i])
                        g = simp[i].intersection(clip)
                    if g.geom_type == 'GeometryCollection':
                        # Clipping can leave slivers of a lower dimension (a polygon touching the tile edge → a line
                        # or point): keep only parts of the feature's own dimension, which the tile format can encode.
                        dim = geo.geom_type.replace('Multi', '')
                        parts = [p for p in g.geoms if p.geom_type.replace('Multi', '') == dim]
                        g = unary_union(parts) if parts else g.__class__()
                else:
                    g = geo
                if g.is_empty:
                    continue
                feats.append({'geometry': g, 'properties': props})
            if not feats:
                continue
            data = mapbox_vector_tile.encode([{'name': layer, 'features': feats}], default_options={'quantize_bounds': b, 'extents': 4096})
            tiles.append((zxy_to_tileid(z, x, y), gzip.compress(data)))
    tiles.sort()
    allb = [g.bounds for g, _, _ in geoms]
    def ll(xm, ym):
        return xm / ORIGIN * 180.0, math.degrees(2 * math.atan(math.exp(ym / R)) - math.pi / 2)
    w, s = ll(min(b[0] for b in allb), min(b[1] for b in allb))
    e, n = ll(max(b[2] for b in allb), max(b[3] for b in allb))
    with open(path, 'wb') as f:
        wr = Writer(f)
        for tid, data in tiles:
            wr.write_tile(tid, data)
        wr.finalize({
            'tile_type': TileType.MVT, 'tile_compression': Compression.GZIP,
            'min_zoom': min_zoom, 'max_zoom': max_zoom,
            'min_lon_e7': int(w * 1e7), 'min_lat_e7': int(s * 1e7), 'max_lon_e7': int(e * 1e7), 'max_lat_e7': int(n * 1e7),
            'center_zoom': min_zoom + 2, 'center_lon_e7': int((w + e) / 2 * 1e7), 'center_lat_e7': int((s + n) / 2 * 1e7),
        }, {'name': name, 'attribution': attribution, 'vector_layers': [{'id': layer, 'fields': fields, 'minzoom': min_zoom, 'maxzoom': max_zoom}]})
    return len(tiles)
