// "World of the book" UI pieces shared by the reader's X-Ray and the Book
// World page: analysis progress and controls, entity lists, and evidence-
// based entity cards where every fact links back to the page it came from.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { AIErrorNotice, useAICall, useAIReady } from '../ai/ui';
import { db } from '../db/db';
import type { ConceptKind } from '../db/types';
import { analyzeBook, cancelAnalysis, pauseAnalysis, retryFailed } from '../lib/book/pipeline';
import { atOrBefore, entityUpTo, latestDescription, normName } from '../lib/book/resolve';
import { cachedXRay, synthesizeXRay } from '../lib/book/synthesize';
import type { BookEntity, BookGraphRow, BookJobRow, BookXRayRow, Certainty, EntityType, Evidence } from '../lib/book/types';
import { readerPosKey } from '../lib/ebooks';
import { chapterOfCfi, loadReadingPos } from '../lib/book/text';
import { AIBadge, ProgressBar } from './common';
import { KIND_ICON } from './entity';
import { Icon } from './icons';

export const TYPE_KIND: Record<EntityType, ConceptKind> = {
  character: 'person', place: 'place', region: 'place', polity: 'polity', organization: 'organization', family: 'organization',
  event: 'event', object: 'object', date: 'period', occupation: 'concept', concept: 'concept',
};
export const TYPE_LABEL: Record<EntityType, string> = {
  character: 'Character', place: 'Place', region: 'Region', polity: 'Country / state', organization: 'Organization', family: 'Family',
  event: 'Event', object: 'Object', date: 'Date', occupation: 'Occupation', concept: 'Term',
};
const CERTAINTY: Record<Certainty, { label: string; cls: string; hint: string }> = {
  explicit: { label: 'Stated', cls: 'good', hint: 'The book says this directly.' },
  inferred: { label: 'Inferred', cls: 'warn', hint: 'A reasonable reading of the text, not stated outright.' },
  uncertain: { label: 'Uncertain', cls: 'bad', hint: 'The AI wasn’t sure.' },
};

// ── Data hooks ─────────────────────────────────────────────────────────

/** undefined while loading, null when there's none. */
export const useBookGraph = (bookId: string) => useLiveQuery(async () => (await db.bookGraph.get(bookId)) ?? null, [bookId]);
export const useBookJob = (bookId: string) => useLiveQuery(async () => (await db.bookJobs.get(bookId)) ?? null, [bookId]);
export function useHidden(bookId: string): Set<string> | undefined {
  const rows = useLiveQuery(() => db.xrayHidden.where('bookId').equals(bookId).toArray(), [bookId]);
  return useMemo(() => (rows ? new Set(rows.map((r) => r.name)) : undefined), [rows]);
}
export const isHidden = (hidden: Set<string> | undefined, e: BookEntity) => !!hidden && (hidden.has(normName(e.name)) || hidden.has(e.key));

export async function hideEntity(bookId: string, e: BookEntity) {
  await db.xrayHidden.put({ id: `${bookId}|${e.key}`, bookId, name: e.key, at: Date.now() });
}
export async function unhideEntity(bookId: string, key: string) {
  await db.xrayHidden.delete(`${bookId}|${key}`);
}

/** How far you've read: section and paragraph (paragraph unknown for positions saved before analysis). */
export function readingPos(bookId: string, readerLocation?: string): { chapter: number; para: number } | undefined {
  const exact = loadReadingPos(bookId);
  if (exact) return exact;
  let cfi = readerLocation;
  try { cfi = localStorage.getItem(readerPosKey(bookId)) || cfi; } catch { /* ignore */ }
  const ch = chapterOfCfi(cfi);
  return ch === undefined ? undefined : { chapter: ch, para: 0 };
}

const xrayOffKey = (bookId: string) => `shelf.xrayOff.${bookId}`;
export function xrayOff(bookId: string) { try { return localStorage.getItem(xrayOffKey(bookId)) === '1'; } catch { return false; } }
export function setXrayOff(bookId: string, off: boolean) { try { if (off) localStorage.setItem(xrayOffKey(bookId), '1'); else localStorage.removeItem(xrayOffKey(bookId)); } catch { /* ignore */ } }

// ── Progress & controls ────────────────────────────────────────────────

const STAGE: Record<BookJobRow['stage'], string> = { text: 'Reading the book', extract: 'Finding characters, places and events', resolve: 'Merging names', places: 'Looking up places on the map', done: 'Done' };

