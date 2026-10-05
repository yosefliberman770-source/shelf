"""Event rules (events.py): kinds by name, the 1945 scope, duplicates, dates outside a war, and HCED identity by name.

  python3 -m unittest discover -s scripts/atlas-build -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import events  # noqa: E402


def ev(q, n, k, y, lon=10.0, lat=50.0, **p):
    return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [lon, lat]}, 'properties': {'q': q, 'n': n, 'k': k, 'y': y, **p}}


class Rules(unittest.TestCase):
    def test_kind_by_name(self):
        self.assertEqual(events.kind_from_name('Siege of Orléans', 'battle'), 'siege')
        self.assertEqual(events.kind_from_name('Second Siege of Vienna', 'battle'), 'siege')
        self.assertEqual(events.kind_from_name('Battle of Hastings', 'battle'), 'battle')

    def test_core(self):
        self.assertEqual(events.core('Second Battle of Panipat'), 'panipat')
        self.assertEqual(events.core('Siege of the Alcázar'), 'alcazar')

    def test_labels(self):
        self.assertTrue(events.plausible_label('Battle of Shiting'))
        self.assertFalse(events.plausible_label('lol battle'))
        self.assertFalse(events.plausible_label('Q123456'))

    def test_clean(self):
        feats = [ev('Q1', 'Battle of X', 'battle', 1200), ev('Q2', 'Battle of X', 'battle', 1201, lon=10.5, w='W1'),
                 ev('Q3', 'Siege of Y', 'battle', 1300), ev('Q4', 'Battle of Z', 'battle', 2014),
                 ev('Q5', 'Battle of B', 'battle', 49, w='W2'), ev('Q6', 'Battle of C', 'battle', 1500, w='W3')]
        wars = [{'q': 'W1', 'f': 1199, 't': 1202}, {'q': 'W2', 'f': -49, 't': -45}, {'q': 'W3', 'f': 1400, 't': 1410}]
        stats = events.clean_events(feats, wars)
        by = {f['properties']['q']: f['properties'] for f in feats}
        self.assertNotIn('Q4', by)                       # after 1945
        self.assertEqual(by['Q3']['k'], 'siege')         # kind by name
        self.assertIn('Q2', by)                          # the one with more recorded is kept…
        self.assertEqual(by['Q2']['dq'], ['Q1'])         # …the other is its duplicate
        self.assertEqual(by['Q2']['dd'], 36)             # 36 km apart: more than 25 km, said as a disagreement
        self.assertEqual(by['Q5']['wo'], 'sign')         # 49 inside -49…-45 reversed
        self.assertEqual(by['Q6']['wo'], 1)
        self.assertEqual(stats['duplicates'], 1)

    def test_identity_not_nearness(self):
        wd = ev('Q1', 'Battle of Crécy', 'battle', 1346)
        self.assertTrue(events.same_event(wd, 'Battle of Crecy', 1346, 1346))
        self.assertTrue(events.same_event(ev('Q2', 'Battle of Shijōnawate', 'battle', 1348), 'Battle of Shijo Nawate', 1348, 1348))
        self.assertFalse(events.same_event(wd, 'Battle of Abbeville', 1346, 1346))   # near, same year, another battle
        self.assertFalse(events.same_event(wd, 'Battle of Crécy', 1356, 1356))       # same name, another year


if __name__ == '__main__':
    unittest.main()
