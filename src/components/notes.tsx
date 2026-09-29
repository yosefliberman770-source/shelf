import { Link } from 'react-router-dom';
import { deleteNote } from '../db/actions';
import type { Note } from '../db/types';
import { formatKey, keyFromMs } from '../engine/dates';
import type { LibraryIndex } from '../engine/model';
import { useUI } from '../state/ui';
import { AIBadge } from './common';

export function NoteCard({ note, idx, hideItem }: { note: Note; idx: LibraryIndex; hideItem?: boolean }) {
  const { open, toast } = useUI();
  const item = note.itemId ? idx.items.get(note.itemId) : undefined;
  const loc = [note.page !== undefined ? `p. ${note.page}` : '', note.chapter ? `ch. ${note.chapter}` : '', note.timestamp ?? ''].filter(Boolean).join(' · ');
  return (
    <div className={`note-card ${note.kind === 'quote' ? 'quote-card' : ''}`}>
      <div className="text selectable" style={{ whiteSpace: 'pre-wrap' }}>{note.kind === 'quote' ? `“${note.text}”` : note.text}</div>
      <div className="row wrap small faint">
        {note.source === 'ai' && <AIBadge />}
        {!hideItem && item && <Link to={`/item/${item.id}?tab=notes`} className="muted ellipsis" style={{ maxWidth: 240 }}>{item.title}</Link>}
        {loc && <span>{loc}</span>}
        <span>{formatKey(keyFromMs(note.createdAt), idx.today, { short: true })}</span>
        {note.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
        {note.conceptIds.map((c) => idx.concepts.get(c)).filter(Boolean).map((c) => <Link key={c!.id} to={`/knowledge/concept/${c!.id}`} className="chip accent">◇ {c!.name}</Link>)}
        <span className="grow" />
        <button className="btn xs ghost" onClick={() => open({ kind: 'note', noteKind: note.kind === 'quote' ? 'quote' : 'note', noteId: note.id, itemId: note.itemId })}>Edit</button>
        <button className="btn xs ghost" onClick={async () => { if (confirm('Delete this note?')) { await deleteNote(note.id); toast('Deleted'); } }}>Delete</button>
      </div>
    </div>
  );
}
