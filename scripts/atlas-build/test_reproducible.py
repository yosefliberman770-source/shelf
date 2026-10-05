"""Reproducibility and robustness of the data build (Stage 1 of the fix plan).

The same inputs must give the same output, whatever order they arrive in; one bad record must not stop a build or
leave it half-written; a changed, missing or unrecorded input must be reported, not silently used or skipped.

  python3 -m unittest discover -s scripts/atlas-build -p 'test_*.py'
"""
import json
import os
import random
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import inputs  # noqa: E402
import quality  # noqa: E402
import world  # noqa: E402

REG = {'pleiades': {'core': [-750, 640], 'box': [-10, 20, 50, 55]},
       'hre': {'core': [800, 1800], 'box': [3, 44, 20, 56]}}


def row(src, pid, title, lon, lat, start=None, end=None, names=(), extra=None, precise=1):
    return [src, pid, title, lon, lat, precise, 'settlement', start, end, 0, [[n] for n in names], [], [], extra]


ROWS = [
    row('pleiades', 1, 'Roma', 12.4823, 41.8933, -753, 640, names=['Rome']),
    row('pleiades', 2, 'Capua', 14.2526, 41.0866, -600, 640),
    row('pleiades', 3, 'Augila', 21.2952, 29.1521, -550, 640),
    row('hre', 'h1', 'Lübeck', 10.6866, 53.8655, 1143, None),
    row('hre', 'h2', 'Köln', 6.9583, 50.9375, 950, None, names=['Cologne']),
    # one source id, two records (two seats): which one keeps the bare id must not depend on input order
    row('hre', 'h9', 'Seat A', 9.1, 48.7, 1200, None),
    row('hre', 'h9', 'Seat B', 8.4, 49.0, 1250, None),
]


def read(p):
    with open(p, 'rb') as fh:
        return fh.read()


def snapshot(base):
    out = {}
    for d, _, fs in os.walk(base):
        for f in fs:
            p = os.path.join(d, f)
            out[os.path.relpath(p, base)] = read(p)
    return out


