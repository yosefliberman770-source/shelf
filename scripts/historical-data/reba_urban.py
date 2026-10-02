#!/usr/bin/env python3
"""Historical Urban Population 3700 BC – AD 2000 (Reba, Reitsma & Seto 2016; SEDAC/Harvard Dataverse, CC BY 4.0):
the 'Historical Urban Population' sheet as raw/historical-urban-population-reba/derived/population.csv, one row per
city and year, with a 'popl' text ("population estimate 12,000") for the record's type line. Nothing is added: the
estimate is the source's (Chandler 1987, Modelski 2003), shown at its own year only."""
import csv
import os

import openpyxl

RAW = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'historical', 'raw', 'historical-urban-population-reba')

if __name__ == '__main__':
    wb = openpyxl.load_workbook(os.path.join(RAW, 'original', 'urbanspatial-hist-urban-pop-3700bc-ad2000-xlsx.xlsx'), read_only=True)
    rows = list(wb['Historical Urban Population'].iter_rows(values_only=True))
    head = list(rows[0])
    os.makedirs(os.path.join(RAW, 'derived'), exist_ok=True)
    with open(os.path.join(RAW, 'derived', 'population.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(head + ['popl'])
        for r in rows[1:]:
            if r[0] is None:
                continue
            w.writerow(list(r) + [f'population estimate {int(r[8]):,}' if r[8] is not None else None])
    print(len(rows) - 1, 'records')
