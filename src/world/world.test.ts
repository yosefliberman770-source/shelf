// The Historical World core: uncertain dates, coverage, source selection,
// missing-data wording and the map overlay fit.
import { describe, expect, it } from 'vitest';
import { regionAt } from './axes';
import { cellAt } from './coverage';
import { explainEmpty } from './evidence';
import { century, circa, formatDate, parseDate, period, relation } from './histdate';
import { fitOverlay, overlayFor } from './maps';
import { SOURCES } from './registry';
import { selectSources } from './select';

describe('historical dates keep their uncertainty', () => {
  it('parses phrases without inventing precision', () => {
    expect(parseDate('218 BC')).toMatchObject({ earliest: -218, latest: -218, precision: 'year' });
    expect(parseDate('c. 1200')).toMatchObject({ preferred: 1200, precision: 'circa' });
    expect(formatDate(parseDate('c. 1200'))).toBe('about 1200 CE');
    expect(parseDate('12th century')).toMatchObject({ earliest: 1101, latest: 1200, precision: 'century' });
    expect(parseDate('the third century BC')).toMatchObject({ earliest: -300, latest: -201 });
    expect(parseDate('218–201 BC')).toMatchObject({ earliest: -218, latest: -201, precision: 'range' });
    expect(parseDate('1350s')).toMatchObject({ earliest: 1350, latest: 1359, precision: 'decade' });
    expect(parseDate('before 500')).toMatchObject({ latest: 500, qualifier: 'before' });
    expect(parseDate('in the spring')).toBeUndefined();
  });
  it('says "possibly" rather than "definitely" for circa dates and broad periods', () => {
    expect(relation(circa(1200), 1200)).toBe('possible');
    expect(relation(period(-30, 300, 'Roman'), 100)).toBe('possible');
    expect(relation(century(12), 1150)).toBe('possible');
    expect(relation(parseDate('218 BC'), -218)).toBe('within');
    expect(relation(parseDate('218 BC'), -216)).toBe('outside');
    expect(relation(undefined, 1000)).toBe('unknown');
  });
});

describe('coverage and source selection', () => {
  it('describes digital coverage per region, period and data type', () => {
    expect(cellAt(12.5, 41.9, 100, 'places').inShelf).toBe('excellent'); // Pleiades, Roman Italy
    expect(cellAt(10.7, 53.9, 1400, 'roads').inShelf).toBe('excellent'); // Viabundus
    expect(cellAt(120.2, 30.3, 1200, 'administrative').inShelf).toBe('excellent'); // CHGIS (live)
    expect(cellAt(20, -5, 1400, 'settlements').exists).toBe('none'); // no open structured data
  });
  it('prefers specialist sources and says when better data exists that Shelf can’t use', () => {
    const rome = selectSources({ lon: 12.5, lat: 41.9, year: 100, type: 'places' });
    expect(rome.use[0].source.id).toBe('pleiades');
    const china = selectSources({ lon: 120.2, lat: 30.3, year: 1200, type: 'places' });
    expect(china.use[0].source.id).toBe('chgis');
    const britain1900 = selectSources({ lon: -1, lat: 52, year: 1900, type: 'names' });
    expect(britain1900.explanation).toMatch(/GB1900/);
    const hansa = selectSources({ lon: 10.7, lat: 53.9, year: 1400, type: 'routes' });
    expect(hansa.use[0].source.id).toBe('viabundus');
    expect(SOURCES.every((s) => s.license && s.attribution)).toBe(true);
  });
  it('never presents missing data as historical absence', () => {
    const e = explainEmpty('settlements', 20, -5, 1400);
    expect(e.kind).toBe('no-structured-data');
    expect(e.text).toMatch(/does not mean nothing existed/);
    expect(explainEmpty('names', -1, 52, 1900).kind).toBe('database-limitation');
    expect(regionAt(10.7, 53.9)).toBe('central-europe');
  });
});

