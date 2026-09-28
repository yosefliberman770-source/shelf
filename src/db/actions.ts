// All writes to the database go through these functions so invariants hold:
// one Item object per book, progress lives on the current ReadingInstance,
// sessions are the source of truth for statistics, and nothing is lost on
// reread (a new instance is created instead).
import { todayKey, keyFromMs } from '../engine/dates';
import { db, defaultSettings, uid } from './db';
import type {
  AIRecord,
  Concept,
  DateKey,
  Folder,
  Goal,
  Item,
  Link,
  Note,
  NodeType,
  Plan,
  Project,
  QueueLane,
  ReadingInstance,
  ReadingSession,
  Settings,
  SmartCollection,
  Status,
} from './types';

/** Merge stored settings over defaults (safe inside read-only live queries). */
export function withDefaults(s?: Settings): Settings {
  const d = defaultSettings();
  if (!s) return d;
  return { ...d, ...s, notifications: { ...d.notifications, ...s.notifications }, ai: { ...d.ai, ...s.ai, share: { ...d.ai.share, ...s.ai?.share } } };
}

export async function readSettings(): Promise<Settings> {
  return withDefaults(await db.settings.get('settings'));
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  if (!s) await db.settings.put(defaultSettings());
  return withDefaults(s);
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const s = await getSettings();
  await db.settings.put({ ...s, ...patch, id: 'settings' });
}

// ── Authors & tags ─────────────────────────────────────────────────────────

export async function authorIdsFor(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const existing = await db.authors.where('name').equalsIgnoreCase(name).first();
    if (existing) ids.push(existing.id);
    else {
      const id = uid();
      await db.authors.add({ id, name, createdAt: Date.now() });
      ids.push(id);
    }
  }
  return [...new Set(ids)];
}

export async function tagIdsFor(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const existing = (await db.tags.toArray()).find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) ids.push(existing.id);
    else {
      const id = uid();
      await db.tags.add({ id, name });
      ids.push(id);
    }
  }
  return [...new Set(ids)];
}

// ── Items ──────────────────────────────────────────────────────────────────

export interface ItemDraft extends Partial<Omit<Item, 'id' | 'authorIds' | 'tagIds'>> {
  title: string;
  authors?: string[];
  tags?: string[];
  rating?: number;
  review?: string;
  startedOn?: DateKey;
  finishedOn?: DateKey;
  position?: number;
}

export async function addItem(d: ItemDraft): Promise<string> {
  const now = Date.now();
  const id = uid();
  const instId = uid();
  const status: Status = d.status ?? 'want';
  const authorIds = await authorIdsFor(d.authors ?? []);
  const tagIds = await tagIdsFor(d.tags ?? []);
  const total = d.total && d.total > 0 ? d.total : undefined;
  const position = status === 'read' && total ? total : Math.max(0, Math.min(d.position ?? 0, total ?? Infinity));
  const maxOrder = (await db.items.toArray()).reduce((a, i) => Math.max(a, i.queueOrder), 0);
  const item: Item = {
    contentType: 'book',
    unit: 'pages',
    genres: [],
    folderIds: [],
    shelfIds: [],
    favorite: false,
    source: 'user',
    ...stripDraft(d),
    id,
    title: d.title.trim() || 'Untitled',
    authorIds,
    tagIds,
    total,
    status,
    queue: d.queue ?? laneFor(status),
    queueOrder: maxOrder + 1,
    currentInstanceId: instId,
    createdAt: d.createdAt ?? now,
    updatedAt: now,
  };
  const inst: ReadingInstance = {
    id: instId,
    itemId: id,
    number: 1,
    status,
    position,
    startedOn: d.startedOn ?? (status === 'reading' ? todayKey() : undefined),
    finishedOn: d.finishedOn ?? (status === 'read' && !d.source ? todayKey() : undefined),
    rating: d.rating,
    review: d.review,
    createdAt: now,
  };
  await db.transaction('rw', db.items, db.instances, async () => {
    await db.items.add(item);
    await db.instances.add(inst);
  });
  return id;
}

