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

    def test_no_date_is_no_date(self):
        for t in (None, '', 'unknown', 'Roman', '?', 'nan'):
            self.assertIsNone(P(t))


if __name__ == '__main__':
    unittest.main()
