"""Tests for the shared data-quality rules and their use in the build.

  python3 -m unittest discover -s scripts/atlas-build -p 'test_*.py'
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import quality  # noqa: E402
import tiler  # noqa: E402
import world  # noqa: E402


class PositionRules(unittest.TestCase):
    def test_real_positions_pass(self):
        self.assertIsNone(quality.position_problem(10.68, 53.87))   # Lübeck
        self.assertIsNone(quality.position_problem(-179.9, -89.9))
        self.assertIsNone(quality.position_problem(0.0, 51.48))     # on the prime meridian is fine

    def test_impossible_positions_are_rejected_generically(self):
        # The EBIDAT record with longitude 36578 (a lost decimal point) — and any dataset's equivalent.
        self.assertEqual(quality.position_problem(36578, 50.1), 'longitude outside -180…180')
        self.assertEqual(quality.position_problem(10.5, 95), 'latitude outside -90…90')
        self.assertEqual(quality.position_problem(0, 0), 'position 0, 0 (an empty field)')
        self.assertEqual(quality.position_problem(None, 5), 'missing coordinate')
        self.assertEqual(quality.position_problem('10', 5), 'non-numeric coordinate')
        self.assertEqual(quality.position_problem(float('nan'), 5), 'non-finite coordinate')

    def test_swapped_pairs_are_recognised(self):
        box = [3, 45.5, 28, 60]  # EBIDAT
        self.assertTrue(quality.swapped(50.1, 8.7, box))    # Frankfurt with lat/lon exchanged
        self.assertFalse(quality.swapped(8.7, 50.1, box))

    def test_geometry_bounds(self):
        self.assertIsNone(quality.geometry_problem((10, 50, 11, 51)))
        self.assertEqual(quality.geometry_problem((10, 50, 200, 51)), 'longitude outside -180…180')


class DateRules(unittest.TestCase):
    def test_dates(self):
        self.assertIsNone(quality.date_problem(1100, 1300))
        self.assertIsNone(quality.date_problem(None, 1300))  # end only: allowed, never read as "since the beginning of time"
        self.assertIsNone(quality.date_problem(-218, None))
        self.assertEqual(quality.date_problem(1300, 1100), 'ends before it starts')
        self.assertEqual(quality.date_problem(0, 5), 'year 0 (there is no year 0)')
        self.assertEqual(quality.date_problem(99999, None), 'year out of range')


class BuildRejectsBadRecords(unittest.TestCase):
    def test_places_index_rejects_impossible_rows_and_says_why(self):
        rows = [
            ['ebidat', 1, 'Burg A', 8.7, 50.1, 1, 'castle', 1100, 1300, 0, [], [], [], None],
            ['ebidat', 2, 'Burg B', 36578, 50.1, 1, 'castle', 1100, 1300, 0, [], [], [], None],
            ['ebidat', 3, 'Burg C', 9.1, 49.0, 1, 'castle', 1300, 1100, 0, [], [], [], None],
        ]
        with tempfile.TemporaryDirectory() as d:
            stats = world.places_index(rows, base=d)
            self.assertEqual(stats['rows'], 1)
            self.assertEqual(sorted(r['reason'] for r in stats['rejected']), ['ends before it starts', 'longitude outside -180…180'])
            kept = [r for f in os.listdir(os.path.join(d, 'c')) for r in json.load(open(os.path.join(d, 'c', f)))]
            self.assertEqual([r[1] for r in kept], [1])

    def test_duplicate_ids_are_reported_not_silently_overwritten(self):
        rows = [['wikidata', 'Q1', 'A', 8.7, 50.1, 1, 'castle', None, None, 0, [], [], [], None],
                ['wikidata', 'Q1', 'A again', 20.0, 40.0, 1, 'castle', None, None, 0, [], [], [], None]]
        with tempfile.TemporaryDirectory() as d:
            stats = world.places_index(rows, base=d)
            self.assertEqual(stats['rows'], 1)
            self.assertEqual([r['reason'] for r in stats['rejected']], ['duplicate id (first record kept)'])

    def test_tiler_leaves_out_impossible_geometries_and_counts_them(self):
        feats = [({'type': 'Point', 'coordinates': [8.7, 50.1]}, {'i': 'a'}, 0),
                 ({'type': 'Point', 'coordinates': [36578, 50.1]}, {'i': 'b'}, 0)]
        with tempfile.TemporaryDirectory() as d:
            n = tiler.build(os.path.join(d, 't.pmtiles'), 'x', feats, 3, 't', 't')
            self.assertEqual(n['features'], 1)
            self.assertEqual(n['rejected'], [{'id': 'b', 'reason': 'longitude outside -180…180'}])

    def test_polygons_stay_valid_in_every_tile(self):
        # An hourglass whose neck (≈1.4 km) is narrower than one tile unit at low zooms: snapping to the tile grid
        # pinched it into an invalid ring, which was written into the tiles as it was.
        ring = [[0, 0], [2, 0], [2, 1], [1.01, 1], [1.01, 1.3], [2, 1.3], [2, 2.3], [0, 2.3], [0, 1.3], [0.99, 1.3], [0.99, 1], [0, 1], [0, 0]]
        ring = [[x * 0.5 + 10, y * 0.5 + 50] for x, y in ring]
        feats = [({'type': 'Polygon', 'coordinates': [ring]}, {'i': 'p'}, 0)]
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 't.pmtiles')
            tiler.build(path, 'x', feats, 8, 't', 't')
            from pmtiles.reader import MmapSource, all_tiles
            import gzip
            import mapbox_vector_tile
            from shapely.geometry import shape
            with open(path, 'rb') as f:
                for (z, x, y), data in all_tiles(MmapSource(f)):
                    layer = mapbox_vector_tile.decode(gzip.decompress(data))['x']
                    for ft in layer['features']:
                        self.assertTrue(shape(ft['geometry']).is_valid, f'invalid polygon in tile {z}/{x}/{y}')


if __name__ == '__main__':
    unittest.main()
