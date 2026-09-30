// The reader's toolbox: Ask AI, Map, Images and Explore, opened over the book
// without losing your page. Everything is tied to one shared entity, so a
// person you tap in the text is the same person on the map, in images, in
// your notes and in your Knowledge Atlas.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import type { Concept, ConceptKind } from '../db/types';
import type { Term } from '../lib/entityDetect';
import { useLibrary } from '../state/library';
import { Segmented } from './common';
import { KIND_ICON, KIND_LABEL, useEntity, yearSpan } from './entity';
import { type Mention, PersonCard, XRayPanel } from './xray';
import { EntityDetail, findEntity, TYPE_KIND, useBookGraph } from './bookworld';
import { atOrBefore } from '../lib/book/resolve';
import { locTitle } from '../lib/book/text';
import type { MapRequest } from './history/HistoricalMapPanel';
import { detectPlaces, type PlaceMention, screenMentions } from '../lib/history/placeDetect';
import type { EntityCacheRow } from '../db/types';
import type { XRayEntry } from '../lib/xray';
import { Icon, type IconName } from './icons';
import { type AIMode, type ReadingContext, ReaderAI } from './reader-ai';
import { VisualExplorer } from './visual';

export type ToolTab = 'ai' | 'xray' | 'map' | 'visual' | 'explore' | 'entity';
export interface Focus { name: string; kind?: ConceptKind; conceptId?: string; passage?: string; entry?: XRayEntry; /** An entity from the whole-book analysis. */ graphKey?: string }
export interface ToolState { tab: ToolTab; focus?: Focus; mode?: AIMode; ctx: ReadingContext; scope?: 'page' | 'chapter' | 'book' }

export const TOOLS: { id: Exclude<ToolTab, 'entity'>; icon: IconName; label: string }[] = [
  { id: 'xray', icon: 'user', label: 'X-Ray' },
  { id: 'map', icon: 'map', label: 'Map' },
  { id: 'ai', icon: 'sparkle', label: 'Ask AI' },
  { id: 'explore', icon: 'compass', label: 'Explore' },
];

