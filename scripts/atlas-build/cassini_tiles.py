"""Roads of the Cassini map (c. 1756–1815; Perret et al., Harvard Dataverse, CC0) as tiles."""
import os

import registers
import tiler


def build_cassini_roads(tiles_dir):
    # Roads drawn on dated historical maps: Cassini (France, 1756–1815) and Lutsch (Transylvania, 1751).
    import generic
    feats = registers.cassini_roads() + registers.lutsch_roads()
    credits = ['Perret, Gribaudi & Barthelemy, 18th century Cassini roads and cities (Harvard Dataverse, CC0)',
               'Lutsch map of Transylvania 1751, roads and mountain paths (Harvard Dataverse, CC BY-NC-SA 4.0)']
    # Line datasets read through spec files (data/historical/specs, "geometry": "lines", public only).
    for sp in generic.specs(public=True, geometry='lines'):
        if 'roads-cassini' in (sp.get('layers') or []):
            feats += generic.line_features(sp)
            credits.append(f"{sp['title']} ({sp['licence']})")
    return tiler.build(os.path.join(tiles_dir, 'cassini-roads.pmtiles'), 'roads', feats, 11, 'Roads in dated sources', '; '.join(credits))


def build_spec_areas(tiles_dir, private_dir=None):
    """Dated historical territorial units read through spec files ("geometry": "polygons"): the public ones into
    historical-units.pmtiles; those whose licence keeps them off the public site into the private pack (private-units.pmtiles)."""
    import generic
    out = {}
    for public, d, name in ((True, tiles_dir, 'historical-units.pmtiles'), (False, private_dir, 'private-units.pmtiles')):
        if d is None:
            continue
        feats, credits = [], []
        for sp in generic.specs(public=public, geometry='polygons'):
            feats += generic.area_features(sp)
            credits.append(f"{sp['title']} ({sp['licence']})")
        if feats:
            os.makedirs(d, exist_ok=True)
            out[name] = tiler.build(os.path.join(d, name), 'units', feats, 10, 'Historical territorial units in dated sources', '; '.join(credits))
    return out


def build_inscriptions(tiles_dir):
    """Find-spots of dated Latin inscriptions (LIST v1.2), one point per find-spot, counts per century."""
    spots, stats = registers.list_inscriptions()
    feats = []
    for x in spots:
        p = {'i': f"li:{x['id']}", 'n': x['name'], 'k': 'inscription', 'src': 'lirelist', 'ni': x['n'],
             'ty': ', '.join(t for t, _ in x['types'].most_common(3))[:80], **({'m': x['modern'][:50]} if x.get('modern') else {}),
             **({'pv': x['prov'][:40]} if x.get('prov') else {}), **({'pl': str(x['pl'])} if x.get('pl') else {})}
        for c, n in x['cent'].items():
            p[f'c{c}'] = n
        mz = 5 if x['n'] >= 100 else 6 if x['n'] >= 20 else 7 if x['n'] >= 5 else 8
        feats.append(({'type': 'Point', 'coordinates': [x['lon'], x['lat']]}, p, mz))
    t = tiler.build(os.path.join(tiles_dir, 'inscriptions.pmtiles'), 'findspots', feats, 10, 'Find-spots of dated Latin inscriptions',
                    'LIST v1.2 — Latin Inscriptions in Space and Time (Kaše, Heřmánková, Sobotková; SDAM Aarhus), from EDH and EDCS, CC BY 4.0')
    return {**t, 'inscriptions': stats}
