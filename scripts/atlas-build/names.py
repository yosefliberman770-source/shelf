"""Name keys shared by the build and the app. Standard library only, so tests can import it.

norm() must give the same key as normName() in src/atlas/gazetteer.ts, and shard() the same
file as nameShard(): the index is written under the Python key and looked up under the JS one.
src/atlas/names-parity.test.ts runs both over real names.
"""
from __future__ import annotations

import re
import unicodedata

# JavaScript's \\s and String.trim(): Python's \\s differs (it lacks U+FEFF and adds U+001C–001F, U+0085).
_JS_SPACE = '[\t\n\v\f\r    -     　﻿]'
_LEADING_THE = re.compile(r'^the' + _JS_SPACE + '+')
_SPACES = re.compile(_JS_SPACE + '+')
_EDGES = re.compile(r'^' + _JS_SPACE + '+|' + _JS_SPACE + '+$')


def norm(s: str) -> str:
    """Lower-case, without accents or a leading "the", so "Lutétia" = "lutetia"."""
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.category(c).startswith('M')).lower()
    s = _LEADING_THE.sub('', s)
    s = s.replace('’', "'")
    return _EDGES.sub('', _SPACES.sub(' ', s))


def shard(n: str) -> str:
    """Name-index shard for a normalised name."""
    out = ''
    for ch in list(n)[:2]:
        out += ch if re.match(r'[a-z0-9]', ch) else 'x%x' % (ord(ch) % 16)
    return out or '_'


if __name__ == '__main__':
    # For the parity test: JSON list of strings on stdin → [[norm, shard], …] on stdout.
    import json
    import sys
    print(json.dumps([[norm(x), shard(norm(x))] for x in json.load(sys.stdin)], ensure_ascii=False))
