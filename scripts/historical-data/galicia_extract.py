#!/usr/bin/env python3
"""Unpack the GASID archives (Mendeley Data md8jp9ny9z, 7z) from the vault into raw/galicia-buildings/derived/."""
import os

import libarchive

RAW = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'galicia-buildings')

if __name__ == '__main__':
    out = os.path.join(RAW, 'derived')
    os.makedirs(out, exist_ok=True)
    os.chdir(out)
    for name in ('Galicia_and_Austrian_Silesia_Buildings_v1.7z', 'uncertainty_metadata.7z'):
        libarchive.extract_file(os.path.join(RAW, 'original', name))
