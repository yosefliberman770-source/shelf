// Knowledge Atlas views: everyone, everywhere and everything you've met in
// your reading, seen as people, a timeline, a map, by book, as questions,
// and as a plain history of your interests (descriptive — never a score).
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AskChip } from '../ai/ui';
import type { Concept, ConceptKind, Item } from '../db/types';
import type { LibraryIndex } from '../engine/model';
import { monthName } from '../engine/dates';
import { Atlas } from './atlas';
import { Cover, Empty, Segmented } from './common';
import { KIND_ICON, KIND_LABEL, yearSpan } from './entity';

type View = 'people' | 'timeline' | 'map' | 'books' | 'questions' | 'interests';

/** Books each concept is linked to. */
export function booksByConcept(idx: LibraryIndex): Map<string, Item[]> {
  const m = new Map<string, Set<string>>();
  for (const l of idx.snap.links) {
    let c: string | undefined;
    let i: string | undefined;
    if (l.fromType === 'concept' && l.toType === 'item') { c = l.fromId; i = l.toId; }
    else if (l.toType === 'concept' && l.fromType === 'item') { c = l.toId; i = l.fromId; }
    if (!c || !i) continue;
    if (!m.has(c)) m.set(c, new Set());
    m.get(c)!.add(i);
  }
  return new Map([...m].map(([c, s]) => [c, [...s].map((id) => idx.items.get(id)).filter((x): x is Item => !!x)]));
}

const ENTITY_KINDS: ConceptKind[] = ['person', 'place', 'event', 'polity', 'period', 'organization', 'source', 'object', 'concept'];
const eraY = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);

export function AtlasHome({ idx }: { idx: LibraryIndex }) {
  const nav = useNavigate();
  const [view, setView] = useState<View>('people');
  const byConcept = useMemo(() => booksByConcept(idx), [idx]);
  const ents = idx.snap.concepts.filter((c) => c.kind !== 'subject');
  const counts = { person: 0, place: 0, event: 0 } as Record<string, number>;
  for (const c of ents) counts[c.kind === 'polity' ? 'place' : c.kind] = (counts[c.kind === 'polity' ? 'place' : c.kind] ?? 0) + 1;
  if (!ents.length)
    return (
      <div className="card">
        <Empty illustration="map" title="Your reading universe starts here" action={<Link className="btn primary" to="/reading/ebooks">Open a book</Link>}>
          While you read an ebook, tap underlined names — or use Explore → “Find people, places & events” — and everyone and everywhere you meet collects here, linked across all your books.
        </Empty>
      </div>
    );
  return (
    <div className="col gap-16">
      <div className="row wrap gap-8">
        <span className="pill">👤 {counts.person ?? 0} people</span>
        <span className="pill">📍 {counts.place ?? 0} places</span>
        <span className="pill">⚔️ {counts.event ?? 0} events</span>
        <span className="pill">📚 {new Set([...byConcept.values()].flat().map((i) => i.id)).size} books connected</span>
      </div>
      <Segmented value={view} onChange={setView} options={[{ value: 'people', label: 'Who & what' }, { value: 'timeline', label: 'Timeline' }, { value: 'map', label: 'Map' }, { value: 'books', label: 'Books' }, { value: 'questions', label: 'Questions' }, { value: 'interests', label: 'Interests' }]} />
      {view === 'people' && <EntityList ents={ents} byConcept={byConcept} />}
      {view === 'timeline' && <Timeline ents={ents} byConcept={byConcept} />}
      {view === 'map' && <Atlas concepts={ents} height="min(58vh, 520px)" onPick={(c) => nav(`/knowledge/concept/${c.id}`)} />}
      {view === 'books' && <BooksUniverse idx={idx} byConcept={byConcept} />}
      {view === 'questions' && <Questions idx={idx} />}
      {view === 'interests' && <Interests idx={idx} />}
    </div>
  );
}