function stripDraft(d: ItemDraft): Partial<Item> {
  const { authors: _a, tags: _t, rating: _r, review: _rv, startedOn: _s, finishedOn: _f, position: _p, ...rest } = d;
  return rest;
}

export function laneFor(status: Status): QueueLane {
  switch (status) {
    case 'reading': return 'now';
    case 'read': return 'finished';
    case 'paused': return 'paused';
    case 'dnf': return 'finished';
    default: return 'later';
  }
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: Date.now() });
}

export async function updateItemAuthors(id: string, names: string[]): Promise<void> {
  await updateItem(id, { authorIds: await authorIdsFor(names) });
}

export async function updateItemTags(id: string, names: string[]): Promise<void> {
  await updateItem(id, { tagIds: await tagIdsFor(names) });
}

export async function deleteItem(id: string): Promise<void> {
  await db.transaction('rw', [db.items, db.instances, db.sessions, db.notes, db.links, db.projects, db.files], async () => {
    await db.items.delete(id);
    await db.files.where('itemId').equals(id).delete();
    await db.instances.where('itemId').equals(id).delete();
    await db.sessions.where('itemId').equals(id).delete();
    await db.notes.where('itemId').equals(id).delete();
    await db.links.filter((l) => (l.fromType === 'item' && l.fromId === id) || (l.toType === 'item' && l.toId === id)).delete();
    for (const p of await db.projects.toArray()) if (p.itemIds.includes(id)) await db.projects.update(p.id, { itemIds: p.itemIds.filter((x) => x !== id) });
  });
}

async function currentInstance(item: Item): Promise<ReadingInstance> {
  let inst = item.currentInstanceId ? await db.instances.get(item.currentInstanceId) : undefined;
  if (!inst) {
    const all = await db.instances.where('itemId').equals(item.id).sortBy('number');
    inst = all[all.length - 1];
  }
  if (!inst) {
    inst = { id: uid(), itemId: item.id, number: 1, status: item.status, position: 0, createdAt: Date.now() };
    await db.instances.add(inst);
    await db.items.update(item.id, { currentInstanceId: inst.id });
  }
  return inst;
}

export async function setStatus(itemId: string, status: Status, date: DateKey = todayKey()): Promise<void> {
  const item = await db.items.get(itemId);
  if (!item) return;
  const inst = await currentInstance(item);
  const instPatch: Partial<ReadingInstance> = { status };
  if (status === 'reading' && !inst.startedOn) instPatch.startedOn = date;
  if (status === 'read') {
    instPatch.finishedOn = inst.finishedOn ?? date;
    instPatch.startedOn = inst.startedOn ?? date;
    if (item.total) instPatch.position = item.total;
  }
  if (status !== 'read') instPatch.finishedOn = undefined;
  await db.transaction('rw', db.items, db.instances, async () => {
    await db.instances.update(inst.id, instPatch);
    await db.items.update(itemId, { status, queue: laneFor(status), updatedAt: Date.now() });
  });
}

// ── Logging ────────────────────────────────────────────────────────────────

export interface LogInput {
  itemId: string;
  /** Amount read (base units). */
  amount?: number;
  /** Absolute new position (base units). */
  to?: number;
  /** Start of a range ("pages 120–145"); amount = to − (from − 1). */
  from?: number;
  durationSec?: number;
  date?: DateKey;
  startedAt?: number;
  note?: string;
  source?: ReadingSession['source'];
}

export interface LogResult {
  session: ReadingSession;
  completed: boolean;
  undo: () => Promise<void>;
}

