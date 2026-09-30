"""
Europe-wide medieval sites, towns and battles, read from data/historical/raw
(never modified):

  wikidata-medieval  castles, monasteries, cathedrals, dioceses, fortifications,
                     universities, bridges and dated settlements (CC0)
  germania-sacra     monasteries and canonries of the Holy Roman Empire with each
                     order's dated tenure, and diocese borders (CC BY-SA 3.0)
  buringh-urban      estimated population of 2,262 European towns, 700–2000 (CC0)
  hced               battles and sieges before 1600 (CC0), only those Wikidata lacks

Outputs:
  public/world/tiles/medieval-sites.pmtiles   layer `sites`  (one point per site)
  public/world/tiles/towns.pmtiles            layer `towns`  (Buringh towns, population per sample year)
  public/world/tiles/gs-dioceses.pmtiles      layer `dioceses` (Germania Sacra's diocese borders; undated)
  public/atlas/hced-battles.json              battles/sieges not already in wikidata-events.json
  rows for the place index (see world.py): sources `wikidata`, `germaniasacra`, `buringh`

Nothing is invented: a site without a recorded date stays undated (the map
hides it at a date unless the reader asks for undated records); names follow
English label → the item's own label in a Latin-script language, never a
made-up translation; importance is never taken from how much has been
written about a place (Wikipedia sitelinks are not used).

  python3 scripts/atlas-build/sites.py
"""
from __future__ import annotations

import csv
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict

import tiler
import translit

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
RAW = os.path.join(ROOT, 'data', 'historical', 'raw')
WD = os.path.join(RAW, 'wikidata-medieval', 'original')
TILES = os.path.join(ROOT, 'public', 'world', 'tiles')
ATLAS = os.path.join(ROOT, 'public', 'atlas')

# An item in several classes is filed under the first that applies.
KINDS = ['cathedral', 'monastery', 'university', 'castle', 'fortification', 'bridge', 'diocese', 'settlement']
# Latin-script labels, in order of preference, after English (Serbian and Serbo-Croatian Latin included).
NAME_LANGS = 'mul de fr it es pt ca nl pl cs sk hu ro hr sl sv da nb fi is la lt lv et ga cy eu gl sq tr sr-el sh lb rm fy se hsb'.split()
# Labels in other scripts, kept as the place's own name when nothing else exists.
OTHER_SCRIPT_LANGS = 'uk be bg sr mk ru el ka hy ar he'.split()
LATEST = 1650  # later foundations are outside this layer's scope
# More specific kinds, from Wikidata's own classes (English labels of P31).
SUBTYPES = [
    ('abbey', 'abbey'), ('priory', 'priory'), ('friary', 'friary'), ('convent', 'convent'), ('nunnery', 'convent'),
    ('commandery', 'commandery'), ('charterhouse', 'charterhouse'), ('eastern orthodox monastery', 'orthodox monastery'),
    ('motte-and-bailey', 'motte-and-bailey'), ('deserted castle site', 'castle site'), ('castle ruin', 'castle ruin'),
    ('tower house', 'tower house'), ('hillfort', 'hillfort'), ('city gate', 'city gate'), ('city walls', 'town walls'),
    ('château', 'château'), ('water castle', 'water castle'), ('deserted village', 'deserted village'),
    ('abandoned village', 'deserted village'), ('titular see', 'titular see'),
]


def log(*a):
    print(*a, flush=True)


def norm(s: str) -> str:
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.category(c).startswith('M')).lower()
    return re.sub(r'\s+', ' ', re.sub(r"[’'`\-]", ' ', s)).strip()


def latin(s: str) -> bool:
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all('LATIN' in unicodedata.name(c, '') for c in letters)


def year(v: str):
    m = re.match(r'^"?(-?\d{1,4})-', v or '')
    return int(m.group(1)) if m else None


def qid(v: str) -> str:
    return v.strip('"<>').rsplit('/', 1)[-1]


