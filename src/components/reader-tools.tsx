// The reader's toolbox: Ask AI, Map, Images and Explore, opened over the book
// without losing your page. Everything is tied to one shared entity, so a
// person you tap in the text is the same person on the map, in images, in
// your notes and in your Knowledge Atlas.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import type { Concept, ConceptKind } from '../db/types';
import type { Term } from '../lib/entityDetect';
import { useLibrary } from '../state/library';
import { Atlas } from './atlas';
import { Segmented } from './common';
import { KIND_ICON, KIND_LABEL, useEntity, yearSpan } from './entity';
import { type Mention, PersonCard, XRayPanel } from './xray';
import type { XRayEntry } from '../lib/xray';
import { Icon, type IconName } from './icons';
import { type AIMode, type ReadingContext, ReaderAI } from './reader-ai';
import { VisualExplorer } from './visual';

export type ToolTab = 'ai' | 'xray' | 'map' | 'visual' | 'explore' | 'entity';
export interface Focus { name: string; kind?: ConceptKind; conceptId?: string; passage?: string; entry?: XRayEntry }
export interface ToolState { tab: ToolTab; focus?: Focus; mode?: AIMode; ctx: ReadingContext; scope?: 'page' | 'chapter' | 'book' }

export const TOOLS: { id: Exclude<ToolTab, 'entity'>; icon: IconName; label: string }[] = [
  { id: 'xray', icon: 'user', label: 'X-Ray' },
  { id: 'ai', icon: 'sparkle', label: 'Ask AI' },
  { id: 'explore', icon: 'compass', label: 'Explore' },
];

export function ReaderTools({ state, setState, onClose, found, chapterText, chapterHref, findMentions, onJump }: {
  state: ToolState;
  setState: (s: ToolState) => void;
  onClose: () => void;
  found: { page: Term[]; chapter: Term[] };
  chapterText: () => string;
  chapterHref?: string;
  findMentions?: (name: string) => Mention[];
  onJump?: (cfi: string) => void;
}) {
  const { tab, focus, ctx } = state;
  const idx = useLibrary();
  const go = (patch: Partial<ToolState>) => setState({ ...state, ...patch });
  const openEntity = (name: string, kind?: ConceptKind, conceptId?: string) => go({ tab: 'entity', focus: { name, kind, conceptId }, mode: undefined });
  const book = { title: ctx.title, author: ctx.author, chapter: ctx.chapter };
  // Reuse what X-Ray already worked out about this name in this book.
  const xrayRows = useLiveQuery(() => db.entityCache.where('itemId').equals(ctx.itemId).toArray(), [ctx.itemId]);
  const known = (name: string) => xrayRows?.flatMap((r) => r.names as XRayEntry[]).find((n) => n.name.toLowerCase() === name.toLowerCase() || n.full?.toLowerCase() === name.toLowerCase());
  return (
    <div className="col gap-12">
      <div className="row between" style={{ gap: 6 }}>
        <div className="tool-tabs" role="tablist">
          {TOOLS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => go({ tab: t.id, mode: undefined })}>
              <Icon name={t.icon} /><span>{t.label}</span>
            </button>
          ))}
        </div>
        <button className="btn icon sm ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      {focus && tab !== 'entity' && (
        <div className="row gap-8 small">
          <button className="chip accent" onClick={() => go({ tab: 'entity' })}>{focus.kind ? KIND_ICON[focus.kind] : '◇'} {focus.name}</button>
          <button className="why-link" onClick={() => go({ focus: undefined })}>back to the page</button>
        </div>
      )}
      {tab === 'xray' && <XRayPanel book={book} itemId={ctx.itemId} chapterHref={chapterHref} chapterText={chapterText} known={found.chapter} onOpen={(e) => go({ tab: 'entity', focus: { name: e.name, kind: e.kind, entry: e } })} />}
      {tab === 'entity' && focus && xrayRows !== undefined && (() => {
        const c = focus.conceptId ? idx.concepts.get(focus.conceptId) : undefined;
        const entry: XRayEntry = focus.entry ?? known(focus.name) ?? (c?.wikidataId ? { name: focus.name, full: c.name, kind: c.kind, real: true } : { name: focus.name, kind: focus.kind ?? 'person', real: true });
        return (
          <>
            {focus.entry && <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => go({ tab: 'xray', focus: undefined })}><Icon name="chevronLeft" />X-Ray</button>}
            <PersonCard key={focus.name + (focus.entry?.full ?? '')} entry={entry} book={book} itemId={ctx.itemId} passage={focus.passage} mentions={findMentions?.(focus.name)} onJump={onJump}
              onAsk={(n) => go({ tab: 'ai', focus: { name: n, kind: entry.kind }, mode: 'explain' })} />
          </>
        );
      })()}
      {tab === 'ai' && <ReaderAI key={`${focus?.name ?? ''}|${state.mode ?? ''}|${ctx.selection ?? ''}`} ctx={{ ...ctx, focus: focus?.name }} initialMode={state.mode} onEntity={(n, k) => openEntity(n, k)} />}
      {tab === 'map' && <MapTab ctx={ctx} focus={focus} onPick={(c) => openEntity(c.name, c.kind, c.id)} />}
      {tab === 'visual' && <VisualTab ctx={ctx} focus={focus} />}
      {tab === 'explore' && <ExploreTab state={state} go={go} found={found} openEntity={openEntity} />}
    </div>
  );
}

