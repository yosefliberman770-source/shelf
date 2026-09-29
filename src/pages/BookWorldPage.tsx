// The world of a book: analysis progress, and everyone and everywhere in it,
// linked to each other, to the map and back to the exact page in the book.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnalysisProgress, EntityDetail, EntityRow, hideEntity, isHidden, readingPos, TYPE_KIND, unhideEntity, useBookGraph, useHidden } from '../components/bookworld';
import { Segmented, Tabs } from '../components/common';
import { KIND_ICON } from '../components/entity';
import { Icon } from '../components/icons';
import { db } from '../db/db';
import { atOrBefore, entityUpTo } from '../lib/book/resolve';
import { locTitle } from '../lib/book/text';
import type { BookEntity, EntityType } from '../lib/book/types';
import { useLibrary } from '../state/library';

type Tab = 'characters' | 'places' | 'groups' | 'events' | 'relationships' | 'timeline' | 'removed';
const GROUPS: Record<'characters' | 'places' | 'groups', EntityType[]> = {
  characters: ['character'],
  places: ['place', 'region', 'polity'],
  groups: ['organization', 'family', 'event', 'object', 'occupation', 'date', 'concept'],
};

export default function BookWorldPage() {
  const { id, key } = useParams();
  const idx = useLibrary();
  const nav = useNavigate();
  const item = id ? idx.items.get(id) : undefined;
  const graph = useBookGraph(id!);
  const hidden = useHidden(id!);
  const rows = useLiveQuery(async () => new Map((await db.bookText.where('bookId').equals(id!).toArray()).map((t) => [t.chapter, t])), [id]);
  const hasFile = useLiveQuery(async () => (await db.files.where('itemId').equals(id!).count()) > 0, [id]);
  const here = readingPos(id!, item?.readerLocation);
  const [spoilers, setSpoilers] = useState(false);
  const [tab, setTab] = useState<Tab>('characters');
  const [q, setQ] = useState('');
  if (!item) return <div className="page"><h1>Book not found</h1></div>;
  // Not started yet → nothing is "known" in spoiler-free mode.
  const limit = spoilers ? undefined : here ?? { chapter: -1, para: -1 };
  const chapterTitle = (c: number, para?: number) => locTitle(rows?.get(c), para) || `Section ${c + 1}`;
  const jump = (cfi: string) => nav(`/read/${id}?at=${encodeURIComponent(cfi)}`);
  const map = (name: string) => nav(`/read/${id}?map=${encodeURIComponent(name)}`);
  const open = (k: string) => nav(`/world/${id}/${encodeURIComponent(k)}`);
  const known = (graph?.entities ?? []).map((e) => (limit === undefined ? e : entityUpTo(e, limit.chapter, limit.para))).filter((e): e is BookEntity => !!e);
  const nameOf = (k: string) => graph?.entities.find((e) => e.key === k)?.name ?? k;
  const visible = (l: { chapter: number; para?: number }) => atOrBefore(l, limit?.chapter, limit?.para);

  const header = (
    <div className="page-head" style={{ alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <button className="btn sm ghost" style={{ paddingLeft: 0 }} onClick={() => (key ? nav(`/world/${id}`) : nav(`/item/${id}`))}><Icon name="chevronLeft" />{key ? 'Book world' : item.title}</button>
        <h1 style={{ fontSize: 26 }}>{key ? graph?.entities.find((e) => e.key === key)?.name ?? 'Entry' : 'Book world'}</h1>
        {!key && <div className="small muted">{item.title}</div>}
      </div>
    </div>
  );
  const spoilerSwitch = graph && (
    <Segmented size="sm" value={spoilers ? 'all' : 'here'} onChange={(v) => setSpoilers(v === 'all')} options={[{ value: 'here', label: 'Up to my page' }, { value: 'all', label: 'Whole book · spoilers' }]} />
  );

  if (key && graph) {
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        {header}
        <div className="mb-8">{spoilerSwitch}</div>
        <EntityDetail bookId={id!} graph={graph} entityKey={key} chapter={limit?.chapter} para={limit?.para} chapterTitle={chapterTitle} onJump={jump} onOpenEntity={open} onMap={map} onRemoved={() => nav(`/world/${id}`)} />
      </div>
    );
  }

  const list = (types: EntityType[]) => known.filter((e) => types.includes(e.type) && !isHidden(hidden, e) && (!q || [e.name, ...e.aliases].some((n) => n.toLowerCase().includes(q.toLowerCase()))));
  const counts = { characters: list(GROUPS.characters).length, places: list(GROUPS.places).length, groups: list(GROUPS.groups).length };
  const removed = known.filter((e) => isHidden(hidden, e));
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      {header}
      {hasFile === false && <div className="notice warn">Open this book’s ebook file in Shelf first — the analysis reads the book on this device.</div>}
      {hasFile && <AnalysisProgress bookId={id!} priorityChapter={here?.chapter} />}
      {hasFile && <Link className="btn sm mt-8" to={`/read/${id}`}><Icon name="book" />Back to reading</Link>}
      {graph && (
        <div className="col gap-12 mt-16">
          {spoilerSwitch}
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[
            { id: 'characters', label: `Characters · ${counts.characters}` }, { id: 'places', label: `Places · ${counts.places}` }, { id: 'groups', label: `Other · ${counts.groups}` },
            { id: 'events', label: 'Events' }, { id: 'relationships', label: 'Relationships' }, { id: 'timeline', label: 'Timeline' },
            ...(removed.length ? [{ id: 'removed' as Tab, label: `Removed · ${removed.length}` }] : []),
          ]} />
          {(tab === 'characters' || tab === 'places' || tab === 'groups') && (
            <>
              <input className="input sm" placeholder="Find a name…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="list-card">
                {list(GROUPS[tab]).map((e) => <EntityRow key={e.key} e={e} onOpen={() => open(e.key)} onRemove={() => hideEntity(id!, e)} />)}
              </div>
              {!list(GROUPS[tab]).length && <div className="small muted">{!spoilers && !here ? 'Start reading — everyone you meet appears here, with nothing from further on. Or switch to “Whole book” to see everything.' : 'Nothing here yet.'}</div>}
              {tab === 'places' && <div className="tiny faint">Map locations come from historical gazetteers (World Historical Gazetteer or Wikidata), never from the AI.</div>}
            </>
          )}
          {tab === 'events' && (
            <div className="col gap-8">
              {graph.events.filter((e) => visible(e.loc)).map((ev, i) => (
                <div key={i} className="card" style={{ padding: 10 }}>
                  <div className="small"><b>{ev.name}</b>{ev.when && <span className="faint"> · {ev.when}</span>}</div>
                  <div className="tiny muted">
                    {chapterTitle(ev.loc.chapter)}
                    {ev.where && <> · at <button className="why-link" onClick={() => open(ev.where!)}>{nameOf(ev.where)}</button></>}
                    {ev.who.length > 0 && <> · with {ev.who.slice(0, 5).map((w, j) => <span key={w}>{j ? ', ' : ''}<button className="why-link" onClick={() => open(w)}>{nameOf(w)}</button></span>)}</>}
                    {ev.loc.cfi && <> · <button className="why-link" onClick={() => jump(ev.loc.cfi!)}>read it</button></>}
                  </div>
                </div>
              ))}
              {!graph.events.some((e) => visible(e.loc)) && <div className="small muted">No events yet.</div>}
            </div>
          )}
          {tab === 'relationships' && (
            <div className="col gap-4">
              {graph.relations.filter((r) => visible(r.loc)).slice(0, 400).map((r, i) => (
                <div key={i} className="small row wrap gap-4" style={{ borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
                  <button className="why-link" onClick={() => open(r.from)}>{nameOf(r.from)}</button>
                  <span className="muted">{r.type}</span>
                  <button className="why-link" onClick={() => open(r.to)}>{nameOf(r.to)}</button>
                  {r.certainty !== 'explicit' && <span className="tiny faint">({r.certainty})</span>}
                  {r.loc.cfi && <button className="why-link tiny" onClick={() => jump(r.loc.cfi!)}>source</button>}
                </div>
              ))}
            </div>
          )}
          {tab === 'timeline' && (
            <div className="col gap-12">
              {(() => {
                // Group by chapter heading: who and what first appears in each.
                const groups: { title: string; firsts: BookEntity[]; evs: typeof graph.events }[] = [];
                const at = (t: string) => { let g = groups.find((x) => x.title === t); if (!g) { g = { title: t, firsts: [], evs: [] }; groups.push(g); } return g; };
                const items = [
                  ...known.filter((e) => !isHidden(hidden, e) && (e.type === 'character' || e.type === 'place' || e.type === 'polity')).map((e) => ({ loc: e.mentions[0], e })),
                  ...graph.events.filter((ev) => visible(ev.loc)).map((ev) => ({ loc: ev.loc, ev })),
                ].filter((x) => x.loc).sort((a, b) => a.loc.chapter - b.loc.chapter || a.loc.para - b.loc.para);
                for (const x of items) { const g = at(chapterTitle(x.loc.chapter, x.loc.para)); if ('e' in x && x.e) g.firsts.push(x.e); else if ('ev' in x && x.ev) g.evs.push(x.ev); }
                if (!groups.length) return <div className="small muted">{spoilers ? 'Nothing yet.' : 'Start reading — people and places appear here as you meet them.'}</div>;
                return groups.map((g) => (
                  <div key={g.title}>
                    <div className="eyebrow">{g.title}</div>
                    {g.evs.map((ev, i) => <div key={i} className="small">• {ev.name}</div>)}
                    {g.firsts.length > 0 && <div className="row wrap gap-4 mt-4">{g.firsts.slice(0, 20).map((e) => <button key={e.key} className="chip" onClick={() => open(e.key)}>{KIND_ICON[TYPE_KIND[e.type]]} {e.name} <span className="faint">new</span></button>)}</div>}
                  </div>
                ));
              })()}
            </div>
          )}
          {tab === 'removed' && (
            <div className="col gap-4">
              <div className="small muted">Entries you removed. They stay hidden from X-Ray even if the book is analysed again.</div>
              {removed.map((e) => <div key={e.key} className="row between small"><span>{e.name}</span><button className="btn xs" onClick={() => unhideEntity(id!, e.key)}>Restore</button></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
