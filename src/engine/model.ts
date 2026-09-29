// In-memory index over a full snapshot of the database. All deterministic
// engines (forecasting, statistics, streaks, search) read from this.
import type {
  AIRecord,
  Curriculum,
  MediaRecord,
  Author,
  Concept,
  DateKey,
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
} from '../db/types';
import { type DayRules, todayKey } from './dates';
import { UNITS } from './units';

export interface Snapshot {
  items: Item[];
  instances: ReadingInstance[];
  sessions: ReadingSession[];
  notes: Note[];
  folders: Folder[];
  shelves: Shelf[];
  tags: Tag[];
  authors: Author[];
  goals: Goal[];
  projects: Project[];
  plans: Plan[];
  collections: SmartCollection[];
  concepts: Concept[];
  links: Link[];
  ai: AIRecord[];
  curricula: Curriculum[];
  media: MediaRecord[];
  settings: Settings;
}

export class LibraryIndex {
  readonly snap: Snapshot;
  readonly today: DateKey;
  readonly items = new Map<string, Item>();
  readonly authors = new Map<string, Author>();
  readonly folders = new Map<string, Folder>();
  readonly tags = new Map<string, Tag>();
  readonly shelves = new Map<string, Shelf>();
  readonly concepts = new Map<string, Concept>();
  readonly projects = new Map<string, Project>();
  readonly instances = new Map<string, ReadingInstance>();
  readonly instancesByItem = new Map<string, ReadingInstance[]>();
  readonly sessionsByItem = new Map<string, ReadingSession[]>();
  readonly sessionsByInstance = new Map<string, ReadingSession[]>();
  readonly notesByItem = new Map<string, Note[]>();
  readonly childFolders = new Map<string | undefined, Folder[]>();
  /** Sessions sorted ascending by startedAt. */
  readonly sessions: ReadingSession[];
  readonly planningRules: DayRules;
  readonly streakRules: DayRules;

  private _pagesPerMinute?: number | null;
  private _familySpeed = new Map<string, number | null>();

  constructor(snap: Snapshot, today: DateKey = todayKey()) {
    this.snap = snap;
    this.today = today;
    for (const i of snap.items) this.items.set(i.id, i);
    for (const a of snap.authors) this.authors.set(a.id, a);
    for (const f of snap.folders) {
      this.folders.set(f.id, f);
      const k = f.parentId && snap.folders.some((p) => p.id === f.parentId) ? f.parentId : undefined;
      const arr = this.childFolders.get(k) ?? [];
      arr.push(f);
      this.childFolders.set(k, arr);
    }
    for (const arr of this.childFolders.values()) arr.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    for (const t of snap.tags) this.tags.set(t.id, t);
    for (const s of snap.shelves) this.shelves.set(s.id, s);
    for (const c of snap.concepts) this.concepts.set(c.id, c);
    for (const p of snap.projects) this.projects.set(p.id, p);
    for (const ins of snap.instances) {
      this.instances.set(ins.id, ins);
      push(this.instancesByItem, ins.itemId, ins);
    }
    for (const arr of this.instancesByItem.values()) arr.sort((a, b) => a.number - b.number);
    this.sessions = [...snap.sessions].sort((a, b) => a.startedAt - b.startedAt);
    for (const s of this.sessions) {
      push(this.sessionsByItem, s.itemId, s);
      push(this.sessionsByInstance, s.instanceId, s);
    }
    for (const n of snap.notes) if (n.itemId) push(this.notesByItem, n.itemId, n);
    this.planningRules = { weekdays: snap.settings.nonReadingWeekdays, dates: snap.settings.excludedDates };
    this.streakRules = { weekdays: snap.settings.streakSkipWeekdays, dates: snap.settings.streakSkipDates };
  }

  get settings() {
    return this.snap.settings;
  }

  itemList(): Item[] {
    return this.snap.items;
  }

