#!/usr/bin/env python3
"""Discovery universe: a wide, resumable harvest of catalogue records for historical-geospatial sources.

  python3 scripts/historical-data/discover/universe.py <channel> [<channel> ...]
  python3 scripts/historical-data/discover/universe.py all

Channels (each one catalogue or catalogue family; all metadata only, nothing beyond catalogue records is downloaded):
  datacite    DataCite REST (Zenodo, Figshare, Dryad, OSF, Dataverse, institutional repositories) — up to 300 hits per query
  openaire    OpenAIRE Graph (aggregates ~100k repositories, incl. national archives and INSPIRE harvests) — up to 200 per query
  europa      data.europa.eu (national open-data and INSPIRE portals) — up to 200 per query
  zenodo      Zenodo (file lists) — 25 per query
  arcgis      ArcGIS Hub, items whose extent touches Europe/Mediterranean — up to 100 per query
  dataverse   every Dataverse installation in Europe (and Harvard), core queries
  europeana   Europeana map items per place (individual historical maps)
  rumsey      David Rumsey Map Collection, per place
  pangaea     PANGAEA (palaeo-environment, archaeology)
  re3data     the re3data registry of research-data repositories (institutions that may hold more)
  ogm         OpenGeoMetadata catalogues of university map/GIS libraries (git clones, parsed, then removed)

Output: scripts/atlas-build/.cache/universe/<channel>.jsonl.gz (compact records, appended), <channel>.done (finished query
keys, so a stopped run resumes where it stopped). inventory.py merges them with the earlier harvest.
"""
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from universe_queries import universe_queries  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
OUT = os.path.join(ROOT, 'scripts', 'atlas-build', '.cache', 'universe')
UA = 'ShelfResearch/1.0 (personal historical atlas; https://github.com/yosefliberman770-source/shelf)'
EUROPE_BBOX = (-25, 27, 62, 72)
q = urllib.parse.quote


def get(url, tries=4, accept='application/json', raw=False):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, timeout=90) as r:
                b = r.read()
                return b if raw else json.loads(b.decode('utf-8', 'replace'))
        except urllib.error.HTTPError as e:
            last = e.code
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(8 * (i + 1))
                continue
            return None
        except Exception as e:  # noqa: BLE001
            last = str(e)[:80]
            time.sleep(4 * (i + 1))
    return None


class Sink:
    """Appends compact records to the channel file; remembers finished query keys."""

    def __init__(self, ch):
        os.makedirs(OUT, exist_ok=True)
        self.ch = ch
        self.lock = threading.Lock()
        self.done_path = os.path.join(OUT, f'{ch}.done')
        self.done = set(open(self.done_path, encoding='utf-8').read().split('\n')) if os.path.exists(self.done_path) else set()
        self.fh = gzip.open(os.path.join(OUT, f'{ch}.jsonl.gz'), 'at', encoding='utf-8')
        self.dfh = open(self.done_path, 'a', encoding='utf-8')
        self.n = 0

    def key(self, s):
        return hashlib.sha1(s.encode()).hexdigest()[:16]

    def is_done(self, k):
        return self.key(k) in self.done

    def write(self, recs, k):
        with self.lock:
            for r in recs:
                r['ch'] = self.ch
                self.fh.write(json.dumps({x: v for x, v in r.items() if v not in (None, '', [], {})}, ensure_ascii=False) + '\n')
            self.n += len(recs)
            self.fh.flush()
            self.dfh.write(self.key(k) + '\n')
            self.dfh.flush()

    def close(self):
        self.fh.close()
        self.dfh.close()


def txt(s, n=500):
    if isinstance(s, list):
        s = ' '.join(str(x) for x in s if x)
    s = re.sub(r'<[^>]+>', ' ', str(s or ''))
    return re.sub(r'\s+', ' ', s).strip()[:n]


