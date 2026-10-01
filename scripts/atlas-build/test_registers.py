"""Tests for the register loaders' dating rules.

  python3 -m unittest discover -s scripts/atlas-build -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import registers  # noqa: E402


class WikidataPrecision(unittest.TestCase):
    def test_year_precision_is_the_year(self):
        self.assertEqual(registers.wd_window(1485, 9), (1485, 1485))
        self.assertEqual(registers.wd_window(1485, None), (1485, 1485))

    def test_decade_is_a_window(self):
        self.assertEqual(registers.wd_window(1734, 8), (1730, 1739))

    def test_century_is_never_a_single_year(self):
        # Wikibase reads year Y at century precision as century ceil(Y/100): 1600 → 16th, 1650 and 1700 → 17th.
        self.assertEqual(registers.wd_window(1600, 7), (1501, 1600))
        self.assertEqual(registers.wd_window(1650, 7), (1601, 1700))
        self.assertEqual(registers.wd_window(1700, 7), (1601, 1700))
        self.assertEqual(registers.wd_window(850, 7), (801, 900))

    def test_millennium_is_not_used(self):
        self.assertIsNone(registers.wd_window(1000, 6))


if __name__ == '__main__':
    unittest.main()
