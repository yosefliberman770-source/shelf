// Core data model for Shelf. Every entity lives in one local IndexedDB database
// (see db.ts). Items are single objects referenced by id from folders, shelves,
// projects and collections — never duplicated.

export type ID = string;
/** Local calendar date, `YYYY-MM-DD`, in the user's timezone. */
export type DateKey = string;

export type ContentType =
  | 'book'
  | 'ebook'
  | 'audiobook'
  | 'textbook'
  | 'academic'
  | 'comic'
  | 'article'
  | 'podcast'
  | 'course'
  | 'research'
  | 'other'
  | 'custom';

/**
 * Progress units. Items store progress in the unit's *base* quantity:
 * `hours` is stored internally as minutes and only displayed as hours.
 */
export type UnitKind =
  | 'pages'
  | 'chapters'
  | 'sections'
  | 'minutes'
  | 'hours'
  | 'lessons'
  | 'episodes'
  | 'documents'
  | 'percent'
  | 'custom';

export type Status = 'want' | 'reading' | 'read' | 'paused' | 'dnf';
export type QueueLane = 'now' | 'next' | 'later' | 'paused' | 'finished';
export type Source = 'user' | 'ai' | 'import';

export type ReadingFormat = 'ebook' | 'print' | 'both';

export interface Author {
  id: ID;
  name: string;
  notes?: string;
  createdAt: number;
}

export interface Item {
  id: ID;
  title: string;
  subtitle?: string;
  authorIds: ID[];
  contentType: ContentType;
  customType?: string;
  unit: UnitKind;
  customUnit?: string;
  /** Total length in base units (minutes for hours). 0/undefined = unknown. */
  total?: number;
  /** Print page count if known, independent of the tracking unit. */
  pageCount?: number;
  isbn?: string;
  publisher?: string;
  /** Publication year (can be negative for ancient works). */
  publishedYear?: number;
  description?: string;
  coverUrl?: string;
  /** Custom uploaded cover, stored as a data URL. */
  coverData?: string;
  genres: string[];
  tagIds: ID[];
  folderIds: ID[];
  shelfIds: ID[];
  status: Status;
  favorite: boolean;
  queue: QueueLane;
  queueOrder: number;
  /** Optional per-item daily target, in base units. */
  dailyTarget?: number;
  /** Optional deadline. Undefined = "No deadline yet". */
  deadline?: DateKey;
  /** Historical coverage — when the *subject* happened (years; negative = BCE). */
  histStart?: number;
  histEnd?: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  series?: string;
  language?: string;
  currentInstanceId?: ID;
  lastReadAt?: number;
  /** How you're reading it: the ePub in Shelf, a paper copy, or both. */
  format?: ReadingFormat;
  openLibraryKey?: string;
  /** Last reading position inside an attached ebook file (EPUB CFI). */
  readerLocation?: string;
  /** Bookmarks inside an attached ebook file. */
  bookmarks?: Bookmark[];
  /** Length of the attached ebook in characters (for time-left estimates). */
  ebookChars?: number;
  source: Source;
  createdAt: number;
  updatedAt: number;
}

export interface Bookmark {
  cfi: string;
  label: string;
  /** Fraction of the book (0–1) when known. */
  pct?: number;
  createdAt: number;
}

/** A single reading of an item. Rereads create new instances; history is never overwritten. */
export interface ReadingInstance {
  id: ID;
  itemId: ID;
  number: number;
  status: Status;
  /** Current position in base units. */
  position: number;
  startedOn?: DateKey;
  finishedOn?: DateKey;
  rating?: number; // 0.5..5 in 0.5 steps
  review?: string;
  createdAt: number;
}

export interface ReadingSession {
  id: ID;
  itemId: ID;
  instanceId: ID;
  date: DateKey;
  /** Epoch ms when the session started (or was logged). */
  startedAt: number;
  /** Seconds, if timed or entered. */
  durationSec?: number;
  /** Units read in this session (base units). */
  amount: number;
  from?: number;
  to?: number;
  note?: string;
  source: Source;
  /** Where the reading happened: in Shelf's ebook reader (logged automatically) or a paper copy. */
  medium?: 'ebook' | 'print';
  createdAt: number;
}