def run_queries(ch, fn, queries, workers, pause):
    sink = Sink(ch)
    todo = [x for x in queries if not sink.is_done(x[0])]
    print(ch, 'queries', len(queries), 'to do', len(todo), flush=True)
    t0 = time.time()

    def one(i_item):
        i, item = i_item
        recs = fn(item[0])
        if recs is not None:
            for r in recs:
                r['q'] = item[0]
            sink.write(recs, item[0])
        time.sleep(pause)
        if i % 200 == 0:
            print(ch, i, '/', len(todo), 'records', sink.n, f'{time.time() - t0:.0f}s', flush=True)
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(one, enumerate(todo)))
    sink.close()
    print(ch, 'done, records written', sink.n, flush=True)


# ── channels ──────────────────────────────────────────────────────────────

def datacite(s, pages=3):
    out, url = [], f'https://api.datacite.org/dois?query={q(s)}&resource-type-id=dataset,collection,model&page%5Bsize%5D=100&page%5Bcursor%5D=1'
    for _ in range(pages):
        d = get(url)
        if d is None:
            return None if not out else out
        for it in d.get('data', []):
            a = it['attributes']
            bbox = None
            for gl in a.get('geoLocations') or []:
                b = gl.get('geoLocationBox') or {}
                try:
                    bbox = [float(b['westBoundLongitude']), float(b['southBoundLatitude']), float(b['eastBoundLongitude']), float(b['northBoundLatitude'])]
                except (KeyError, TypeError, ValueError):
                    pass
            pub = a.get('publisher')
            out.append({'doi': a.get('doi'), 'url': a.get('url'), 'title': txt((a.get('titles') or [{}])[0].get('title'), 300),
                        'desc': txt([x.get('description') for x in a.get('descriptions') or []][:2]), 'year': a.get('publicationYear'),
                        'inst': pub if isinstance(pub, str) else (pub or {}).get('name'), 'repo': it.get('relationships', {}).get('client', {}).get('data', {}).get('id'),
                        'creators': [x.get('name') for x in a.get('creators') or []][:5], 'kw': [x.get('subject') for x in a.get('subjects') or [] if x.get('subject')][:15],
                        'fmts': (a.get('formats') or [])[:10], 'bbox': bbox, 'lic': [x.get('rights') for x in a.get('rightsList') or []][:2],
                        'type': (a.get('types') or {}).get('resourceTypeGeneral'), 'sizes': (a.get('sizes') or [])[:3],
                        'rel': [f"{r.get('relationType')}:{r.get('relatedIdentifier')}" for r in a.get('relatedIdentifiers') or []][:15],
                        'cites': a.get('citationCount')})
        nxt = (d.get('links') or {}).get('next')
        if not nxt or len(d.get('data', [])) < 100:
            break
        url = nxt
    return out


def openaire(s, pages=2):
    out = []
    for p in range(1, pages + 1):
        d = get(f'https://api.openaire.eu/graph/v1/researchProducts?search={q(s)}&type=dataset&pageSize=100&page={p}')
        if d is None:
            return out or None
        res = d.get('results') or []
        for r in res:
            pids = [f"{x.get('scheme')}:{x.get('value')}" for x in r.get('pids') or []]
            doi = next((x.split(':', 1)[1] for x in pids if x.lower().startswith('doi:')), None)
            urls = [u for inst in r.get('instances') or [] for u in inst.get('urls') or []]
            bbox = None
            for g in r.get('geoLocations') or []:
                b = g.get('box') or ''
                nums = re.findall(r'-?\d+(?:\.\d+)?', b) if isinstance(b, str) else []
                if len(nums) == 4:
                    bbox = [float(x) for x in nums]
            out.append({'doi': doi, 'url': urls[0] if urls else None, 'title': txt(r.get('mainTitle'), 300), 'desc': txt((r.get('descriptions') or [])[:1]),
                        'year': (r.get('publicationDate') or '')[:4], 'inst': r.get('publisher'),
                        'repo': ', '.join(sorted({(inst.get('hostedBy') or {}).get('value', '') for inst in r.get('instances') or []}))[:120],
                        'creators': [a.get('fullName') for a in r.get('authors') or []][:5],
                        'kw': [(x.get('subject') or {}).get('value') for x in r.get('subjects') or []][:15], 'fmts': (r.get('formats') or [])[:10],
                        'countries': [c.get('code') for c in r.get('countries') or []][:5], 'cov': (r.get('coverages') or [])[:5], 'bboxText': bbox,
                        'lic': [(r.get('bestAccessRight') or {}).get('label')], 'type': 'dataset', 'oaid': r.get('id')})
        if len(res) < 100:
            break
    return out


