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

import inputs
import csv
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict

import quality
import tiler
import translit
import regional

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
RAW = os.path.join(ROOT, 'data', 'historical', 'raw')
WD = os.path.join(RAW, 'wikidata-medieval', 'original')
TILES = os.path.join(ROOT, 'public', 'world', 'tiles')
ATLAS = os.path.join(ROOT, 'public', 'atlas')
# Private data pack build output (git-ignored): tiles and place index for datasets that must not be republished.
PRIVATE_BUILD = os.path.join(ROOT, 'data', 'private-pack', 'build')
private_rows = []  # filled by build(); world.py writes them as the private place index
register_feats = []  # national registers and historical gazetteers (registers.py) → registers.pmtiles

# An item in several classes is filed under the first that applies.
KINDS = ['cathedral', 'monastery', 'university', 'castle', 'fortification', 'bridge', 'diocese', 'settlement']
# Latin-script labels, in order of preference, after English (Serbian and Serbo-Croatian Latin included).
NAME_LANGS = 'mul de fr it es pt ca nl pl cs sk hu ro hr sl sv da nb fi is la lt lv et ga cy eu gl sq tr sr-el sh lb rm fy se hsb'.split()
# Labels in other scripts, kept as the place's own name when nothing else exists.
OTHER_SCRIPT_LANGS = 'uk be bg sr mk ru el ka hy ar he'.split()
LATEST = 1650  # later foundations are outside this layer's scope
EVIDENCE = os.path.join(RAW, 'wikidata-medieval', 'original', 'temporal-evidence.json')  # wikidata_dates.py


def load_evidence():
    """Extra dated statements Wikidata holds for the snapshot's undated items (empty when not fetched)."""
    if not inputs.present(EVIDENCE):
        return {}, {}
    d = json.load(open(EVIDENCE, encoding='utf-8'))
    by = defaultdict(list)
    for x in d['statements']:
        by[x['i']].append(x)
    return by, d['periods']
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