def dist_km(a, b):
    dx = (a[0] - b[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot(dx, (a[1] - b[1]) * 110.57)


class Grid:
    def __init__(self, cell=0.1):
        self.cell, self.m = cell, defaultdict(list)

    def add(self, lon, lat, v):
        self.m[(int(lon // self.cell), int(lat // self.cell))].append(v)

    def near(self, lon, lat, r=1):
        cx, cy = int(lon // self.cell), int(lat // self.cell)
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                yield from self.m.get((cx + dx, cy + dy), [])


# ── Wikidata ──────────────────────────────────────────────────────────────

def wd_labels():
    out = {}
    for r in csv.reader(open(os.path.join(WD, 'labels.tsv'), encoding='utf-8'), delimiter='\t'):
        if len(r) > 1 and '/entity/' in r[0]:
            out[qid(r[0])] = r[1].rsplit('@', 1)[0].strip('"')
    return out


def wd_names(kind):
    out = {}
    for r in csv.reader(open(os.path.join(WD, f'{kind}.names.tsv'), encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
        if len(r) < 2 or r[0].startswith('?'):
            continue
        names = {}
        for part in r[1].strip('"').split('|'):
            lang, _, label = part.partition(':')
            if label and lang not in names:
                names[lang] = label.replace('\\"', '"')
        out[qid(r[0])] = names
    return out


def wd_records(kinds):
    labels = wd_labels()
    recs = {}
    for kind in kinds:
        names = wd_names(kind)
        for r in csv.reader(open(os.path.join(WD, f'{kind}.tsv'), encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
            if r[0].startswith('?'):
                continue
            q = qid(r[0])
            if q in recs:
                recs[q]['kinds'].add(kind)  # filed under its first kind; the others are kept
                continue
            m = re.match(r'POINT\(([-\d.eE]+) ([-\d.eE]+)\)', r[1])
            if not m:
                continue
            en = r[2].rsplit('@', 1)[0].strip('"').replace('\\"', '"') if r[2] else ''
            types = [labels.get(qid(x), '') for x in r[13].strip('"').split('|') if x]
            recs[q] = {
                'q': q, 'kind': kind, 'kinds': {kind}, 'lon': round(float(m.group(1)), 5), 'lat': round(float(m.group(2)), 5), 'en': en,
                'names': names.get(q, {}), 'inc': year(r[3]), 'fm': year(r[4]), 'dis': year(r[5]),
                'orders': [labels[qid(x)] for x in r[9].strip('"').split('|') if x and qid(x) in labels],
                'dio': qid(r[10]) if r[10] else None, 'dioN': labels.get(qid(r[10])) if r[10] else None,
                'types': [t for t in types if t], 'sl': int(r[12]) if r[12].strip('"').isdigit() else 0,
            }
    # Items with no label in the languages fetched: their labels in any language (fetched separately).
    fb = os.path.join(WD, 'fallback.names.tsv')
    if os.path.exists(fb):
        for r in csv.reader(open(fb, encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
            if len(r) < 2 or r[0].startswith('?') or qid(r[0]) not in recs:
                continue
            rec = recs[qid(r[0])]
            for part in r[1].strip('"').split('|'):
                lang, _, label = part.partition(':')
                if label:
                    if lang == 'en' and not rec['en']:
                        rec['en'] = label
                    rec['names'].setdefault(lang, label)
    return recs


def title_of(rec):
    """The name to show, and how it was chosen — never a made-up translation:
      1. the English label (Wikidata's established English name),
      2. the item's own label in a Latin-script language,
      3. a romanization by a published standard scheme (Cyrillic, Greek, Georgian — see translit.py),
      4. the label in its own script.
    Returns (title, language, basis) with basis 'en' | 'label' | 'romanized: <scheme>' | 'original script';
    (None, None, None) only if the item has no label at all."""
    if rec['en']:
        return rec['en'], 'en', 'en'
    for lang in NAME_LANGS:
        v = rec['names'].get(lang)
        if v and latin(v):
            return v, lang, 'label'
    for lang, v in sorted(rec['names'].items()):
        if latin(v):
            return v, lang, 'label'
    r = translit.romanize(rec['names'])
    if r:
        return r[0], r[1], f'romanized: {r[2]}'
    for lang in OTHER_SCRIPT_LANGS + sorted(rec['names']):
        v = rec['names'].get(lang)
        if v:
            return v, lang, 'original script'
    return None, None, None


def subtype(rec):
    ts = ' | '.join(rec['types']).lower()
    for key, st in SUBTYPES:
        if key in ts:
            return st
    return None


# ── Germania Sacra ────────────────────────────────────────────────────────

def gs_records():
    d = json.load(open(os.path.join(RAW, 'germania-sacra', 'original', 'monasteries-locations.geojson'), encoding='utf-8'))
    out = []
    for f in d['features']:
        p = f['properties']
        lon, lat = f['geometry']['coordinates'][:2]
        orders, froms, tos, open_end = [], [], [], False
        for o in p.get('orders') or []:
            a = int(o['beginTPQ']) if (o.get('beginTPQ') or '').lstrip('-').isdigit() else None
            b = int(o['endTPQ']) if (o.get('endTPQ') or '').lstrip('-').isdigit() else None
            if a is not None:
                froms.append(a)
            if b is not None:
                tos.append(b)
            elif (o.get('to') or '').strip().lower() in ('heute', ''):
                open_end = True
            orders.append([o.get('name') or '', a, b, o.get('from') or '', o.get('to') or ''])
        name = (p.get('monasteryName') or '').split(',')[0].strip()
        out.append({'gsn': str(p['gsnId']), 'lon': round(lon, 5), 'lat': round(lat, 5), 'name': name, 'full': p.get('monasteryName') or '',
                    'place': p.get('locationName') or '', 'orders': orders,
                    'from': min(froms) if froms else None, 'to': None if open_end or not tos else max(tos)})
    return out


# ── Buringh ───────────────────────────────────────────────────────────────

def buringh_records():
    path = os.path.join(RAW, 'buringh-urban', 'original', 'European urban population, 700 - 2000.tab')
    cities = {}
    for r in csv.DictReader(open(path, encoding='utf-8'), delimiter='\t'):
        key = (r['city'], r['latitudeindegrees'], r['longitudeindegrees'])
        c = cities.get(key)
        if not c:
            try:
                lat, lon = float(r['latitudeindegrees'].replace(',', '.')), float(r['longitudeindegrees'].replace(',', '.'))
            except ValueError:
                continue
            syn = [s.strip() for s in (r['synonymsandhistoricalnames'] or '').split(',') if s.strip()]
            c = cities[key] = {'city': r['city'], 'syn': syn, 'country': r['country'], 'lon': lon, 'lat': lat,
                               'water': r['transportlocation/watercatchmentarea'], 'pop': {}, 'nature': {}}
        y = int(float(r['year']))
        try:
            c['pop'][y] = float(r['inhabitantsin000-s'])
        except ValueError:
            continue
        if r['natureofestimate']:
            c['nature'][y] = r['natureofestimate']
    return list(cities.values())


PAST_OR_AREA = re.compile(r'\b(ancient|archaeological|roman|former|historical|polis|greek colony|greek city)')
# A label that names an area around the town, or a sub-unit of it ("Metropolitan City of Rome", "Seville city").
AREA_LABEL = re.compile(r'(?i)\b(province|metropolitan city|region|county|oblast|raion|district|department|arrondissement|municipality|urban area|agglomeration)\b|\s+city$|^city of\b')


def plausible(lon, lat):
    return -35 < lon < 70 and 25 < lat < 75


def decimal_readings(v):
    """A coordinate whose decimal separator was lost in the source (e.g. 50579 for 50.579):
    every reading with one or two digits before the point."""
    sign, digits = (-1 if v < 0 else 1), str(int(abs(v)))
    return [sign * float(digits[:k] + '.' + digits[k:]) for k in (1, 2) if len(digits) > k]


def main_name(t):
    return norm(re.split(r'[,(]', t['city'])[0])


def match_english(towns, recs):
    """Give each Buringh town the Wikidata city/town/settlement whose label (in any language) is one of
    the town's own names, within 12 km. Unmatched towns keep Buringh's name.

    A few rows in the source lost their decimal separator (latitude 50579 for 50.579). Such a town is
    kept only if one reading of its digits puts it within 12 km of a Wikidata place with the same
    name — the repair is then confirmed by an independent record, and marked; otherwise it is dropped."""
    grid = Grid(0.1)
    for r in recs.values():
        # Present-day cities and towns only: the dated-settlement records include ancient
        # predecessors and monasteries whose names overlap a town's synonyms.
        if r['kinds'] & {'city', 'town'}:
            labels = {norm(x) for x in [r['en'], *r['names'].values()] if x}
            grid.add(r['lon'], r['lat'], (r, labels))

    names = defaultdict(list)
    for r in recs.values():
        if r['kinds'] & {'city', 'town'} and r['dis'] is None:
            for x in {norm(x) for x in [r['en'], *r['names'].values()] if x}:
                names[x].append(r)

    def past(r):
        # An item for a vanished predecessor (dissolved, or classed as ancient / archaeological).
        return r['dis'] is not None or bool(PAST_OR_AREA.search(' | '.join(r['types']).lower()))

    def unique(n):
        return len({r['q'] for r in names.get(n, []) if not past(r)}) == 1

    def by_name(own):
        return [r for n in own for r in names.get(n, [])]

    def find(t, lon, lat):
        # The item must carry the town's own main name in some language (Wien → Vienna, whose German
        # label is Wien); a shared synonym alone is not enough (Craiova's synonym Pelendava is a Roman fort).
        own = {main_name(t)}
        best = None
        for r, labels in grid.near(lon, lat, 1):
            if own & labels:
                d = dist_km((lon, lat), (r['lon'], r['lat']))
                # Among same-named items on the spot (a city and its ancient predecessor), the one Wikipedia
                # treats as the main article — used only to tell identical names apart, never as importance.
                rank = (past(r), bool(AREA_LABEL.search(r['en'] or '')), -r['sl'], d)
                if d <= 12 and (best is None or rank < best[0]):
                    best = (rank, r)
        return best and (best[0][3], best[1])

    matched, kept, dropped = 0, [], []
    for t in towns:
        if plausible(t['lon'], t['lat']):
            best = find(t, t['lon'], t['lat'])
        else:
            lons = [t['lon']] if abs(t['lon']) < 70 else decimal_readings(t['lon'])
            lats = [t['lat']] if 25 < t['lat'] < 75 else decimal_readings(t['lat'])
            best = None
            for lon in lons:
                for lat in lats:
                    if plausible(lon, lat) and (hit := find(t, lon, lat)) and (best is None or hit[0] < best[0][0]):
                        best = (hit, lon, lat)
            if not best:
                dropped.append(t['city'])
                continue
            best, t['lon'], t['lat'] = best
            t['fixed'] = True
        if not best:
            # The source's position may simply be wrong (Riga at 21.1°E instead of 24.1°E). If exactly one
            # present-day town with one of its names lies within 800 km, use that position and say so.
            # Within 60 km any of its names may confirm it; farther away only a town whose English label is
            # the town's own main name (ancient synonyms such as "Norba" name other places too).
            own = {norm(x) for x in [t['city'], *t['syn']]}
            main = main_name(t)
            cands = [r for r in by_name(own) if not past(r) and (
                (d := dist_km((t['lon'], t['lat']), (r['lon'], r['lat']))) <= 60 or (d <= 250 and norm(r['en'] or '') == main and unique(main)))]
            far = [r for r in by_name({main}) if not past(r) and unique(main) and norm(r['en'] or '') == main]
            if not cands and far and dist_km((t['lon'], t['lat']), (far[0]['lon'], far[0]['lat'])) <= 800:
                # The only town of that name is 250–800 km away: the row's position is evidently wrong,
                # and moving it that far on a name alone would be a guess — leave it off the map.
                dropped.append(t['city'])
                continue
            if len({r['q'] for r in cands}) == 1:
                r = cands[0]
                t['moved'] = round(dist_km((t['lon'], t['lat']), (r['lon'], r['lat'])))
                t['lon'], t['lat'] = r['lon'], r['lat']
                best = (0, r)
        if best and (past(best[1]) or AREA_LABEL.search(best[1]['en'] or '')):
            # Only a predecessor's record (Massalia for Marseille) or a unit named after the town
            # ("Seville city"): neither label is the town's English name.
            best = None
        if best:
            t['q'] = best[1]['q']
            t['en'] = re.sub(r'\s*\([^)]*\)$', '', best[1]['en'] or '')  # "Calahorra (municipal capital)" → "Calahorra"
            matched += 1
        kept.append(t)
    towns[:] = kept
    return {'matched': matched, 'coordinatesRepaired': sum(1 for t in towns if t.get('fixed')),
            'movedToWikidataPosition': sum(1 for t in towns if t.get('moved')), 'droppedBadCoordinates': dropped}


# ── Build ─────────────────────────────────────────────────────────────────

def build(rows_only=False):
    recs = wd_records(KINDS + ['city', 'town'])
    log('  wikidata records', len(recs), Counter(r['kind'] for r in recs.values()))
    gs = gs_records()
    towns = buringh_records()
    log('  germania sacra', len(gs), ' buringh towns', len(towns), ' english names matched', match_english(towns, recs))

    # Germania Sacra ↔ Wikidata monasteries: the same house within 400 m is one site with both identifiers.
    grid = Grid(0.02)
    for r in recs.values():
        if r['kind'] in ('monastery', 'cathedral'):
            grid.add(r['lon'], r['lat'], r)
    gs_only, merged = [], 0
    for g in gs:
        hit = min((r for r in grid.near(g['lon'], g['lat']) if dist_km((g['lon'], g['lat']), (r['lon'], r['lat'])) <= 0.4),
                  key=lambda r: dist_km((g['lon'], g['lat']), (r['lon'], r['lat'])), default=None)
        if hit and 'gs' not in hit:
            hit['gs'] = g
            merged += 1
        else:
            gs_only.append(g)
    log('  germania sacra merged with wikidata', merged, ' separate', len(gs_only))

    # Buringh towns replace Wikidata settlement rows for the same place (Buringh has population; the date is kept).
    town_q = {t['q'] for t in towns if t.get('q')}
    for t in towns:
        r = recs.get(t.get('q') or '')
        if r and r['kind'] == 'settlement':
            t['fm'] = min(x for x in (r['fm'], r['inc']) if x is not None) if (r['fm'] or r['inc']) else None

    rows, sites = [], []
    skipped = Counter()
    for r in recs.values():
        if r['kind'] in ('city', 'town') or (r['kind'] == 'settlement' and r['q'] in town_q):
            continue
        title, lang, name_basis = title_of(r)
        if not title:
            skipped['no label in any language'] += 1
            continue
        g = r.get('gs')
        # Dates: founding / first mention and dissolution as Wikidata records them; Germania Sacra's
        # dated tenure fills a gap Wikidata leaves.
        start = min((x for x in (r['inc'], r['fm']) if x is not None), default=None)
        # What the start date means. A first written mention (P1249) says only when evidence begins. Wikidata's
        # "inception" (P571) is a founding or building date for castles, religious houses, cathedrals, bridges and
        # universities; for settlements it is often a first mention entered as inception, so it is not treated
        # as a founding there.
        if r['fm'] is not None and (r['inc'] is None or r['fm'] <= r['inc']):
            basis = 'first mention'
        elif start is not None:
            basis = 'recorded start (Wikidata inception)' if r['kind'] == 'settlement' else 'founded'
        else:
            basis = None
        end = r['dis']
        if g and start is None and g['from'] is not None:
            start, basis = g['from'], 'Germania Sacra'
        if g and end is None and g['to'] is not None and start is not None:
            end = g['to']
        if start is not None and start >= LATEST:
            skipped['founded after %d' % LATEST] += 1
            continue
        if end is not None and start is not None and end < start:
            end = None
        st = subtype(r)
        # Every label is kept (the name index finds a place by any of them); Latin-script ones first.
        labels = sorted(((k, v) for k, v in r['names'].items() if v != title), key=lambda kv: (not latin(kv[1]), kv[0]))
        names = [[v, None, None, k] for k, v in labels][:16]
        if r['en'] and r['en'] != title:
            names.insert(0, [r['en'], None, None, 'en'])
        related = [[r['dio'], 'in diocese', r['dioN'], 0]] if r['dio'] and r['dioN'] else []
        extra = {'k': r['kind'], **({'st': st} if st else {}), **({'fb': basis} if basis else {}), **({'nl': lang, 'nb': name_basis} if lang != 'en' else {}),
                 **({'o': r['orders'][:4]} if r['orders'] else {}), **({'gs': g['gsn'], 'go': g['orders'][:6]} if g else {})}
        rows.append(['wikidata', r['q'], title, r['lon'], r['lat'], 1, r['kind'] + (',' + st if st else ''), start, end, 0, names,
                     [r['dioN']] if r['dioN'] else [], related, extra])
        props = {'i': r['q'], 'n': title[:70], 'k': r['kind']}
        if st:
            props['st'] = st
        if start is not None:
            props['f'] = start
        if end is not None:
            props['t'] = end
        if basis:
            props['fb'] = basis
        if r['orders']:
            props['o'] = ', '.join(r['orders'][:3])[:80]
        if r['dioN']:
            props['d'] = r['dioN'][:60]
        if g:
            props['gs'] = g['gsn']
        if lang != 'en':
            props['nl'] = lang
            props['nb'] = name_basis
        sites.append(props | {'_ll': (r['lon'], r['lat'])})

    for g in gs_only:
        if not g['name'] or (g['from'] is not None and g['from'] >= LATEST):
            continue
        orders = [o[0] for o in g['orders'] if o[0]]
        rows.append(['germaniasacra', g['gsn'], g['name'], g['lon'], g['lat'], 1, 'monastery', g['from'], g['to'], 0,
                     [[g['full'], None, None, 'de']] if g['full'] != g['name'] else [], [g['place']] if g['place'] else [], [],
                     {'k': 'monastery', 'nl': 'de', 'go': g['orders'][:6], **({'fb': 'Germania Sacra'} if g['from'] is not None else {})}])
        props = {'i': 'gs' + g['gsn'], 'gs': g['gsn'], 'n': g['name'][:70], 'k': 'monastery', 'nl': 'de'}
        if g['from'] is not None:
            props['f'] = g['from']
            props['fb'] = 'Germania Sacra'
        if g['to'] is not None:
            props['t'] = g['to']
        if orders:
            props['o'] = ', '.join(dict.fromkeys(orders))[:80]
        sites.append(props | {'_ll': (g['lon'], g['lat'])})

    town_feats = []
    for t in towns:
        title = t.get('en') or t['city']
        pops = {y: p for y, p in t['pop'].items()}
        first = min((y for y, p in sorted(pops.items()) if p > 0), default=None)
        names = [[x, None, None, ''] for x in dict.fromkeys([t['city'], *t['syn']]) if x != title][:12]
        extra = {'k': 'town', **({'fb': 'first mention (Wikidata)'} if t.get('fm') else {}), **({'tn': 0} if title != t['city'] else {}), **({'fix': 'decimal point restored, confirmed by Wikidata'} if t.get('fixed') else {}),
                 **({'fix': f"position from Wikidata; Buringh's coordinates are {t['moved']} km away"} if t.get('moved') else {}), 'pop': {str(y): p for y, p in sorted(pops.items())}, 'est': {str(y): v for y, v in sorted(t['nature'].items())},
                 **({'q': t['q']} if t.get('q') else {}), **({'env': [first, None, 'dataset']} if first is not None and not t.get('fm') else {})}
        bid = f"{t['city']}|{t['lat']:.2f}|{t['lon']:.2f}"
        rows.append(['buringh', bid, title, round(t['lon'], 4), round(t['lat'], 4), 1, 'town',
                     t.get('fm'), None, 0, names, [t['country']], [], extra])
        props = {'i': bid, 'n': title[:60], 'c': t['country']}
        if t.get('q'):
            props['q'] = t['q']
        if t.get('en') and t['en'] != t['city']:
            props['a'] = t['city']  # the name as Buringh gives it
        if t.get('fixed') or t.get('moved'):
            props['fx'] = 1
        for y, p in pops.items():
            if p > 0:
                props[f'p{y}'] = p
        peak = max((p for y, p in pops.items() if y <= 1850), default=0)
        mz = 3 if peak >= 50 else 4 if peak >= 20 else 5 if peak >= 10 else 6 if peak >= 5 else 7
        town_feats.append(({'type': 'Point', 'coordinates': [round(t['lon'], 4), round(t['lat'], 4)]}, props, mz))

    log('  place-index rows', len(rows), Counter(r[0] for r in rows), ' skipped', dict(skipped))
    if rows_only:
        return rows, {}

    stats = {}
    # Level of detail: major church sites first, then religious houses and castles, then the rest.
    zoom = {'cathedral': 5, 'university': 5, 'diocese': 6, 'monastery': 7, 'castle': 7, 'fortification': 8, 'bridge': 9, 'settlement': 9}
    feats = []
    for p in sites:
        ll = p.pop('_ll')
        mz = zoom[p['k']]
        if p.get('st') in ('abbey',):
            mz -= 1
        feats.append(({'type': 'Point', 'coordinates': list(ll)}, p, mz))
    stats['sites'] = tiler.build(os.path.join(TILES, 'medieval-sites.pmtiles'), 'sites', feats, 11, 'Medieval sites of Europe',
                                 'Wikidata (CC0); Germania Sacra (CC BY-SA 3.0)')
    stats['towns'] = tiler.build(os.path.join(TILES, 'towns.pmtiles'), 'towns', town_feats, 10, 'European towns 700–2000',
                                 'Buringh, European urban population 700–2000 (DANS, CC0)')
    d = json.load(open(os.path.join(RAW, 'germania-sacra', 'original', 'diocese-borders.geojson'), encoding='utf-8'))
    dio = [(f['geometry'], {'n': f['properties'].get('Name') or ''}, 4) for f in d['features'] if f.get('geometry')]
    stats['dioceses'] = tiler.build(os.path.join(TILES, 'gs-dioceses.pmtiles'), 'dioceses', dio, 9, 'Dioceses of the Empire (Germania Sacra)',
                                    'Germania Sacra (CC BY-SA 3.0)')
    stats['hced'] = hced_battles()
    log('  ', stats)
    return rows, stats


def hced_battles():
    """HCED battles before 1600 that Wikidata's events lack (no Wikidata battle/siege within 50 km and ±1 year)."""
    ev = json.load(open(os.path.join(ATLAS, 'wikidata-events.json'), encoding='utf-8'))['features']
    grid = Grid(1.0)
    for f in ev:
        p = f['properties']
        if p['k'] in ('battle', 'siege'):
            grid.add(*f['geometry']['coordinates'][:2], (f['geometry']['coordinates'][:2], p['y'], norm(p['n'])))
    out, dup = [], 0
    path = os.path.join(RAW, 'hced', 'original', 'HCED Data v3.csv')
    for r in csv.DictReader(open(path, encoding='cp1252', errors='replace')):
        try:
            y, lat, lon = int(r['Year']), float(r['Latitude']), float(r['Longitude'])
        except ValueError:
            continue
        if y >= 1600:
            continue
        name = r['Battle'].strip()
        n = norm(name)
        same = any(abs(wy - y) <= 1 and (dist_km(ll, (lon, lat)) <= 50 or n in wn) for ll, wy, wn in grid.near(lon, lat, 1))
        if same:
            dup += 1
            continue
        props = {'n': ('Siege of ' if 'siege' in n else 'Battle of ') + name if not re.match(r'(?i)(battle|siege)\b', name) else name,
                 'k': 'siege' if 'siege' in n else 'battle', 'y': y, 'h': r['ID']}
        for k_in, k_out in (('War', 'w'), ('Winner', 'win'), ('Loser', 'los')):
            if r.get(k_in, '').strip():
                props[k_out] = r[k_in].strip()[:80]
        out.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 4), round(lat, 4)]}, 'properties': props})
    with open(os.path.join(ATLAS, 'hced-battles.json'), 'w', encoding='utf-8') as fh:
        json.dump({'type': 'FeatureCollection', 'features': out}, fh, ensure_ascii=False, separators=(',', ':'))
    return {'added': len(out), 'alreadyInWikidata': dup}


if __name__ == '__main__':
    build()
