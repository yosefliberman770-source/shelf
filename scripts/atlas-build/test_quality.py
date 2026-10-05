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
            # The impossible position is left out; the impossible dates are removed and the place kept, with a note.
            self.assertEqual(stats['rows'], 2)
            self.assertEqual(sorted(r['reason'] for r in stats['rejected']), ['ends before it starts', 'longitude outside -180…180'])
            kept = {}
            for f in os.listdir(os.path.join(d, 'c')):
                with open(os.path.join(d, 'c', f), encoding='utf-8') as fh:
                    kept.update({r[1]: r for r in json.load(fh)})
            self.assertEqual(sorted(kept), [1, 3])
            self.assertEqual(kept[3][7:9], [None, None])
            self.assertIn('ends before it starts', kept[3][13]['fix'])

    def test_duplicate_ids_are_kept_under_unique_keys_with_their_source_id(self):
        # Germania Sacra: one institution, several seats; the id index could reach only one of them.
        rows = [['germaniasacra', 4068, 'Domstift Kurland', 21.59429, 56.72085, 1, 'monastery', None, None, 0, [], [], [], None],
                ['germaniasacra', 4068, 'Domstift Kurland', 21.55851, 57.39623, 1, 'monastery', None, None, 0, [], [], [], None]]
        with tempfile.TemporaryDirectory() as d:
            stats = world.places_index(rows, base=d)
            self.assertEqual((stats['rows'], stats['duplicateIdsKeptUnderNewKeys'], stats['rejected']), (2, 1, []))
            ids = {}
            for f in os.listdir(os.path.join(d, 'i')):
                with open(os.path.join(d, 'i', f), encoding='utf-8') as fh:
                    ids.update(json.load(fh))
            self.assertEqual(sorted(ids), ['4068', '4068~2'])
            rows_out = [r for f in os.listdir(os.path.join(d, 'c')) for r in json.load(open(os.path.join(d, 'c', f), encoding='utf-8'))]
            self.assertEqual([r[13]['sid'] for r in rows_out if r[1] == '4068~2'], [4068])

    def test_coarse_or_shared_positions_are_marked_approximate(self):
        rows = [['wikidata', 'Q1', 'A', 8.7, 50.1, 1, 'castle', None, None, 0, [], [], [], None],       # 1 decimal
                ['dicotopo', 1, 'B', 2.34567, 48.12345, 1, 'castle', None, None, 0, [], [], [], None],
                ['dicotopo', 2, 'C', 2.34567, 48.12345, 1, 'church', None, None, 0, [], [], [], None],
                ['dicotopo', 3, 'D', 2.34567, 48.12345, 1, 'settlement', None, None, 0, [], [], [], None],
                ['dicotopo', 4, 'E', 3.45678, 47.12345, 1, 'settlement', None, None, 0, [], [], [], None]]
        with tempfile.TemporaryDirectory() as d:
            world.places_index(rows, base=d)
            out = {r[2]: r for f in os.listdir(os.path.join(d, 'c')) for r in json.load(open(os.path.join(d, 'c', f), encoding='utf-8'))}
            self.assertEqual({k: v[5] for k, v in out.items()}, {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 1})
            self.assertIn('decimal places', out['A'][13]['pq'])
            self.assertIn('share this exact position', out['B'][13]['pq'])

    def test_prehistoric_dates_are_not_impossible(self):
        self.assertIsNone(quality.date_problem(-2600000, -3000))  # Pleiades: Franchthi Cave

    def test_tiler_leaves_out_impossible_geometries_and_counts_them(self):
        feats = [({'type': 'Point', 'coordinates': [8.7, 50.1]}, {'i': 'a'}, 0),
                 ({'type': 'Point', 'coordinates': [36578, 50.1]}, {'i': 'b'}, 0)]
        with tempfile.TemporaryDirectory() as d:
            n = tiler.build(os.path.join(d, 't.pmtiles'), 'x', feats, 3, 't', 't')
            self.assertEqual(n['features'], 1)
            self.assertEqual(n['rejected'], [{'id': 'b', 'reason': 'longitude outside -180…180'}])

    def test_a_year_0_is_an_empty_field_and_only_that_date_goes(self):
        # Itiner-e: (100, 0) = from 100, end unknown; (0, 0) = undated. The start must survive.
        p = {'f': 100, 't': 0}
        self.assertEqual(quality.clean_dates(p), 'year 0 (an empty date field)')
        self.assertEqual(p, {'f': 100})
        q = {'f': 0, 't': 0, 'fe': 0}
        quality.clean_dates(q)
        self.assertEqual(q, {'fe': 0})
        rows = [['hre', 1, 'Herzberg', 13.23528, 51.69222, 1, 'town', 0, 1500, 0, [], [], [], None]]
        with tempfile.TemporaryDirectory() as d:
            world.places_index(rows, base=d)
            out = [r for f in os.listdir(os.path.join(d, 'c')) for r in json.load(open(os.path.join(d, 'c', f), encoding='utf-8'))]
            self.assertEqual(out[0][7:9], [None, 1500])

    def test_tiler_removes_impossible_dates_but_keeps_the_feature(self):
        feats = [({'type': 'Point', 'coordinates': [8.7, 50.1]}, {'i': 'a', 'f': 1300, 't': 1100}, 0)]
        with tempfile.TemporaryDirectory() as d:
            n = tiler.build(os.path.join(d, 't.pmtiles'), 'x', feats, 3, 't', 't')
            self.assertEqual(n['features'], 1)
            self.assertEqual(n['rejected'], [{'id': 'a', 'reason': 'ends before it starts', 'kept': 'without dates'}])

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