export interface Note {
  id: ID;
  itemId?: ID;
  instanceId?: ID;
  kind: 'note' | 'quote' | 'question';
  text: string;
  page?: number;
  chapter?: string;
  section?: string;
  timestamp?: string;
  /** Position inside the item's ebook file (EPUB CFI), for highlights. */
  location?: string;
  tags: string[];
  conceptIds: ID[];
  source: Source;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: ID;
  name: string;
  parentId?: ID;
  icon?: string;
  color?: string;
  description?: string;
  tags: string[];
  notes?: string;
  /** Optional daily goal pace for the folder, in pages/base units. */
  goalPace?: number;
  deadline?: DateKey;
  order: number;
  createdAt: number;
}

export interface Shelf {
  id: ID;
  name: string;
  icon?: string;
  order: number;
  createdAt: number;
}

export interface Tag {
  id: ID;
  name: string;
  color?: string;
}

export type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'annual';
export type GoalMetric = 'pages' | 'minutes' | 'books' | 'units' | 'sessions';

export interface Goal {
  id: ID;
  period: GoalPeriod;
  metric: GoalMetric;
  target: number;
  /** Optional year for annual challenges. */
  year?: number;
  active: boolean;
  createdAt: number;
}

/** A weekly schedule: amount (base units) per weekday, Sunday = 0. */
export type WeekSchedule = [number, number, number, number, number, number, number];

export interface Project {
  id: ID;
  name: string;
  description?: string;
  itemIds: ID[];
  deadline?: DateKey;
  /** Planned pace per eligible day (pages). */
  pace?: number;
  schedule?: WeekSchedule;
  status: 'active' | 'done' | 'archived';
  color?: string;
  source: Source;
  createdAt: number;
}

export type PlanTarget =
  | { kind: 'library' }
  | { kind: 'folder'; id: ID }
  | { kind: 'project'; id: ID }
  | { kind: 'item'; id: ID };

/** Saved hypothetical plan (simulator). Never alters real goals until applied. */
export interface Plan {
  id: ID;
  name: string;
  target: PlanTarget;
  schedule: WeekSchedule;
  excludedDates: DateKey[];
  deadline?: DateKey;
  applied: boolean;
  createdAt: number;
}

export type RuleField =
  | 'pages'
  | 'rating'
  | 'status'
  | 'contentType'
  | 'genre'
  | 'tag'
  | 'folder'
  | 'author'
  | 'publishedYear'
  | 'progress'
  | 'untouchedDays'
  | 'behindSchedule'
  | 'durationHours'
  | 'text'
  | 'favorite';

export type RuleOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains' | 'is';

export interface Rule {
  field: RuleField;
  op: RuleOp;
  value: string | number | boolean;
}

export interface SmartCollection {
  id: ID;
  name: string;
  icon?: string;
  rules: Rule[];
  match: 'all' | 'any';
  createdAt: number;
}

export type ConceptKind = 'concept' | 'subject' | 'person' | 'place' | 'event' | 'period' | 'polity' | 'object' | 'organization' | 'source';

export interface Concept {
  id: ID;
  name: string;
  kind: ConceptKind;
  description?: string;
  parentId?: ID;
  /** For events/periods: years (negative = BCE). */
  start?: number;
  end?: number;
  /** True when the dates are approximate (“c. 500 BC”). */
  approximate?: boolean;
  /** Shared identity: the Wikidata item (e.g. Q1048 for Julius Caesar). */
  wikidataId?: string;
  /** Other names the entity goes by, used to recognise it in books. */
  aliases?: string[];
  /** Map position, when the entity is a place or happened somewhere. */
  lat?: number;
  lon?: number;
  /** Short neutral description from the linked encyclopedia source. */
  summary?: string;
  summarySource?: string;
  imageUrl?: string;
  source: Source;
  createdAt: number;
}

