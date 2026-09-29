// The entity card: one compact view of a person, place, event or idea that
// every feature shares. Resolving a name here attaches it to the one shared
// entity in the knowledge graph (anchored to Wikidata when online).
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { link } from '../db/actions';
import { db } from '../db/db';
import type { Concept, ConceptKind } from '../db/types';
import { formatYear } from '../engine/dates';
import { resolveEntity, wikidata, type EntityCandidate } from '../lib/entities';
import { useLibrary } from '../state/library';
import { Cover } from './common';
import { Icon, type IconName } from './icons';

export const KIND_LABEL: Record<ConceptKind, string> = {
  person: 'Person', place: 'Place', event: 'Event', period: 'Period', polity: 'State / civilization', organization: 'Organization',
  object: 'Object', source: 'Primary source / work', concept: 'Idea', subject: 'Subject',
};
export const KIND_ICON: Record<ConceptKind, string> = { subject: '📂', concept: '◇', person: '👤', place: '📍', event: '⚔️', period: '🕰', polity: '🏛', organization: '👥', object: '🏺', source: '📜' };

export function yearSpan(c: Pick<Concept, 'start' | 'end' | 'approximate'>): string {
  if (c.start === undefined && c.end === undefined) return '';
  const pre = c.approximate ? 'c. ' : '';
  if (c.start !== undefined && c.end !== undefined && c.end !== c.start) return `${pre}${formatYear(c.start)} – ${formatYear(c.end)}`;
  return `${pre}${formatYear(c.start ?? c.end)}`;
}

export type EntityTool = 'map' | 'visual' | 'ai' | 'explore';

/** Resolve a name (or load an id) to the shared entity; links it to a book when given. */
export function useEntity(input: { name?: string; conceptId?: string; kind?: ConceptKind; itemId?: string }) {
  const [id, setId] = useState<string | undefined>(input.conceptId);
  const [busy, setBusy] = useState(!input.conceptId);
  const [error, setError] = useState('');
  useEffect(() => {
    if (input.conceptId) { setId(input.conceptId); setBusy(false); return; }
    if (!input.name) return;
    let live = true;
    setBusy(true);
    resolveEntity(input.name, { kind: input.kind })
      .then(async (c) => {
        if (input.itemId) await link('concept', c.id, 'item', input.itemId, 'appears in');
        if (live) setId(c.id);
      })
      .catch(() => live && setError('Couldn’t look this up.'))
      .finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [input.name, input.conceptId, input.kind, input.itemId]);
  const concept = useLiveQuery(() => (id ? db.concepts.get(id) : undefined), [id]);
  return { concept, busy, error };
}

export function EntityCard({ name, conceptId, kind, itemId, onTool, textColor }: { name?: string; conceptId?: string; kind?: ConceptKind; itemId?: string; onTool?: (t: EntityTool, c: Concept) => void; textColor?: string }) {
  const idx = useLibrary();
  const { concept: c, busy, error } = useEntity({ name, conceptId, kind, itemId });
  const [alts, setAlts] = useState<EntityCandidate[] | null>(null);
  if (busy && !c) return <div className="small muted" style={{ padding: 8 }}>Looking up “{name}”…</div>;
  if (!c) return <div className="small muted">{error || 'Not found.'}</div>;
  const bookIds = new Set([
    ...idx.snap.links.filter((l) => (l.fromType === 'concept' && l.fromId === c.id && l.toType === 'item') || (l.toType === 'concept' && l.toId === c.id && l.fromType === 'item')).map((l) => (l.fromType === 'item' ? l.fromId : l.toId)),
  ]);
  const books = [...bookIds].map((b) => idx.items.get(b)).filter(Boolean);
  const notes = idx.snap.notes.filter((n) => n.conceptIds.includes(c.id));
  const actions: { t: EntityTool; icon: IconName; label: string; show: boolean }[] = [
    { t: 'ai', icon: 'sparkle', label: 'Ask AI', show: true },
    { t: 'map', icon: 'map', label: 'Map', show: c.lat !== undefined || c.kind === 'place' || c.kind === 'event' || c.kind === 'polity' },
    { t: 'visual', icon: 'layers', label: 'Images', show: true },
    { t: 'explore', icon: 'compass', label: 'Explore', show: true },
  ];
  return (
    <div className="col gap-12" style={{ color: textColor }}>
      <div className="row top gap-12">
        {c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" style={{ width: 72, height: 88, objectFit: 'cover', borderRadius: 10, flex: 'none', background: 'var(--surface-2)' }} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="eyebrow">{KIND_ICON[c.kind]} {KIND_LABEL[c.kind]}{yearSpan(c) ? ` · ${yearSpan(c)}` : ''}</div>
          <div className="book-title" style={{ fontSize: 20 }}>{c.name}</div>
          {c.summary && <p className="small mt-8" style={{ lineHeight: 1.5 }}>{c.summary.length > 320 ? `${c.summary.slice(0, 320)}…` : c.summary}</p>}
          <div className="tiny faint mt-8">
            {c.wikidataId ? <>Matched to <a href={`https://www.wikidata.org/wiki/${c.wikidataId}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Wikidata {c.wikidataId}</a>{c.summarySource?.startsWith('http') && <> · summary from <a href={c.summarySource} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Wikipedia</a></>}. </> : 'Not linked to a reference source yet. '}
            <button className="why-link" onClick={async () => setAlts(await wikidata.search(name ?? c.name).catch(() => []))}>Not the right one?</button>
          </div>
        </div>
      </div>
      {alts && (
        <div className="col" style={{ gap: 4 }}>
          <div className="small muted">Pick the right match:</div>
          {alts.map((a) => (
            <button key={a.id} className="rabbit-node" onClick={async () => { const fixed = await resolveEntity(a.label, { wikidataId: a.id, kind: c.kind }); if (itemId) await link('concept', fixed.id, 'item', itemId, 'appears in'); setAlts(null); }}>
              <span><b>{a.label}</b> <span className="small muted">{a.description}</span></span>{a.id === c.wikidataId && <Icon name="check" />}
            </button>
          ))}
          {!alts.length && <div className="small faint">No other matches (or you’re offline).</div>}
        </div>
      )}
      {onTool && (
        <div className="row wrap gap-8">
          {actions.filter((a) => a.show).map((a) => <button key={a.t} className="btn sm" onClick={() => onTool(a.t, c)}><Icon name={a.icon} />{a.label}</button>)}
        </div>
      )}
      {books.length > 0 && (
        <div>
          <div className="eyebrow mb-8">In your library · {books.length} book{books.length === 1 ? '' : 's'}</div>
          <div className="chips-scroll">{books.map((b) => <Link key={b!.id} to={`/item/${b!.id}`} className="row" style={{ gap: 8, flex: 'none', maxWidth: 220 }}><Cover item={b!} width={28} /><span className="small ellipsis" style={{ fontWeight: 700 }}>{b!.title}</span></Link>)}</div>
        </div>
      )}
      {notes.length > 0 && <div className="small muted">{notes.length} of your notes mention this.</div>}
      <Link to={`/knowledge/concept/${c.id}`} className="small" style={{ fontWeight: 800, color: 'var(--accent-ink)' }}>Full profile in your Knowledge Atlas →</Link>
    </div>
  );
}