export function ReaderTools({ state, setState, onClose, found, chapterText, chapterHref, findMentions, onJump, onOpenMap }: {
  state: ToolState;
  setState: (s: ToolState) => void;
  onClose: () => void;
  found: { page: Term[]; chapter: Term[] };
  chapterText: () => string;
  chapterHref?: string;
  findMentions?: (name: string) => Mention[];
  onJump?: (cfi: string) => void;
  onOpenMap?: (req: MapRequest) => void;
}) {
  const { tab, focus, ctx } = state;
  const idx = useLibrary();
  const go = (patch: Partial<ToolState>) => setState({ ...state, ...patch });
  const openEntity = (name: string, kind?: ConceptKind, conceptId?: string) => go({ tab: 'entity', focus: { name, kind, conceptId }, mode: undefined });
  const book = { title: ctx.title, author: ctx.author, chapter: ctx.chapter };
  // Reuse what X-Ray already worked out about this name in this book.
  const xrayRows = useLiveQuery(() => db.entityCache.where('itemId').equals(ctx.itemId).toArray(), [ctx.itemId]);
  const known = (name: string) => xrayRows?.flatMap((r) => r.names as XRayEntry[]).find((n) => n.name.toLowerCase() === name.toLowerCase() || n.full?.toLowerCase() === name.toLowerCase());
  const graph = useBookGraph(ctx.itemId);
  const textRows = useLiveQuery(async () => new Map((await db.bookText.where('bookId').equals(ctx.itemId).toArray()).map((t) => [t.chapter, t])), [ctx.itemId]);
  const chapterTitle = (c: number, para?: number) => locTitle(textRows?.get(c), para) || `Section ${c + 1}`;
  const graphEntity = tab === 'entity' && focus ? (focus.graphKey ? graph?.entities.find((e) => e.key === focus.graphKey) : findEntity(graph, focus.name, ctx.spine, ctx.spinePara)) : undefined;
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
      {tab === 'xray' && <XRayPanel book={book} itemId={ctx.itemId} chapterHref={chapterHref} chapterText={chapterText} known={found.chapter} spine={ctx.spine} spinePara={ctx.spinePara} onOpen={(e) => go({ tab: 'entity', focus: { name: e.name, kind: e.kind, entry: e } })} onOpenKey={(key, name) => go({ tab: 'entity', focus: { name, graphKey: key } })} />}
      {tab === 'entity' && focus && graph && graphEntity && (
        <>
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => go({ tab: 'xray', focus: undefined })}><Icon name="chevronLeft" />X-Ray</button>
          <EntityDetail key={graphEntity.key} bookId={ctx.itemId} graph={graph} entityKey={graphEntity.key} chapter={ctx.spine} para={ctx.spinePara} chapterTitle={chapterTitle} onJump={onJump}
            onOpenEntity={(k) => go({ tab: 'entity', focus: { name: graph.entities.find((e) => e.key === k)?.name ?? k, graphKey: k } })}
            onMap={onOpenMap ? (n) => onOpenMap({ name: n, passage: focus.passage }) : undefined}
            onRemoved={() => go({ tab: 'xray', focus: undefined })} />
          {graphEntity.real && (
            <div className="mt-8">
              <div className="eyebrow mb-8">Real-world background</div>
              <PersonCard key={graphEntity.real} entry={{ name: graphEntity.name, full: graphEntity.real, kind: TYPE_KIND[graphEntity.type], real: true }} book={book} itemId={ctx.itemId} passage={focus.passage}
                onAsk={(n) => go({ tab: 'ai', focus: { name: n, kind: TYPE_KIND[graphEntity.type] }, mode: 'explain' })} />
            </div>
          )}
        </>
      )}
      {tab === 'entity' && focus && !graphEntity && xrayRows !== undefined && (() => {
        const c = focus.conceptId ? idx.concepts.get(focus.conceptId) : undefined;
        const entry: XRayEntry = focus.entry ?? known(focus.name) ?? (c?.wikidataId ? { name: focus.name, full: c.name, kind: c.kind, real: true } : { name: focus.name, kind: focus.kind ?? 'person', real: true });
        return (
          <>
            {focus.entry && <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => go({ tab: 'xray', focus: undefined })}><Icon name="chevronLeft" />X-Ray</button>}
            <PersonCard key={focus.name + (focus.entry?.full ?? '')} entry={entry} book={book} itemId={ctx.itemId} passage={focus.passage} mentions={findMentions?.(focus.name)} onJump={onJump}
              onAsk={(n) => go({ tab: 'ai', focus: { name: n, kind: entry.kind }, mode: 'explain' })}
              onMap={onOpenMap ? (n) => onOpenMap({ name: n, passage: focus.passage }) : undefined} />
          </>
        );
      })()}
      {tab === 'ai' && <ReaderAI key={`${focus?.name ?? ''}|${state.mode ?? ''}|${ctx.selection ?? ''}`} ctx={{ ...ctx, focus: focus?.name }} initialMode={state.mode} onEntity={(n, k) => openEntity(n, k)} />}
      {tab === 'map' && onOpenMap && <PlacesTab ctx={ctx} chapterText={chapterText} xrayRows={xrayRows ?? []} onOpenMap={onOpenMap} />}
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