def europa(s, pages=2):
    out = []
    for p in range(pages):
        d = get(f'https://data.europa.eu/api/hub/search/search?q={q(s)}&limit=100&page={p}&filter=dataset')
        if d is None:
            return out or None
        res = (d.get('result') or {}).get('results') or []
        for it in res:
            t, de = it.get('title') or {}, it.get('description') or {}
            ten = t.get('en') or next(iter(t.values()), '')
            other = next((v for k, v in t.items() if k != 'en'), '')
            sp = it.get('spatial')
            out.append({'url': f"https://data.europa.eu/data/datasets/{it.get('id')}", 'title': txt(ten + (f' / {other}' if other and other != ten else ''), 300),
                        'desc': txt(de.get('en') or next(iter(de.values()), '')), 'inst': txt((it.get('catalog') or {}).get('title'), 120),
                        'repo': (it.get('catalog') or {}).get('id'), 'countries': [(it.get('country') or {}).get('label')] if isinstance(it.get('country'), dict) else [],
                        'kw': [k.get('label') for k in it.get('keywords') or [] if isinstance(k, dict)][:15],
                        'fmts': sorted({(x.get('format') or {}).get('label', '') for x in it.get('distributions') or [] if isinstance(x, dict)})[:10],
                        'spatial': json.dumps(sp)[:300] if sp else None, 'year': (it.get('issued') or it.get('modified') or '')[:4], 'type': 'dataset'})
        if len(res) < 100:
            break
    return out


def zenodo(s):
    d = get(f'https://zenodo.org/api/records?q={q(s)}&type=dataset&size=25')
    if d is None:
        return None
    out = []
    for it in (d.get('hits') or {}).get('hits', []):
        m, files = it.get('metadata', {}), it.get('files') or []
        out.append({'doi': it.get('doi') or m.get('doi'), 'url': (it.get('links') or {}).get('self_html'), 'title': txt(m.get('title'), 300), 'desc': txt(m.get('description')),
                    'year': (m.get('publication_date') or '')[:4], 'creators': [c.get('name') for c in m.get('creators', [])][:5],
                    'inst': txt(sorted({c.get('affiliation') or '' for c in m.get('creators', [])}), 200), 'repo': 'zenodo', 'kw': (m.get('keywords') or [])[:15],
                    'files': [{'n': f.get('key'), 's': f.get('size'), 'u': (f.get('links') or {}).get('self')} for f in files[:25]],
                    'lic': [(m.get('license') or {}).get('id')], 'type': 'dataset',
                    'rel': [f"{r.get('relation')}:{r.get('identifier')}" for r in m.get('related_identifiers') or []][:15]})
    return out


