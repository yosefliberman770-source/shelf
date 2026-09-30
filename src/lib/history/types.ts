// The app's own model of a historical place, independent of any data source.
// Providers (World Historical Gazetteer, Wikidata, …) translate into these.

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'AMBIGUOUS' | 'UNRESOLVED';

/** GeoJSON geometry as the source gave it (point, line, polygon, collection…). */
export type Geometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'MultiPoint' | 'LineString'; coordinates: [number, number][] }
  | { type: 'MultiLineString' | 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] }
  | { type: 'GeometryCollection'; geometries: Geometry[] };

/** [minLon, minLat, maxLon, maxLat] */
export type BBox = [number, number, number, number];

export interface Attribution {
  /** e.g. "World Historical Gazetteer", "GeoNames via WHG", "Wikidata" */
  source: string;
  /** Underlying dataset, when an aggregator names it (e.g. "Pleiades"). */
  dataset?: string;
  license?: string;
  licenseUrl?: string;
  url?: string;
  /** False when the source's terms don't allow redistributing its records. */
  redistributable?: boolean;
}

export interface HistoricalPlace {
  /** Stable id: "<provider>:<sourceId>", e.g. "whg:place:pl:423025", "wikidata:Q220". */
  id: string;
  canonicalName: string;
  /** The name as it appeared in the book. */
  matchedName: string;
  alternativeNames: string[];
  latitude?: number;
  longitude?: number;
  geometry?: Geometry;
  boundingBox?: BBox;
  /** How exact the location is. */
  locationPrecision: 'exact' | 'approximate' | 'extent' | 'uncertain' | 'unknown';
  placeType?: string;
  description?: string;
  countryCodes: string[];
  historicalStartYear?: number;
  historicalEndYear?: number;
  source: string;
  sourceId: string;
  confidence: Confidence;
  attribution: Attribution[];
  /** Link to the record at its source. */
  url?: string;
}

/** A possible match returned by a provider, before the app decides. */
export interface PlaceCandidate {
  place: HistoricalPlace;
  /** Provider's relative ranking score (0–100); only comparable within one query. */
  score?: number;
  /** Absolute name-match quality (0–100) when the provider measures it. */
  nameConfidence?: number;
  /** Provider says this is an exact name match. */
  exactName?: boolean;
}

/** Everything known about where a name was read — used to disambiguate. */
export interface PlaceQuery {
  name: string;
  /** Historical year being read about (no year 0), if known. */
  date?: number;
  surroundingText?: string;
  chapterTitle?: string;
  bookTitle?: string;
  nearbyPlaceNames?: string[];
  language?: string;
  /** Book id, so a choice made in one book doesn't leak into another. */
  bookId?: string;
  /** Places already identified in this book (its geography so far), as a prior for ambiguous names. */
  contextPoints?: { lat: number; lon: number }[];
}

export interface PlaceResolution {
  status: Confidence;
  /** The chosen place (HIGH/MEDIUM/LOW, or picked by the user). */
  place?: HistoricalPlace;
  /** Alternatives to show when ambiguous (or for "not the right one?"). */
  candidates: PlaceCandidate[];
  /** Which provider answered. */
  provider: string;
  /** Set when a provider couldn't be reached (never cached). */
  error?: string;
  fromCache?: boolean;
  /** The user picked this place themselves. */
  userChosen?: boolean;
  /** Plain-language reason for the decision. */
  reason?: string;
}

/** Plain-language wording for each confidence state (no fake percentages). */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  HIGH: 'Likely match',
  MEDIUM: 'Possible match',
  LOW: 'Possible match — please check',
  AMBIGUOUS: 'Multiple possible locations',
  UNRESOLVED: 'Location not confidently identified',
};

export interface PlaceProvider {
  id: string;
  name: string;
  /** Whether this provider can be used right now (configured, reachable). */
  available(): Promise<boolean>;
  /** Candidates for many names at once (providers batch where they can). */
  search(queries: PlaceQuery[], signal?: AbortSignal): Promise<PlaceCandidate[][]>;
  /** Full record for an id previously returned by search. */
  get?(sourceId: string, signal?: AbortSignal): Promise<HistoricalPlace | undefined>;
}