function EntityList({ ents, byConcept }: { ents: Concept[]; byConcept: Map<string, Item[]> }) {
  const [kind, setKind] = useState<ConceptKind | 'all'>('all');
  const [q, setQ] = useState('');
  const kinds = ENTITY_KINDS.filter((k) => ents.some((c) => c.kind === k));
  const list = ents.filter((c) => (kind === 'all' || c.kind === kind) && (!q || `${c.name} ${(c.aliases ?? []).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (byConcept.get(b.id)?.length ?? 0) - (byConcept.get(a.id)?.length ?? 0) || a.name.localeCompare(b.name));
  return (
    <>
      <input className="input" placeholder="Find a person, place, event…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find in your atlas" />
      <div className="chips-scroll">
        <button className={`chip ${kind === 'all' ? 'on' : ''}`} onClick={() => setKind('all')}>All</button>
        {kinds.map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND_ICON[k]} {KIND_LABEL[k]}</button>)}
      </div>
      <div className="list-card">
        {list.map((c) => {
          const books = byConcept.get(c.id) ?? [];
          return (
            <Link key={c.id} to={`/knowledge/concept/${c.id}`} className="li">
              {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" style={{ width: 38, height: 38, borderRadius: 12, objectFit: 'cover', flex: 'none' }} onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} /> : <span className="li-ico" style={{ background: 'var(--surface-2)', fontSize: 17 }}>{KIND_ICON[c.kind]}</span>}
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="li-title" style={{ display: 'block', textTransform: 'none' }}>{c.name}</span>
                <span className="li-sub ellipsis" style={{ display: 'block' }}>{[KIND_LABEL[c.kind], yearSpan(c), books.length ? `in ${books.length} book${books.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
              </span>
              {books.length > 1 && <span className="chip accent" style={{ minHeight: 22, fontSize: 11 }}>{books.length} books</span>}
            </Link>
          );
        })}
        {!list.length && <div className="small muted" style={{ padding: 14 }}>Nothing matches.</div>}
      </div>
    </>
  );
}

function Timeline({ ents, byConcept }: { ents: Concept[]; byConcept: Map<string, Item[]> }) {
  const dated = ents.filter((c) => c.start !== undefined || c.end !== undefined).sort((a, b) => (a.start ?? a.end!) - (b.start ?? b.end!));
  if (!dated.length) return <div className="small muted">None of your atlas entries have dates yet. People, battles and states matched to Wikidata get their dates automatically.</div>;
  const century = (y: number) => (y < 0 ? `${Math.ceil(-y / 100)}${ord(Math.ceil(-y / 100))} century BC` : `${Math.ceil(y / 100)}${ord(Math.ceil(y / 100))} century AD`);
  let last = '';
  return (
    <div className="timeline-list">
      {dated.map((c) => {
        const y = c.start ?? c.end!;
        const head = century(y);
        const show = head !== last;
        last = head;
        const books = byConcept.get(c.id) ?? [];
        return (
          <div key={c.id}>
            {show && <div className="eyebrow" style={{ margin: '14px 0 6px' }}>{head}</div>}
            <Link to={`/knowledge/concept/${c.id}`} className="tl-row">
              <span className="tl-year num">{c.approximate ? 'c. ' : ''}{eraY(y)}</span>
              <span className="tl-dot" aria-hidden>{KIND_ICON[c.kind]}</span>
              <span className="grow" style={{ minWidth: 0 }}><b className="small">{c.name}</b><span className="tiny faint" style={{ display: 'block' }}>{yearSpan(c)}{books.length ? ` · ${books.map((b) => b.title).slice(0, 2).join(', ')}` : ''}</span></span>
            </Link>
          </div>
        );
      })}
      <p className="tiny faint mt-16">“c.” marks approximate dates. There is no year 0 — 1 BC is followed by AD 1.</p>
    </div>
  );
}
const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