def arcgis(s):
    b = ','.join(map(str, EUROPE_BBOX))
    d = get(f'https://hub.arcgis.com/api/search/v1/collections/all/items?q={q(s)}&bbox={b}&limit=100')
    if d is None:
        return None
    out = []
    for f in d.get('features') or []:
        p = f.get('properties') or {}
        if p.get('type') not in ('Feature Service', 'Map Service', 'CSV', 'Shapefile', 'GeoJson', 'File Geodatabase', 'KML', 'WFS', 'WMS', 'Image Service',
                                 'Vector Tile Service', 'GeoPackage', 'Microsoft Excel', 'Web Map', 'Feature Collection', 'Scene Service'):
            continue
        ext = p.get('extent')
        bbox = [ext[0][0], ext[0][1], ext[1][0], ext[1][1]] if isinstance(ext, list) and len(ext) == 2 else None
        out.append({'url': p.get('url') or f"https://www.arcgis.com/home/item.html?id={p.get('id')}", 'item': f"https://www.arcgis.com/home/item.html?id={p.get('id')}",
                    'title': txt(p.get('title'), 300), 'desc': txt(p.get('snippet') or p.get('description')), 'inst': p.get('orgName') or p.get('owner'),
                    'repo': 'ArcGIS Online', 'kw': (p.get('tags') or [])[:15], 'fmts': [p.get('type')] + (p.get('typeKeywords') or [])[:6], 'bbox': bbox,
                    'lic': [txt(p.get('licenseInfo'), 120)], 'year': time.strftime('%Y', time.gmtime((p.get('created') or 0) / 1000)), 'type': p.get('type')})
    return out


def pangaea(s):
    d = get(f'https://ws.pangaea.de/es/pangaea/panmd/_search?q={q(s)}&size=100')
    if d is None:
        return None
    out = []
    for h in (d.get('hits') or {}).get('hits', []):
        x = h.get('_source') or {}
        xt = x.get('xml-thumb') or ''
        tm = re.search(r'<md:title>(.*?)</md:title>', xt, re.S)
        am = re.search(r'<md:abstract>(.*?)</md:abstract>', xt, re.S)
        out.append({'doi': (x.get('URI') or '').split('doi.pangaea.de/')[-1], 'url': x.get('URI'), 'title': txt(tm.group(1) if tm else '', 300),
                    'desc': txt(am.group(1) if am else ''),
                    'kw': (x.get('agg-topic') or [])[:10], 'repo': 'PANGAEA', 'type': 'dataset'})
    return out


EUROPEANA_PLACES = ['Europe', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'England', 'Scotland', 'Ireland', 'Wales', 'Netherlands', 'Belgium',
                    'Denmark', 'Sweden', 'Norway', 'Finland', 'Iceland', 'Poland', 'Bohemia', 'Moravia', 'Slovakia', 'Hungary', 'Transylvania', 'Austria',
                    'Tyrol', 'Switzerland', 'Romania', 'Wallachia', 'Moldavia', 'Bulgaria', 'Serbia', 'Croatia', 'Dalmatia', 'Slavonia', 'Bosnia', 'Albania',
                    'Greece', 'Morea', 'Crete', 'Cyprus', 'Ottoman', 'Turkey', 'Anatolia', 'Constantinople', 'Russia', 'Ukraine', 'Podolia', 'Volhynia',
                    'Galicia', 'Lithuania', 'Livonia', 'Courland', 'Estonia', 'Prussia', 'Silesia', 'Pomerania', 'Saxony', 'Bavaria', 'Westphalia',
                    'Holy Roman Empire', 'Lombardy', 'Venice', 'Tuscany', 'Sicily', 'Sardinia', 'Naples', 'Castile', 'Aragon', 'Catalonia', 'Andalusia',
                    'Normandy', 'Brittany', 'Burgundy', 'Provence', 'Flanders', 'Holland', 'Mediterranean', 'Balkans', 'Danube', 'Rhine', 'Baltic',
                    'Palestine', 'Holy Land', 'Egypt', 'Syria', 'Barbary', 'Morocco', 'Algiers', 'Tunis', 'Caucasus', 'Georgia', 'Crimea']


