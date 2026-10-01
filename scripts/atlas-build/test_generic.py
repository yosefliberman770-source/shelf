"""Tests for the spec-driven loader's dating parser (never more precise than the text).

  python3 -m unittest discover -s scripts/atlas-build -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import generic  # noqa: E402

P = generic.parse_dating


class Dating(unittest.TestCase):
    def test_centuries_are_windows(self):
        self.assertEqual(P('19th c.')[:2], (1801, 1900))
        self.assertEqual(P('XIII. sz.')[:2], (1201, 1300))
        self.assertEqual(P('13. Jh.')[:2], (1201, 1300))
        self.assertEqual(P('XIVe siècle')[:2], (1301, 1400))

    def test_century_ranges_and_parts(self):
        self.assertEqual(P('5th-7th c.')[:2], (401, 700))
        self.assertEqual(P('14-15 c.')[:2], (1301, 1500))
        self.assertEqual(P('XII-XIII w.')[:2], (1101, 1300))
        self.assertEqual(P('2nd half of the 16th century')[:2], (1551, 1600))
        self.assertEqual(P('early 14th century')[:2], (1301, 1333))

    def test_years_and_open_ends(self):
        self.assertEqual(P('1250-1300')[:2], (1250, 1300))
        self.assertEqual(P(1512)[:2], (1512, 1512))
        self.assertEqual(P('after 1350')[:2], (1350, None))
        self.assertEqual(P('before 1600')[:2], (None, 1600))
        self.assertEqual(P('300 BC')[:2], (-300, -300))

    def test_abbreviated_ranges_and_decades(self):
        self.assertEqual(generic.parse_dating('1852-62')[:2], (1852, 1862))
        self.assertEqual(generic.parse_dating('1863-4')[:2], (1863, 1864))
        self.assertEqual(generic.parse_dating('1720/1')[:2], (1720, 1721))  # old-style double dating
        self.assertEqual(generic.parse_dating('the 1850s')[:2], (1850, 1859))
        self.assertEqual(generic.parse_dating('1801-12-05')[:2], (1801, 1801))  # a full date, not 1801–1812
        self.assertEqual(generic.parse_dating('1810/12/31')[:2], (1810, 1810))

    def test_no_date_is_no_date(self):
        for t in (None, '', 'unknown', 'Roman', '?', 'nan'):
            self.assertIsNone(P(t))


class Attestations(unittest.TestCase):
    def test_one_snapshot_per_attestation_year_only(self):
        import json
        import tempfile
        fc = {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [12.5, 41.9]}, 'properties': {'n': 'Roma', 'it': 'GH1563|OC1623|SASD', 'alt': 'roma|rome'}},
            {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [11.2, 43.8]}, 'properties': {'n': 'Firenze', 'it': 'SASD', 'alt': ''}}]}
        with tempfile.TemporaryDirectory() as d:
            json.dump(fc, open(os.path.join(d, 'x.geojson'), 'w'))
            spec = {'src': 't', 'read': {'path': os.path.join(d, 'x.geojson')},
                    'fields': {'name': 'n', 'kind': 'settlement', 'altNames': {'field': 'alt'}},
                    'dating': {'mode': 'attestations', 'field': 'it', 'yearRegex': r'(\d{4})', 'label': 'listed in {year}'}}
            recs, skipped = generic.records(spec)
        self.assertEqual(sorted(r['snap'] for r in recs), [1563, 1623])
        self.assertTrue(all(r.get('env') is None for r in recs))
        self.assertEqual(skipped.get('no dated attestation'), 1)  # an itinerary without a year dates nothing
        self.assertEqual([n[0] for n in recs[0]['names']], ['rome'])


class NewOptions(unittest.TestCase):
    def _recs(self, feats, spec):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            json.dump({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': c}, 'properties': p} for c, p in feats]},
                      open(os.path.join(d, 'x.geojson'), 'w'))
            spec = dict(spec, src='t', read={'path': os.path.join(d, 'x.geojson')})
            return generic.records(spec)

    def test_signed_ranges(self):
        self.assertEqual(generic._signed_range('-27:13')[:2], (-27, 13))
        self.assertEqual(generic._signed_range('451:475')[:2], (451, 475))
        self.assertIsNone(generic._signed_range('undetermined'))
        self.assertIsNone(generic._signed_range('0'))  # there is no year 0

    def test_open_end_survives_phase_grouping(self):
        recs, _ = self._recs([([10, 50], {'n': 'Abae, Achaea', 's': '-146', 'e': 'undetermined'}), ([10, 50], {'n': 'Abae, Achaea', 's': '100:200', 'e': '300'})],
                             {'fields': {'name': 'n', 'nameSplit': ',', 'kind': 'settlement'}, 'groupBy': True,
                              'dating': {'mode': 'fields', 'from': 's', 'to': 'e', 'signedYears': True, 'openValues': ['undetermined']}})
        self.assertEqual(recs[0]['name'], 'Abae')
        self.assertEqual(recs[0]['env'], (-146, None))  # never closed, never filled in

    def test_keep_filters_and_type_only_names(self):
        recs, sk = self._recs([([0, 50], {'t': 'RATH', 'e': 'RATH'}), ([0, 50], {'t': 'FORT', 'e': 'FORTIFIED OUTCROP: DUNSHAMMER'}),
                               ([0, 50], {'t': 'NON-ANTIQUITY', 'e': 'X: Y'})],
                              {'keep': [{'field': 't', 'notValues': ['NON-ANTIQUITY']}],
                               'fields': {'name': 'e', 'nameSplit': ':', 'nameSplitIndex': -1, 'nameSplitRequired': True, 'nameTitleCase': True, 'kind': 'castle'},
                               'dating': {'mode': 'snapshot', 'year': 1500}})
        self.assertEqual([(r['name'], bool(r.get('generic'))) for r in recs], [('Rath', True), ('Dunshammer', False)])
        self.assertEqual(sk.get('outside the spec filter'), 1)

    def test_drop_undated_end_only(self):
        recs, sk = self._recs([([0, 50], {'n': 'A', 'a': '21-04-1810', 'b': '2001'}), ([0, 50], {'n': 'B', 'a': '1825', 'b': '1927'})],
                              {'dropUndated': True, 'fields': {'name': 'n', 'kind': 'mine'}, 'dating': {'mode': 'fields', 'from': 'a', 'to': 'b', 'openValues': ['21-04-1810']}})
        self.assertEqual([(r['name'], r['env']) for r in recs], [('B', (1825, 1927))])

    def test_projected_wgs84_is_not_degrees(self):
        self.assertTrue(generic._is_wgs84_degrees('EPSG:4326'))
        self.assertFalse(generic._is_wgs84_degrees('EPSG:32635'))
        self.assertFalse(generic._is_wgs84_degrees('EPSG:3857'))

    def test_century_midpoint_years_become_the_century(self):
        import json
        import tempfile
        fc = {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [39.7, 54.6]}, 'properties': {'id': 'a', 'n': 'A', 's': 1350, 'e': ' '}},
            {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [39.7, 54.6]}, 'properties': {'id': 'b', 'n': 'B', 's': 1467, 'e': 1764}}]}
        with tempfile.TemporaryDirectory() as d:
            json.dump(fc, open(os.path.join(d, 'm.geojson'), 'w'))
            spec = {'src': 't', 'read': {'path': os.path.join(d, 'm.geojson')}, 'fields': {'id': 'id', 'name': 'n', 'kind': 'monastery'},
                    'dating': {'mode': 'fields', 'from': 's', 'to': 'e', 'openValues': [' '], 'midCenturyAsCentury': True}}
            out = {r['id']: r for r in generic.records(spec)[0]}
        self.assertEqual(out['a']['env'], (1301, None))  # the 14th century, end left open
        self.assertIn('century midpoint', out['a']['per'])
        self.assertEqual(out['b']['env'], (1467, 1764))  # an ordinary year stays as given

    def test_lat_lon_text_field_and_approximate_positions(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, 'm.csv'), 'w', encoding='utf-8').write('id;geo\na;46.5775, 4.9611\nb;\n')
            spec = {'src': 't', 'read': {'path': os.path.join(d, 'm.csv'), 'delimiter': ';', 'latLonField': 'geo', 'approx': True},
                    'fields': {'id': 'id', 'kind': 'mill'}, 'dating': {'mode': 'snapshot', 'year': 1809}}
            recs, skipped = generic.records(spec)
        self.assertEqual([(r['lon'], r['lat'], r['precise']) for r in recs], [(4.9611, 46.5775, False)])
        self.assertEqual(skipped['no usable position'], 1)


class Areas(unittest.TestCase):
    def test_units_dated_by_their_own_survey_years(self):
        import json
        import tempfile
        sq = lambda x0, y0: {'type': 'Polygon', 'coordinates': [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]]}  # noqa: E731
        fc = {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'geometry': sq(0, 50), 'properties': {'C': 'A', 'H': 'X', 'P': 'p1', 'D': '1860-1870'}},
            {'type': 'Feature', 'geometry': sq(1, 50), 'properties': {'C': 'A', 'H': 'X', 'P': 'p2', 'D': '1875-1888'}},
            {'type': 'Feature', 'geometry': sq(2, 50), 'properties': {'C': 'B', 'H': 'X', 'P': 'p3', 'D': ''}}]}
        with tempfile.TemporaryDirectory() as d:
            json.dump(fc, open(os.path.join(d, 'u.geojson'), 'w'))
            spec = {'src': 't', 'read': {'path': os.path.join(d, 'u.geojson')}, 'dating': {'mode': 'fields', 'field': 'D', 'label': 'surveyed'},
                    'dissolve': [{'field': ['C', 'H'], 'level': 'hundred'}, {'field': ['C', 'P'], 'level': 'parish'}]}
            out = generic.area_features(spec)
        got = {(p['lv'], p['n']): (p['ef'], p['et']) for _, p, _ in out}
        self.assertEqual(got[('hundred', 'X')], (1860, 1888))  # the union of its parishes' survey years
        self.assertEqual(got[('parish', 'p1')], (1860, 1870))
        self.assertNotIn(('parish', 'p3'), got)  # no date of its own: not drawn
        self.assertEqual(len([k for k in got if k[0] == 'hundred']), 1)  # same-named hundred in county B has no dated parish

    def test_census_units_are_snapshots_with_their_figure(self):
        import json
        import tempfile
        sq = lambda x0: {'type': 'Polygon', 'coordinates': [[[x0, 50], [x0 + 1, 50], [x0 + 1, 51], [x0, 51], [x0, 50]]]}  # noqa: E731
        fc = {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'geometry': sq(0), 'properties': {'D': 'Biala', 'Y': '1869', 'N': 81664.0}},
            {'type': 'Feature', 'geometry': sq(1), 'properties': {'D': 'Teschen', 'Y': '1857', 'N': None}}]}
        with tempfile.TemporaryDirectory() as d:
            json.dump(fc, open(os.path.join(d, 'u.geojson'), 'w'))
            spec = {'src': 't', 'read': {'path': os.path.join(d, 'u.geojson')}, 'dating': {'mode': 'fields', 'field': 'Y', 'snapshot': True, 'label': 'census'},
                    'dissolve': [{'field': 'D', 'level': 'district', 'note': {'field': 'N', 'label': 'inhabitants'}}]}
            out = {p['n']: p for _, p, _ in generic.area_features(spec)}
        self.assertEqual((out['Biala']['ef'], out['Biala']['et'], out['Biala']['sn']), (1869, 1869, 1))
        self.assertEqual(out['Biala']['per'], 'census 1869; 81,664 inhabitants')
        self.assertEqual(out['Teschen']['per'], 'census 1857')  # no figure given: none invented


if __name__ == '__main__':
    unittest.main()