export async function logProgress(input: LogInput): Promise<LogResult | undefined> {
  const item = await db.items.get(input.itemId);
  if (!item) throw new Error('Item not found');
  const inst = await currentInstance(item);
  const before = { item: { ...item }, inst: { ...inst } };
  let amount: number;
  let from: number | undefined;
  let to: number | undefined;
  if (input.to !== undefined && input.from !== undefined) {
    from = input.from;
    to = input.to;
    amount = to - (from - 1);
  } else if (input.to !== undefined) {
    to = input.to;
    amount = to - inst.position;
    // "Pages 120–145" style ranges only make sense for whole, countable units.
    from = item.unit === 'pages' || item.unit === 'chapters' ? inst.position + 1 : inst.position;
  } else {
    amount = input.amount ?? 0;
    from = item.unit === 'pages' || item.unit === 'chapters' ? inst.position + 1 : inst.position;
    to = inst.position + amount;
  }
  if (!Number.isFinite(amount)) throw new Error('Invalid amount');
  if (amount <= 0 && !input.durationSec) return undefined;
  amount = Math.max(0, amount);
  let newPos = Math.max(inst.position, to ?? inst.position + amount);
  if (item.total) newPos = Math.min(item.total, newPos);
  const date = input.date ?? todayKey();
  const now = Date.now();
  const session: ReadingSession = {
    id: uid(),
    itemId: item.id,
    instanceId: inst.id,
    date,
    startedAt: input.startedAt ?? (input.date && input.date !== todayKey() ? new Date(`${input.date}T12:00:00`).getTime() : now - (input.durationSec ?? 0) * 1000),
    durationSec: input.durationSec,
    amount,
    from,
    to,
    note: input.note?.trim() || undefined,
    source: input.source ?? 'user',
    createdAt: now,
  };
  const completed = !!item.total && newPos >= item.total && inst.status !== 'read';
  await db.transaction('rw', db.items, db.instances, db.sessions, async () => {
    await db.sessions.add(session);
    const instPatch: Partial<ReadingInstance> = { position: newPos };
    if (!inst.startedOn || date < inst.startedOn) instPatch.startedOn = date;
    let status = item.status;
    if (status === 'want' || status === 'paused') status = 'reading';
    if (completed) {
      status = 'read';
      instPatch.finishedOn = date;
    }
    instPatch.status = status;
    await db.instances.update(inst.id, instPatch);
    await db.items.update(item.id, {
      status,
      queue: laneFor(status),
      lastReadAt: Math.max(item.lastReadAt ?? 0, session.startedAt),
      updatedAt: now,
    });
  });
  const undo = async () => {
    await db.transaction('rw', db.items, db.instances, db.sessions, async () => {
      await db.sessions.delete(session.id);
      await db.instances.put(before.inst);
      await db.items.put({ ...before.item, updatedAt: Date.now() });
    });
  };
  return { session, completed, undo };
}

/** Delete a session and recompute the instance position from remaining sessions. */
export async function deleteSession(id: string): Promise<void> {
  const s = await db.sessions.get(id);
  if (!s) return;
  await db.transaction('rw', db.sessions, db.instances, async () => {
    await db.sessions.delete(id);
    const inst = await db.instances.get(s.instanceId);
    if (inst && inst.status !== 'read') {
      const rest = await db.sessions.where('instanceId').equals(inst.id).toArray();
      const maxTo = rest.reduce((a, r) => Math.max(a, r.to ?? 0), 0);
      const sum = rest.reduce((a, r) => a + r.amount, 0);
      await db.instances.update(inst.id, { position: Math.max(maxTo, sum) });
    }
  });
}

export async function updateSession(id: string, patch: Partial<ReadingSession>): Promise<void> {
  await db.sessions.update(id, patch);
}

/** Set position directly (e.g. "I'm on page 250") without inventing a session amount when moving backwards. */
export async function setPosition(itemId: string, position: number): Promise<LogResult | undefined> {
  const item = await db.items.get(itemId);
  if (!item) return;
  const inst = await currentInstance(item);
  if (position > inst.position) return logProgress({ itemId, to: position });
  await db.instances.update(inst.id, { position: Math.max(0, position) });
  return undefined;
}