/** Concepts linked to a book (people, places… that appear in it). */
export function useBookEntities(itemId: string): Concept[] {
  const idx = useLibrary();
  const ids = new Set(idx.snap.links.filter((l) => (l.fromType === 'concept' && l.toType === 'item' && l.toId === itemId) || (l.toType === 'concept' && l.fromType === 'item' && l.fromId === itemId)).map((l) => (l.fromType === 'concept' ? l.fromId : l.toId)));
  return [...ids].map((id) => idx.concepts.get(id)).filter((c): c is Concept => !!c);
}

function MapTab({ ctx, focus, onPick }: { ctx: ReadingContext; focus?: Focus; onPick: (c: Concept) => void }) {
  const idx = useLibrary();
  const book = useBookEntities(ctx.itemId);
  const [everything, setEverything] = useState(false);
  const { concept, busy } = useEntity({ name: focus?.name, conceptId: focus?.conceptId, kind: focus?.kind, itemId: ctx.itemId });
  const list = everything ? idx.snap.concepts : book;
  const all = concept && !list.some((c) => c.id === concept.id) ? [...list, concept] : list;
  return (
    <div className="col gap-8">
      {focus && busy && <div className="small muted">Finding {focus.name} on the map…</div>}
      <div className="row between small">
        <span className="muted">{everything ? 'Everything in your Knowledge Atlas' : `From “${ctx.title}”`}</span>
        <button className="why-link" onClick={() => setEverything((v) => !v)}>{everything ? 'Just this book' : 'Show all my atlas'}</button>
      </div>
      <Atlas concepts={all} focus={focus ? concept : undefined} height="min(46vh, 380px)" onPick={onPick} compact />
    </div>
  );
}

function VisualTab({ ctx, focus }: { ctx: ReadingContext; focus?: Focus }) {
  const { concept } = useEntity({ name: focus?.name, conceptId: focus?.conceptId, kind: focus?.kind, itemId: ctx.itemId });
  const q = focus?.name ?? (ctx.selection && ctx.selection.length < 60 ? ctx.selection : ctx.title);
  return <VisualExplorer query={q} concept={focus ? concept : undefined} itemId={ctx.itemId} />;
}