def europeana(place, pages=5):
    out, cursor = [], '*'
    query = f'"{place}" AND (map OR karte OR carte OR mappa OR mapa OR térkép OR kaart OR kort OR karta OR карта)'
    for _ in range(pages):
        d = get(f'https://api.europeana.eu/record/v2/search.json?wskey=api2demo&query={q(query)}&qf=TYPE:IMAGE&rows=100&cursor={q(cursor)}&profile=standard')
        if d is None:
            return out or None
        for it in d.get('items') or []:
            lat, lon = (it.get('edmPlaceLatitude') or [None])[0], (it.get('edmPlaceLongitude') or [None])[0]
            out.append({'url': (it.get('guid') or '').split('?')[0], 'title': txt(it.get('title'), 300), 'desc': txt(it.get('dcDescription'), 300),
                        'year': (it.get('year') or [None])[0], 'inst': (it.get('dataProvider') or [None])[0], 'repo': 'Europeana',
                        'countries': it.get('country') or [], 'kw': (it.get('edmPlaceLabel') or [])[:5] + (it.get('edmTimespanLabel') or [])[:3],
                        'lic': it.get('rights') or [], 'type': 'map', 'iiif': (it.get('edmIsShownBy') or [None])[0], 'pt': [lon, lat] if lat and lon else None})
        cursor = d.get('nextCursor')
        if not cursor:
            break
    return out


def rumsey(place, pages=5):
    out = []
    for p in range(1, pages + 1):
        d = get(f'https://www.davidrumsey.com/luna/servlet/as/search?q={q(place)}&lc=RUMSEY~8~1&bs=100&os={(p - 1) * 100}')
        if d is None:
            return out or None
        res = d.get('results') or []
        for r in res:
            f = {x.get('name'): x.get('value') for x in r.get('fieldValues') or [] if isinstance(x, dict)} if isinstance(r.get('fieldValues'), list) else {}
            out.append({'url': r.get('urlSize4') or r.get('id'), 'title': txt(r.get('displayName') or f.get('Full Title') or f.get('Title'), 300),
                        'desc': txt(r.get('description'), 300), 'year': f.get('Date') or f.get('Pub Date'), 'inst': 'David Rumsey Map Collection',
                        'repo': 'David Rumsey', 'type': 'map', 'iiif': r.get('iiifManifest')})
        if len(res) < 100:
            break
    return out


def dataverse_channel():
    inst = get('https://iqss.github.io/dataverse-installations/data/data.json') or {}
    hosts = []
    for i in inst.get('installations', []):
        c = (i.get('country') or '').lower()
        if c in ('', 'usa') and 'harvard' not in (i.get('hostname') or ''):
            continue
        if c in ('china', 'japan', 'australia', 'brazil', 'india', 'mexico', 'canada', 'colombia', 'chile', 'ecuador', 'peru', 'korea', 'taiwan', 'singapore',
                 'south africa', 'kenya', 'ghana', 'argentina', 'indonesia', 'thailand', 'philippines', 'uruguay', 'venezuela', 'vietnam', 'new zealand'):
            continue
        hosts.append((i.get('hostname'), i.get('name'), i.get('country')))
    print('dataverse installations', len(hosts), flush=True)
    from queries import LOCAL, TOPICS
    core = TOPICS + [x for v in LOCAL.values() for x in v]
    sink = Sink('dataverse')

    def host_run(h):
        host, name, country = h
        n = 0
        for s in core:
            k = f'{host}|{s}'
            if sink.is_done(k):
                continue
            d = get(f'https://{host}/api/search?q={q(s)}&type=dataset&per_page=100')
            recs = []
            for it in ((d or {}).get('data') or {}).get('items') or []:
                recs.append({'doi': (it.get('global_id') or '').replace('doi:', ''), 'url': it.get('url'), 'title': txt(it.get('name'), 300),
                             'desc': txt(it.get('description')), 'inst': it.get('name_of_dataverse') or name, 'repo': f'Dataverse {host}',
                             'creators': (it.get('authors') or [])[:5], 'kw': ((it.get('keywords') or []) + (it.get('subjects') or []))[:15],
                             'year': (it.get('published_at') or '')[:4], 'files': it.get('fileCount'), 'countries': [country], 'type': 'dataset', 'q': s})
            sink.write(recs, k)
            n += len(recs)
            time.sleep(0.3)
            if d is None and n == 0:
                break  # host not answering: skip it (recorded by absence; re-run retries)
        print('dataverse', host, n, flush=True)
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(host_run, hosts))
    sink.close()


