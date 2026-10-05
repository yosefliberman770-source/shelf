"""The build's date grammar against the shared battery (src/world/date-battery.json), which the app's parseDate also passes.

  python3 -m unittest discover -s scripts/atlas-build -p 'test_*.py'
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import dates  # noqa: E402

BATTERY = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'world', 'date-battery.json')


class Battery(unittest.TestCase):
    def test_every_case(self):
        for text, a, b, kind in json.load(open(BATTERY, encoding='utf-8'))['cases']:
            self.assertEqual(dates.kind(dates.parse_dating(text)), (a, b, kind), text)

    def test_a_leading_minus_is_bce_without_a_spec_option(self):
        self.assertEqual(dates.parse_dating('-150')[:2], (-150, -150))
        self.assertEqual(dates.parse_dating(-150)[:2], (-150, -150))
        self.assertIsNone(dates.parse_dating('-0'))

    def test_wikidata_years_count_no_year_zero(self):
        self.assertEqual(dates.wd_year('-0217-01-01T00:00:00Z'), -218)
        self.assertEqual(dates.wd_year('"-0217-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>'), -218)
        self.assertEqual(dates.wd_year('0000-01-01T00:00:00Z'), -1)
        self.assertEqual(dates.wd_year('+1066-10-14T00:00:00Z'), 1066)
        self.assertIsNone(dates.wd_year(''))

    def test_every_wikidata_reader_uses_it(self):
        import build
        import registers
        import sites
        v = '"-0217-01-01T00:00:00Z"'
        self.assertEqual({build.wd_year(v), registers._wd_year(v), sites.year(v)}, {-218})


if __name__ == '__main__':
    unittest.main()
