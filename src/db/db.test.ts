import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayKey } from '../engine/dates';
import { itemForecast } from '../engine/forecast';
import { LibraryIndex } from '../engine/model';
import {
  addItem, addNote, createFolder, deleteFolder, deleteItem, deleteSession, finishTimer, logProgress, moveInQueue, pauseTimer, readSettings, resumeTimer,
  setStatus, startReread, startTimer, updateInstance, updateFolder,
} from './actions';
import { db } from './db';
import { commitImport, eraseEverything, exportBackup, parseCSV, previewGoodreads, restoreBackup, toCSV } from './portability';

async function snapshot() {
  return new LibraryIndex({
    items: await db.items.toArray(), instances: await db.instances.toArray(), sessions: await db.sessions.toArray(), notes: await db.notes.toArray(),
    folders: await db.folders.toArray(), shelves: await db.shelves.toArray(), tags: await db.tags.toArray(), authors: await db.authors.toArray(),
    goals: await db.goals.toArray(), projects: await db.projects.toArray(), plans: await db.plans.toArray(), collections: await db.collections.toArray(),
    concepts: await db.concepts.toArray(), links: await db.links.toArray(), ai: await db.ai.toArray(), settings: await readSettings(),
  });
}

beforeEach(async () => {
  await eraseEverything();
});

describe('logging', () => {
  it('logs amounts, positions and ranges and updates status', async () => {
    const id = await addItem({ title: 'SPQR', authors: ['Mary Beard'], total: 608 });
    expect((await db.items.get(id))!.status).toBe('want');
    await logProgress({ itemId: id, amount: 20 });
    let idx = await snapshot();
    expect(idx.position(idx.items.get(id)!)).toBe(20);
    expect(idx.items.get(id)!.status).toBe('reading');
    await logProgress({ itemId: id, to: 50 });
    await logProgress({ itemId: id, from: 51, to: 75 });
    idx = await snapshot();
    expect(idx.position(idx.items.get(id)!)).toBe(75);
    expect(idx.sessions.map((s) => s.amount)).toEqual([20, 30, 25]);
  });

  it('undo restores the exact previous state', async () => {
    const id = await addItem({ title: 'X', total: 100 });
    await logProgress({ itemId: id, amount: 10 });
    const res = await logProgress({ itemId: id, amount: 90 });
    expect(res!.completed).toBe(true);
    expect((await db.items.get(id))!.status).toBe('read');
    await res!.undo();
    const idx = await snapshot();
    expect(idx.items.get(id)!.status).toBe('reading');
    expect(idx.position(idx.items.get(id)!)).toBe(10);
    expect(idx.sessions).toHaveLength(1);
  });

  it('clamps to total and rejects invalid input', async () => {
    const id = await addItem({ title: 'X', total: 100 });
    await logProgress({ itemId: id, amount: 250 });
    const idx = await snapshot();
    expect(idx.position(idx.items.get(id)!)).toBe(100);
    await expect(logProgress({ itemId: id, amount: NaN })).rejects.toThrow();
    expect(await logProgress({ itemId: id, amount: 0 })).toBeUndefined();
  });

  it('deleting a session recomputes position', async () => {
    const id = await addItem({ title: 'X', total: 300 });
    await logProgress({ itemId: id, amount: 40 });
    const s2 = await logProgress({ itemId: id, amount: 60 });
    await deleteSession(s2!.session.id);
    const idx = await snapshot();
    expect(idx.position(idx.items.get(id)!)).toBe(40);
  });

  it('timer survives pause/resume and records duration', async () => {
    const id = await addItem({ title: 'X', total: 300 });
    await startTimer(id);
    const t = await db.timer.get('timer');
    await db.timer.put({ ...t!, startedAt: Date.now() - 20 * 60_000, runningSince: Date.now() - 20 * 60_000 });
    await pauseTimer();
    await resumeTimer();
    const res = await finishTimer({ amount: 30 });
    expect(res!.session.durationSec).toBeGreaterThanOrEqual(20 * 60 - 1);
    expect(res!.session.amount).toBe(30);
    expect(await db.timer.get('timer')).toBeUndefined();
  });
});

describe('rereading', () => {
  it('keeps separate histories per reading instance', async () => {
    const id = await addItem({ title: 'Meditations', total: 200 });
    await logProgress({ itemId: id, amount: 200, date: addDays(todayKey(), -400) });
    const first = (await db.instances.where('itemId').equals(id).toArray())[0];
    await updateInstance(first.id, { rating: 4, review: 'Good' });
    await startReread(id);
    await logProgress({ itemId: id, amount: 50 });
    await addNote({ itemId: id, kind: 'note', text: 'second time' });
    const idx = await snapshot();
    const insts = idx.instancesByItem.get(id)!;
    expect(insts).toHaveLength(2);
    expect(insts[0].status).toBe('read');
    expect(insts[0].rating).toBe(4);
    expect(insts[1].position).toBe(50);
    expect(idx.items.get(id)!.status).toBe('reading');
    expect(idx.snap.notes[0].instanceId).toBe(insts[1].id);
    expect(itemForecast(idx, idx.items.get(id)!).completed).toBe(50);
  });
});