def match_english(towns, recs, repair=True):
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
        if plausible(t['lon'], t['lat']) or not repair:
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
        if not best and repair:
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
    ev_by, ev_periods = load_evidence()
    evidence_used = Counter()
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
        # No date in the snapshot: the other dated statements Wikidata holds for the item (a dated event, an opening,
        # a style or period with its own dates). A dated statement is evidence the place existed then, not a founding.
        env = None
        if start is None and end is None:
            ev = quality.wikidata_evidence(ev_by.get(r['q'], []), ev_periods)
            if ev and ev[0] == 'attested':
                start, basis = ev[1], ev[2]
                evidence_used['attested'] += 1
            elif ev:
                env = [ev[1], ev[2], ev[3]]
                evidence_used['period'] += 1
        st = subtype(r)
        # Every label is kept (the name index finds a place by any of them); Latin-script ones first.
        labels = sorted(((k, v) for k, v in r['names'].items() if v != title), key=lambda kv: (not latin(kv[1]), kv[0]))
        names = [[v, None, None, k] for k, v in labels][:16]
        if r['en'] and r['en'] != title:
            names.insert(0, [r['en'], None, None, 'en'])
        related = [[r['dio'], 'in diocese', r['dioN'], 0]] if r['dio'] and r['dioN'] else []
        extra = {'k': r['kind'], **({'st': st} if st else {}), **({'fb': basis} if basis else {}), **({'env': env} if env else {}), **({'nl': lang, 'nb': name_basis} if lang != 'en' else {}),
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
        if env:
            props['ef'] = env[0]
            if env[1] is not None:
                props['et'] = env[1]
            props['per'] = 'period of its architectural style (Wikidata)' if env[2] == 'style' else 'its recorded period (Wikidata)'
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

    hre_feats, private_feats, private_rows[:], reg_stats = regional_layers(recs, rows, sites)
    log('  regional', reg_stats)

    log('  place-index rows', len(rows), Counter(r[0] for r in rows), ' skipped', dict(skipped), ' Wikidata evidence for undated items', dict(evidence_used))
    if rows_only:
        return rows, {}

    stats = {}
    # Level of detail: major church sites first, then religious houses and castles, then the rest.
    zoom = {'cathedral': 5, 'university': 5, 'diocese': 6, 'monastery': 7, 'castle': 7, 'fortification': 8, 'bridge': 9, 'settlement': 9,
            'church': 9, 'market': 7, 'site': 9, 'hoard': 9, 'wreck': 9, 'road': 9}
    feats = []
    registry = quality.dataset_registry(ROOT)
    for p in sites:
        ll = p.pop('_ll')
        with_window(p, registry)
        mz = zoom[p['k']]
        if p.get('st') in ('abbey',):
            mz -= 1
        feats.append(({'type': 'Point', 'coordinates': list(ll)}, p, mz))
    stats['hre'] = tiler.build(os.path.join(TILES, 'hre-towns.pmtiles'), 'towns', hre_feats, 10, 'Towns of the Holy Roman Empire',
                               'Princes and Townspeople (Bogucka, Cantoni, Mohr, Weigand), CC0')
    # Private data pack only (never in git or the public site): see scripts/atlas-build/private_pack.py.
    for _, p, _ in private_feats:
        with_window(p, registry)
    os.makedirs(os.path.join(PRIVATE_BUILD, 'tiles'), exist_ok=True)
    stats['private'] = tiler.build(os.path.join(PRIVATE_BUILD, 'tiles', 'private-sites.pmtiles'), 'sites', private_feats, 11, 'Private sites',
                                   'Private data pack — used privately in Shelf, not republished')
    stats['privateLines'] = tiler.build(os.path.join(PRIVATE_BUILD, 'tiles', 'private-lines.pmtiles'), 'features', private_lines(), 11,
                                        'Private lines and areas', 'Atlas Fontium (IH PAN) — private use, not republished')
    stale = os.path.join(TILES, 'local-sites.pmtiles')
    if os.path.exists(stale):
        os.remove(stale)
    stats['sites'] = tiler.build(os.path.join(TILES, 'medieval-sites.pmtiles'), 'sites', feats, 11, 'Medieval sites of Europe',
                                 'Wikidata (CC0); Germania Sacra (CC BY-SA 3.0)')
    reg_zoom = {'cathedral': 6, 'monastery': 7, 'castle': 8, 'fortification': 9, 'settlement': 9, 'church': 9, 'market': 8, 'bridge': 10,
                'harbour': 9, 'wreck': 10, 'mill': 10, 'mine': 10, 'road': 10, 'site': 11, 'building': 11}
    rfeats, sfeats = [], []
    import generic as GEN2
    spec_srcs = {sp['src'] for sp in GEN2.specs(public=True)}
    for p in register_feats:
        ll = p.pop('_ll')
        with_window(p, registry)
        # Spec-driven datasets go to their own tile set (keeps each file well under hosting limits).
        (sfeats if p.get('src') in spec_srcs else rfeats).append(({'type': 'Point', 'coordinates': list(ll)}, p, reg_zoom.get(p['k'], 10)))
    stats['specSites'] = tiler.build(os.path.join(TILES, 'spec-sites.pmtiles'), 'sites', sfeats, 11, 'Datasets read through spec files',
                                     '; '.join(f"{sp['title']} ({sp['licence']})" for sp in GEN2.specs(public=True)))
    stats['registers'] = tiler.build(os.path.join(TILES, 'registers.pmtiles'), 'sites', rfeats, 11, 'National registers and historical gazetteers',
                                     'Canmore (HES, OGL); Archaeological Survey of Ireland (CC BY 4.0); NID register (CC BY 4.0); Index Villaris 1680 (CC BY 4.0); '
                                     'Ottoman NFS gazetteer (CC BY 4.0); Generalkarte gazetteer (CC BY 4.0); Cassini (CC0); Lutsch 1751 (CC BY-NC-SA 4.0); Slovenian RKD register (CC BY 4.0); Latvian monuments list (CC0); Croatian register of cultural goods (Open Licence); Russian 3-verst map gazetteer (Boykov, CC BY 4.0); RoHGIS settlements 1904–1913 (CC BY 4.0); TransIce Iceland (CC BY 4.0); DISSILOC (CC BY-SA 4.0); Swedish geometrical maps 1630–1655 (CC BY 4.0); Tyrolean mining documents gazetteer (CC BY 4.0); Arkas 2.0 Slovenia (CC BY-SA 4.0)')
    from cassini_tiles import build_cassini_roads
    stats['cassiniRoads'] = build_cassini_roads(TILES)
    from cassini_tiles import build_spec_areas
    stats['specAreas'] = build_spec_areas(TILES, os.path.join(PRIVATE_BUILD, 'tiles'))
    from cassini_tiles import build_building_density
    stats['buildingDensity'] = build_building_density(TILES)
    from cassini_tiles import build_inscriptions
    stats['inscriptions'] = build_inscriptions(TILES)
    stats['towns'] = tiler.build(os.path.join(TILES, 'towns.pmtiles'), 'towns', town_feats, 10, 'European towns 700–2000',
                                 'Buringh, European urban population 700–2000 (DANS, CC0)')
    d = json.load(open(os.path.join(RAW, 'germania-sacra', 'original', 'diocese-borders.geojson'), encoding='utf-8'))
    dio = [(f['geometry'], {'n': f['properties'].get('Name') or ''}, 4) for f in d['features'] if f.get('geometry')]
    stats['dioceses'] = tiler.build(os.path.join(TILES, 'gs-dioceses.pmtiles'), 'dioceses', dio, 9, 'Dioceses of the Empire (Germania Sacra)',
                                    'Germania Sacra (CC BY-SA 3.0)')
    stats['hced'] = hced_battles()
    log('  ', stats)
    return rows, stats


def private_lines():
    """Atlas Fontium (Crown of Poland, 2nd half of the 16th c.): roads with the atlas's weight class, rivers, forests and
    water, and the administrative and church units — for the private data pack. One period for the whole atlas."""
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    base = os.path.join(RAW, 'atlas-fontium-poland', 'original')
    layers = [('drogi', 'road', lambda p: {'w': p.get('waga_drogi') or None}, 5, 0.0005), ('rzeki', 'river', lambda p: {'n': p.get('nazwa') or None}, 6, 0.0005),
              ('lasy', 'forest', lambda p: {}, 6, 0.002), ('akweny', 'water', lambda p: {}, 7, 0.001),
              ('wojewodztwa', 'voivodeship', lambda p: {'n': p.get('woj_p')}, 4, 0.002), ('powiaty', 'district', lambda p: {'n': p.get('powiat_p')}, 5, 0.001),
              ('diecezje', 'diocese', lambda p: {'n': p.get('g_diecezja')}, 4, 0.002), ('parafie', 'parish', lambda p: {'n': p.get('g_parafia')}, 8, 0.0005)]
    out = []
    for fn, kind, props, mz, tol in layers:
        path = os.path.join(base, fn + '.geojson')
        if not inputs.present(path):
            continue
        for f in json.load(open(path, encoding='utf-8'))['features']:
            if not f.get('geometry'):
                continue
            src = shape(f['geometry'])
            g = src.simplify(tol, preserve_topology=True)
            if g.geom_type == 'GeometryCollection':  # simplification can mix dimensions: keep the parts like the source
                keep = [x for x in g.geoms if x.geom_type.replace('Multi', '') == src.geom_type.replace('Multi', '')]
                g = unary_union(keep) if keep else g
            if g.is_empty or g.geom_type == 'GeometryCollection':
                continue
            pr = {'k': kind, 'ef': regional.AF_PERIOD[0], 'et': regional.AF_PERIOD[1], **{k: v for k, v in props(f['properties']).items() if v}}
            out.append((mapping(g), pr, mz))
    return out


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


# ── Regional specialist datasets (second audit pass; see regional.py) ─────

FIN_PERIODS = {'keskiaikainen': (1150, 1550), 'rautakautinen': (-500, 1150), 'historiallinen': (1150, 1900)}


def with_window(p, registry):
    """w0/w1: the period the feature's dataset covers. The map draws a site with no evidence at the chosen year (no dates,
    or first recorded later) only inside it, and only when the reader includes unevidenced records (see catalog.ts)."""
    w = quality.display_window(p, registry)
    if w:
        p['w0'], p['w1'] = w


def _site_props(i, name, kind, lon, lat, **kw):
    p = {'i': i, 'n': name[:70], 'k': kind}
    p.update({k: v for k, v in kw.items() if v not in (None, '', [])})
    return p | {'_ll': (lon, lat)}


# Norwegian monuments kept although their original function is not settlement, church, fort or trade: burial mounds and
# house sites, which carry the Viking-age and medieval landscape. Their Norwegian category names in English for titles.
NO_KEEP_ART = {'Gravhaug', 'Gravrøys', 'Tuft', 'Hustuft', 'Kirkegård', 'Kirkested', 'Bygdeborg', 'Båtstø', 'Naust', 'Nausttuft', 'Gårdshaug'}
NO_ART_EN = {'Gravhaug': 'Burial mound', 'Gravrøys': 'Burial cairn', 'Tuft': 'House site', 'Hustuft': 'House site', 'Kirkegård': 'Churchyard',
             'Kirkested': 'Church site', 'Kirke': 'Church', 'Bygdeborg': 'Hillfort', 'Båtstø': 'Boat landing', 'Naust': 'Boathouse',
             'Nausttuft': 'Boathouse site', 'Gårdshaug': 'Farm mound', 'Borg': 'Castle', 'Bosetning-aktivitetsområde': 'Settlement area',
             'Gårdstun': 'Farmstead', 'Kaupang': 'Trading place', 'Handelssted': 'Trading place'}


def regional_layers(recs, rows, sites_out):
    """Adds rows (place index) and site features for the regional datasets; returns
    (HRE town features, local-only features, stats)."""
    stats = {}

    # Holy Roman Empire towns — English names matched like Buringh's, positions never moved (the source is precise).
    hre = regional.princes_townspeople()
    adapt = [{'city': t['name'], 'syn': [x for x in (t['alt'], t['foreign']) if x], 'lon': t['lon'], 'lat': t['lat'], 't': t} for t in hre]
    m = match_english(adapt, recs, repair=False)
    hre_feats = []
    for a in adapt:
        t = a['t']
        title = a.get('en') or t['name']
        names = [[x, None, None, lang] for x, lang in ((t['name'], 'de'), (t['alt'], 'de'), (t['foreign'], '')) if x and x != title]
        rule = t['rule']
        # The town existed from its earliest dated evidence of any kind: the Städtebuch sometimes dates a charter or
        # foundation before the first "mention" (whose year can be an upper bound, e.g. "Middle Ages" = 1500 at the latest).
        dated = [(y, b) for y, b in ((t['founded'], 'founded'), (t['mention'], 'first mention'), (t['charter'], 'first mention'),
                                     (t['character'], 'first mention')) if y is not None and y != 0]  # 0 = an empty field
        start, basis = min(dated, key=lambda d: (d[0], d[1] != 'founded')) if dated else (None, None)
        extra = {'k': 'town', **({'fb': basis} if basis else {}), **({'tn': 0} if title != t['name'] else {}),
                 **({'q': a['q']} if a.get('q') else {}), 'ch': t['charter'], 'lf': t['legal'], 'fm1': t['firstMarket'],
                 'rule': rule[:40]}
        rows.append(['hre', t['id'], title, t['lon'], t['lat'], 1, 'town', start, None, 0, names[:6], [rule[0][0]] if rule else [], [], extra])
        props = {'i': t['id'], 'n': title[:60]}
        for k, v in (('f', start), ('fb', basis), ('ch', t['charter']), ('fd', t['founded']), ('cc', t['character']), ('lf', t['legal']),
                     ('m', t['firstMarket'][0] if t['firstMarket'] else None), ('mt', t['firstMarket'][1] if t['firstMarket'] else None),
                     ('a', t['name'] if title != t['name'] else None), ('q', a.get('q'))):
            if v is not None:
                props[k] = v
        if rule:
            props['rl'] = ';'.join(f'{n}|{x}|{y}' for n, x, y in rule)[:3000]
        mz = 5 if (t['charter'] or 9999) <= 1300 else 6 if t['charter'] else 8
        hre_feats.append(({'type': 'Point', 'coordinates': [t['lon'], t['lat']]}, props, mz))
    stats['hre'] = {'towns': len(hre), 'englishNames': m['matched'], 'withRulers': sum(1 for t in hre if t['rule'])}

    # France — Mérimée. A monument within 250 m of a Wikidata site of the same kind is that site (the
    # Mérimée reference and building-campaign century are added to it); otherwise it is its own site.
    group = {'castle': 'castle', 'fortification': 'castle', 'monastery': 'relig', 'cathedral': 'relig', 'church': 'relig', 'bridge': 'bridge', 'market': 'market'}
    wd_sites = {p['i']: p for p in sites_out if isinstance(p.get('i'), str) and p['i'].startswith('Q')}
    grid = Grid(0.01)
    for p in wd_sites.values():
        grid.add(p['_ll'][0], p['_ll'][1], p)
    mer = regional.merimee()
    merged = 0
    for x in mer:
        g = group[x['kind']]
        near = [p for p in grid.near(x['lon'], x['lat'], 1) if group.get(p['k']) == g and dist_km((x['lon'], x['lat']), p['_ll']) <= 0.25]
        if near:
            p = min(near, key=lambda p: dist_km((x['lon'], x['lat']), p['_ll']))
            if 'mr' not in p:
                p['mr'] = x['ref']
                p['bc'] = x['centuries']
                merged += 1
                continue
        span = x['span']
        # Dated by the century of the main building campaign: an evidence period, not a founding year.
        extra = {'k': x['kind'], 'nl': 'fr', 'nb': 'label', 'fb': 'main building campaign (Mérimée)', 'bc': x['centuries'],
                 'env': [span[0], None, 'source'] if not x['moyenAge'] else [500, 1500, 'source']}
        rows.append(['merimee', x['ref'], x['name'], x['lon'], x['lat'], 1, x['kind'], None, None, 0, [], [x['commune']] if x['commune'] else [], [], extra])
        sites_out.append(_site_props(x['ref'], x['name'], x['kind'], x['lon'], x['lat'], ef=span[0], bc=x['centuries'][:60], fb='building campaign', nl='fr', nb='label', src='merimee'))
    stats['merimee'] = {'medievalMonuments': len(mer), 'mergedIntoWikidataSites': merged, 'ownSites': len(mer) - merged}

    # Finland — register sites classed medieval. Dated only by the register's period classes → evidence period.
    fin = regional.finland()
    for x in fin:
        spans = [FIN_PERIODS[c.strip()] for c in (x['period'] or '').split(',') if c.strip() in FIN_PERIODS]
        lo, hi = min(s[0] for s in spans), max(s[1] for s in spans)
        kind = x['kind'] if x['kind'] in ('church', 'fortification', 'settlement') else 'site'
        extra = {'k': kind, 'nl': 'fi', 'nb': 'label', 'env': [lo, hi, 'source'], 'st': x['type'][:40], 'per': x['period']}
        rows.append(['finreg', x['id'], x['name'], x['lon'], x['lat'], 1, kind, None, None, 0, [], [x['kunta']] if x['kunta'] else [], [], extra])
        sites_out.append(_site_props('fi' + x['id'], x['name'], kind, x['lon'], x['lat'], ef=lo, et=hi, st=x['type'][:40], per=x['period'][:40], nl='fi', nb='label', src='finreg'))
    stats['finland'] = len(fin)

    # West Bohemia — dated historical name forms. A Wikidata settlement within 2 km with the same Czech label is
    # the same place: the attested form (with its year and source) is added to it; otherwise a place of its own.
    by_cs = defaultdict(list)
    for r in rows:
        if r[0] == 'wikidata' and (r[13] or {}).get('k') == 'settlement':
            for n in [r[2], *[x[0] for x in r[10]]]:
                by_cs[norm(n)].append(r)
    wb, merged = regional.western_bohemia(), 0
    for x in wb:
        hit = next((r for r in by_cs.get(norm(x['name']), []) if dist_km((x['lon'], x['lat']), (r[3], r[4])) <= 2), None)
        form = [x['form'] or x['de'], x['first'], None, 'historical form'] if (x['form'] or x['de']) else None
        if hit:
            if form:
                hit[10].insert(0, form)
            if x['first'] is not None and (hit[7] is None or x['first'] < hit[7]):
                hit[7] = x['first']
                hit[13]['fb'] = 'first mention'
                hit[13]['fbs'] = 'Western Bohemia toponyms (Janovská 2026)'
            merged += 1
            continue
        rows.append(['wbohemia', x['id'], x['name'], x['lon'], x['lat'], 1, 'settlement', x['first'], None, 0, [form] if form else [], [], [],
                     {'k': 'settlement', 'fb': 'first mention', 'src1': x['src'], 'nl': 'cs', 'nb': 'label'}])
        sites_out.append(_site_props('wb' + str(x['id']), x['name'], 'settlement', x['lon'], x['lat'], f=x['first'], fb='first mention', nl='cs', nb='label', src='wbohemia'))
    stats['westernBohemia'] = {'places': len(wb), 'mergedIntoWikidata': merged}

    # England — bridges and fords attested to c. 1250.
    br = regional.bridges()
    for x in br:
        rows.append(['bridges1250', x['id'], x['name'].lstrip('?'), x['lon'], x['lat'], 0 if x['uncertain'] else 1, 'bridge', x['first'], None, 1 if x['uncertain'] else 0,
                     [[x['form'], x['first'], None, 'attested form']] if x['form'] else [], [x['river']] if x['river'] else [], [], {'k': 'bridge', 'fb': 'first mention'}])
        sites_out.append(_site_props('br' + x['id'], x['name'].lstrip('?'), 'bridge', x['lon'], x['lat'], f=x['first'], fb='first mention', riv=x['river'], src='bridges1250', u=1 if x['uncertain'] else None))
    stats['bridges'] = len(br)

    # Public, open licences: Nordic Spatial Humanities (CC BY 4.0) and the Norwegian heritage register (NLOD).
    for x in regional.nordic():
        if x['first'] is not None:
            rows.append(['nsh', x['id'], x['name'], x['lon'], x['lat'], 1, x['kind'], x['first'], None, 0, [], [x['diocese']] if x.get('diocese') else [], [],
                         {'k': x['kind'], 'fb': 'first mention', 'st': x['type'], 'nb': 'label', **({'q': x['q']} if x.get('q') else {})}])
            sites_out.append(_site_props('ns' + x['id'], x['name'], x['kind'], x['lon'], x['lat'], f=x['first'], fb='first mention', st=x['type'],
                                         dio=x.get('diocese'), src='nsh'))
        else:
            lo, hi = x['period']
            rows.append(['nsh', x['id'], x['name'], x['lon'], x['lat'], 1, x['kind'], None, None, 0, [], [], [],
                         {'k': x['kind'], 'env': [lo, hi, 'source'], 'st': x['type'], 'saga': x['saga'], 'nb': 'label'}])
            sites_out.append(_site_props('ns' + x['id'], x['name'], x['kind'], x['lon'], x['lat'], ef=lo, et=hi, st=x['type'],
                                         per=f"named in {x['saga']} (the sagas narrate c. 870–1030)", src='nsh'))
    no = [x for x in regional.norway() if x['kind'] != 'site' or x['art'] in NO_KEEP_ART]
    no = [x for x in no if x['period'][1] - x['period'][0] <= 700]
    for x in no:
        lo, hi, label = x['period']
        title = x['name'] or NO_ART_EN.get(x['art'], x['art'] or 'Monument')
        rows.append(['nokm', x['id'], title, x['lon'], x['lat'], 1, x['kind'], None, None, 0, [], [], [],
                     {'k': x['kind'], 'env': [lo, hi, 'source'], 'st': x['art'], 'per': label, 'nb': 'label'}])
        sites_out.append(_site_props('no' + x['id'], title, x['kind'], x['lon'], x['lat'], ef=lo, et=hi, st=x['art'], per=f'{label} (register dating)', src='nokm'))
    stats['nordic'] = {'nsh': sum(1 for r in rows if r[0] == 'nsh'), 'norway': len(no)}

    # National registers and historical gazetteers (2026-10 discovery pass; see registers.py and
    # docs/HISTORICAL_SOURCES_SEARCH.md). Every record keeps only the dating its own source gives: a construction window,
    # a period the record names, or the single year in which a gazetteer or register lists it ('sn': a snapshot). Dated
    # records go into the place index; undated ones only into the tiles (drawn when the reader includes undated records).
    import registers as REG
    COMMON_WORDS = {w.strip().lower() for w in open(os.path.join(ROOT, 'public', 'atlas', 'common-words.txt'), encoding='utf-8') if w.strip()}
    register_feats[:] = []

    def common(name):
        # The name index drops a leading English article, so "The Mill" is the word "mill" there too.
        n = name.strip().lower()
        return n in COMMON_WORDS or (n.startswith('the ') and n[4:].strip() in COMMON_WORDS)

    reg_stats, reg_index = {}, Counter()
    loaders = (('canmore', REG.canmore), ('irlsmr', REG.ireland_smr), ('nid', REG.poland_nid), ('ivillaris', REG.index_villaris),
               ('ottomannfs', REG.ottoman_nfs), ('generalkarte', REG.generalkarte), ('cassini', REG.cassini_places), ('lutsch', REG.lutsch),
               ('sirkd', REG.slovenia_rkd), ('lvmon', REG.latvia_monuments),
               ('hrreg', REG.croatia_goods),
               ('r3verst', REG.russian_3verst), ('rohgis', REG.rohgis_settlements),
               ('transice', REG.iceland_transice), ('dissiloc', REG.dissiloc),
               ('swegeo', REG.sweden_geometric), ('tyrolmine', REG.tyrol_mining),
               ('arkas', REG.arkas), ('wdextra', REG.wikidata_extra))
    # Spec-driven datasets (data/historical/specs/*.json, read by generic.py): public ones join the registers here.
    import generic as GEN
    spec_loaded = {}

    def spec_loader(sp):
        def fn():
            recs, skipped = GEN.records(sp)
            spec_loaded[sp['src']] = recs
            return recs, skipped
        return fn
    loaders += tuple((sp['src'], spec_loader(sp)) for sp in GEN.specs(public=True))
    # Specs that only add evidence about places the gazetteers already hold (e.g. population estimates) are drawn but
    # kept out of the place-name index, so they never compete with the gazetteers when a name is resolved.
    no_index = {sp['src'] for sp in GEN.specs(public=None) if sp.get('placeIndex') is False}
    for name, fn in loaders:
        res = fn()
        recs, note = (res if isinstance(res, tuple) else (res, None))
        reg_stats[name] = {'records': len(recs), **({'notes': note} if note else {})}
        for x in recs:
            lon, lat = x['lon'], x['lat']
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                continue
            pr = {'src': x['src'], 'st': x['ty'][:80], 'per': x.get('per'), 'u': None if x['precise'] else 1}
            env = None
            if x.get('snap'):
                env = [x['snap'], x['snap'], 'source']
                pr.update(ef=x['snap'], et=x['snap'], sn=1)
            elif x.get('env'):
                env = [x['env'][0], x['env'][1], 'source']
                pr.update(ef=x['env'][0], et=x['env'][1], cw=x.get('cw'))
            register_feats.append(_site_props(f"{x['src']}:{x['id']}", x['name'], x['kind'], lon, lat, **pr))
            # A record whose whole name is an ordinary word ("Mill", "Church") is drawn but not indexed as a place name.
            if env and x['kind'] not in ('site', 'building') and not common(x['name']) and not x.get('generic') and x['src'] not in no_index:
                extra = {'k': x['kind'], 'nb': 'label', 'env': env, 'st': x['ty'][:80], **({'per': x['per']} if x.get('per') else {}),
                         **({'cw': x['cw']} if x.get('cw') else {}), **({'sn': 1} if x.get('snap') else {}), **({'loc': x['loc']} if x.get('loc') else {})}
                rows.append([x['src'], x['id'], x['name'], lon, lat, 1 if x['precise'] else 0, x['kind'], None, None, 0 if x['precise'] else 1,
                             [list(n) for n in x['names'] if n[0] and not common(n[0])][:6], x['ctx'][:2], [], extra])
                reg_index[x['src']] += 1
    stats['registers'] = {**reg_stats, 'inPlaceIndex': dict(reg_index), 'tileFeatures': len(register_feats)}

    # Private data pack (never published): datasets with no licence to republish, or terms that forbid it.
    private, prows = [], []

    bad = Counter()

    def add(src, pid, name, kind, lon, lat, mz=8, f=None, fb=None, env=None, per=None, ty=None, names=(), precise=True, **props):
        if not (-180 <= lon <= 180 and -90 <= lat <= 90) or (lon == 0 and lat == 0):
            bad[src] += 1  # impossible position in the source: left out, counted
            return
        extra = {'k': kind, 'nb': 'label', **({'fb': fb} if fb else {}), **({'env': [env[0], env[1], 'source']} if env else {}),
                 **({'st': ty[:60]} if ty else {}), **({'per': per} if per else {})}
        # The end the source records (EBIDAT's end of use) is the record's end in the gazetteer too, as on the map.
        # rf: a start that is evidence for the place in the gazetteer (a market grant) but not the map's own date field.
        rf = props.pop('rf', None)
        prows.append([src, pid, name, lon, lat, 1 if precise else 0, kind, f if f is not None else rf, props.get('t'), 0 if precise else 1, [list(n) for n in names], [], [], extra])
        pr = {'i': f'{src}:{pid}', 'n': name[:70], 'k': kind, 'f': f, 'fb': fb, 'ef': env[0] if env else None, 'et': env[1] if env else None,
              'per': per, 'ty': ty[:120] if ty else None, 'src': src, 'u': None if precise else 1, **props}
        private.append(({'type': 'Point', 'coordinates': [lon, lat]}, {k: v for k, v in pr.items() if v is not None}, mz))

    for x in regional.tib():
        add('tib', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 6, f=x['first'], fb='first attestation (TIB)' if x['first'] is not None else None,
            ty=', '.join(x['types']), precise=not x.get('area'))
    for x in regional.markets_fairs():
        add('mfairs', x['id'], x['name'], 'market', x['lon'], x['lat'], 6, ty='borough' if x['borough'] else None, m=x['first'], mk=x['markets'], fr=x['fairs'],
            rf=x['first'], fb='first market or fair grant' if x['first'] is not None else None)
    for x in regional.atlas_fontium():
        per = f'{regional.AF_PERIOD[0]}–{regional.AF_PERIOD[1]} (Atlas historyczny Polski, 2nd half of the 16th c.)'
        ty = ' · '.join(v for v in (x['character'], x['owner'], x['size'], x['mills'], 'location approximate' if x['approx'] else None) if v)
        for kind in ('settlement', 'church') if x['parish'] else ('settlement',):
            add('afontium', ('c' if kind == 'church' else '') + x['id'], x['name'], kind, x['lon'], x['lat'], 5 if x['character'] == 'town' else 8,
                env=regional.AF_PERIOD, per=per, ty=ty, names=[(x['modern'], None, None, 'pl')] if x['modern'] and x['modern'] != x['name'] else ())
    for x in regional.ran():
        add('ran', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 7, env=(x['from'], x['to']), per=f"{x['period']} (register dating)",
            ty=f"{x['type']} · {x['locality']}, {x['county']}")
    for x in regional.dicotopo():
        add('dicotopo', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 8 if x['kind'] == 'settlement' else 9, f=x['first'], fb='first mention',
            ty=f"{x['type']} — earliest form: {x['firstForm']}", names=[(fm, y, None, 'historical form') for fm, y in x['forms']], precise=x['precise'])
    for x in regional.denmark():
        add('dkff', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 8, env=(x['from'], x['to']), per='register dating', ty=x['type'])
    for x in regional.darmc():
        add('darmc', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 7, env=(x['from'], x['to']), per=f"{x['set']} (DARMC dating)", ty=x['type'])
    for x in regional.ebidat():
        add('ebidat', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 7, f=x['from'], fb='founded' if x['from'] is not None else None,
            env=None if x['from'] is not None else (x['envFrom'], x['envTo']) if x.get('envFrom') is not None else None,
            ty=x['type'], dt=x['dating'], t=x['to'])
    # ARIADNE catalogue records (archaeology, Europe-wide): each phase of a record with its own period; provider licences vary.
    import registers as REG2
    ari, ari_skip = REG2.ariadne()
    for x in ari:
        add('ariadne', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 9, env=x['env'], per=x['per'], ty=x['ty'], precise=x['precise'])
    stats['ariadneSkipped'] = ari_skip
    amcr_recs, amcr_skip = REG2.amcr() if os.path.exists(os.path.join(RAW, 'amcr-czechia', 'original', 'pian.xml.gz')) else ([], {})
    for x in amcr_recs:
        add('amcr', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 9, env=x['env'], per=x['per'], ty=x['ty'], precise=x['precise'])
    stats['amcrSkipped'] = amcr_skip
    for sp in GEN.specs(public=False):
        recs, skipped = GEN.records(sp)
        spec_loaded[sp['src']] = recs
        for x in recs:
            env = x.get('env') or ((x['snap'], x['snap']) if x.get('snap') else None)
            add(sp['src'], x['id'], x['name'], x['kind'], x['lon'], x['lat'], 9, env=env, per=x.get('per'), ty=x['ty'], precise=x['precise'],
                **({'sn': 1} if x.get('snap') else {}))
        stats.setdefault('privateSpecs', {})[sp['src']] = {'records': len(recs), 'skipped': skipped}
    GEN.write_app_module(spec_loaded)
    for x in REG2.latin_church_1772():
        add('latin1772', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 8, env=(1772, 1772), per=x['per'], ty=x['ty'], sn=1)
    for x in regional.sweden():
        add('raa', x['id'], x['name'], x['kind'], x['lon'], x['lat'], 8, env=(x['from'], x['to']), per=f"{x['period']} (register dating)", ty=x['type'])
    stats['private'] = dict(Counter(r[0] for r in prows))
    stats['privateBadPositions'] = dict(bad)
    return hre_feats, private, prows, stats
