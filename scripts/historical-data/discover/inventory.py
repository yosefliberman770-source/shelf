#!/usr/bin/env python3
"""Build the candidate-source inventory from the discovery harvest (harvest.py), the Harvard and other map-library
catalogues (OpenGeoMetadata), Wikidata's register/database properties, and Shelf's own earlier candidate lists.

  python3 scripts/historical-data/discover/inventory.py
    → data/historical/discovery/inventory.jsonl      every candidate, one JSON object per line
    → data/historical/discovery/summary.json         counts by channel, class, region, category, status

Each candidate gets, from its metadata only (no guessing beyond what the text and fields say):
  relevance  0–100: historical × geographic × European signals, minus clear off-topic signals
  regions, categories, periods (centuries named or years given), formats, access class A–I, status
Inspection (inspect.py) and acquisition fill in what metadata cannot tell.
"""
import glob
import gzip
import hashlib
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..', '..')
DISC = os.path.join(ROOT, 'scripts', 'atlas-build', '.cache', 'discovery')
OUT = os.path.join(ROOT, 'data', 'historical', 'discovery')
SCRATCH_OGM = os.environ.get('OGM_DIR', '')

# ── Vocabularies (stems, several languages) ──────────────────────────────────
HIST = r"mediev|middle ages|mittelalter|médiév|medioev|medieval|średniow|středov|stredov|középkor|средневек|середньовіч|srednjovek|srednjovjek|средновек|keskiaj|medeltid|middelalder|middeleeuw|" \
       r"roman\b|romain|römisch|romano|rzymsk|római|римск|ancient|antiq|antik|antich|starożyt|late antique|byzant|bizant|византи|ottoman|osmanl|османск|" \
       r"histor|archaeolog|archäolog|archéolog|archeolog|arqueol|arheolog|régész|археолог|fornl|fortidsminde|kulturminne|muinais|" \
       r"castle|château|burg\b|burgen|castell|castill|zamek|zamk|hrad|vár\b|várak|замок|крепост|fortif|monaster|kloster|abbey|abbaye|abbazi|" \
       r"klasztor|klášter|kolostor|монастир|монастыр|parish|paroiss|pfarr|parrocch|parafi|toponym|place-?name|ortsnam|nazwy miejsc|helynév|helynev|топоним|" \
       r"gazetteer|viking|anglo-saxon|merovingian|carolingian|karoling|slavic|slavonic|early modern|frühneuzeit|ancien régime|\b1[0-8]th century|\bc\. ?1[0-8]\d\d|" \
       r"hillfort|grodzisk|городищ|piliakaln|pilskaln|linnam|oppid|limes|domesday|charter|urkund|cadastr|kataster|katastr|census 1[789]|defter|tahrir"
GEO = r"\bgis\b|shapefile|\bshp\b|geojson|geopackage|gpkg|\bkml\b|kmz|wfs|wms|georeferen|géoréf|georeferenz|coordinates|koordinat|coordonn|coordinat|" \
      r"latitude|longitude|wgs ?84|epsg|spatial|geospatial|räumlich|spatiale|spazial|przestrzen|térinformat|геоинформ|гіс|\bгис\b|map\b|maps\b|karte|carte|mappa|mapa|" \
      r"térkép|карт|atlas|gazetteer|geocod|gazet|location|lokalis|lokaliz|point data|polygons?|vector|raster|geotiff"