/** Mentions after screening (async); until screening finishes only known names and strong cues are shown. */
function useScreened(ms: PlaceMention[]): PlaceMention[] {
  const key = ms.map((m) => m.name).join('|');
  const [out, setOut] = useState<{ key: string; ms: PlaceMention[] }>();
  useEffect(() => {
    let live = true;
    screenMentions(ms).then((r) => { if (live) setOut({ key, ms: r }); }).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return out?.key === key ? out.ms : ms.filter((m) => m.known || m.evidence.strength === 'strong');
}

/** The Map tab: places named on this page, and the whole chapter on a map. */
function PlacesTab({ ctx, chapterText, xrayRows, onOpenMap }: { ctx: ReadingContext; chapterText: () => string; xrayRows: EntityCacheRow[]; onOpenMap: (r: MapRequest) => void }) {
  const idx = useLibrary();
  // Places and people the whole-book analysis found (up to where you are).
  const graph = useBookGraph(ctx.itemId);
  const seen = (graph?.entities ?? []).filter((e) => e.mentions[0] && atOrBefore(e.mentions[0], ctx.spine, ctx.spinePara));
  const graphNames = (types: string[]) => seen.filter((e) => types.includes(e.type)).flatMap((e) => [e.name, ...e.aliases]);
  const knownPlaces = [
    ...idx.snap.concepts.filter((c) => c.kind === 'place' || c.kind === 'polity').flatMap((c) => [c.name, ...(c.aliases ?? [])]),
    ...xrayRows.flatMap((r) => r.names).filter((n) => n.kind === 'place' || n.kind === 'polity').map((n) => n.name),
    ...graphNames(['place', 'region', 'polity']),
  ].filter((n) => n.length >= 3);
  const people = [
    ...idx.snap.concepts.filter((c) => c.kind === 'person').map((c) => c.name),
    ...xrayRows.flatMap((r) => r.names).filter((n) => n.kind === 'person').map((n) => n.name),
    ...graphNames(['character']),
  ];
  // Capitalised words after a weak cue are only candidates: ordinary English
  // words ("Guild", "Mass") are dropped unless the offline data knows them.
  const onPage = useScreened(detectPlaces(ctx.pageText, knownPlaces, people));
  const inChapter = useScreened(detectPlaces(chapterText(), knownPlaces, people)).filter((p) => !onPage.some((q) => q.name === p.name)).slice(0, 24);
  const open = (name: string, text: string) => {
    const i = text.indexOf(name);
    onOpenMap({ name, passage: i >= 0 ? text.slice(Math.max(0, i - 600), i + 600) : undefined, mentionIndex: i >= 0 ? Math.min(i, 600) : undefined, detection: knownPlaces.includes(name) ? 'known' : 'cue' });
  };
  return (
    <div className="col gap-12">
      <div>
        <div className="book-title" style={{ fontSize: 18 }}>Historical map</div>
        <div className="tiny faint">Tap a place to see it on a map of its own time.</div>
      </div>
      <div>
        <div className="eyebrow mb-8">On this page</div>
        {onPage.length ? <div className="row wrap gap-4">{onPage.map((p) => <button key={p.name} className={`chip ${p.known ? 'accent' : ''}`} onClick={() => open(p.name, ctx.pageText)}>📍 {p.name}</button>)}</div>
          : <div className="small muted">No place names spotted on this page. You can also select a word in the book and tap 🗺 Map.</div>}
      </div>
      {inChapter.length > 0 && (
        <details>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Elsewhere in this chapter ({inChapter.length})</summary>
          <div className="row wrap gap-4 mt-8">{inChapter.map((p) => <button key={p.name} className="chip" onClick={() => open(p.name, chapterText())}>📍 {p.name}</button>)}</div>
        </details>
      )}
      <div className="row wrap gap-8">
        <button className="btn primary" onClick={() => onOpenMap({ mode: 'world' })}>🌍 Show me this world</button>
        <button className="btn" onClick={() => onOpenMap({ mode: 'chapter' })}>🗺 Map this chapter</button>
        <button className="btn ghost" onClick={() => onOpenMap({ mode: 'maps' })}>📜 Historical maps</button>
        <button className="btn ghost" onClick={() => onOpenMap({ mode: 'search' })}><Icon name="search" />Search the map</button>
        <button className="btn ghost" onClick={() => onOpenMap({ mode: 'saved' })}>🔖 Saved & places you’ve met</button>
      </div>
      <div className="tiny faint">Tip: select a longer passage in the book and tap “🗺 Map this passage” to map just those places. Place names with a blue dotted underline can be tapped.</div>
    </div>
  );
}
