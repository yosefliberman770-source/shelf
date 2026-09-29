// The reader's toolbox: Ask AI, Map, Images and Explore, opened over the book
// without losing your page. Everything is tied to one shared entity, so a
// person you tap in the text is the same person on the map, in images, in
// your notes and in your Knowledge Atlas.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM } from '../ai/context';
import { AIErrorNotice, useAICall, useAIReady } from '../ai/ui';
import { db } from '../db/db';
import type { Concept, ConceptKind } from '../db/types';
import { guessNames, type Term } from '../lib/entityDetect';
import { useLibrary } from '../state/library';
import { Atlas } from './atlas';
import { Segmented } from './common';
import { EntityCard, KIND_ICON, KIND_LABEL, useEntity, yearSpan } from './entity';
import { Icon, type IconName } from './icons';
import { type AIMode, type ReadingContext, ReaderAI } from './reader-ai';
import { VisualExplorer } from './visual';

export type ToolTab = 'ai' | 'map' | 'visual' | 'explore' | 'entity';
export interface Focus { name: string; kind?: ConceptKind; conceptId?: string }
export interface ToolState { tab: ToolTab; focus?: Focus; mode?: AIMode; ctx: ReadingContext; scope?: 'page' | 'chapter' | 'book' }

export const TOOLS: { id: Exclude<ToolTab, 'entity'>; icon: IconName; label: string }[] = [
  { id: 'ai', icon: 'sparkle', label: 'Ask AI' },
  { id: 'map', icon: 'map', label: 'Map' },
  { id: 'visual', icon: 'layers', label: 'Images' },
  { id: 'explore', icon: 'compass', label: 'Explore' },
];

const ENTITY_KINDS: ConceptKind[] = ['person', 'place', 'event', 'polity', 'organization', 'period', 'source', 'object', 'concept'];