def re3data_channel():
    raw = get('https://www.re3data.org/api/v1/repositories', accept='application/xml', raw=True) or b''
    ids = re.findall(rb'<id>(r3d\d+)</id>', raw)
    names = re.findall(rb'<name>([^<]*)</name>', raw)
    print('re3data repositories', len(ids), flush=True)
    sink = Sink('re3data')

    def one(i):
        rid = ids[i].decode()
        if sink.is_done(rid):
            return
        x = (get(f'https://www.re3data.org/api/v1/repository/{rid}', accept='application/xml', raw=True) or b'').decode('utf-8', 'replace')
        f = lambda tag: [txt(m, 300) for m in re.findall(rf'<r3d:{tag}[^>]*>(.*?)</r3d:{tag}>', x, re.S)]  # noqa: E731
        sink.write([{'url': (f('repositoryURL') or [None])[0], 'rid': rid, 'title': (f('repositoryName') or [names[i].decode('utf-8', 'replace') if i < len(names) else rid])[0],
                     'desc': (f('description') or [''])[0], 'kw': (f('subject') + f('keyword'))[:20], 'countries': f('institutionCountry')[:5],
                     'inst': '; '.join(f('institutionName')[:3]), 'fmts': f('apiType')[:5], 'type': 'repository', 'repo': 're3data'}], rid)
        time.sleep(0.2)
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(one, range(len(ids))))
    sink.close()


OGM_REPOS = ['edu.harvard', 'edu.stanford.purl', 'edu.princeton.arks', 'edu.nyu', 'edu.umn', 'edu.wisc', 'edu.mit', 'edu.berkeley', 'edu.cornell',
             'edu.columbia', 'edu.illinois', 'edu.uchicago', 'edu.psu', 'edu.purdue', 'edu.indiana', 'edu.iowa', 'edu.msu', 'edu.osu', 'edu.rutgers',
             'edu.tufts', 'edu.ucla', 'edu.virginia', 'edu.uarizona', 'edu.colorado', 'edu.umich', 'edu.umd', 'edu.nebraska', 'edu.utexas', 'edu.uiowa',
             'edu.ucsb', 'edu.ucdavis', 'edu.baruch', 'edu.vt', 'edu.washington', 'edu.unc', 'edu.duke', 'edu.yale', 'edu.brown', 'edu.upenn',
             'edu.rice', 'edu.emory', 'edu.uconn', 'edu.lib.ncsu', 'org.libraryofcongress', 'big-ten', 'gov.loc', 'ca.ubc', 'ca.utoronto',
             'ca.mcgill', 'uk.ac.ox', 'uk.ac.lse', 'uk.ac.edina', 'nl.uva', 'de.tib']