function ExploreTab({ state, go, found, openEntity }: {
  state: ToolState;
  go: (p: Partial<ToolState>) => void;
  found: { page: Term[]; chapter: Term[] };
  openEntity: (name: string, kind?: ConceptKind, conceptId?: string) => void;
}) {
  const { ctx } = state;
  const scope = state.scope ?? 'page';
  const book = useBookEntities(ctx.itemId);

  const known = scope === 'page' ? found.page : found.chapter;

  return (
    <div className="col gap-12">
      <Segmented options={[{ value: 'page', label: 'This page' }, { value: 'chapter', label: 'This chapter' }, { value: 'book', label: 'This book' }]} value={scope} onChange={(v) => go({ scope: v })} />
      {scope !== 'book' && (
        <>
          <div className="row wrap gap-8">
            <button className="btn sm accent" onClick={() => go({ tab: 'ai', mode: 'summary', focus: undefined })}>⚡ Quick summary</button>
            <button className="btn sm" onClick={() => go({ tab: 'ai', mode: 'context', focus: undefined })}>Background</button>
            <button className="btn sm" onClick={() => go({ tab: 'xray', focus: undefined })}>Who’s who (X-Ray)</button>
            <button className="btn sm" onClick={() => go({ tab: 'ai', mode: 'timeline', focus: undefined })}>Timeline</button>
          </div>
          <Group title={scope === 'page' ? 'Recognised on this page' : 'Recognised in this chapter'} terms={known.map((t) => ({ name: t.name, kind: t.kind, conceptId: t.conceptId }))} onPick={openEntity}
            empty={scope === 'page' ? 'Nothing from your Knowledge Atlas on this page yet.' : 'Nothing from your Knowledge Atlas in this chapter yet.'} />
          <div className="tiny faint">Underlined words in the book are things you’ve already met. Tap one to see who or what it is, or open X-Ray for everyone in this chapter.</div>
        </>
      )}
      {scope === 'book' && (
        <>
          <div className="row wrap gap-8">
            <Link className="btn sm" to={`/item/${ctx.itemId}`}>Book page</Link>
            <button className="btn sm ai" onClick={() => go({ tab: 'ai', mode: 'context', focus: undefined })}><Icon name="sparkle" />Background</button>
          </div>
          <Group title={`In this book · ${book.length}`} terms={book.map((c) => ({ name: c.name, kind: c.kind, conceptId: c.id }))} onPick={openEntity} empty="As you tap names while reading, they collect here — your map of this book." />
          {book.some((c) => c.start !== undefined) && (
            <div>
              <div className="eyebrow mb-8">Timeline</div>
              <div className="col" style={{ gap: 4 }}>
                {book.filter((c) => c.start !== undefined).sort((a, b) => a.start! - b.start!).map((c) => (
                  <button key={c.id} className="rabbit-node" onClick={() => openEntity(c.name, c.kind, c.id)}>
                    <span className="small"><span className="num faint" style={{ display: 'inline-block', minWidth: 96 }}>{yearSpan(c)}</span> {KIND_ICON[c.kind]} {c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Link to="/knowledge" className="small" style={{ fontWeight: 800, color: 'var(--accent-ink)' }}>Open your Knowledge Atlas →</Link>
        </>
      )}
    </div>
  );
}

function Group({ title, terms, onPick, empty, badge }: { title: string; terms: { name: string; kind?: ConceptKind; conceptId?: string }[]; onPick: (n: string, k?: ConceptKind, id?: string) => void; empty?: string; badge?: string }) {
  const uniq = [...new Map(terms.map((t) => [t.conceptId ?? t.name.toLowerCase(), t])).values()];
  return (
    <div>
      <div className="eyebrow mb-8">{title}{badge && <span className="chip ai" style={{ minHeight: 18, fontSize: 10, marginLeft: 6 }}>{badge}</span>}</div>
      {uniq.length === 0 ? <div className="small muted">{empty}</div> : (
        <div className="row wrap gap-4">
          {uniq.map((t) => <button key={t.conceptId ?? t.name} className="chip" title={t.kind ? KIND_LABEL[t.kind] : undefined} onClick={() => onPick(t.name, t.kind, t.conceptId)}>{t.kind ? KIND_ICON[t.kind] : '◇'} {t.name}</button>)}
        </div>
      )}
    </div>
  );
}