  authorNames(item: Item): string[] {
    return item.authorIds.map((id) => this.authors.get(id)?.name).filter((x): x is string => !!x);
  }

  authorLine(item: Item): string {
    const n = this.authorNames(item);
    return n.length ? n.join(', ') : 'Unknown author';
  }

  currentInstance(item: Item): ReadingInstance | undefined {
    if (item.currentInstanceId) {
      const i = this.instances.get(item.currentInstanceId);
      if (i) return i;
    }
    const list = this.instancesByItem.get(item.id);
    return list?.[list.length - 1];
  }

  /** Current position (base units). A finished item counts as its total. */
  position(item: Item): number {
    const inst = this.currentInstance(item);
    if (!inst) return 0;
    if (inst.status === 'read' && item.total) return item.total;
    return Math.max(0, inst.position);
  }

  rating(item: Item): number | undefined {
    const list = this.instancesByItem.get(item.id) ?? [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].rating) return list[i].rating;
    return undefined;
  }

  /** Folder plus all descendant folder ids. */
  folderTree(id: string): string[] {
    const out: string[] = [];
    const walk = (fid: string, depth: number) => {
      if (depth > 64 || out.includes(fid)) return;
      out.push(fid);
      for (const c of this.childFolders.get(fid) ?? []) walk(c.id, depth + 1);
    };
    walk(id, 0);
    return out;
  }

  folderPath(id: string): Folder[] {
    const path: Folder[] = [];
    let f = this.folders.get(id);
    for (let i = 0; f && i < 64; i++) {
      path.unshift(f);
      f = f.parentId ? this.folders.get(f.parentId) : undefined;
    }
    return path;
  }

  /** Unique items in a folder and all its descendants. */
  itemsInFolder(id: string, recursive = true): Item[] {
    const ids = new Set(recursive ? this.folderTree(id) : [id]);
    return this.snap.items.filter((i) => i.folderIds.some((f) => ids.has(f)));
  }

  itemsInProject(p: Project): Item[] {
    return p.itemIds.map((id) => this.items.get(id)).filter((x): x is Item => !!x);
  }

  lastReadDate(item: Item): DateKey | undefined {
    const list = this.sessionsByItem.get(item.id);
    return list?.length ? list[list.length - 1].date : undefined;
  }

  /**
   * Pages read per minute from timed page-based sessions, used to convert time
   * budgets and audio. null when there isn't enough timed data.
   */
  pagesPerMinute(): number | null {
    if (this._pagesPerMinute !== undefined) return this._pagesPerMinute;
    this._pagesPerMinute = this.familySpeedPerMinute('pages');
    return this._pagesPerMinute;
  }

  /** Units per minute for a unit family, from timed sessions. */
  familySpeedPerMinute(family: string): number | null {
    if (this._familySpeed.has(family)) return this._familySpeed.get(family)!;
    let amount = 0;
    let sec = 0;
    for (const s of this.sessions) {
      if (!s.durationSec || s.durationSec < 60 || s.amount <= 0) continue;
      const item = this.items.get(s.itemId);
      if (!item || UNITS[item.unit]?.family !== family) continue;
      amount += s.amount;
      sec += s.durationSec;
    }
    const v = sec >= 600 ? amount / (sec / 60) : null;
    this._familySpeed.set(family, v);
    return v;
  }

  /**
   * Convert base units of an item into page-equivalents so mixed-format
   * folders/projects can share a single forecast. Returns undefined if no
   * honest conversion exists (e.g. lessons of unknown size).
   */
  pageEquivalent(item: Item, base: number): number | undefined {
    const fam = UNITS[item.unit]?.family;
    if (fam === 'pages') return base;
    if (item.pageCount && item.total) return (base / item.total) * item.pageCount;
    if (item.unit === 'percent' && item.pageCount) return (base / 100) * item.pageCount;
    return undefined;
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export function isUnfinished(item: Item): boolean {
  return item.status === 'want' || item.status === 'reading' || item.status === 'paused';
}