// ── Timer (persisted so an interrupted timer is never lost) ────────────────

export async function startTimer(itemId: string): Promise<void> {
  const item = await db.items.get(itemId);
  if (!item) return;
  const inst = await currentInstance(item);
  const now = Date.now();
  await db.timer.put({ id: 'timer', itemId, startedAt: now, accumulatedMs: 0, runningSince: now, startPosition: inst.position });
}

export async function pauseTimer(): Promise<void> {
  const t = await db.timer.get('timer');
  if (!t || t.runningSince === undefined) return;
  await db.timer.put({ ...t, accumulatedMs: t.accumulatedMs + (Date.now() - t.runningSince), runningSince: undefined });
}

export async function resumeTimer(): Promise<void> {
  const t = await db.timer.get('timer');
  if (!t || t.runningSince !== undefined) return;
  await db.timer.put({ ...t, runningSince: Date.now() });
}

export function timerElapsedMs(t: { accumulatedMs: number; runningSince?: number }, now = Date.now()): number {
  return t.accumulatedMs + (t.runningSince !== undefined ? now - t.runningSince : 0);
}

export async function discardTimer(): Promise<void> {
  await db.timer.delete('timer');
}

export async function finishTimer(input: { amount?: number; to?: number; note?: string }): Promise<LogResult | undefined> {
  const t = await db.timer.get('timer');
  if (!t) return;
  const durationSec = Math.round(timerElapsedMs(t) / 1000);
  const res = await logProgress({
    itemId: t.itemId,
    amount: input.to === undefined ? input.amount ?? 0 : undefined,
    to: input.to,
    durationSec: Math.max(1, durationSec),
    startedAt: t.startedAt,
    date: keyFromMs(t.startedAt),
    note: input.note,
    source: 'user',
  });
  await db.timer.delete('timer');
  return res;
}

// ── Notes & quotes ─────────────────────────────────────────────────────────

export async function addNote(n: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'tags' | 'conceptIds' | 'source'> & Partial<Pick<Note, 'tags' | 'conceptIds' | 'source'>>): Promise<string> {
  const id = uid();
  let instanceId = n.instanceId;
  if (n.itemId && !instanceId) {
    const item = await db.items.get(n.itemId);
    if (item) instanceId = (await currentInstance(item)).id;
  }
  await db.notes.add({ tags: [], conceptIds: [], source: 'user', ...n, instanceId, id, createdAt: Date.now(), updatedAt: Date.now() });
  return id;
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
  await db.notes.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
  await db.links.filter((l) => (l.fromType === 'note' && l.fromId === id) || (l.toType === 'note' && l.toId === id)).delete();
}

// ── Ratings, reviews, rereads ──────────────────────────────────────────────

export async function updateInstance(id: string, patch: Partial<ReadingInstance>): Promise<void> {
  await db.instances.update(id, patch);
}