EUROPE = {
    'France': r"france|french|français|gaul|gallia|bretagne|normand|burgund|provence|aquitain|languedoc|alsace|lorraine|occitan",
    'Germany': r"german|deutsch|bayern|bavar|sachsen|saxon|westfal|rheinland|thüring|hessen|schwaben|swabi|franken|brandenburg|holy roman|reich\b",
    'Italy': r"ital|lombard|tuscan|toscan|sicil|sardin|venet|venice|venezia|roma\b|rome\b|piemont|apulia|puglia|calabr|campania|umbria|lazio|emilia",
    'Spain': r"spain|spanish|españ|espana|castil|aragon|catalu|catalon|andalu|al-andalus|navarr|galicia|leon\b|hispan|iberi",
    'Portugal': r"portug|lusitan",
    'England': r"england|english|britain|british|anglo|wales|welsh|cymru|scotland|scottish|alba\b",
    'Ireland': r"ireland|irish|éire|eire|ulster",
    'Low Countries': r"netherland|dutch|nederland|holland|flander|vlaander|belgi|luxemb|brabant|friesland|frisia",
    'Scandinavia': r"denmark|danish|dansk|danmark|sweden|swedish|svensk|sverige|norway|norweg|norsk|norge|scandinav|nordic|viking",
    'Finland & Iceland': r"finland|finnish|suomi|iceland|ísland|íslands",
    'Poland': r"poland|polish|polska|polsk|silesia|śląsk|pomerania|pomorze|prussia|prusy|mazovia",
    'Czechia & Slovakia': r"czech|bohemia|böhmen|čech|moravia|morava|slovak|slovensk",
    'Hungary': r"hungar|magyar|ungarn|pannoni",
    'Romania & Moldova': r"romania|român|rumän|transylvan|erdély|walach|wallach|moldav|moldov|dacia",
    'Balkans': r"balkan|bulgar|българ|serbia|srbij|србиј|croatia|hrvat|sloven|bosni|herzegov|macedon|albani|shqip|montenegr|dalmat|illyri|kosov|yugoslav",
    'Greece & Cyprus': r"greece|greek|hellen|ελλ|byzant|crete|kreta|cyprus|κύπρ|aegean|peloponn|athens|macedonia",
    'Baltic': r"baltic|estonia|eesti|latvia|latvij|lithuan|lietuv|livonia|courland|kurland",
    'East Slavic': r"ukrain|україн|belarus|беларус|russia|росси|русск|rus'|kievan|kyiv|novgorod|muscov",
    'Anatolia & Caucasus': r"anatolia|turkey|türk|turkish|ottoman|osmanl|constantinop|istanbul|georgia|armenia|caucas|kavkaz",
    'Levant, Egypt & Maghreb': r"levant|palestin|syria|lebanon|israel|jordan|egypt|maghreb|morocc|alger|tunis|libya|ifriqiya|crusader",
    'Austria & Switzerland': r"austria|österreich|tyrol|tirol|switzerland|schweiz|suisse|svizzera|helvet",
    'Europe-wide': r"europ|mediterran|méditerr|mittelmeer",
}
CATS = {
    'Settlements': r"settlement|siedlung|habitat|insediament|poblamiento|osadnictw|osídlen|település|поселен|naselj|village|dorf|villag|town|stadt|ville|città|ciudad|miast|város|город|city|cities|urban|wüstung|deserted",
    'Political': r"boundar|border|grenze|frontière|confin|territor|kingdom|empire|duchy|county|lordship|seigneur|polity|polities|administrative|verwaltung|province|voivod|kreis|comitat|vármegye",
    'Religious': r"church|kirche|église|chiesa|iglesia|kościół|kostel|templom|церк|monaster|kloster|abbey|abbaye|priory|convent|diocese|bistum|diocès|diocesi|parish|paroisse|pfarr|pilgrim|saint|cult|synagog|mosque",
    'Military': r"castle|burg|château|castell|castill|zamek|hrad|vár\b|замок|fort|fortif|befestig|hillfort|grodzisk|городищ|battle|schlacht|siege|military|militär",
    'Transport': r"road|straße|strasse|route|via\b|viae|itinerar|bridge|brücke|pont|ponte|ferry|canal|kanal|waterway|navigation|railway|railroad|eisenbahn|pass\b|track",
    'Economic': r"market|markt|marché|mercat|fair\b|messe|mint|münz|coin|hoard|mine\b|mines|mining|bergbau|quarr|mill|mühle|moulin|trade|handel|commerce|toll|zoll|salt|iron|forest|wald",
    'Maritime': r"port\b|ports|harbo|hafen|anchorage|shipwreck|wreck|wrack|maritime|naval|coastal|lighthouse|seafar",
    'Physical': r"river|fluss|rivière|fiume|rzek|lake|see\b|wetland|marsh|coast|shoreline|landscape|landschaft|paysage|palaeo|paleo|forest|land use|landuse|vegetation|soil",
    'Archaeology': r"archaeolog|archäolog|archéolog|archeolog|arqueol|arheolog|régész|археолог|excavat|ausgrab|fouille|scavo|excavac|wykop|site\b|sites\b|fundstell|monument|denkmal|cemetery|gräberfeld|nécropole|burial|barrow|tumul",
    'Population': r"population|bevölkerung|démograph|demograph|census|zensus|recensement|hearth|feux|tax\b|steuer|impôt|defter|tahrir|inhabitants|einwohner",
    'Names': r"place-?name|toponym|ortsnam|gazetteer|nom de lieu|nazwy miejsc|helynév|топоним|dictionnaire topographique|onomast|exonym",
    'Events': r"battle|war\b|wars\b|siege|event|conflict|revolt|rebellion|treaty",
}
OUTSIDE = r"\b(?:america|united states|u\.s\.|canada|canadian|massachusetts|michigan|new york|virginia|california|texas|mexico|brazil|argentin|chile|peru|india|china|chinese|japan|korea|australia|new zealand|indonesia|philippin|kenya|nigeria|south africa|ontario|quebec|nova scotia|prince edward)"
NEGATIVE = r"genom|protein|cell line|rna-seq|clinical|patient|covid|sars-cov|neural network training|tumou?r|mouse|mice|drosophila|enzyme|catalys|" \
           r"battery|lithium|polymer|nanopart|alloy|quantum|semiconductor|finite element|elastomer|students?' |questionnaire|survey of teachers|" \
           r"climate model|cmip|era5|precipitation forecast|satellite altimetry|lidar point cloud of forest|traffic accident|real estate|electricity|" \
           r"wastewater|drinking water|sewer|groundwater monitoring|air quality|noise map|cadastral parcels 20|land registry 20|bus stops|parking|" \
           r"elections? 20|covid-19|pandemic|stock market|cryptocurr"
