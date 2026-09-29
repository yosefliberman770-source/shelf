import Dexie, { type Table } from 'dexie';
import type {
  ActiveTimer,
  AIRecord,
  Author,
  Concept,
  Folder,
  Goal,
  Item,
  Link,
  Note,
  Plan,
  Project,
  ReadingInstance,
  ReadingSession,
  Settings,
  Shelf,
  SmartCollection,
  Tag,
  User,
  EbookFile,
  Curriculum,
  MediaRecord,
  EntityCacheRow,
  PlaceCacheRow,
  AIUsageRow,
  AILogRow,
  AICacheRow,
  PlaceChoiceRow,
  MapBookmarkRow,
  MapNoteRow,
  PlaceVisitRow,
  WorldCacheRow,
  BookWorldRow,
} from './types';
import type { BookChunkRow, BookGraphRow, BookJobRow, BookTextRow, BookXRayRow, XRayHiddenRow } from '../lib/book/types';

export class ShelfDB extends Dexie {
  users!: Table<User, string>;
  settings!: Table<Settings, string>;
  items!: Table<Item, string>;
  authors!: Table<Author, string>;
  instances!: Table<ReadingInstance, string>;
  sessions!: Table<ReadingSession, string>;
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  shelves!: Table<Shelf, string>;
  tags!: Table<Tag, string>;
  goals!: Table<Goal, string>;
  projects!: Table<Project, string>;
  plans!: Table<Plan, string>;
  collections!: Table<SmartCollection, string>;
  concepts!: Table<Concept, string>;
  links!: Table<Link, string>;
  ai!: Table<AIRecord, string>;
  timer!: Table<ActiveTimer, string>;
  files!: Table<EbookFile, string>;
  curricula!: Table<Curriculum, string>;
  media!: Table<MediaRecord, string>;
  entityCache!: Table<EntityCacheRow, string>;
  placeCache!: Table<PlaceCacheRow, string>;
  placeChoices!: Table<PlaceChoiceRow, string>;
  aiUsage!: Table<AIUsageRow, string>;
  aiLog!: Table<AILogRow, number>;
  aiCache!: Table<AICacheRow, string>;
  bookText!: Table<BookTextRow, string>;
  bookChunks!: Table<BookChunkRow, string>;
  bookJobs!: Table<BookJobRow, string>;
  bookGraph!: Table<BookGraphRow, string>;
  bookXray!: Table<BookXRayRow, string>;
  xrayHidden!: Table<XRayHiddenRow, string>;
  mapBookmarks!: Table<MapBookmarkRow, string>;
  mapNotes!: Table<MapNoteRow, string>;
  placeVisits!: Table<PlaceVisitRow, string>;
  worldCache!: Table<WorldCacheRow, string>;
  bookWorld!: Table<BookWorldRow, string>;

  constructor(name = 'shelf') {
    super(name);
    this.version(1).stores({
      users: 'id',
      settings: 'id',
      items: 'id, title, status, queue, contentType, *authorIds, *folderIds, *tagIds, *shelfIds, isbn, updatedAt, lastReadAt',
      authors: 'id, name',
      instances: 'id, itemId, status, finishedOn',
      sessions: 'id, itemId, instanceId, date, startedAt',
      notes: 'id, itemId, instanceId, kind, createdAt, *conceptIds',
      folders: 'id, parentId, name',
      shelves: 'id, name',
      tags: 'id, &name',
      goals: 'id, period',
      projects: 'id, status',
      plans: 'id',
      collections: 'id',
      concepts: 'id, name, kind, parentId',
      links: 'id, [fromType+fromId], [toType+toId]',
      ai: 'id, kind, createdAt',
      timer: 'id',
    });
    // v2: ebook files stored on this device.
    this.version(2).stores({ files: 'id, itemId' });
    // v3: knowledge atlas — curricula, saved images, per-chapter entity cache.
    this.version(3).stores({ concepts: 'id, name, kind, parentId, wikidataId', curricula: 'id, status, updatedAt', media: 'id, provider, objectId', entityCache: 'id, itemId' });
    // Historical place lookups (a local cache, not part of backups) and places the reader picked.
    this.version(4).stores({ placeCache: 'id, placeId, updatedAt', placeChoices: 'id, bookId' });
    // v5: multi-provider AI — usage counts, a request log and cached answers (all local).
    this.version(5).stores({ aiUsage: 'id, day, month, provider', aiLog: '++id, at, provider', aiCache: 'id, createdAt' });
    // v6: whole-book analysis — the book's text, chunk results, jobs, the resolved graph, X-Ray summaries and removed entries.
    this.version(6).stores({ bookText: 'id, bookId', bookChunks: 'id, bookId, [bookId+status]', bookJobs: 'id, status', bookGraph: 'id', bookXray: 'id, bookId', xrayHidden: 'id, bookId' });
    // v7: the historical atlas — saved map views, private place notes, and places met in each book.
    this.version(7).stores({ mapBookmarks: 'id, bookId, createdAt', mapNotes: 'id, placeKey, bookId, updatedAt', placeVisits: 'id, bookId, placeKey, lastAt' });
    // v8: the Historical World — cached answers from live sources, and each book's historical geography.
    this.version(8).stores({ worldCache: 'id, at', bookWorld: 'id, updatedAt' });
  }
}

export const db = new ShelfDB();

export const ALL_TABLES = [
  'users',
  'settings',
  'items',
  'authors',
  'instances',
  'sessions',
  'notes',
  'folders',
  'shelves',
  'tags',
  'goals',
  'projects',
  'plans',
  'collections',
  'concepts',
  'links',
  'ai',
  'timer',
  'curricula',
  'media',
  'placeChoices',
  'xrayHidden',
  'mapBookmarks',
  'mapNotes',
  'placeVisits',
] as const;
export type TableName = (typeof ALL_TABLES)[number];

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    theme: 'system',
    nonReadingWeekdays: [],
    excludedDates: [],
    streakSkipWeekdays: [],
    streakSkipDates: [],
    finishLineThreshold: 0.8,
    staleDays: 30,
    defaultPace: 20,
    quickAmounts: [5, 10, 25, 50],
    paceWindowDays: 14,
    notifications: {
      daily: { enabled: false, time: '20:00' },
      goal: false,
      behind: false,
      finishLine: false,
      completion: true,
      weekly: { enabled: false, weekday: 0 },
      projectDeadline: { enabled: false, daysBefore: 7 },
    },
    ai: {
      enabled: false,
      provider: '',
      model: '',
      share: { notes: true, reviews: true, readingHistory: true, ratings: true },
    },
    onboarded: false,
    createdAt: Date.now(),
  };
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