class BaseMapRivers(unittest.TestCase):
    def test_rivers_appear_by_size(self):
        import build
        self.assertEqual(build.river_minzoom(800000), 3)   # Danube
        self.assertEqual(build.river_minzoom(6000), 5)
        self.assertEqual(build.river_minzoom(150), 8)
        self.assertIsNone(build.river_minzoom(149))
        self.assertIsNone(build.river_minzoom(None))

    def test_smoothing_keeps_the_ends_so_segments_still_meet(self):
        import build
        line = [(0, 0), (1, 0), (1, 1), (2, 1)]
        out = build.chaikin(line)
        self.assertEqual((out[0], out[-1]), (line[0], line[-1]))
        self.assertGreater(len(out), len(line))


class BaseMapDates(unittest.TestCase):
    def test_reservoir_takes_the_earliest_dam_date_near_its_outlet(self):
        import build
        from shapely.geometry import box
        lake = box(6.0, 44.0, 6.2, 44.1)
        dams = [(6.21, 44.05, 1960, 'Q1'), (6.1, 44.05, 1975, 'Q2'), (7.5, 44.5, 1500, 'Q3')]  # Q3: far away
        self.assertEqual(build.reservoir_year(lake, (6.2, 44.05), dams), (1960, 'Q1'))
        self.assertIsNone(build.reservoir_year(lake, (6.2, 44.05), [(7.5, 44.5, 1500, 'Q3')]))

    def test_peaks_are_named_by_prominence(self):
        import build
        self.assertEqual([build.peak_minzoom(p) for p in (4700, 1200, 700, 300)], [7, 8, 9, 10])


class UndatedEvidence(unittest.TestCase):
    REG = quality.dataset_registry(os.path.join(os.path.dirname(__file__), '..', '..'))

    def test_display_window_is_the_datasets_documented_period_not_a_date(self):
        self.assertEqual(quality.display_window({'i': 'Q42', 'k': 'castle'}, self.REG), tuple(self.REG['wikidata']['core']))
        self.assertEqual(quality.display_window({'i': 'gs7', 'k': 'monastery'}, self.REG), tuple(self.REG['germaniasacra']['core']))
        self.assertEqual(quality.display_window({'src': 'dicotopo'}, self.REG), tuple(self.REG['dicotopo']['core']))
        # A market is not shown before its first recorded grant.
        self.assertEqual(quality.display_window({'src': 'mfairs', 'm': 1227}, self.REG)[0], 1227)

    def test_a_dated_statement_is_evidence_of_existence_never_a_founding(self):
        ev = quality.wikidata_evidence([{'prop': 'event', 'v': 'Q385378', 'y': 1312}, {'prop': 'opening', 'v': None, 'y': 1290}], {})
        self.assertEqual(ev[:2], ('attested', 1290))
        self.assertNotIn('found', ev[2])

    def test_a_style_or_period_gives_only_the_dates_wikidata_records_for_it(self):
        self.assertEqual(quality.wikidata_evidence([{'prop': 'style', 'v': 'Q176483', 'y': None}], {'Q176483': [1140, 1520]}), ('period', 1140, 1520, 'style'))
        # Romanesque and Gothic together: the union, labelled as style.
        self.assertEqual(quality.wikidata_evidence([{'prop': 'style', 'v': 'A', 'y': None}, {'prop': 'style', 'v': 'B', 'y': None}], {'A': [1000, 1200], 'B': [1140, None]}),
                         ('period', 1000, None, 'style'))
        # A style Wikidata gives no dates for adds nothing: nothing is guessed.
        self.assertIsNone(quality.wikidata_evidence([{'prop': 'style', 'v': 'C', 'y': None}], {'C': [None, None]}))
        self.assertIsNone(quality.wikidata_evidence([{'prop': 'event', 'v': 'X', 'y': 0}], {}))  # year 0 = no date



class Stacks(unittest.TestCase):
    """Points that share a position carry how many records stand there (A11-008, X-24)."""

    def test_shared_positions_are_counted(self):
        import tiler
        from shapely.geometry import Point
        g = lambda lon, lat: Point(*tiler.to_merc(lon, lat))  # noqa: E731
        geoms = [(g(-3.2, 55.95), {'i': 'a'}, 0), (g(-3.2, 55.95), {'i': 'b'}, 5), (g(-3.2, 55.95), {'i': 'c'}, 9), (g(-3.3, 55.95), {'i': 'd'}, 0)]
        tiler.mark_stacks(geoms, 11)
        self.assertEqual([p.get('sk') for _, p, _ in geoms], [3, 3, 3, None])


if __name__ == '__main__':
    unittest.main()