/** A curriculum the reader builds (with optional AI help): levels of resources. */
export interface Curriculum {
  id: ID;
  name: string;
  description?: string;
  goal?: string;
  levels: CurriculumLevel[];
  synthesis?: string;
  status: 'active' | 'done' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface CurriculumLevel {
  id: ID;
  name: string;
  description?: string;
  resources: CurriculumResource[];
  questions?: string[];
}

export type ResourceStatus = 'not-started' | 'reading' | 'completed' | 'skipped' | 'revisit';

export interface CurriculumResource {
  id: ID;
  /** Linked library item when the resource is a book in the library. */
  itemId?: ID;
  title: string;
  author?: string;
  kind: 'book' | 'primary' | 'article' | 'other';
  status: ResourceStatus;
  note?: string;
  /** Why it's here (e.g. an accepted AI suggestion keeps its reason). */
  why?: string;
  source: Source;
}

/** A saved image with full provenance. Never presented as evidence unless it is. */
export interface MediaRecord {
  id: ID;
  provider: 'wikimedia' | 'met';
  objectId: string;
  title: string;
  creator?: string;
  date?: string;
  description?: string;
  institution?: string;
  license?: string;
  rights?: string;
  sourceUrl: string;
  imageUrl: string;
  thumbUrl?: string;
  evidence: EvidenceType;
  retrievedAt: number;
  conceptIds: ID[];
  itemIds: ID[];
}

export type EvidenceType = 'artifact' | 'contemporary' | 'archaeological' | 'photograph' | 'reconstruction' | 'modern' | 'ai' | 'unclassified';

/** Entities found in one chapter of an ebook (cached so books aren't re-analysed). */
export interface EntityCacheRow {
  id: string;
  itemId: ID;
  href: string;
  names: { name: string; kind: ConceptKind; conceptId?: ID; full?: string; real?: boolean; role?: string; mentions?: number }[];
  source: Source;
  createdAt: number;
}

export type NodeType = 'item' | 'author' | 'note' | 'concept' | 'folder' | 'tag' | 'curriculum' | 'media' | 'ai';

export interface Link {
  id: ID;
  fromType: NodeType;
  fromId: ID;
  toType: NodeType;
  toId: ID;
  relation?: string;
  source: Source;
  createdAt: number;
}

export type AIKind =
  | 'recommendation'
  | 'path'
  | 'gap'
  | 'notes-organization'
  | 'learned'
  | 'coach'
  | 'reread'
  | 'comparison'
  | 'book-qa'
  | 'chat'
  | 'tutor';

/** Anything the AI produced and the user chose to keep. Always labelled AI-generated. */
export interface AIRecord {
  id: ID;
  kind: AIKind;
  title: string;
  content: string;
  /** Optional structured payload (e.g. note groupings). */
  data?: unknown;
  scope?: { type: NodeType | 'library'; id?: ID };
  provider?: string;
  model?: string;
  createdAt: number;
}

export interface ActiveTimer {
  id: 'timer';
  itemId: ID;
  startedAt: number;
  /** Accumulated ms from previous running segments. */
  accumulatedMs: number;
  /** Epoch ms of current running segment start; undefined when paused. */
  runningSince?: number;
  startPosition: number;
}

export type ThemePref = 'light' | 'dark' | 'system';

export interface NotificationPrefs {
  daily: { enabled: boolean; time: string };
  goal: boolean;
  behind: boolean;
  finishLine: boolean;
  completion: boolean;
  weekly: { enabled: boolean; weekday: number };
  projectDeadline: { enabled: boolean; daysBefore: number };
}

export interface AISettings {
  enabled: boolean;
  provider: string;
  model: string;
  /** Privacy controls: which categories of data may be sent. */
  share: {
    notes: boolean;
    reviews: boolean;
    readingHistory: boolean;
    ratings: boolean;
  };
}

export interface Settings {
  id: 'settings';
  userName?: string;
  theme: ThemePref;
  /** Weekdays (0=Sun) that don't count as reading days for planning. */
  nonReadingWeekdays: number[];
  /** Specific dates excluded from planning (holidays, vacations). */
  excludedDates: DateKey[];
  /** Weekdays skipped by the streak (neither extend nor break). */
  streakSkipWeekdays: number[];
  streakSkipDates: DateKey[];
  finishLineThreshold: number; // 0..1
  staleDays: number;
  defaultPace: number; // pages/day fallback when there is no history
  quickAmounts: number[];
  paceWindowDays: number;
  notifications: NotificationPrefs;
  ai: AISettings;
  onboarded: boolean;
  /** What the reader said they usually read (optional, from onboarding). */
  interests?: string[];
  /** True while the optional sample library is loaded. */
  sampleData?: boolean;
  createdAt: number;
}

export interface User {
  id: 'me';
  name: string;
  createdAt: number;
}

/** An ebook file (EPUB) stored on this device. Not included in JSON backups. */
export interface EbookFile {
  id: ID;
  itemId: ID;
  name: string;
  size: number;
  blob: Blob;
  /** Cached epub.js locations (JSON) so percentages are instant next time. */
  locations?: string;
  source?: 'file' | 'standardebooks' | 'gutenberg';
  addedAt: number;
}