describe('overlaying an original map', () => {
  it('fits control points and reports the error honestly', () => {
    // An exact affine relation (a well-behaved map): the fit should be near-perfect.
    const gcps = [[0, 0], [1000, 0], [1000, 800], [0, 800], [500, 400]].map(([x, y]) => ({ px: [x, y] as [number, number], geo: [10 + x / 1000, 50 - y / 1000] as [number, number] }));
    const o = fitOverlay({ annotation: 'a', imageService: 'https://iiif.example/img', width: 1000, height: 800, gcps })!;
    expect(o.errorKm).toBeLessThan(0.5);
    expect(o.coordinates[0][0]).toBeCloseTo(10, 1);
    expect(o.coordinates[2][1]).toBeCloseTo(49.2, 1);
    expect(o.url).toMatch(/^https:\/\/iiif\.example\/img\/0,0,1000,800\/1000,\/0\/default\.jpg$/);
    // A distorted old map: the error is reported, not hidden.
    const bent = gcps.map((g, i) => ({ ...g, geo: [g.geo[0] + (i === 4 ? 0.2 : 0), g.geo[1]] as [number, number] }));
    expect(fitOverlay({ annotation: 'a', imageService: 'x', width: 1000, height: 800, gcps: bent })!.errorKm).toBeGreaterThan(1);
    expect(fitOverlay({ annotation: 'a', imageService: 'x', width: 10, height: 10, gcps: gcps.slice(0, 3) })).toBeUndefined();
    // Overlays are refused, with a reason, when too few points or too distorted for their size.
    expect(overlayFor({ annotation: 'a', imageService: 'x', width: 1000, height: 800, gcps: gcps.slice(0, 3) })).toMatchObject({ ok: false });
    const wild = gcps.map((g, i) => ({ ...g, geo: [g.geo[0] + (i === 4 ? 0.6 : 0), g.geo[1]] as [number, number] }));
    const r = overlayFor({ annotation: 'a', imageService: 'x', width: 1000, height: 800, gcps: wild });
    expect(r.ok).toBe(false);
    expect(overlayFor({ annotation: 'a', imageService: 'x', width: 1000, height: 800, gcps }).ok).toBe(true);
  });
});

describe('georeferenced layers from university map libraries (WMS)', () => {
  it('asks for the layer’s own extent in Web Mercator and places the image on those corners', async () => {
    const { wmsImage } = await import('./maps');
    const r = wmsImage({ url: 'https://example.org/wms', layer: 'lib:MAP_1721', bbox: [-1.8, 45.96, -0.81, 46.47] }, 800);
    const p = new URL(r.url).searchParams;
    expect(p.get('srs')).toBe('EPSG:3857');
    expect(p.get('layers')).toBe('lib:MAP_1721');
    expect(Number(p.get('width'))).toBe(800);
    expect(r.coordinates).toEqual([[-1.8, 46.47], [-0.81, 46.47], [-0.81, 45.96], [-1.8, 45.96]]);
    const [x0, y0, x1, y1] = p.get('bbox')!.split(',').map(Number);
    expect(x0).toBeLessThan(x1);
    expect(y0).toBeLessThan(y1);
    // Height follows the Mercator aspect ratio of the box.
    expect(Number(p.get('height'))).toBe(Math.round((800 * (y1 - y0)) / (x1 - x0)));
  });
});

describe('georeferenced scans served as map tiles by their publisher', () => {
  it('previews the tile at the middle of the map and lays the tiles only within the map’s extent', async () => {
    const { wmsOverlay, xyzTile } = await import('./maps');
    // Llandegla tithe map (1847): the extent from the publisher's tile service
    const xyz = { url: 'https://example.org/MapServer/tile/{z}/{y}/{x}', bbox: [-3.23336, 53.0217, -3.10992, 53.08693] as [number, number, number, number] };
    expect(xyzTile(xyz)).toBe('https://example.org/MapServer/tile/11/666/1005');
    expect(xyzTile(xyz, 2)).toBe('https://example.org/MapServer/tile/13/2666/4023');
    const o = wmsOverlay({ id: 'gis:x', title: 'Llandegla Tithe Survey 1847', date: parseDate('1847'), subjects: [], collection: 'gis', holder: 'National Library of Wales', page: '', rights: '', xyz })!;
    expect(o.tiles).toBe(xyz.url);
    expect(o.coordinates).toEqual([[-3.23336, 53.08693], [-3.10992, 53.08693], [-3.10992, 53.0217], [-3.23336, 53.0217]]);
  });
});
