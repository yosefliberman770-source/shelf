// The whole-book analysis job queue. One book runs at a time; others wait in
// line. Every step is saved as it happens, so closing the app, losing the
// connection or running out of free AI never loses work — the job picks up
// at the next unfinished chunk.
//
// Cost control: one AI request per chunk (~3,500 tokens of text), identical
// chunks are never sent twice (content hash), name merging and place lookups
// use no AI at all, and requests go through the AI manager, which only uses
// free providers unless you've allowed paid AI.
import { AIError, complete, parseJSON, repairJSON } from '../../ai/client';
import { nextAvailableAt } from '../../ai/manager';
import { db } from '../../db/db';
import { savedBookDate } from '../history/placeDetect';
import { historicalPlaces } from '../history/placeService';
import { candidateNames, chunkText, hashChunk, planChunks } from './chunk';
import { EXTRACTION_SYSTEM, extractionPrompt, parseExtraction } from './extractPrompt';
import { resolveBook } from './resolve';
import { bookText, extractBookText } from './text';
import { ANALYSIS_VERSION, type BookChunkRow, type BookGraphRow, type BookJobRow, type BookTextRow, type ChunkExtraction } from './types';

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;
const REBUILD_EVERY = 3;

type Listener = () => void;
const active = new Map<string, AbortController>();
let pumping = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<Listener>();
export function onPipelineChange(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const notify = () => { for (const l of listeners) { try { l(); } catch { /* ignore */ } } };

async function patchJob(id: string, patch: Partial<BookJobRow> | ((j: BookJobRow) => Partial<BookJobRow>)) {
  await db.transaction('rw', db.bookJobs, async () => {
    const j = await db.bookJobs.get(id);
    if (!j) return;
    const p = typeof patch === 'function' ? patch(j) : patch;
    await db.bookJobs.put({ ...j, ...p, updatedAt: Date.now() });
  });
  notify();
}

function newJob(bookId: string, priorityChapter?: number): BookJobRow {
  const now = Date.now();
  return { id: bookId, bookId, version: ANALYSIS_VERSION, status: 'queued', stage: 'text', chapters: 0, chunks: 0, chunksDone: 0, chunksFailed: 0, chaptersDone: 0, requests: 0, succeeded: 0, retried: 0, cachedChunks: 0, priorityChapter, errors: [], startedAt: now, updatedAt: now };
}

// ── Public controls ────────────────────────────────────────────────────

/** Start (or continue) analysing a book. `priorityChapter` is done first. */
export async function analyzeBook(bookId: string, opts: { priorityChapter?: number; restart?: boolean } = {}) {
  const existing = await db.bookJobs.get(bookId);
  if (opts.restart) {
    stop(bookId);
    await db.transaction('rw', [db.bookChunks, db.bookJobs, db.bookGraph, db.bookText, db.bookXray], async () => {
      await db.bookChunks.where('bookId').equals(bookId).delete();
      await db.bookText.where('bookId').equals(bookId).delete();
      await db.bookXray.where('bookId').equals(bookId).delete();
      await db.bookGraph.delete(bookId);
      await db.bookJobs.put(newJob(bookId, opts.priorityChapter));
    });
  } else if (!existing || existing.version !== ANALYSIS_VERSION) {
    await db.bookJobs.put({ ...newJob(bookId, opts.priorityChapter), ...(existing ? { requests: existing.requests, succeeded: existing.succeeded } : {}) });
  } else if (existing.status !== 'running') {
    await db.bookJobs.put({ ...existing, status: 'queued', priorityChapter: opts.priorityChapter ?? existing.priorityChapter, message: undefined, resumeAt: undefined, updatedAt: Date.now() });
  } else if (opts.priorityChapter !== undefined && existing.priorityChapter !== opts.priorityChapter) {
    await patchJob(bookId, { priorityChapter: opts.priorityChapter });
  }
  notify();
  void pump();
}

export async function pauseAnalysis(bookId: string) {
  stop(bookId);
  await patchJob(bookId, { status: 'paused', message: 'Paused. Tap Resume to continue where it stopped.' });
}

export async function cancelAnalysis(bookId: string) {
  stop(bookId);
  await patchJob(bookId, { status: 'cancelled', message: 'Cancelled. What was already analysed is kept.' });
}

export async function retryFailed(bookId: string) {
  await db.bookChunks.where('[bookId+status]').equals([bookId, 'failed']).modify({ status: 'pending', attempts: 0, error: undefined });
  await patchJob(bookId, { chunksFailed: 0 });
  await analyzeBook(bookId);
}

/** Continue jobs that were running or waiting when the app was last closed. */
export async function resumePendingJobs() {
  const jobs = await db.bookJobs.toArray().catch(() => [] as BookJobRow[]);
  for (const j of jobs) {
    if (j.status === 'running') await db.bookJobs.update(j.id, { status: 'queued' });
    if (j.status === 'waiting') scheduleWake(j.id, j.resumeAt);
  }
  void pump();
}

function stop(bookId: string) {
  active.get(bookId)?.abort();
  active.delete(bookId);
  const t = timers.get(bookId);
  if (t) { clearTimeout(t); timers.delete(bookId); }
}

function scheduleWake(bookId: string, at?: number) {
  const t0 = timers.get(bookId);
  if (t0) clearTimeout(t0);
  const ms = Math.max(5_000, (at ?? Date.now() + 60_000) - Date.now());
  timers.set(bookId, setTimeout(() => { timers.delete(bookId); void db.bookJobs.update(bookId, { status: 'queued', message: undefined }).then(() => pump()); }, Math.min(ms, 2 ** 31 - 1)));
}

// ── Runner ─────────────────────────────────────────────────────────────

async function pump() {
  if (pumping || active.size) return;
  pumping = true;
  try {
    const next = (await db.bookJobs.where('status').equals('queued').toArray()).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!next) return;
    const ctrl = new AbortController();
    active.set(next.id, ctrl);
    void run(next.id, ctrl.signal).finally(() => {
      if (active.get(next.id) === ctrl) active.delete(next.id);
      void pump();
    });
  } finally {
    pumping = false;
  }
}

