// Historical map providers. The reader only talks to this interface, so other
// maps (Roman road maps, campaign maps, custom GIS layers) can be added later
// without touching the reader.
import { toOhmDate } from './dates';
import { mapViewFor, type MapView } from './geometry';
import type { HistoricalPlace } from './types';

export interface MapUrlOptions {
  /** Style/layer id understood by the provider. */
  layer?: string;
  /** IETF language tag for labels, or "mul" for contemporary local names. */
  language?: string;
  projection?: 'mercator' | 'globe' | 'vertical-perspective';
  /** Animate from `date` towards this year (inclusive). */
  animateTo?: number;
  /** Years per animation frame (negative runs backwards). */
  stepYears?: number;
  /** Frames per second. */
  framerate?: number;
}

export interface HistoricalMapProvider {
  id: string;
  name: string;
  homepage: string;
  attribution: { text: string; url: string }[];
  layers: { id: string; label: string }[];
  /** URL to embed for a view at a given year (no year 0; undefined = no date filter). */
  embedUrl(view: MapView, year: number | undefined, opts?: MapUrlOptions): string;
  /** URL of the full, standalone map for the same view. */
  fullMapUrl(view: MapView, year: number | undefined): string;
}

/** https://github.com/OpenHistoricalMap/openhistoricalmap-embed — hash parameters. */
export const openHistoricalMap: HistoricalMapProvider = {
  id: 'ohm',
  name: 'OpenHistoricalMap',
  homepage: 'https://www.openhistoricalmap.org/',
  attribution: [
    { text: 'OpenHistoricalMap contributors', url: 'https://www.openhistoricalmap.org/copyright' },
  ],
  layers: [
    { id: 'O', label: 'Historical' },
    { id: 'W', label: 'Woodblock' },
    { id: 'R', label: 'Railway' },
  ],
  embedUrl(view, year, opts = {}) {
    // map=zoom/lat/lon, in decimal degrees.
    const parts = [`map=${round(view.zoom, 2)}/${round(view.lat, 5)}/${round(view.lon, 5)}`];
    if (view.bbox) parts.push(`bbox=${view.bbox.map((v) => round(v, 5)).join(',')}`);
    if (year !== undefined && opts.animateTo !== undefined && opts.animateTo !== year) {
      parts.push(`start_date=${toOhmDate(year)}`, `end_date=${toOhmDate(opts.animateTo)}`);
      const step = Math.max(1, Math.abs(Math.round(opts.stepYears ?? 1)));
      parts.push(`interval=${opts.animateTo < year ? '-' : ''}P${step}Y`);
      if (opts.framerate) parts.push(`framerate=${opts.framerate}`);
    } else if (year !== undefined) {
      parts.push(`date=${toOhmDate(year)}`);
    }
    parts.push(`layer=${opts.layer ?? 'O'}`);
    if (opts.language) parts.push(`language=${encodeURIComponent(opts.language)}`);
    if (opts.projection) parts.push(`projection=${opts.projection}`);
    return `https://embed.openhistoricalmap.org/#${parts.join('&')}`;
  },
  fullMapUrl(view, year) {
    const date = year !== undefined ? `&date=${toOhmDate(year)}` : '';
    return `https://www.openhistoricalmap.org/#map=${Math.round(view.zoom)}/${round(view.lat, 5)}/${round(view.lon, 5)}&layers=O${date}`;
  },
};

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export const MAP_PROVIDERS: HistoricalMapProvider[] = [openHistoricalMap];

/**
 * Build the embed URL for a place at a year. Returns undefined when the place
 * has no location (the panel then says so instead of showing a random map).
 */
export function buildHistoricalMapUrl(place: Pick<HistoricalPlace, 'latitude' | 'longitude' | 'geometry' | 'boundingBox' | 'placeType'>, year: number | undefined, options: MapUrlOptions & { provider?: HistoricalMapProvider; view?: MapView } = {}): string | undefined {
  const view = options.view ?? mapViewFor(place);
  if (!view) return undefined;
  return (options.provider ?? openHistoricalMap).embedUrl(view, year, options);
}