STRUCTURED_FMT = r"shp|shapefile|geojson|gpkg|geopackage|kml|kmz|csv|tsv|xlsx|xls|sqlite|json|gml|zip|ods|dbf|rdf|ttl|parquet|fgb"
RASTER_FMT = r"geotiff|tiff|tif|jp2|jpeg2000|iiif|sid|ecw"
SERVICE = r"wfs|wms|wmts|arcgis|featureserver|mapserver|ogc|sparql|api\b|rest\b"
YEAR = re.compile(r"(?<![\d.])(1[0-9]{3}|[2-9][0-9]{2})(?![\d.])")
CENT = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)[ -]centur|\b(\d{1,2})\. ?(?:jahrhundert|jh)|\b([ivxl]+)e siècle|\b(\d{1,2})e siècle", re.I)
ROMAN = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12, 'xiii': 13, 'xiv': 14,
         'xv': 15, 'xvi': 16, 'xvii': 17, 'xviii': 18, 'xix': 19, 'xx': 20}
PERIOD_WORDS = {'roman': (-50, 450), 'römisch': (-50, 450), 'late antique': (250, 650), 'byzant': (330, 1453), 'early medieval': (500, 1000),
                'frühmittelalter': (500, 1000), 'high medieval': (1000, 1250), 'late medieval': (1250, 1500), 'spätmittelalter': (1250, 1500),
                'medieval': (500, 1500), 'mittelalter': (500, 1500), 'médiév': (500, 1500), 'viking': (793, 1066), 'merovingian': (480, 750),
                'carolingian': (750, 900), 'anglo-saxon': (410, 1066), 'ottoman': (1300, 1922), 'early modern': (1500, 1800), 'frühneuzeit': (1500, 1800),
                'ancien régime': (1500, 1789), 'napoleonic': (1795, 1815), '19th century': (1800, 1900)}


def clean(s):
    if not s:
        return ''
    if isinstance(s, (list, tuple)):
        s = ' '.join(clean(x) for x in s)
    if isinstance(s, dict):
        s = s.get('en') or next(iter(s.values()), '')
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(str(s)))).strip()