class PlaceIndex(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def build(self, rows, name='places'):
        base = os.path.join(self.tmp, name)
        stats = world.places_index([list(r) for r in rows], base, registry=REG)
        return base, stats

    def test_order_does_not_change_the_index(self):
        """RP-2, A14-013, X-07: shuffled input gives byte-identical files and the same keys."""
        a, _ = self.build(ROWS, 'a')
        for seed in range(5):
            rows = ROWS[:]
            random.Random(seed).shuffle(rows)
            b, _ = self.build(rows, f'b{seed}')
            self.assertEqual(snapshot(a), snapshot(b))

    def test_shared_id_keys_follow_content_not_order(self):
        base, _ = self.build(list(reversed(ROWS)))
        cells = {k: json.loads(v) for k, v in snapshot(base).items() if k.startswith('c' + os.sep)}
        keys = {r[2]: r[1] for rs in cells.values() for r in rs}
        self.assertEqual({keys['Seat A'], keys['Seat B']}, {'h9', 'h9~2'})
        base2, _ = self.build(ROWS, 'again')
        cells2 = {k: json.loads(v) for k, v in snapshot(base2).items() if k.startswith('c' + os.sep)}
        self.assertEqual(keys, {r[2]: r[1] for rs in cells2.values() for r in rs})

    def test_a_malformed_record_is_set_aside_not_fatal(self):
        """A14-015: a missing title, a short row and a non-list name entry are rejected with a reason."""
        bad = [row('pleiades', 50, None, 12.0, 41.0), ['pleiades', 51], row('pleiades', 52, 'X', 12.0, 41.0, names=[None])]
        _, stats = self.build(ROWS + bad)
        reasons = {str(r['id']): r['reason'] for r in stats['rejected']}
        self.assertEqual(reasons['50'], 'missing title')
        self.assertIn('malformed record', reasons['51'])
        self.assertIn('malformed record', reasons['52'])
        self.assertEqual(stats['rows'], len(ROWS))

    def test_implausible_records_are_kept_and_flagged(self):
        """A14-015: swapped coordinates, a lost or added minus sign, a placeholder title."""
        odd = [row('pleiades', 60, 'Swapped', 41.8933, 12.4823, -100, 100),  # Rome with lat/lon exchanged
               row('hre', 'h60', 'Minus', 9.0, 48.0, -1200, None),            # BCE year in a CE-only dataset
               row('pleiades', 61, 'unknown', 12.0, 41.0, -100, 100)]
        _, stats = self.build(ROWS + odd)
        flags = {str(f['id']): f['reason'] for f in stats['flagged']}
        self.assertIn('swapped', flags['60'])
        self.assertIn('minus sign', flags['h60'])
        self.assertIn('placeholder title', flags['61'])
        self.assertEqual(stats['rows'], len(ROWS) + 3)

    def test_fractional_years_are_not_dates(self):
        self.assertEqual(quality.date_problem(1200.5, None), 'fractional year')
        self.assertIsNone(quality.date_problem(1200.0, 1300))

    def test_an_interrupted_build_keeps_the_previous_index(self):
        """A14-003: the new index is swapped in only when complete."""
        base, _ = self.build(ROWS)
        before = snapshot(base)
        calls = {'n': 0}
        real = world.write_json

        def failing(path, obj):
            calls['n'] += 1
            if calls['n'] == 3:
                raise OSError('disk full')
            real(path, obj)
        with mock.patch.object(world, 'write_json', failing):
            with self.assertRaises(OSError):
                world.places_index([list(r) for r in ROWS[:3]], base, registry=REG)
        self.assertEqual(snapshot(base), before)


class Inputs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.raw = os.path.join(self.tmp, 'raw')
        os.makedirs(os.path.join(self.raw, 'ds', 'original'))
        self.f = os.path.join(self.raw, 'ds', 'original', 'a.csv')
        self.write(self.f, 'id,name\n1,Roma\n')
        self.manifest = os.path.join(self.tmp, 'manifest.json')
        with open(self.manifest, 'w') as fh:
            json.dump({'ds/original/a.csv': {'url': 'https://example.org/a.csv', 'bytes': os.path.getsize(self.f),
                                             'sha256': inputs.sha256(self.f), 'downloaded': '2026-10-01'}}, fh)
        inputs.MISSING.clear()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    @staticmethod
    def write(path, text):
        with open(path, 'w') as fh:
            fh.write(text)

    def problems(self):
        return {p['path']: p['problem'] for p in inputs.verify_vault(self.raw, self.manifest)}

    def test_an_unchanged_vault_passes(self):
        self.assertEqual(self.problems(), {})

    def test_a_file_replaced_under_the_same_name_and_size_is_caught(self):
        """RP-3 tamper, A14-008."""
        self.write(self.f, 'id,name\n1,Rome\n')
        self.assertIn('checksum', self.problems()['ds/original/a.csv'])

    def test_a_recorded_file_that_is_gone_is_caught(self):
        """RP-4 missing input."""
        os.remove(self.f)
        self.assertIn('missing', self.problems()['ds/original/a.csv'])

    def test_an_unrecorded_file_is_caught(self):
        """A14-012, X-20: a file in the vault with no URL, checksum or date."""
        self.write(os.path.join(self.raw, 'ds', 'original', 'b.csv'), 'x')
        self.assertIn('not recorded', self.problems()['ds/original/b.csv'])

    def test_a_missing_optional_input_is_reported_and_fails_the_build(self):
        """A14-011: no silent smaller corpus."""
        self.assertFalse(inputs.present(os.path.join(self.raw, 'nope.zip')))
        self.assertEqual(inputs.MISSING[-1]['reader'], 'test_a_missing_optional_input_is_reported_and_fails_the_build')
        self.assertEqual(inputs.finish(allow_missing=False), 2)
        self.assertEqual(inputs.finish(allow_missing=True), 0)
        inputs.MISSING.clear()

    def test_files_the_build_derives_are_not_checked_as_sources(self):
        os.makedirs(os.path.join(self.raw, 'ds', 'derived'))
        self.write(os.path.join(self.raw, 'ds', 'derived-medieval.json'), '{}')
        self.write(os.path.join(self.raw, 'ds', 'derived', 'x.shp'), 'x')
        self.assertEqual(self.problems(), {})

    def test_a_download_comes_from_the_checked_vault_copy(self):
        """A14-006: the build reads the file the manifest describes, not a second download of the same URL."""
        self.assertEqual(inputs.vault_copy('https://example.org/a.csv', self.raw, self.manifest), self.f)
        self.assertIsNone(inputs.vault_copy('https://example.org/other.csv', self.raw, self.manifest))
        self.write(self.f, 'changed')
        self.assertIsNone(inputs.vault_copy('https://example.org/a.csv', self.raw, self.manifest))

    def test_the_vault_is_fully_recorded(self):
        """Every file in the real raw vault is listed in data/historical/manifest.json (present only on the owner's
        machine and in the build environment; the checksums themselves are verified before each build)."""
        if not os.path.isdir(inputs.RAW):
            self.skipTest('no raw vault here')
        with open(inputs.VAULT_MANIFEST, encoding='utf-8') as fh:
            manifest = json.load(fh)
        self.assertEqual([f for f in inputs.vault_files() if f not in manifest], [])


class DerivedExtracts(unittest.TestCase):
    def test_the_nordic_extracts_are_keyed_on_the_code_that_made_them(self):
        """A14-001: a parser change makes a fresh extract instead of reusing the old one."""
        import regional
        src = open(regional.__file__, encoding='utf-8').read()
        self.assertEqual(src.count("-{CODE}'"), 3)
        self.assertEqual(len(regional.CODE), 12)


class Tiles(unittest.TestCase):
    def test_the_same_features_give_the_same_tile_bytes(self):
        """A13-007: no timestamp inside the compressed tiles."""
        import tiler
        feats = [({'type': 'Point', 'coordinates': [12.48, 41.89]}, {'n': 'Roma'}, 0),
                 ({'type': 'Point', 'coordinates': [14.25, 41.09]}, {'n': 'Capua'}, 0)]
        tmp = tempfile.mkdtemp()
        try:
            out = []
            for i in range(2):
                p = os.path.join(tmp, f't{i}.pmtiles')
                with mock.patch('time.time', return_value=1_000_000 + i * 1000):
                    tiler.build(p, 'places', feats, 6, 'test', 'test')
                out.append(read(p))
            self.assertEqual(out[0], out[1])
        finally:
            shutil.rmtree(tmp)


if __name__ == '__main__':
    unittest.main()