describe('folders', () => {
  it('a book in many folders is one object; deleting a folder re-parents children', async () => {
    const h = await createFolder({ name: 'History' });
    const r = await createFolder({ name: 'Rome', parentId: h });
    const rep = await createFolder({ name: 'Republic', parentId: r });
    const id = await addItem({ title: 'SPQR', total: 600, folderIds: [rep, h] });
    await logProgress({ itemId: id, amount: 100 });
    let idx = await snapshot();
    expect(idx.itemsInFolder(h)).toHaveLength(1);
    expect(idx.position(idx.itemsInFolder(rep)[0])).toBe(100);
    await expect(updateFolder(h, { parentId: rep })).rejects.toThrow();
    await deleteFolder(r);
    idx = await snapshot();
    expect(idx.folders.get(rep)!.parentId).toBe(h);
    expect(idx.items.get(id)!.folderIds.sort()).toEqual([h, rep].sort());
  });

  it('deleting an item removes its sessions and notes', async () => {
    const id = await addItem({ title: 'X', total: 100 });
    await logProgress({ itemId: id, amount: 10 });
    await addNote({ itemId: id, kind: 'quote', text: 'q' });
    await deleteItem(id);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
  });
});

describe('queue', () => {
  it('moving lanes changes status', async () => {
    const id = await addItem({ title: 'X', total: 100 });
    await moveInQueue(id, 'now');
    expect((await db.items.get(id))!.status).toBe('reading');
    await moveInQueue(id, 'paused');
    expect((await db.items.get(id))!.status).toBe('paused');
    await setStatus(id, 'read');
    const inst = (await db.instances.where('itemId').equals(id).toArray())[0];
    expect(inst.finishedOn).toBe(todayKey());
    expect(inst.position).toBe(100);
  });
});

describe('portability', () => {
  it('CSV round trip with quotes and newlines', () => {
    const rows = [{ a: 'hello, "world"', b: 'line1\nline2', c: 3 }];
    const parsed = parseCSV(toCSV(rows));
    expect(parsed[1]).toEqual(['hello, "world"', 'line1\nline2', '3']);
  });

  it('Goodreads preview, merge without overwriting, and duplicate handling', async () => {
    const existing = await addItem({ title: 'Rubicon', authors: ['Tom Holland'], total: 464 });
    await updateInstance((await db.instances.where('itemId').equals(existing).first())!.id, { rating: 5 });
    const csv = [
      'Book Id,Title,Author,Additional Authors,ISBN,ISBN13,My Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review',
      '1,Rubicon,Tom Holland,,="0385503059",="9780385503051",3,Anchor,Paperback,464,2003,2003,2024/05/01,2024/01/01,history,read,',
      '2,Dune,Frank Herbert,,,="9780441172719",5,Ace,Paperback,617,1990,1965,2023/02/10,2023/01/01,"sci-fi, favorites",read,Loved it',
      '3,New Book,Someone,,,,0,,Kindle Edition,,,,,2024/01/01,,to-read,',
    ].join('\n');
    const rows = await previewGoodreads(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].action).toBe('merge');
    expect(rows[1].draft.finishedOn).toBe('2023-02-10');
    expect(rows[1].shelves).toEqual(['sci-fi', 'favorites']);
    expect(rows[2].draft.contentType).toBe('ebook');
    const res = await commitImport(rows);
    expect(res).toEqual({ added: 2, merged: 1, skipped: 0 });
    const rub = await db.instances.where('itemId').equals(existing).first();
    expect(rub!.rating).toBe(5); // not overwritten
    expect((await db.items.get(existing))!.isbn).toBe('9780385503051'); // filled in
    const dune = (await db.items.toArray()).find((i) => i.title === 'Dune')!;
    const dInst = await db.instances.where('itemId').equals(dune.id).first();
    expect(dInst!.finishedOn).toBe('2023-02-10');
    expect(dInst!.review).toBe('Loved it');
    expect((await db.shelves.toArray()).map((s) => s.name).sort()).toEqual(["favorites", "history", "sci-fi"]);
  });

  it('backup and restore round trip', async () => {
    const id = await addItem({ title: 'X', total: 100 });
    await logProgress({ itemId: id, amount: 10 });
    const b = await exportBackup();
    await eraseEverything();
    expect(await db.items.count()).toBe(0);
    await restoreBackup(b, 'replace');
    expect(await db.items.count()).toBe(1);
    expect(await db.sessions.count()).toBe(1);
  });
});