def periods(text):
    """Centuries (start years) a text names: explicit centuries, plausible years (200–1950) and period words."""
    cs = set()
    for m in CENT.finditer(text):
        n = next((g for g in m.groups() if g), None)
        n = ROMAN.get(n.lower()) if n and not n.isdigit() else int(n) if n else None
        if n and 2 <= n <= 20:
            cs.add((n - 1) * 100)
    for m in YEAR.finditer(text):
        y = int(m.group(1))
        if 200 <= y <= 1950 and not re.search(rf'(?:19[5-9]\d|20\d\d)', m.group(0)):
            cs.add(y // 100 * 100)
    low = text.lower()
    for w, (a, b) in PERIOD_WORDS.items():
        if w in low:
            cs.update(range(max(200, a // 100 * 100), min(1900, b) + 1, 100))
    return sorted(c for c in cs if 200 <= c <= 1900)


def classify(c):
    """Relevance and the A–I access class, from the candidate's own metadata."""
    text = f"{c['title']} {c.get('description', '')} {' '.join(c.get('keywords', []))}"
    low = text.lower()
    h = len(set(re.findall(HIST, low)))
    g = len(set(re.findall(GEO, low))) + (2 if c.get('bbox') else 0)
    regions = [r for r, rx in EUROPE.items() if re.search(rf'\b(?:{rx})', low)]
    if c.get('bbox'):
        w, s, e, n = c['bbox']
        if e >= -25 and w <= 60 and n >= 28 and s <= 72:
            regions = regions or ['(bbox in Europe/Mediterranean)']
        else:
            regions = []  # its own footprint is elsewhere, whatever words the text shares with a European region
    elif re.search(OUTSIDE, c['title'].lower()) and not any(re.search(rf'\b(?:{EUROPE[r]})', c['title'].lower()) for r in regions):
        regions = []  # the title names a place outside Europe and no European one
    cats = [k for k, rx in CATS.items() if re.search(rf'\b(?:{rx})', low)]
    neg = bool(re.search(NEGATIVE, low))
    fmts = ' '.join(c.get('formats', [])).lower() + ' ' + low
    rel = min(40, h * 8) + min(25, g * 5) + (20 if regions else 0) + min(15, len(cats) * 3)
    if neg:
        rel = max(0, rel - 50)
    if c['channel'] in ('harvard-geodata', 'ogm'):
        rel = max(rel, 30 if regions else 10)
    c['relevance'] = min(100, rel)
    c['regions'] = regions
    c['categories'] = cats
    c['periods'] = periods(text)
    # Access class (A–I, as in the brief).
    if c['channel'] in ('wikidata-register',):
        cls = 'B' if c.get('formatter') else 'F'
    elif c['channel'] in ('ogm', 'harvard-geodata', 'loc-maps'):
        cls = 'E' if re.search(r'raster|geotiff|scanned|image|tif|jpeg|map', fmts) and not re.search(r'shapefile|vector|polygon|line|point', fmts) else 'A'
    elif re.search(SERVICE, fmts) and not re.search(STRUCTURED_FMT, ' '.join(c.get('formats', [])).lower()):
        cls = 'C'
    elif re.search(STRUCTURED_FMT, fmts) or re.search(r'dataset', c.get('type', '').lower()):
        cls = 'A'
    elif re.search(RASTER_FMT, fmts):
        cls = 'E'
    else:
        cls = 'G'
    if c['relevance'] < 25:
        cls = 'I'
    c['accessClass'] = cls
    return c


def cand(channel, **kw):
    key = kw.get('doi') or kw.get('url') or kw.get('title')
    kw['id'] = channel + ':' + hashlib.sha1(str(key).lower().encode()).hexdigest()[:12]
    kw['channel'] = channel
    kw.setdefault('keywords', [])
    kw.setdefault('formats', [])
    kw['title'] = clean(kw.get('title'))[:300]
    kw['description'] = clean(kw.get('description'))[:1200]
    return kw


def responses(cat):
    for p in glob.glob(os.path.join(DISC, cat, '*.json')):
        d = json.load(open(p, encoding='utf-8'))
        r = d['response']
        if r and not (isinstance(r, dict) and 'error' in r):
            yield d['query'], r


def from_datacite():
    for qy, r in responses('datacite'):
        for it in r.get('data', []):
            a = it['attributes']
            bbox = None
            for gl in a.get('geoLocations') or []:
                b = gl.get('geoLocationBox')
                if b and all(b.get(k) is not None for k in ('westBoundLongitude', 'southBoundLatitude', 'eastBoundLongitude', 'northBoundLatitude')):
                    try:
                        bbox = [float(b['westBoundLongitude']), float(b['southBoundLatitude']), float(b['eastBoundLongitude']), float(b['northBoundLatitude'])]
                    except (TypeError, ValueError):
                        pass
            yield cand('datacite', doi=a.get('doi'), title=(a.get('titles') or [{}])[0].get('title'), description=[x.get('description') for x in a.get('descriptions') or []][:2],
                       institution=a.get('publisher') if isinstance(a.get('publisher'), str) else (a.get('publisher') or {}).get('name'),
                       creators=[x.get('name') for x in (a.get('creators') or [])][:5], year=a.get('publicationYear'), url=a.get('url'),
                       repository=it.get('relationships', {}).get('client', {}).get('data', {}).get('id'),
                       keywords=[s.get('subject') for s in a.get('subjects') or [] if s.get('subject')][:20], formats=a.get('formats') or [],
                       type=(a.get('types') or {}).get('resourceTypeGeneral', ''), licence=[x.get('rights') for x in a.get('rightsList') or []][:2],
                       sizes=a.get('sizes') or [], bbox=bbox, citations=a.get('citationCount'), foundBy=[qy])


def from_zenodo():
    for cat in ('zenodo', 'zenodo2'):
        for qy, r in responses(cat):
            for it in (r.get('hits') or {}).get('hits', []):
                m = it.get('metadata', {})
                files = it.get('files') or []
                yield cand('zenodo', doi=it.get('doi') or m.get('doi'), title=m.get('title'), description=m.get('description'),
                           creators=[c.get('name') for c in m.get('creators', [])][:5], institution=', '.join(sorted({c.get('affiliation') for c in m.get('creators', []) if c.get('affiliation')}))[:200],
                           year=(m.get('publication_date') or '')[:4], url=(it.get('links') or {}).get('self_html') or f"https://zenodo.org/records/{it.get('id')}",
                           repository='zenodo', keywords=m.get('keywords') or [], formats=sorted({os.path.splitext(f.get('key', ''))[1].lstrip('.').lower() for f in files}),
                           type='dataset', licence=[(m.get('license') or {}).get('id')], sizeBytes=sum(f.get('size', 0) for f in files),
                           files=[{'name': f.get('key'), 'size': f.get('size'), 'url': (f.get('links') or {}).get('self')} for f in files[:30]], foundBy=[qy])


def from_dataverse():
    for qy, r in responses('dataverse'):
        for it in (r.get('data') or {}).get('items', []):
            yield cand('harvard-dataverse', doi=(it.get('global_id') or '').replace('doi:', ''), title=it.get('name'), description=it.get('description'),
                       institution=it.get('name_of_dataverse'), creators=it.get('authors', [])[:5], year=(it.get('published_at') or '')[:4], url=it.get('url'),
                       repository='Harvard Dataverse', keywords=(it.get('keywords') or []) + (it.get('subjects') or []), type='dataset',
                       fileCount=it.get('fileCount'), foundBy=[qy])


def from_europa():
    for qy, r in responses('europa'):
        for it in (r.get('result') or {}).get('results', []):
            title = it.get('title') or {}
            desc = it.get('description') or {}
            lang = [k for k in title if k != 'en'][:1]
            t_en = title.get('en') or next(iter(title.values()), '')
            t_orig = title.get(lang[0]) if lang else ''
            yield cand('data.europa.eu', url=f"https://data.europa.eu/data/datasets/{it.get('id')}", title=f"{t_en}" + (f" / {t_orig}" if t_orig and t_orig != t_en else ''),
                       description=desc.get('en') or next(iter(desc.values()), ''), institution=clean((it.get('catalog') or {}).get('title')),
                       country=(it.get('country') or {}).get('label') if isinstance(it.get('country'), dict) else it.get('country'),
                       keywords=[k.get('label') for k in it.get('keywords') or [] if isinstance(k, dict) and k.get('label')][:20],
                       formats=sorted({(d.get('format') or {}).get('label', '') for d in it.get('distributions') or [] if isinstance(d, dict)}),
                       repository=(it.get('catalog') or {}).get('id'), type='dataset', foundBy=[qy])


def from_figshare():
    for qy, r in responses('figshare'):
        for it in r if isinstance(r, list) else []:
            yield cand('figshare', doi=it.get('doi'), title=it.get('title'), url=(it.get('url_public_html') or it.get('url')), year=(it.get('published_date') or '')[:4],
                       repository='figshare', type=it.get('defined_type_name', ''), foundBy=[qy])


def from_whg():
    for qy, r in responses('whg'):
        for it in r.get('features', []):
            yield cand('whg', url=f"https://whgazetteer.org/datasets/{it['id']}/places", title=it.get('title'), description=it.get('description'),
                       institution=it.get('creator'), records=it.get('place_count'), repository='World Historical Gazetteer', type='gazetteer',
                       formats=['lpf', 'tsv'], foundBy=[qy])


def from_loc():
    for qy, r in responses('loc'):
        for it in r.get('results', []):
            yield cand('loc-maps', url=it.get('id'), title=it.get('title'), description=it.get('description'), year=it.get('date'),
                       institution='Library of Congress, Geography and Map Division', repository='loc.gov', formats=['image', 'iiif' if it.get('digitized') else ''],
                       keywords=it.get('subject', [])[:15] + it.get('location', [])[:10], type='map', foundBy=[qy])


def from_wikidata_registers():
    p = os.path.join(DISC, 'wikidata-props.json')
    if not os.path.exists(p):
        return
    rows = defaultdict(dict)
    for b in json.load(open(p, encoding='utf-8')):
        pid = b['p']['value'].rsplit('/', 1)[-1]
        r = rows[pid]
        r['label'] = b.get('pLabel', {}).get('value')
        r.setdefault('countries', set()).add(b.get('countryLabel', {}).get('value', ''))
        r['formatter'] = r.get('formatter') or b.get('formatter', {}).get('value')
        r['subject'] = r.get('subject') or b.get('subjectLabel', {}).get('value')
        try:
            r['count'] = max(r.get('count', 0), int(float(b['count']['value'])))
        except (KeyError, ValueError):
            pass
    for pid, r in rows.items():
        ctry = ', '.join(sorted(x for x in r['countries'] if x))
        yield cand('wikidata-register', url=f'https://www.wikidata.org/wiki/Property:{pid}', title=f"{r['label']} ({pid})",
                   description=f"Identifier property for {r.get('subject') or 'an external database'}" + (f"; country: {ctry}" if ctry else ''),
                   institution=r.get('subject'), country=ctry, records=r.get('count'), formatter=r.get('formatter'), repository='Wikidata',
                   keywords=[ctry], type='register', foundBy=[{'q': 'Wikidata external-identifier properties for places/heritage'}])


def from_ogm(base):
    """GeoBlacklight (Aardvark or 1.0) records of a university map library."""
    inst = os.path.basename(base).removeprefix('ogm-')
    for p in glob.glob(os.path.join(base, '**', '*.json'), recursive=True):
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(d, dict) or not (d.get('dct_title_s') or d.get('dc_title_s')):
            continue
        env = d.get('dcat_bbox') or d.get('locn_geometry') or d.get('solr_geom') or ''
        m = re.match(r'ENVELOPE\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)', env)
        bbox = [float(m.group(1)), float(m.group(4)), float(m.group(2)), float(m.group(3))] if m else None
        years = d.get('gbl_indexYear_im') or ([d['solr_year_i']] if d.get('solr_year_i') else [])
        refs = d.get('dct_references_s') or ''
        fmt = d.get('dct_format_s') or d.get('dc_format_s') or ''
        yield cand('harvard-geodata' if inst == 'harvard' else 'ogm', url=(d.get('dct_identifier_sm') or [None])[0] if isinstance(d.get('dct_identifier_sm'), list) else d.get('dc_identifier_s') or d.get('id'),
                   title=d.get('dct_title_s') or d.get('dc_title_s'), description=d.get('dct_description_sm') or d.get('dc_description_s'),
                   institution=', '.join(x for x in (d.get('dct_publisher_sm') or d.get('dc_publisher_sm') or []) if isinstance(x, str)) or d.get('schema_provider_s') or inst,
                   repository=f'OpenGeoMetadata/{inst}', year=years[0] if years else None, mapYears=years[:5], bbox=bbox,
                   keywords=[x for x in (d.get('dct_subject_sm') or d.get('dc_subject_sm') or []) + (d.get('dct_spatial_sm') or d.get('dc_spatial_sm') or []) if isinstance(x, str)],
                   formats=[fmt] + (['wms'] if 'wms' in refs else []) + (['wfs'] if 'wfs' in refs else []) + (['iiif'] if 'iiif' in refs else []),
                   georeferenced=d.get('gbl_georeferenced_b'), accessRights=d.get('dct_accessRights_s') or d.get('dc_rights_s'),
                   type=' '.join(d.get('gbl_resourceClass_sm') or [d.get('layer_geom_type_s', '')]), references=refs[:600], foundBy=[{'q': f'{inst} catalogue'}])


def from_shelf_lists():
    """Shelf's earlier candidate lists (166 seeds and their reconciliation) and the acquired vault, so known sources keep their status."""
    rec = os.path.join(ROOT, 'data', 'historical', 'audit', 'reconciliation.json')
    if os.path.exists(rec):
        for e in json.load(open(rec, encoding='utf-8')):
            lv = e.get('levels') or {}
            status = 'integrated' if lv.get('integrated') or e.get('integratedLater') else 'acquired' if lv.get('acquired') else 'evaluated'
            yield cand('shelf-audit', url=e['candidate'], title=e['candidate'], description=f"{e.get('why') or ''} Next: {e.get('next') or ''}",
                       status=status, region=e.get('section'), licence=[e.get('licence')], type='known', foundBy=[{'q': 'Shelf audit 2026-09-30 (166 seeds)'}])


def main():
    if len(sys.argv) > 1:
        global SCRATCH_OGM
        SCRATCH_OGM = sys.argv[1]
    gens = [from_datacite(), from_zenodo(), from_dataverse(), from_europa(), from_figshare(), from_whg(), from_loc(), from_wikidata_registers(), from_shelf_lists()]
    if SCRATCH_OGM:
        gens += [from_ogm(d) for d in sorted(glob.glob(os.path.join(SCRATCH_OGM, 'ogm-*'))) if os.path.isdir(d)]
    seen = {}
    for g in gens:
        for c in g:
            k = (c.get('doi') or '').lower() or (c.get('url') or '').lower() or c['title'].lower()
            if not k:
                continue
            if k in seen:
                s = seen[k]
                s['foundBy'] = (s.get('foundBy') or []) + [x for x in c.get('foundBy') or [] if x not in (s.get('foundBy') or [])][:10]
                s.setdefault('alsoIn', [])
                if c['channel'] != s['channel'] and c['channel'] not in s['alsoIn']:
                    s['alsoIn'].append(c['channel'])
                continue
            seen[k] = c
    # Versions of one dataset (DataCite registers each version's DOI): one candidate, the versions listed.
    merged = {}
    for c in seen.values():
        k = re.sub(r'\W+', ' ', c['title'].lower()).strip() + '|' + re.sub(r'\W+', ' ', str(c.get('institution') or '').lower()).strip()
        if c['channel'] in ('ogm', 'harvard-geodata', 'loc-maps', 'wikidata-register') or len(c['title']) < 12:
            k = c['id']
        if k in merged:
            m = merged[k]
            m.setdefault('versions', []).append(c.get('doi') or c.get('url'))
            m['foundBy'] = (m.get('foundBy') or []) + [x for x in c.get('foundBy') or [] if x not in (m.get('foundBy') or [])][:10]
        else:
            merged[k] = c
    cands = [classify(c) for c in merged.values()]
    DECISIONS = json.load(open(os.path.join(OUT, 'decisions.json'), encoding='utf-8'))['decisions']
    used = set()
    known = known_sources()
    for c in cands:
        hit = next((v for kx, v in known.items() if kx and (kx in c['title'].lower() or kx in (c.get('url') or '').lower())), None)
        if hit and c['channel'] != 'shelf-audit':
            c['overlapsShelf'] = hit
        c.setdefault('status', 'discovered')
        ids = ((c.get('doi') or '') + ' ' + (c.get('url') or '') + (' ' + c['title'] if c['channel'] == 'datacite' else '')).lower()
        for i, d in enumerate(DECISIONS):
            if any(m in ids for m in d['match']):
                c['status'], c['decision'] = d['status'], {k: v for k, v in d.items() if k != 'match'}
                used.add(i)
                break
    # Sources found by direct searches (registers, portals) that no catalogue returned.
    for i, d in enumerate(DECISIONS):
        if i not in used:
            c = classify(cand('direct-search', url=d.get('url'), title=d['title'], description=d['note'], foundBy=[{'q': 'direct search, 2026-10 pass'}]))
            c['status'], c['decision'] = d['status'], {k: v for k, v in d.items() if k != 'match'}
            cands.append(c)
    os.makedirs(OUT, exist_ok=True)
    cands.sort(key=lambda c: -c['relevance'])
    with gzip.open(os.path.join(OUT, 'inventory.jsonl.gz'), 'wt', encoding='utf-8') as fh:
        for c in cands:
            fh.write(json.dumps(c, ensure_ascii=False, default=list) + '\n')
    summ = {'candidates': len(cands), 'byChannel': Counter(c['channel'] for c in cands), 'byClass': Counter(c['accessClass'] for c in cands),
            'relevant': sum(c['relevance'] >= 50 for c in cands), 'byStatus': Counter(c['status'] for c in cands), 'byRegion(relevance≥50)': Counter(r for c in cands if c['relevance'] >= 50 for r in c['regions']),
            'byCategory(relevance≥50)': Counter(k for c in cands if c['relevance'] >= 50 for k in c['categories']),
            'byCentury(relevance≥50)': Counter(p for c in cands if c['relevance'] >= 50 for p in c['periods']),
            'queries': sum(len(glob.glob(os.path.join(DISC, d, '*.json'))) for d in os.listdir(DISC) if os.path.isdir(os.path.join(DISC, d)))}
    json.dump(summ, open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False, indent=1, default=dict)
    print(json.dumps(summ, ensure_ascii=False, default=dict)[:1500])


def known_sources():
    """Lower-case name fragments of datasets Shelf already holds (vault) → dataset id."""
    out = {}
    for d in os.listdir(os.path.join(ROOT, 'data', 'historical', 'raw')):
        out[d.replace('-', ' ')] = d
    for k, v in {'pleiades': 'pleiades', 'itiner-e': 'itinere', 'viabundus': 'viabundus', 'thurayya': 'al-thurayya', 'cshapes': 'cshapes',
                 'cliopatria': 'cliopatria', 'germania sacra': 'germania-sacra', 'ebidat': 'ebidat', 'dicotopo': 'dicotopo', 'tabula imperii byzantini': 'tib',
                 'maps of power': 'tib', 'atlas fontium': 'atlas-fontium-poland', 'darmc': 'darmc', 'digital atlas of roman and medieval': 'darmc',
                 'gough map': 'gough-map', 'domesday': 'domesday', 'mérimée': 'merimee', 'merimee': 'merimee', 'buringh': 'buringh-urban',
                 'princes and townspeople': 'princes-townspeople', 'historical conflict event': 'hced', 'kulturminne': 'norway-kulturminner',
                 'fornsök': 'sweden-lamningar', 'fund og fortidsminder': 'dk-fund-og-fortidsminder', 'repertoriul arheologic': 'ran-romania'}.items():
        out[k] = v
    return out


if __name__ == '__main__':
    main()
