// The "world of the book": what Shelf learns from reading a whole EPUB.
//
//   EPUB → chapters/paragraphs (local) → chunks → AI extraction (per chunk,
//   cached by content hash) → entity resolution (local) → knowledge graph
//   → X-Ray summaries written from the evidence.
//
// Every fact keeps where it came from (chapter, paragraph, position in the
// book) and how sure it is, so the app can always show "where does it say
// that?" and jump there.

/** Bump when the extraction prompt/shape changes, so old chunk results are redone. */
export const ANALYSIS_VERSION = 1;

export type EntityType =
  | 'character' | 'place' | 'organization' | 'family' | 'polity' | 'event' | 'object' | 'date' | 'occupation' | 'region' | 'concept';

export const ENTITY_TYPES: EntityType[] = ['character', 'place', 'organization', 'family', 'polity', 'event', 'object', 'date', 'occupation', 'region', 'concept'];

/** EXPLICIT = the text says so; INFERRED = a reasonable reading; UNCERTAIN = a guess. */
export type Certainty = 'explicit' | 'inferred' | 'uncertain';

/** One chapter (spine section) of the book as plain paragraphs. Stays on this device. */
export interface BookTextRow {
  id: string; // `${bookId}|${chapter}`
  bookId: string;
  chapter: number; // spine index
  href: string;
  title: string;
  paras: string[];
  /** EPUB CFI for each paragraph, so evidence can jump to it. */
  cfis: string[];
  /** Paragraphs that start a chapter inside this section ("CHAPTER XII"). Many ebooks put several chapters in one file. */
  heads?: number[];
}

/** Where something is in the book. */
export interface BookLoc { chapter: number; para: number; cfi?: string }

// ── What the AI returns for one chunk ─────────────────────────────────

export interface RawFact { text: string; para?: number; quote?: string; certainty?: Certainty }
export interface RawEntity {
  name: string;
  type: EntityType;
  aliases?: string[];
  titles?: string[];
  gender?: 'male' | 'female' | 'unknown';
  description?: string;
  /** For real-world people/places: who/what it really is ("Edward I of England"). */
  real?: string | null;
  facts?: RawFact[];
  paras?: number[];
}
export interface RawRelation { a: string; b: string; type: string; detail?: string; /** a date the text gives for it ("ceded … 1739", A8-045) */ when?: string; para?: number; certainty?: Certainty }
export interface RawEvent { name: string; when?: string; where?: string; who?: string[]; para?: number; certainty?: Certainty }
export interface ChunkExtraction { entities: RawEntity[]; relations: RawRelation[]; events: RawEvent[] }

// ── Stored pipeline state ─────────────────────────────────────────────

export type ChunkStatus = 'pending' | 'running' | 'done' | 'failed';

export interface BookChunkRow {
  id: string; // `${bookId}|${index}`
  bookId: string;
  index: number;
  chapter: number;
  paraStart: number;
  paraEnd: number; // exclusive
  /** SHA-256 of the chunk text + ANALYSIS_VERSION. Unchanged hash → result reused. */
  hash: string;
  chars: number;
  status: ChunkStatus;
  attempts: number;
  provider?: string;
  model?: string;
  error?: string;
  result?: ChunkExtraction;
  doneAt?: number;
}

export type JobStatus = 'queued' | 'running' | 'paused' | 'waiting' | 'done' | 'error' | 'cancelled';
export type JobStage = 'text' | 'extract' | 'resolve' | 'places' | 'done';

export interface BookJobRow {
  id: string; // bookId
  bookId: string;
  version: number;
  status: JobStatus;
  stage: JobStage;
  chapters: number;
  chunks: number;
  chunksDone: number;
  chunksFailed: number;
  /** Chapters whose chunks are all done. */
  chaptersDone: number;
  requests: number;
  succeeded: number;
  retried: number;
  cachedChunks: number;
  provider?: string;
  model?: string;
  /** Chapter to do first (where you're reading). */
  priorityChapter?: number;
  message?: string;
  errors: { at: number; chunk?: number; message: string }[];
  /** When waiting for free AI capacity to come back. */
  resumeAt?: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  /** Rolling average ms per chunk, for the time estimate. */
  msPerChunk?: number;
}

// ── The resolved graph ────────────────────────────────────────────────

export interface Evidence extends BookLoc {
  text: string;
  quote?: string;
  certainty: Certainty;
}

export interface BookEntity {
  key: string; // stable slug within the book
  type: EntityType;
  name: string;
  aliases: string[];
  titles: string[];
  gender?: 'male' | 'female';
  real?: string;
  /** Latest description, per chapter, so the reader sees one from where they are. */
  descriptions: { chapter: number; para?: number; text: string }[];
  facts: Evidence[];
  mentions: BookLoc[];
  chapters: number[];
  firstChapter: number;
  /** Place lookups (places/regions/polities only). */
  place?: { status: 'resolved' | 'probable' | 'ambiguous' | 'unresolved'; lat?: number; lon?: number; label?: string; placeId?: string; modern?: string; provider?: string };
  /** Kept separate because the name could mean more than one entity. */
  uncertainMerge?: string[];
}

export interface BookRelation {
  from: string; // entity key
  to: string;
  type: string;
  detail?: string;
  /** When the relation held, as the text dates it (A8-045). */
  when?: string;
  loc: BookLoc;
  certainty: Certainty;
}

export interface BookEvent {
  name: string;
  when?: string;
  where?: string; // entity key
  who: string[]; // entity keys
  loc: BookLoc;
  certainty: Certainty;
}

export interface BookGraphRow {
  id: string; // bookId
  bookId: string;
  version: number;
  builtAt: number;
  entities: BookEntity[];
  relations: BookRelation[];
  events: BookEvent[];
}

/** A character X-Ray written from the evidence, up to a chapter. */
export interface XRaySynthesis {
  overview: string;
  appearance?: string;
  personality?: string;
  family?: string;
  relationships?: { name: string; relation: string }[];
  development?: string;
  quotes?: string[];
}

export interface BookXRayRow {
  id: string; // `${bookId}|${key}`
  bookId: string;
  key: string;
  throughChapter: number;
  throughPara?: number;
  /** Hash of the evidence used; new evidence → rewrite. */
  evidenceHash: string;
  data: XRaySynthesis;
  provider?: string;
  createdAt: number;
}

/** Things you removed from a book's X-Ray (wrong or unwanted). */
export interface XRayHiddenRow {
  id: string; // `${bookId}|${normalized name}`
  bookId: string;
  name: string;
  at: number;
}