function BooksUniverse({ idx, byConcept }: { idx: LibraryIndex; byConcept: Map<string, Item[]> }) {
  const perBook = new Map<string, Concept[]>();
  for (const [cid, books] of byConcept) {
    const c = idx.concepts.get(cid);
    if (!c || c.kind === 'subject') continue;
    for (const b of books) perBook.set(b.id, [...(perBook.get(b.id) ?? []), c]);
  }
  const bridges = [...byConcept.entries()].filter(([cid, b]) => b.length > 1 && idx.concepts.get(cid)?.kind !== 'subject').sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  return (
    <div className="col gap-16">
      {bridges.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Threads between your books</h3></div>
          <div className="col" style={{ gap: 8 }}>
            {bridges.map(([cid, books]) => {
              const c = idx.concepts.get(cid)!;
              return (
                <div key={cid} className="small">
                  <Link to={`/knowledge/concept/${cid}`}><b>{KIND_ICON[c.kind]} {c.name}</b></Link> appears in {books.length} books: <span className="muted">{books.map((b) => b.title).join(' · ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {[...perBook.entries()].sort((a, b) => b[1].length - a[1].length).map(([bid, cs]) => {
        const it = idx.items.get(bid)!;
        return (
          <div key={bid} className="card tight">
            <div className="row gap-12">
              <Link to={`/item/${it.id}`}><Cover item={it} width={40} /></Link>
              <div className="grow" style={{ minWidth: 0 }}><b className="small ellipsis" style={{ display: 'block' }}>{it.title}</b><span className="tiny faint">{cs.length} people, places & events</span></div>
              <Link className="btn xs" to={`/discover/book/${it.id}`}>Explore</Link>
            </div>
            <div className="chips-scroll mt-8">{cs.map((c) => <Link key={c.id} className="chip" to={`/knowledge/concept/${c.id}`}>{KIND_ICON[c.kind]} {c.name}</Link>)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Questions({ idx }: { idx: LibraryIndex }) {
  const saved = idx.snap.notes.filter((n) => n.kind === 'question').sort((a, b) => b.createdAt - a.createdAt);
  const fromCurricula = idx.snap.curricula.flatMap((c) => c.levels.flatMap((l) => (l.questions ?? []).map((q) => ({ q, c }))));
  if (!saved.length && !fromCurricula.length) return <div className="small muted">Questions you save while reading (Ask AI → Save question) or add to a curriculum collect here, so you can come back to them.</div>;
  return (
    <div className="col" style={{ gap: 8 }}>
      {saved.map((n) => (
        <div key={n.id} className="card tight">
          <div className="small" style={{ fontWeight: 700 }}>{n.text}</div>
          <div className="tiny faint">{n.itemId ? idx.items.get(n.itemId)?.title : ''}{n.chapter ? ` · ${n.chapter}` : ''}</div>
          <div className="row wrap gap-8 mt-8"><AskChip question={n.text} label="Ask AI" /><Link className="chip" to={`/discover/topic/${encodeURIComponent(n.text)}`}>Find books</Link></div>
        </div>
      ))}
      {fromCurricula.map(({ q, c }, i) => (
        <div key={`c${i}`} className="card tight">
          <div className="small" style={{ fontWeight: 700 }}>{q}</div>
          <Link className="tiny faint" to={`/curriculum/${c.id}`}>From your curriculum “{c.name}”</Link>
        </div>
      ))}
    </div>
  );
}

/** A plain history of what you've been curious about, month by month. */
function Interests({ idx }: { idx: LibraryIndex }) {
  const months = new Map<string, { ents: Concept[]; finished: Item[]; started: Item[] }>();
  const bucket = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const get = (k: string) => { if (!months.has(k)) months.set(k, { ents: [], finished: [], started: [] }); return months.get(k)!; };
  for (const c of idx.snap.concepts) if (c.kind !== 'subject') get(bucket(c.createdAt)).ents.push(c);
  for (const ins of idx.snap.instances) {
    const it = idx.items.get(ins.itemId);
    if (!it) continue;
    if (ins.finishedOn) get(ins.finishedOn.slice(0, 7)).finished.push(it);
    if (ins.startedOn) get(ins.startedOn.slice(0, 7)).started.push(it);
  }
  const rows = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 18);
  if (!rows.length) return <div className="small muted">As you read and explore, a month-by-month picture of your interests builds up here.</div>;
  return (
    <div className="col gap-12">
      <p className="small muted" style={{ margin: 0 }}>What you explored each month. It simply describes your reading — there’s no right amount.</p>
      {rows.map(([k, m]) => {
        const kinds = new Map<string, number>();
        for (const c of m.ents) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);
        return (
          <div key={k} className="card tight">
            <div className="row between"><b>{monthName(Number(k.slice(5)) - 1, true)} {k.slice(0, 4)}</b><span className="tiny faint">{[...kinds].map(([kk, n]) => `${KIND_ICON[kk as ConceptKind]} ${n}`).join('  ')}</span></div>
            {m.started.length > 0 && <div className="small mt-8">Started: {m.started.map((i) => i.title).join(', ')}</div>}
            {m.finished.length > 0 && <div className="small">Finished: {m.finished.map((i) => i.title).join(', ')}</div>}
            {m.ents.length > 0 && <div className="chips-scroll mt-8">{m.ents.slice(0, 16).map((c) => <Link key={c.id} className="chip" to={`/knowledge/concept/${c.id}`}>{KIND_ICON[c.kind]} {c.name}</Link>)}</div>}
          </div>
        );
      })}
    </div>
  );
}
