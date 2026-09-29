// X-Ray panel and person card for the reader. Photos and biographies come
// from Wikipedia/Wikidata (credited); roles in the story come from the AI and
// are marked as such. Fictional characters get the book's description only.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AIErrorNotice, useAICall, useAIReady } from '../ai/ui';
import { link } from '../db/actions';
import { db } from '../db/db';
import type { ConceptKind } from '../db/types';
import { resolveEntity } from '../lib/entities';
import { guessNames, type Term } from '../lib/entityDetect';
import { type BookCtx, contextWords, type Facts, identifyWithAI, lifeSpan, lookupFacts, scanChapter, type XRayEntry } from '../lib/xray';
import { AIBadge } from './common';
import { KIND_ICON, KIND_LABEL } from './entity';
import { Icon } from './icons';

export interface Mention { cfi: string; snippet: string }

type Filter = 'all' | 'people' | 'places' | 'terms';
const inFilter = (k: ConceptKind, f: Filter) => f === 'all' || (f === 'people' ? k === 'person' : f === 'places' ? k === 'place' || k === 'polity' : k !== 'person' && k !== 'place' && k !== 'polity');

export function XRayPanel({ book, itemId, chapterHref, chapterText, known, onOpen }: {
  book: BookCtx;
  itemId: string;
  chapterHref?: string;
  chapterText: () => string;
  known: Term[];
  onOpen: (e: XRayEntry) => void;
}) {
  const ready = useAIReady();
  const { loading, error, run } = useAICall();
  const id = `xray|${itemId}|${chapterHref ?? ''}`;
  const row = useLiveQuery(() => (chapterHref ? db.entityCache.get(id) : undefined), [id]);
  const [filter, setFilter] = useState<Filter>('all');
  const scan = async () => {
    const text = chapterText();
    const entries = await run((signal) => scanChapter(book, text, signal));
    if (entries && chapterHref) await db.entityCache.put({ id, itemId, href: chapterHref, names: entries, source: 'ai', createdAt: Date.now() });
  };
  // Scan automatically the first time a chapter's X-Ray is opened.
  useEffect(() => {
    if (ready && chapterHref && row === undefined) {
      db.entityCache.get(id).then((r) => { if (!r) scan(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  // Without AI: names you already know plus names spotted in the text.
  const offline = useMemo<XRayEntry[]>(() => {
    if (ready) return [];
    const text = chapterText();
    const seen = new Set<string>();
    const out: XRayEntry[] = [];
    for (const t of known) if (!seen.has(t.name.toLowerCase())) { seen.add(t.name.toLowerCase()); out.push({ name: t.name, kind: t.kind, real: true }); }
    for (const n of guessNames(text, 20)) if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push({ name: n, kind: 'person', real: true }); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, chapterHref, known.length]);

  const entries: XRayEntry[] = ready ? ((row?.names ?? []) as XRayEntry[]) : offline;
  const shown = entries.filter((e) => inFilter(e.kind, filter));
  return (
    <div className="col gap-12">
      <div className="row between">
        <div>
          <div className="book-title" style={{ fontSize: 18 }}>X-Ray</div>
          <div className="tiny faint">{book.chapter ? `In “${book.chapter}”` : 'In this chapter'}</div>
        </div>
        {ready && chapterHref && <button className="btn xs ghost" disabled={loading} onClick={scan}><Icon name="refresh" />{loading ? 'Scanning…' : 'Rescan'}</button>}
      </div>
      <div className="chips-scroll">
        {([['all', 'All'], ['people', '👤 People'], ['places', '📍 Places'], ['terms', '◇ Terms']] as [Filter, string][]).map(([f, l]) => <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{l}</button>)}
      </div>
      {loading && !entries.length && <div className="small muted">Reading this chapter to find who’s who…</div>}
      <AIErrorNotice error={error} />
      {!loading && ready && !entries.length && !error && <div className="small muted">No people or places found in this chapter.</div>}
      {!ready && <div className="tiny faint">Turn on AI in Settings for a full X-Ray with each person’s part in the story. Without it, these are names spotted in the text.</div>}
      <div className="list-card">
        {shown.map((e, i) => <XRayRow key={`${e.name}-${i}`} e={e} book={book} eager={i < 12} onOpen={() => onOpen(e)} />)}
      </div>
      {ready && entries.length > 0 && <div className="tiny faint"><AIBadge label="AI" /> Roles are written by AI from this chapter; photos and dates come from Wikipedia and Wikidata.</div>}
    </div>
  );
}

function useFacts(e: XRayEntry, book: BookCtx, enabled = true, passage = '') {
  const [facts, setFacts] = useState<Facts | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !e.real) { setFacts(null); return; }
    const c = new AbortController();
    setFacts(undefined);
    lookupFacts(e.full ?? e.name, e.full ? [] : contextWords(book, passage), c.signal).then((f) => !c.signal.aborted && setFacts(f ?? null)).catch(() => !c.signal.aborted && setFacts(null));
    return () => c.abort();
  }, [e.full, e.name, e.real, enabled, book.title, passage]);
  return facts;
}

function XRayRow({ e, book, eager, onOpen }: { e: XRayEntry; book: BookCtx; eager: boolean; onOpen: () => void }) {
  const facts = useFacts(e, book, eager);
  const span = facts ? lifeSpan({ ...facts, kind: facts.kind && facts.kind !== 'concept' ? facts.kind : e.kind }) : '';
  return (
    <button className="li" onClick={onOpen} style={{ alignItems: 'flex-start' }}>
      <Photo src={facts?.image} kind={e.kind} size={48} />
      <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
        <span className="li-title" style={{ display: 'block', textTransform: 'none' }}>{e.name}{e.full && e.full.toLowerCase() !== e.name.toLowerCase() ? <span className="faint" style={{ fontWeight: 600 }}> · {e.full}</span> : null}</span>
        {span && <span className="tiny faint" style={{ display: 'block' }}>{span}</span>}
        {e.role && <span className="small muted clamp-2" style={{ display: 'block' }}>{e.role}</span>}
        {!e.real && <span className="tiny faint">Fictional character</span>}
      </span>
      {e.mentions ? <span className="tiny faint" style={{ flex: 'none' }}>{e.mentions}×</span> : null}
    </button>
  );
}

function Photo({ src, kind, size }: { src?: string; kind: ConceptKind; size: number }) {
  const [bad, setBad] = useState(false);
  if (src && !bad) return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: size, height: size * 1.2, objectFit: 'cover', objectPosition: 'top', borderRadius: 10, flex: 'none', background: 'var(--surface-2)' }} />;
  return <span style={{ width: size, height: size * 1.2, borderRadius: 10, flex: 'none', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: size * 0.42 }}>{KIND_ICON[kind]}</span>;
}

/** Full X-Ray card: photo, dates, short biography, and their part in this book. */
export function PersonCard({ entry, book, itemId, passage, mentions, onJump, onAsk, onMap }: {
  entry: XRayEntry;
  book: BookCtx;
  itemId: string;
  passage?: string;
  mentions?: Mention[];
  onJump?: (cfi: string) => void;
  onAsk?: (name: string) => void;
  /** Open the historical map for a place (shown for places, states and events). */
  onMap?: (name: string) => void;
}) {
  const ready = useAIReady();
  const [e, setE] = useState<XRayEntry | null>(entry.full || entry.role || !ready ? entry : null);
  const [err, setErr] = useState('');
  // Work out which person/place the name means, from the book and passage.
  useEffect(() => {
    if (e) return;
    const c = new AbortController();
    identifyWithAI(entry.name, passage ?? '', book, c.signal).then((x) => !c.signal.aborted && setE(x)).catch(() => { if (!c.signal.aborted) { setErr('Couldn’t ask the AI; searching by context instead.'); setE(entry); } });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const facts = useFacts(e ?? entry, book, !!e, passage);
  const [saved, setSaved] = useState(false);
  // Keep who you looked up in your Knowledge Atlas (so it's underlined next time).
  useEffect(() => {
    if (!facts?.qid || saved) return;
    setSaved(true);
    resolveEntity(facts.title, { wikidataId: facts.qid, kind: facts.kind ?? e?.kind })
      .then(async (c) => { await db.concepts.update(c.id, { aliases: [...new Set([...(c.aliases ?? []), entry.name])] }); await link('concept', c.id, 'item', itemId, 'appears in'); })
      .catch(() => {});
  }, [facts?.qid]);
  if (!e) return <div className="small muted" style={{ padding: 8 }}>Working out who “{entry.name}” is in this book…</div>;
  const kind = facts?.kind && facts.kind !== 'concept' ? facts.kind : e.kind;
  const span = facts ? lifeSpan({ ...facts, kind }) : '';
  const mappable = kind === 'place' || kind === 'polity' || kind === 'event';
  return (
    <div className="col gap-12">
      {onMap && mappable && <button className="btn primary block" onClick={() => onMap(e.name)}>🗺 View on Historical Map</button>}
      <div className="row top gap-12">
        <Photo src={facts?.image} kind={kind} size={92} />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{KIND_ICON[kind]} {KIND_LABEL[kind]}</div>
          <div className="book-title" style={{ fontSize: 21 }}>{facts?.title ?? e.full ?? e.name}</div>
          {facts?.description && <div className="small muted">{facts.description}</div>}
          {span && <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>{span}</div>}
        </div>
      </div>
      {e.role && (
        <div className="notice small">
          <div className="row between"><b>In this book</b><AIBadge label="AI" /></div>
          <div className="mt-8">{e.role}</div>
        </div>
      )}
      {facts === undefined && e.real && <div className="small faint">Looking up {e.full ?? e.name}…</div>}
      {facts?.extract && <p className="small" style={{ lineHeight: 1.6, margin: 0 }}>{facts.extract}</p>}
      {facts === null && (e.real ? <div className="small muted">No encyclopedia entry found for “{e.full ?? e.name}”.</div> : <div className="small muted">A fictional character — there’s no encyclopedia entry.</div>)}
      {err && <div className="tiny faint">{err}</div>}
      {facts?.url && <div className="tiny faint">From <a href={facts.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Wikipedia</a> (CC BY-SA){facts.qid ? <> · dates from <a href={`https://www.wikidata.org/wiki/${facts.qid}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Wikidata</a></> : null}.</div>}
      <div className="row wrap gap-8">
        {onAsk && <button className="btn sm ai" onClick={() => onAsk(facts?.title ?? e.full ?? e.name)}><Icon name="sparkle" />Ask AI</button>}
        {facts?.qid && <Link className="btn sm" to="/knowledge">In your Atlas</Link>}
      </div>
      {mentions && mentions.length > 0 && (
        <div>
          <div className="eyebrow mb-8">Mentions in this chapter · {mentions.length}</div>
          <div className="col" style={{ gap: 4 }}>
            {mentions.slice(0, 20).map((m, i) => (
              <button key={i} className="rabbit-node small" style={{ fontWeight: 400 }} onClick={() => onJump?.(m.cfi)}>
                <span>…{m.snippet}…</span><Icon name="arrowRight" className="faint" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