export function ReaderTools({ state, setState, onClose, found, chapterText, chapterHref }: {
  state: ToolState;
  setState: (s: ToolState) => void;
  onClose: () => void;
  found: { page: Term[]; chapter: Term[] };
  chapterText: () => string;
  chapterHref?: string;
}) {
  const { tab, focus, ctx } = state;
  const go = (patch: Partial<ToolState>) => setState({ ...state, ...patch });
  const openEntity = (name: string, kind?: ConceptKind, conceptId?: string) => go({ tab: 'entity', focus: { name, kind, conceptId }, mode: undefined });
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
      {tab === 'entity' && focus && (
        <EntityCard key={focus.conceptId ?? focus.name} name={focus.name} conceptId={focus.conceptId} kind={focus.kind} itemId={ctx.itemId}
          onTool={(t, c) => go({ tab: t, focus: { name: c.name, kind: c.kind, conceptId: c.id } })} />
      )}
      {tab === 'ai' && <ReaderAI key={`${focus?.name ?? ''}|${state.mode ?? ''}|${ctx.selection ?? ''}`} ctx={{ ...ctx, focus: focus?.name }} initialMode={state.mode} onEntity={(n, k) => openEntity(n, k)} />}
      {tab === 'map' && <MapTab ctx={ctx} focus={focus} onPick={(c) => openEntity(c.name, c.kind, c.id)} />}
      {tab === 'visual' && <VisualTab ctx={ctx} focus={focus} />}
      {tab === 'explore' && <ExploreTab state={state} go={go} found={found} chapterText={chapterText} chapterHref={chapterHref} openEntity={openEntity} />}
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

interface Extracted { entities: { name: string; kind: ConceptKind }[] }

function ExploreTab({ state, go, found, chapterText, chapterHref, openEntity }: {
  state: ToolState;
  go: (p: Partial<ToolState>) => void;
  found: { page: Term[]; chapter: Term[] };
  chapterText: () => string;
  chapterHref?: string;
  openEntity: (name: string, kind?: ConceptKind, conceptId?: string) => void;
}) {
  const { ctx } = state;
  const scope = state.scope ?? 'page';
  const ready = useAIReady();
  const { loading, error, run } = useAICall();
  const book = useBookEntities(ctx.itemId);
  const cacheId = `${ctx.itemId}|${chapterHref ?? ''}`;
  const cached = useLiveQuery(() => (chapterHref ? db.entityCache.get(cacheId) : undefined), [cacheId]);
  const [guesses, setGuesses] = useState<string[] | null>(null);

  const extract = async () => {
    const text = chapterText().slice(0, 7000);
    const r = await run((signal) => completeJSON<Extracted>({
      system: `${BASE_SYSTEM}\nReturn JSON {"entities":[{"name":"full common name","kind":"person|place|event|polity|organization|period|source|object|concept"}]}. List only real, named historical or real-world people, places, events, states, groups, periods, texts and objects that are mentioned in the excerpt (max 30). Use the fullest common name (e.g. "Hannibal", "Battle of Cannae"). No fictional or generic items.`,
      messages: [{ role: 'user', content: `Book: "${ctx.title}" by ${ctx.author}${ctx.chapter ? `, chapter "${ctx.chapter}"` : ''}.\n\nExcerpt:\n"""${text}"""` }],
      maxTokens: 1200,
    }, signal));
    if (!r || !chapterHref) return;
    const names = (r.data.entities ?? []).filter((e) => e?.name && ENTITY_KINDS.includes(e.kind)).slice(0, 30);
    await db.entityCache.put({ id: cacheId, itemId: ctx.itemId, href: chapterHref, names, source: 'ai', createdAt: Date.now() });
  };

  const known = scope === 'page' ? found.page : found.chapter;
  const knownNames = new Set(known.map((t) => t.name.toLowerCase()));
  const aiNames = (cached?.names ?? []).filter((n) => !knownNames.has(n.name.toLowerCase()));

  return (
    <div className="col gap-12">
      <Segmented options={[{ value: 'page', label: 'This page' }, { value: 'chapter', label: 'This chapter' }, { value: 'book', label: 'This book' }]} value={scope} onChange={(v) => go({ scope: v })} />
      {scope !== 'book' && (
        <>
          <div className="row wrap gap-8">
            <button className="btn sm accent" onClick={() => go({ tab: 'ai', mode: 'summary', focus: undefined })}>⚡ Quick summary</button>
            <button className="btn sm" onClick={() => go({ tab: 'ai', mode: 'context', focus: undefined })}>Background</button>
            <button className="btn sm" onClick={() => go({ tab: 'ai', mode: 'people', focus: undefined })}>Who’s who</button>
            <button className="btn sm" onClick={() => go({ tab: 'ai', mode: 'timeline', focus: undefined })}>Timeline</button>
          </div>
          <Group title={scope === 'page' ? 'Recognised on this page' : 'Recognised in this chapter'} terms={known.map((t) => ({ name: t.name, kind: t.kind, conceptId: t.conceptId }))} onPick={openEntity}
            empty={scope === 'page' ? 'Nothing from your Knowledge Atlas on this page yet.' : 'Nothing from your Knowledge Atlas in this chapter yet.'} />
          {aiNames.length > 0 && <Group title="Found by AI in this chapter" badge="AI" terms={aiNames} onPick={openEntity} />}
          {chapterHref && ready && (
            <button className="btn ai sm" style={{ alignSelf: 'flex-start' }} disabled={loading} onClick={extract}>
              <Icon name="sparkle" />{loading ? 'Reading the chapter…' : cached ? 'Look again for people, places & events' : 'Find people, places & events in this chapter'}
            </button>
          )}
          <AIErrorNotice error={error} />
          {!ready && (
            guesses
              ? <Group title="Possible names (automatic guess)" terms={guesses.map((n) => ({ name: n }))} onPick={openEntity} empty="No names spotted." />
              : <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setGuesses(guessNames(scope === 'page' ? ctx.pageText : chapterText()))}>Spot names {scope === 'page' ? 'on this page' : 'in this chapter'}</button>
          )}
          <div className="tiny faint">Underlined words in the book are things you’ve already met. Tap one to see who or what it is. {ready ? 'Finding names sends a short excerpt of this chapter (not the book) to your AI.' : ''}</div>
        </>
      )}
      {scope === 'book' && (
        <>
          <div className="row wrap gap-8">
            <Link className="btn sm" to={`/item/${ctx.itemId}`}>Book page</Link>
            <button className="btn sm" onClick={() => go({ tab: 'map', focus: undefined })}><Icon name="map" />Map this book</button>
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