def ogm_channel():
    tmp = os.path.join(OUT, 'ogm-clones')
    os.makedirs(tmp, exist_ok=True)
    sink = Sink('ogm')
    for repo in OGM_REPOS:
        if sink.is_done(repo):
            continue
        d = os.path.join(tmp, repo)
        if os.environ.get('OGM_LOCAL'):
            d = os.path.join(os.environ['OGM_LOCAL'], repo)
            r = subprocess.CompletedProcess([], 0)
        else:
          r = subprocess.run(['git', 'clone', '-q', '--depth', '1', f'https://github.com/OpenGeoMetadata/{repo}.git', d], capture_output=True, timeout=1800)
        if r.returncode != 0:
            print('ogm', repo, 'not available', flush=True)
            sink.write([], repo)
            continue
        recs = []
        for base, _, files in os.walk(d):
            for fn in files:
                if not fn.endswith('.json'):
                    continue
                try:
                    x = json.load(open(os.path.join(base, fn), encoding='utf-8'))
                    if isinstance(x, str):
                        x = json.loads(x)  # some catalogues store each record as a JSON-encoded string
                except Exception:  # noqa: BLE001
                    continue
                if not isinstance(x, dict) or not (x.get('dct_title_s') or x.get('dc_title_s')):
                    continue
                env = x.get('dcat_bbox') or x.get('locn_geometry') or x.get('solr_geom') or ''
                m = re.match(r'ENVELOPE\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)', env)
                bbox = [float(m.group(1)), float(m.group(4)), float(m.group(2)), float(m.group(3))] if m else None
                years = x.get('gbl_indexYear_im') or ([x['solr_year_i']] if x.get('solr_year_i') else [])
                refs = x.get('dct_references_s') or ''
                ident = x.get('dct_identifier_sm')
                recs.append({'url': (ident[0] if isinstance(ident, list) and ident else x.get('dc_identifier_s') or x.get('id')), 'oid': x.get('id') or x.get('layer_slug_s'),
                             'title': txt(x.get('dct_title_s') or x.get('dc_title_s'), 300), 'desc': txt(x.get('dct_description_sm') or x.get('dc_description_s'), 400),
                             'inst': txt(x.get('dct_publisher_sm') or x.get('dc_publisher_s') or x.get('schema_provider_s') or repo, 150), 'repo': f'OpenGeoMetadata/{repo}',
                             'year': years[0] if years else None, 'years': years[:5], 'bbox': bbox,
                             'kw': [k for k in (x.get('dct_subject_sm') or x.get('dc_subject_sm') or []) + (x.get('dct_spatial_sm') or x.get('dc_spatial_sm') or []) if isinstance(k, str)][:15],
                             'fmts': [x.get('dct_format_s') or x.get('dc_format_s')] + [t for t in ('wms', 'wfs', 'iiif', 'download') if t in refs],
                             'georef': x.get('gbl_georeferenced_b'), 'access': x.get('dct_accessRights_s') or x.get('dc_rights_s'),
                             'type': ' '.join(x.get('gbl_resourceClass_sm') or [x.get('layer_geom_type_s') or '']), 'refs': refs[:500]})
        for i in range(0, len(recs), 5000):
            sink.write(recs[i:i + 5000], f'{repo}#{i}')
        sink.write([], repo)
        print('ogm', repo, len(recs), flush=True)
        shutil.rmtree(d, ignore_errors=True)
    sink.close()


QUERY_CHANNELS = {
    'datacite': (datacite, 4, 0.2), 'openaire': (openaire, 3, 0.3), 'europa': (europa, 3, 0.3), 'zenodo': (zenodo, 1, 1.1),
    'arcgis': (arcgis, 3, 0.3), 'pangaea': (pangaea, 2, 0.3),
}


def main(chs):
    qs = universe_queries()
    for ch in chs:
        if ch in QUERY_CHANNELS:
            fn, w, p = QUERY_CHANNELS[ch]
            sel = qs if ch != 'pangaea' else [x for x in qs if x[2] in ('topic', 'period')]
            run_queries(ch, fn, sel, w, p)
        elif ch == 'europeana':
            run_queries(ch, europeana, [(p, 'en', 'place') for p in EUROPEANA_PLACES], 2, 0.5)
        elif ch == 'rumsey':
            run_queries(ch, rumsey, [(p, 'en', 'place') for p in EUROPEANA_PLACES], 2, 0.5)
        elif ch == 'dataverse':
            dataverse_channel()
        elif ch == 're3data':
            re3data_channel()
        elif ch == 'ogm':
            ogm_channel()


if __name__ == '__main__':
    a = sys.argv[1:]
    main(list(QUERY_CHANNELS) + ['europeana', 'rumsey', 'dataverse', 're3data', 'ogm'] if a == ['all'] else a)