function eta(job: BookJobRow): string {
  const left = job.chunks - job.chunksDone - job.chunksFailed;
  if (!job.msPerChunk || left <= 0 || job.status !== 'running') return '';
  const s = Math.round((left * job.msPerChunk) / 2 / 1000);
  return s < 60 ? `about ${s}s left` : `about ${Math.round(s / 60)} min left`;
}

export function AnalysisProgress({ bookId, priorityChapter, compact }: { bookId: string; priorityChapter?: number; compact?: boolean }) {
  const job = useBookJob(bookId);
  const graph = useBookGraph(bookId);
  const ready = useAIReady();
  const [showErrors, setShowErrors] = useState(false);
  if (job === undefined || graph === undefined) return null;
  const counts = graph ? {
    characters: graph.entities.filter((e) => e.type === 'character').length,
    places: graph.entities.filter((e) => e.type === 'place' || e.type === 'region' || e.type === 'polity').length,
    relationships: graph.relations.length,
  } : undefined;
  if (!job) {
    return (
      <div className="notice col gap-8">
        <b>Build a complete X-Ray for this book</b>
        <span className="small">Shelf reads the whole book on this phone and asks a free AI about one part at a time, finding every character, place and event with the page it came from. The part you’re reading is done first.</span>
        {!ready && <span className="small muted">Set up a free AI provider in Settings → AI first.</span>}
        <button className="btn primary" disabled={!ready} onClick={() => analyzeBook(bookId, { priorityChapter })}>Analyze this book</button>
      </div>
    );
  }
  if (compact && job.status === 'done' && !job.chunksFailed) return null;
  const pct = job.chunks ? (job.chunksDone / job.chunks) : 0;
  const running = job.status === 'running' || job.status === 'queued';
  return (
    <div className="card col gap-8" style={{ padding: 14 }}>
      <div className="row between">
        <b>{job.status === 'done' ? '✓ Book analysed' : job.status === 'waiting' ? 'Waiting for free AI' : job.status === 'paused' ? 'Paused' : job.status === 'cancelled' ? 'Cancelled' : job.status === 'error' ? 'Stopped' : job.status === 'queued' ? 'In line…' : STAGE[job.stage]}</b>
        <span className="small muted">{Math.round(pct * 100)}%</span>
      </div>
      <ProgressBar value={pct} good={job.status === 'done'} />
      {job.message && <div className={`small ${job.status === 'error' ? 'bad' : 'muted'}`}>{job.message}</div>}
      {!compact && (
        <div className="small muted" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2px 12px' }}>
          <span>Sections: {job.chaptersDone}/{job.chapters}</span>
          <span>Parts: {job.chunksDone}/{job.chunks}{job.chunksFailed ? ` · ${job.chunksFailed} failed` : ''}</span>
          {counts && <><span>Characters: {counts.characters}</span><span>Places: {counts.places}</span><span>Relationships: {counts.relationships}</span></>}
          <span>AI requests: {job.requests}</span>
          <span>Successful: {job.succeeded}</span>
          <span>Retried: {job.retried}</span>
          {job.cachedChunks > 0 && <span>Reused (unchanged): {job.cachedChunks}</span>}
          {job.provider && <span style={{ gridColumn: '1 / -1' }}>Using: {job.provider}{job.model ? ` · ${job.model}` : ''}</span>}
          {eta(job) && <span style={{ gridColumn: '1 / -1' }}>{eta(job)}</span>}
        </div>
      )}
      {compact && counts && <div className="tiny muted">{counts.characters} characters · {counts.places} places · {job.chunksDone}/{job.chunks} parts</div>}
      <div className="row wrap gap-8">
        {running && <button className="btn sm" onClick={() => pauseAnalysis(bookId)}>Pause</button>}
        {(job.status === 'paused' || job.status === 'cancelled' || job.status === 'error' || job.status === 'waiting') && <button className="btn sm primary" disabled={!ready} onClick={() => analyzeBook(bookId, { priorityChapter })}>Resume</button>}
        {!compact && running && <button className="btn sm ghost" onClick={() => cancelAnalysis(bookId)}>Cancel</button>}
        {job.chunksFailed > 0 && !running && <button className="btn sm" onClick={() => retryFailed(bookId)}>Retry failed</button>}
        {!compact && !running && <button className="btn sm ghost" onClick={() => { if (confirm('Start the analysis again from scratch? This uses AI requests again.')) void analyzeBook(bookId, { restart: true, priorityChapter }); }}>Restart</button>}
        {!compact && job.errors.length > 0 && <button className="btn sm ghost" onClick={() => setShowErrors(!showErrors)}>{showErrors ? 'Hide' : 'View'} errors ({job.errors.length})</button>}
      </div>
      {showErrors && (
        <div className="col gap-4">
          {job.errors.slice(-15).reverse().map((e, i) => <div key={i} className="tiny muted">{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{e.chunk !== undefined ? ` · part ${e.chunk + 1}` : ''}: {e.message}</div>)}
        </div>
      )}
    </div>
  );
}

// ── Lists ──────────────────────────────────────────────────────────────

export function EntityRow({ e, onOpen, onRemove, count }: { e: BookEntity; onOpen: () => void; onRemove?: () => void; count?: number }) {
  const inChapter = count ?? e.mentions.length;
  const desc = latestDescription(e);
  return (
    <div className="li" style={{ alignItems: 'flex-start' }}>
      <button onClick={onOpen} className="row grow" style={{ gap: 12, alignItems: 'flex-start', background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', minWidth: 0, cursor: 'pointer' }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, flex: 'none', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 18 }}>{KIND_ICON[TYPE_KIND[e.type]]}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="li-title" style={{ display: 'block', textTransform: 'none' }}>{e.name}{e.real && e.real.toLowerCase() !== e.name.toLowerCase() ? <span className="faint" style={{ fontWeight: 600 }}> · {e.real}</span> : null}</span>
          {e.aliases.length > 0 && <span className="tiny faint" style={{ display: 'block' }}>also {e.aliases.slice(0, 3).join(', ')}</span>}
          {desc && <span className="small muted clamp-2" style={{ display: 'block' }}>{desc}</span>}
          {e.uncertainMerge && <span className="tiny" style={{ color: 'var(--warn)' }}>Might be {e.uncertainMerge.slice(0, 3).join(' or ')}</span>}
        </span>
      </button>
      {inChapter > 0 && <span className="tiny faint" style={{ flex: 'none', paddingTop: 2 }}>{inChapter}×</span>}
      {onRemove && <button className="btn icon xs ghost" aria-label={`Remove ${e.name} from X-Ray`} title="Remove from X-Ray" onClick={onRemove}><Icon name="x" /></button>}
    </div>
  );
}

// ── Entity detail ──────────────────────────────────────────────────────

function EvidenceItem({ f, title, onJump }: { f: Evidence; title?: string; onJump?: (cfi: string) => void }) {
  const c = CERTAINTY[f.certainty];
  return (
    <div className="row gap-8" style={{ alignItems: 'flex-start' }}>
      <span className={`chip ${c.cls}`} title={c.hint} style={{ minHeight: 20, fontSize: 10.5, padding: '0 7px', flex: 'none' }}>{c.label}</span>
      <span className="small grow">
        {f.text}
        {f.quote && <span className="faint"> — “{f.quote}”</span>}
        {(onJump && f.cfi) ? <button className="why-link" style={{ marginLeft: 6 }} onClick={() => onJump(f.cfi!)}>{title ?? 'Go to page'} →</button> : title ? <span className="tiny faint"> · {title}</span> : null}
      </span>
    </div>
  );
}

export function EntityDetail({ bookId, graph, entityKey, chapter, para, chapterTitle, onJump, onOpenEntity, onMap, onRemoved }: {
  bookId: string;
  graph: BookGraphRow;
  entityKey: string;
  /** Show only what's known up to this point (undefined = whole book). */
  chapter?: number;
  para?: number;
  chapterTitle: (c: number, para?: number) => string;
  onJump?: (cfi: string) => void;
  onOpenEntity: (key: string) => void;
  onMap?: (name: string) => void;
  onRemoved?: () => void;
}) {
  const full = graph.entities.find((e) => e.key === entityKey);
  const e = full && (chapter === undefined ? full : entityUpTo(full, chapter, para));
  const ready = useAIReady();
  const { loading, error, run } = useAICall();
  const [xray, setXray] = useState<BookXRayRow | undefined | null>(undefined);
  const [allFacts, setAllFacts] = useState(false);
  useEffect(() => { if (e) cachedXRay(bookId, e).then((r) => setXray(r ?? null)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bookId, entityKey, e?.facts.length]);
  if (!full) return <div className="small muted">Not found in this book’s analysis.</div>;
  if (!e) return <div className="small muted">{full.name} hasn’t appeared yet where you are — no spoilers.</div>;
  const nameOf = (k: string) => graph.entities.find((x) => x.key === k)?.name ?? k;
  const visible = (loc: { chapter: number; para?: number }) => atOrBefore(loc, chapter, para);
  const rels = graph.relations.filter((r) => (r.from === e.key || r.to === e.key) && visible(r.loc));
  const events = graph.events.filter((ev) => (ev.where === e.key || ev.who.includes(e.key)) && visible(ev.loc));
  const isPlace = e.type === 'place' || e.type === 'region' || e.type === 'polity';
  // People seen in the same paragraphs as this place (or places for a person).
  const together = (() => {
    const locs = new Set(e.mentions.map((m) => `${m.chapter}:${m.para}`));
    return graph.entities.filter((o) => o.key !== e.key && (isPlace ? o.type === 'character' : o.type === 'place' || o.type === 'region' || o.type === 'polity') && o.mentions.some((m) => visible(m) && locs.has(`${m.chapter}:${m.para}`)))
      .map((o) => ({ o, n: o.mentions.filter((m) => locs.has(`${m.chapter}:${m.para}`)).length })).sort((a, b) => b.n - a.n).slice(0, 12).map((x) => x.o);
  })();
  const facts = allFacts ? e.facts : e.facts.slice(0, 12);
  const nChapters = new Set(e.mentions.map((m) => chapterTitle(m.chapter, m.para))).size;
  const write = async () => {
    const r = await run((signal) => synthesizeXRay(bookId, graph, e.key, chapter ?? Math.max(...full.chapters), chapter === undefined ? Infinity : para ?? Infinity, signal));
    if (r) setXray(r);
  };
  const s = xray?.data;
  return (
    <div className="col gap-12">
      <div className="row top gap-12">
        <span style={{ width: 64, height: 76, borderRadius: 12, flex: 'none', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 28 }}>{KIND_ICON[TYPE_KIND[e.type]]}</span>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{TYPE_LABEL[e.type]}{e.real ? ' · real' : ''}</div>
          <div className="book-title" style={{ fontSize: 21 }}>{e.name}</div>
          {e.real && e.real !== e.name && <div className="small muted">{e.real}</div>}
          {(e.aliases.length > 0 || e.titles.length > 0) && <div className="tiny faint">Also called: {[...e.titles, ...e.aliases].slice(0, 8).join(' · ')}</div>}
          <div className="tiny faint">First appears: {chapterTitle(e.mentions[0]?.chapter ?? e.firstChapter, e.mentions[0]?.para)} · in {nChapters} chapter{nChapters === 1 ? '' : 's'}{chapter !== undefined ? ' so far' : ''}</div>
        </div>
      </div>
      {e.uncertainMerge && <div className="notice warn small">“{e.name}” could be {e.uncertainMerge.join(' or ')} — kept separate because the book doesn’t make it clear.</div>}
      {isPlace && e.place && (
        <div className="notice small">
          <b>{e.place.status === 'resolved' ? '📍 Found on the map' : e.place.status === 'probable' ? '📍 Probably this place' : e.place.status === 'ambiguous' ? 'Several places have this name' : 'Not found in historical gazetteers'}</b>
          {e.place.label && <div>{e.place.label}{e.place.lat !== undefined && e.place.lon !== undefined ? ` · ${e.place.lat.toFixed(3)}, ${e.place.lon.toFixed(3)}` : ''}</div>}
          {e.place.provider && <div className="tiny faint">Location from {e.place.provider === 'whg' ? 'World Historical Gazetteer' : e.place.provider === 'wikidata' ? 'Wikidata' : e.place.provider}, not from AI.</div>}
        </div>
      )}
      {onMap && isPlace && <button className="btn primary block" onClick={() => onMap(e.real ?? e.name)}>🗺 View on Historical Map</button>}

      {latestDescription(e) && <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>{latestDescription(e)}</p>}

      {e.type === 'character' && (
        <div className="card" style={{ padding: 12 }}>
          <div className="row between"><b>X-Ray</b>{s && <AIBadge label="AI · from the evidence below" />}</div>
          {s ? (
            <div className="col gap-8 mt-8 small" style={{ lineHeight: 1.55 }}>
              {s.overview && <p style={{ margin: 0 }}>{s.overview}</p>}
              {s.appearance && <div><b>Appearance.</b> {s.appearance}</div>}
              {s.personality && <div><b>Personality.</b> {s.personality}</div>}
              {s.family && <div><b>Family.</b> {s.family}</div>}
              {s.development && <div><b>So far.</b> {s.development}</div>}
              {s.quotes?.length ? <div className="col gap-4">{s.quotes.map((q, i) => <div key={i} className="faint">“{q}”</div>)}</div> : null}
              <div className="tiny faint">Written from facts up to {chapterTitle(xray!.throughChapter, xray!.throughPara)}.</div>
            </div>
          ) : xray === null ? (
            <div className="mt-8 col gap-8">
              <span className="small muted">A short profile written from everything gathered about {e.name} so far (one AI request).</span>
              <button className="btn sm ai" disabled={!ready || loading || e.facts.length === 0} onClick={write}><Icon name="sparkle" />{loading ? 'Writing…' : 'Write X-Ray'}</button>
            </div>
          ) : null}
          <AIErrorNotice error={error} />
        </div>
      )}

      {rels.length > 0 && (
        <div>
          <div className="eyebrow mb-8">Relationships</div>
          <div className="col gap-4">
            {rels.slice(0, 30).map((r, i) => {
              const other = r.from === e.key ? r.to : r.from;
              return (
                <div key={i} className="row gap-8 small" style={{ alignItems: 'baseline' }}>
                  <span className="muted">{r.from === e.key ? r.type : `${nameOf(r.from)} is ${r.type}`}</span>
                  <button className="why-link" onClick={() => onOpenEntity(other)}>{r.from === e.key ? nameOf(r.to) : e.name}</button>
                  {r.certainty !== 'explicit' && <span className="tiny faint">({CERTAINTY[r.certainty].label.toLowerCase()})</span>}
                  {onJump && r.loc.cfi && <button className="why-link tiny" onClick={() => onJump(r.loc.cfi!)}>source</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {together.length > 0 && (
        <div>
          <div className="eyebrow mb-8">{isPlace ? 'Characters here' : 'Places'}</div>
          <div className="row wrap gap-8">{together.map((o) => <button key={o.key} className="chip" onClick={() => onOpenEntity(o.key)}>{KIND_ICON[TYPE_KIND[o.type]]} {o.name}</button>)}</div>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div className="eyebrow mb-8">Events</div>
          <div className="col gap-4">{events.slice(0, 20).map((ev, i) => (
            <div key={i} className="small">• {ev.name}{ev.when ? <span className="faint"> ({ev.when})</span> : null}{ev.where && ev.where !== e.key ? <> at <button className="why-link" onClick={() => onOpenEntity(ev.where!)}>{nameOf(ev.where)}</button></> : null}
              {onJump && ev.loc.cfi && <button className="why-link tiny" style={{ marginLeft: 6 }} onClick={() => onJump(ev.loc.cfi!)}>source</button>}</div>
          ))}</div>
        </div>
      )}

      {e.facts.length > 0 && (
        <div>
          <div className="eyebrow mb-8">What the book says · {e.facts.length}</div>
          <div className="col gap-8">{facts.map((f, i) => <EvidenceItem key={i} f={f} title={chapterTitle(f.chapter, f.para)} onJump={onJump} />)}</div>
          {e.facts.length > facts.length && <button className="btn sm ghost mt-8" onClick={() => setAllFacts(true)}>Show all {e.facts.length}</button>}
        </div>
      )}

      {e.mentions.length > 0 && onJump && (
        <div>
          <div className="eyebrow mb-8">Mentioned in</div>
          <div className="row wrap gap-8">
            {(() => {
              const byTitle = new Map<string, (typeof e.mentions)[number]>();
              for (const m of e.mentions) { const t = chapterTitle(m.chapter, m.para); if (!byTitle.has(t) || (!byTitle.get(t)!.cfi && m.cfi)) byTitle.set(t, m); }
              return [...byTitle.entries()].slice(0, 60).map(([t, m]) => (m.cfi ? <button key={t} className="chip" onClick={() => onJump(m.cfi!)}>{t}</button> : <span key={t} className="chip">{t}</span>));
            })()}
          </div>
        </div>
      )}
      <button className="btn sm ghost danger" style={{ alignSelf: 'flex-start' }} onClick={async () => { await hideEntity(bookId, full); onRemoved?.(); }}>Remove from X-Ray (wrong or not wanted)</button>
    </div>
  );
}

/** Find the graph entity a tapped name refers to (spoiler-safe). */
export function findEntity(graph: BookGraphRow | null | undefined, name: string, chapter?: number, para?: number): BookEntity | undefined {
  if (!graph) return undefined;
  const n = normName(name);
  const hits = graph.entities.filter((e) => (chapter === undefined || (e.mentions[0] && atOrBefore(e.mentions[0], chapter, para))) && [e.name, ...e.aliases, e.real ?? ''].some((a) => a && normName(a) === n));
  if (hits.length <= 1) return hits[0];
  return hits.find((e) => chapter !== undefined && e.chapters.includes(chapter)) ?? hits[0];
}