export async function startReread(itemId: string): Promise<string | undefined> {
  const item = await db.items.get(itemId);
  if (!item) return;
  const all = await db.instances.where('itemId').equals(itemId).toArray();
  const number = all.reduce((a, i) => Math.max(a, i.number), 0) + 1;
  const inst: ReadingInstance = { id: uid(), itemId, number, status: 'reading', position: 0, startedOn: todayKey(), createdAt: Date.now() };
  await db.transaction('rw', db.items, db.instances, async () => {
    await db.instances.add(inst);
    await db.items.update(itemId, { currentInstanceId: inst.id, status: 'reading', queue: 'now', updatedAt: Date.now() });
  });
  return inst.id;
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function createFolder(f: Partial<Folder> & { name: string }): Promise<string> {
  const id = uid();
  const siblings = await db.folders.filter((x) => x.parentId === f.parentId).count();
  await db.folders.add({ tags: [], order: siblings, createdAt: Date.now(), ...f, id });
  return id;
}

export async function updateFolder(id: string, patch: Partial<Folder>): Promise<void> {
  if (patch.parentId) {
    // Prevent cycles: a folder can't move into its own subtree.
    let p: string | undefined = patch.parentId;
    for (let i = 0; p && i < 64; i++) {
      if (p === id) throw new Error('A folder cannot be moved inside itself.');
      p = (await db.folders.get(p))?.parentId;
    }
  }
  await db.folders.update(id, patch);
}

/** Delete a folder; its subfolders move up to its parent and books keep their other folders. */
export async function deleteFolder(id: string): Promise<void> {
  const f = await db.folders.get(id);
  if (!f) return;
  await db.transaction('rw', db.folders, db.items, async () => {
    await db.folders.where('parentId').equals(id).modify({ parentId: f.parentId });
    await db.items.where('folderIds').equals(id).modify((it: Item) => {
      it.folderIds = it.folderIds.filter((x) => x !== id);
    });
    await db.folders.delete(id);
  });
}

export async function setItemFolders(itemId: string, folderIds: string[]): Promise<void> {
  await updateItem(itemId, { folderIds: [...new Set(folderIds)] });
}

export async function addItemsToFolder(itemIds: string[], folderId: string): Promise<void> {
  for (const id of itemIds) {
    const it = await db.items.get(id);
    if (it && !it.folderIds.includes(folderId)) await db.items.update(id, { folderIds: [...it.folderIds, folderId], updatedAt: Date.now() });
  }
}

// ── Shelves ────────────────────────────────────────────────────────────────

export async function createShelf(name: string, icon?: string): Promise<string> {
  const id = uid();
  await db.shelves.add({ id, name, icon, order: await db.shelves.count(), createdAt: Date.now() });
  return id;
}

export async function renameShelf(id: string, name: string): Promise<void> {
  await db.shelves.update(id, { name });
}

export async function deleteShelf(id: string): Promise<void> {
  await db.transaction('rw', db.shelves, db.items, async () => {
    await db.items.where('shelfIds').equals(id).modify((it: Item) => {
      it.shelfIds = it.shelfIds.filter((x) => x !== id);
    });
    await db.shelves.delete(id);
  });
}

// ── Queue ──────────────────────────────────────────────────────────────────

export async function moveInQueue(itemId: string, lane: QueueLane, beforeItemId?: string): Promise<void> {
  const laneItems = (await db.items.where('queue').equals(lane).toArray()).filter((i) => i.id !== itemId).sort((a, b) => a.queueOrder - b.queueOrder);
  const pos = beforeItemId ? laneItems.findIndex((i) => i.id === beforeItemId) : -1;
  const moving = await db.items.get(itemId);
  if (!moving) return;
  laneItems.splice(pos < 0 ? laneItems.length : pos, 0, moving);
  const statusFor: Partial<Record<QueueLane, Status>> = { now: 'reading', paused: 'paused', finished: 'read', next: 'want', later: 'want' };
  await db.transaction('rw', db.items, db.instances, async () => {
    for (let i = 0; i < laneItems.length; i++) await db.items.update(laneItems[i].id, { queueOrder: i });
  });
  const newStatus = statusFor[lane];
  if (moving.queue !== lane && newStatus && !(lane === 'finished' && moving.status === 'dnf')) {
    if (newStatus !== moving.status) await setStatus(itemId, newStatus);
    await db.items.update(itemId, { queue: lane });
  }
}

// ── Goals, projects, plans, collections ────────────────────────────────────

export async function saveGoal(g: Partial<Goal> & Pick<Goal, 'period' | 'metric' | 'target'>): Promise<string> {
  const id = g.id ?? uid();
  await db.goals.put({ active: true, createdAt: Date.now(), ...g, id });
  return id;
}

export async function deleteGoal(id: string) {
  await db.goals.delete(id);
}

export async function saveProject(p: Partial<Project> & { name: string }): Promise<string> {
  const id = p.id ?? uid();
  const existing = p.id ? await db.projects.get(p.id) : undefined;
  await db.projects.put({ itemIds: [], status: 'active', source: 'user', createdAt: Date.now(), ...existing, ...p, id });
  return id;
}

export async function deleteProject(id: string) {
  await db.projects.delete(id);
}

export async function savePlan(p: Partial<Plan> & Pick<Plan, 'name' | 'target' | 'schedule'>): Promise<string> {
  const id = p.id ?? uid();
  await db.plans.put({ excludedDates: [], applied: false, createdAt: Date.now(), ...p, id });
  return id;
}

export async function deletePlan(id: string) {
  await db.plans.delete(id);
}

export async function saveCollection(c: Partial<SmartCollection> & Pick<SmartCollection, 'name' | 'rules'>): Promise<string> {
  const id = c.id ?? uid();
  await db.collections.put({ match: 'all', createdAt: Date.now(), ...c, id });
  return id;
}

export async function deleteCollection(id: string) {
  await db.collections.delete(id);
}

// ── Knowledge ──────────────────────────────────────────────────────────────

export async function saveConcept(c: Partial<Concept> & Pick<Concept, 'name'>): Promise<string> {
  if (!c.id) {
    const existing = (await db.concepts.toArray()).find((x) => x.name.toLowerCase() === c.name.trim().toLowerCase() && (!c.kind || x.kind === c.kind));
    if (existing) return existing.id;
  }
  const id = c.id ?? uid();
  const prev = c.id ? await db.concepts.get(c.id) : undefined;
  await db.concepts.put({ kind: 'concept', source: 'user', createdAt: Date.now(), ...prev, ...c, name: c.name.trim(), id });
  return id;
}

export async function deleteConcept(id: string): Promise<void> {
  await db.transaction('rw', db.concepts, db.links, db.notes, async () => {
    await db.concepts.where('parentId').equals(id).modify({ parentId: undefined });
    await db.links.filter((l) => (l.fromType === 'concept' && l.fromId === id) || (l.toType === 'concept' && l.toId === id)).delete();
    await db.notes.where('conceptIds').equals(id).modify((n: Note) => {
      n.conceptIds = n.conceptIds.filter((x) => x !== id);
    });
    await db.concepts.delete(id);
  });
}

export async function link(fromType: NodeType, fromId: string, toType: NodeType, toId: string, relation?: string, source: Link['source'] = 'user'): Promise<string> {
  const existing = await db.links
    .filter((l) => (l.fromType === fromType && l.fromId === fromId && l.toType === toType && l.toId === toId) || (l.fromType === toType && l.fromId === toId && l.toType === fromType && l.toId === fromId))
    .first();
  if (existing) return existing.id;
  const id = uid();
  await db.links.add({ id, fromType, fromId, toType, toId, relation, source, createdAt: Date.now() });
  return id;
}

export async function unlink(id: string) {
  await db.links.delete(id);
}

// ── AI records ─────────────────────────────────────────────────────────────

export async function saveAIRecord(r: Omit<AIRecord, 'id' | 'createdAt'>): Promise<string> {
  const id = uid();
  await db.ai.add({ ...r, id, createdAt: Date.now() });
  return id;
}

export async function deleteAIRecord(id: string) {
  await db.ai.delete(id);
}

/** Remove everything the AI produced: saved AI records, AI links, AI concepts, AI notes. */
export async function deleteAllAIData(): Promise<void> {
  await db.transaction('rw', [db.ai, db.links, db.concepts, db.notes], async () => {
    await db.ai.clear();
    await db.links.filter((l) => l.source === 'ai').delete();
    await db.concepts.filter((c) => c.source === 'ai').delete();
    await db.notes.filter((n) => n.source === 'ai').delete();
  });
}
