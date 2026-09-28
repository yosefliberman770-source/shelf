// Helpers for building snapshots in tests and demo data.
import { defaultSettings } from '../db/db';
import type { Item, ReadingInstance, ReadingSession } from '../db/types';
import { fromKey } from './dates';
import type { Snapshot } from './model';

let n = 0;
const id = (p: string) => `${p}${++n}`;

export function emptySnapshot(): Snapshot {
  return {
    items: [], instances: [], sessions: [], notes: [], folders: [], shelves: [], tags: [], authors: [],
    goals: [], projects: [], plans: [], collections: [], concepts: [], links: [], ai: [],
    settings: defaultSettings(),
  };
}

export function makeItem(snap: Snapshot, over: Partial<Item> & { title: string }): { item: Item; instance: ReadingInstance } {
  const itemId = over.id ?? id('item');
  const instance: ReadingInstance = {
    id: id('inst'),
    itemId,
    number: 1,
    status: over.status ?? 'reading',
    position: 0,
    createdAt: 0,
  };
  const item: Item = {
    id: itemId,
    authorIds: [],
    contentType: 'book',
    unit: 'pages',
    genres: [],
    tagIds: [],
    folderIds: [],
    shelfIds: [],
    status: 'reading',
    favorite: false,
    queue: 'now',
    queueOrder: 0,
    source: 'user',
    createdAt: 0,
    updatedAt: 0,
    currentInstanceId: instance.id,
    ...over,
  };
  snap.items.push(item);
  snap.instances.push(instance);
  return { item, instance };
}

export function logSession(
  snap: Snapshot,
  item: Item,
  instance: ReadingInstance,
  date: string,
  amount: number,
  durationSec?: number,
  hour = 20,
): ReadingSession {
  const d = fromKey(date);
  d.setHours(hour, 0, 0, 0);
  const s: ReadingSession = {
    id: id('s'),
    itemId: item.id,
    instanceId: instance.id,
    date,
    startedAt: d.getTime(),
    durationSec,
    amount,
    source: 'user',
    createdAt: d.getTime(),
  };
  snap.sessions.push(s);
  instance.position += amount;
  instance.startedOn ??= date;
  return s;
}