async function run(bookId: string, signal: AbortSignal) {
  await patchJob(bookId, { status: 'running', message: undefined });
  try {
    // 1. The book's text, read locally.
    let text = await bookText(bookId);
    if (!text.length) {
      await patchJob(bookId, { stage: 'text', message: 'Reading the book…' });
      text = await extractBookText(bookId, signal);
      if (!text.length) throw new Error('No readable text was found in this ebook.');
    }
    // 2. Chunks — unchanged chunks keep their results.
    const chunks = await ensureChunks(bookId, text);
    await patchJob(bookId, { stage: 'extract', chapters: text.length, chunks: chunks.length, message: undefined });
    // 3. AI extraction, one chunk at a time per worker.
    const exhausted = await extractAll(bookId, text, signal);
    if (signal.aborted) return;
    // 4. Merge names into one graph (no AI).
    await patchJob(bookId, { stage: 'resolve' });
    await rebuildGraph(bookId, text);
    if (exhausted) {
      const at = nextAvailableAt();
      await patchJob(bookId, { status: 'waiting', resumeAt: at, message: `Free AI capacity is used up for now${at ? ` — it will continue automatically around ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. No paid AI was used. Everything analysed so far is saved.` });
      scheduleWake(bookId, at);
      return;
    }
    // 5. Places → real geographic sources (no AI).
    await patchJob(bookId, { stage: 'places' });
    await resolvePlaces(bookId, signal).catch(() => {});
    if (signal.aborted) return;
    const failed = await db.bookChunks.where('[bookId+status]').equals([bookId, 'failed']).count();
    await patchJob(bookId, { status: 'done', stage: 'done', finishedAt: Date.now(), chunksFailed: failed, message: failed ? `${failed} part${failed === 1 ? '' : 's'} couldn’t be analysed. Tap “Retry failed” to try again.` : undefined });
  } catch (e) {
    if ((e as Error).name === 'AbortError' || signal.aborted) return;
    await patchJob(bookId, (j) => ({ status: 'error', message: (e as Error).message, errors: [...j.errors, { at: Date.now(), message: (e as Error).message }].slice(-50) }));
  }
}

async function ensureChunks(bookId: string, text: BookTextRow[]): Promise<BookChunkRow[]> {
  const plans = planChunks(text);
  const existing = await db.bookChunks.where('bookId').equals(bookId).toArray();
  const byHash = new Map(existing.filter((c) => c.status === 'done').map((c) => [c.hash, c]));
  const rows: BookChunkRow[] = [];
  let reused = 0;
  for (const [index, p] of plans.entries()) {
    const hash = await hashChunk(p.text);
    const prev = byHash.get(hash);
    const same = existing.find((c) => c.index === index && c.hash === hash);
    if (same) { rows.push(same); continue; }
    if (prev) reused++;
    rows.push({ id: `${bookId}|${index}`, bookId, index, chapter: p.chapter, paraStart: p.paraStart, paraEnd: p.paraEnd, hash, chars: p.text.length, status: prev ? 'done' : 'pending', attempts: 0, ...(prev ? { result: prev.result, provider: prev.provider, model: prev.model, doneAt: prev.doneAt } : {}) });
  }
  // A chunk left "running" by a closed app goes back in the queue.
  for (const r of rows) if (r.status === 'running') r.status = 'pending';
  await db.transaction('rw', db.bookChunks, async () => {
    await db.bookChunks.where('bookId').equals(bookId).filter((c) => c.index >= rows.length).delete();
    await db.bookChunks.bulkPut(rows);
  });
  if (reused) await patchJob(bookId, (j) => ({ cachedChunks: j.cachedChunks + reused }));
  await updateCounts(bookId);
  return rows;
}

async function updateCounts(bookId: string) {
  const all = await db.bookChunks.where('bookId').equals(bookId).toArray();
  const byChapter = new Map<number, boolean>();
  for (const c of all) byChapter.set(c.chapter, (byChapter.get(c.chapter) ?? true) && c.status === 'done');
  await patchJob(bookId, { chunks: all.length, chunksDone: all.filter((c) => c.status === 'done').length, chunksFailed: all.filter((c) => c.status === 'failed').length, chaptersDone: [...byChapter.values()].filter(Boolean).length });
}

/** Returns true if it stopped because free AI ran out. */
async function extractAll(bookId: string, text: BookTextRow[], signal: AbortSignal): Promise<boolean> {
  const byChapter = new Map(text.map((t) => [t.chapter, t]));
  const title = await db.items.get(bookId);
  const author = title?.authorIds?.length ? (await db.authors.bulkGet(title.authorIds)).filter(Boolean).map((a) => a!.name).join(', ') : '';
  const book = { title: title?.title ?? 'Unknown', author: author || 'Unknown author' };
  let exhausted = false;
  let sinceRebuild = 0;

  const nextChunk = async (): Promise<BookChunkRow | undefined> => {
    const job = await db.bookJobs.get(bookId);
    const pending = await db.bookChunks.where('[bookId+status]').equals([bookId, 'pending']).toArray();
    if (!pending.length) return undefined;
    const pr = job?.priorityChapter;
    // Where you're reading first, then from the start of the book onwards.
    pending.sort((a, b) => (pr !== undefined ? Number(b.chapter === pr) - Number(a.chapter === pr) : 0) || a.index - b.index);
    const c = pending[0];
    await db.bookChunks.update(c.id, { status: 'running' });
    return c;
  };

  const worker = async () => {
    for (;;) {
      if (signal.aborted || exhausted) return;
      const c = await nextChunk();
      if (!c) return;
      const ch = byChapter.get(c.chapter);
      if (!ch) { await db.bookChunks.update(c.id, { status: 'failed', error: 'Chapter text missing' }); continue; }
      const passage = chunkText(ch.paras, c.paraStart, c.paraEnd);
      const hints = candidateNames(passage, 60).map((n) => n.name);
      const t0 = performance.now();
      try {
        const res = await complete({ task: 'extraction', system: EXTRACTION_SYSTEM, messages: [{ role: 'user', content: extractionPrompt(book, ch.title, passage, hints) }], json: true, maxTokens: 6000 }, signal);
        let data: unknown;
        try { data = parseJSON(res.text); } catch { data = repairJSON(res.text); }
        const result: ChunkExtraction = parseExtraction(data, [c.paraStart, c.paraEnd]);
        await db.bookChunks.update(c.id, { status: 'done', result, provider: res.provider, model: res.model, doneAt: Date.now(), error: undefined });
        const ms = performance.now() - t0;
        await patchJob(bookId, (j) => ({ requests: j.requests + (res.cached ? 0 : 1), succeeded: j.succeeded + 1, provider: res.provider, model: res.model, msPerChunk: j.msPerChunk ? j.msPerChunk * 0.7 + ms * 0.3 : ms, cachedChunks: j.cachedChunks + (res.cached ? 1 : 0) }));
      } catch (e) {
        if ((e as Error).name === 'AbortError' || signal.aborted) { await db.bookChunks.update(c.id, { status: 'pending' }); return; }
        if (e instanceof AIError && (e.kind === 'exhausted' || e.kind === 'unconfigured' || e.kind === 'disabled')) {
          await db.bookChunks.update(c.id, { status: 'pending' });
          if (e.kind !== 'exhausted') throw e;
          exhausted = true;
          return;
        }
        const attempts = c.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await db.bookChunks.update(c.id, { status: failed ? 'failed' : 'pending', attempts, error: (e as Error).message });
        await patchJob(bookId, (j) => ({ requests: j.requests + 1, retried: j.retried + (failed ? 0 : 1), errors: [...j.errors, { at: Date.now(), chunk: c.index, message: (e as Error).message }].slice(-50) }));
      }
      await updateCounts(bookId);
      if (++sinceRebuild >= REBUILD_EVERY) { sinceRebuild = 0; await rebuildGraph(bookId, text); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await updateCounts(bookId);
  return exhausted;
}

/** Rebuild the graph from every finished chunk. Local and quick; keeps place lookups. */
export async function rebuildGraph(bookId: string, text?: BookTextRow[]): Promise<BookGraphRow> {
  const t = text ?? (await bookText(bookId));
  const cfiMap = new Map(t.map((r) => [r.chapter, r.cfis]));
  const done = (await db.bookChunks.where('[bookId+status]').equals([bookId, 'done']).toArray()).sort((a, b) => a.index - b.index);
  const graph = resolveBook(bookId, done.map((c) => ({ index: c.index, chapter: c.chapter, paraStart: c.paraStart, paraEnd: c.paraEnd, result: c.result! })), (ch, p) => cfiMap.get(ch)?.[p] || undefined);
  const prev = await db.bookGraph.get(bookId);
  if (prev) for (const e of graph.entities) { const old = prev.entities.find((o) => o.key === e.key && o.place); if (old) e.place = old.place; }
  await db.bookGraph.put(graph);
  notify();
  return graph;
}

async function resolvePlaces(bookId: string, signal: AbortSignal) {
  const graph = await db.bookGraph.get(bookId);
  if (!graph) return;
  const item = await db.items.get(bookId);
  const places = graph.entities.filter((e) => (e.type === 'place' || e.type === 'region' || e.type === 'polity') && !e.place).slice(0, 60);
  if (!places.length) return;
  const date = savedBookDate(bookId);
  const names = places.map((p) => p.real ?? p.name);
  const res = await historicalPlaces.resolveMany(places.map((_, i) => ({ name: names[i], bookId, bookTitle: item?.title, date, nearbyPlaceNames: names.filter((_, j) => j !== i).slice(0, 8) })), signal);
  const status = { HIGH: 'resolved', MEDIUM: 'probable', LOW: 'probable', AMBIGUOUS: 'ambiguous', UNRESOLVED: 'unresolved' } as const;
  const fresh = await db.bookGraph.get(bookId);
  if (!fresh) return;
  for (const [i, p] of places.entries()) {
    const r = res[i];
    const e = fresh.entities.find((x) => x.key === p.key);
    if (!e || !r || r.error) continue;
    e.place = { status: status[r.status], lat: r.place?.latitude, lon: r.place?.longitude, label: r.place?.canonicalName, placeId: r.place?.id, provider: r.provider };
  }
  await db.bookGraph.put(fresh);
  notify();
}
