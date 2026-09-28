import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BASE_SYSTEM, itemLine, libraryDigest } from '../ai/context';
import { AIPanel, useConcierge } from '../ai/ui';
import { Cover, Empty, Stars, StatusChip } from '../components/common';
import { db } from '../db/db';
import { formatKey, formatYear } from '../engine/dates';
import { itemForecast } from '../engine/forecast';
import { fmtDuration } from '../engine/units';
import { useLibrary } from '../state/library';

export default function AuthorPage() {
  const { id } = useParams();
  const idx = useLibrary();
  const a = idx.authors.get(id!);
  const [notes, setNotes] = useState(a?.notes ?? '');
  const items = idx.itemList().filter((i) => i.authorIds.includes(id!));
  useConcierge(`Author: ${a?.name}`, [`In what order should I read ${a?.name}?`, `Which authors are similar to ${a?.name}?`], () => items.map((i) => itemLine(idx, i, { share: idx.settings.ai.share, withProgress: true })).join('\n'), [idx, id]);
  if (!a) return <div className="page"><Empty title="Author not found" /></div>;
  const read = items.filter((i) => i.status === 'read');
  const sec = items.reduce((s, i) => s + (idx.sessionsByItem.get(i.id) ?? []).reduce((x, y) => x + (y.durationSec ?? 0), 0), 0);
  const ratings = items.map((i) => idx.rating(i)).filter((x): x is number => !!x);
  const subjects = [...new Set(items.flatMap((i) => [...i.genres, ...i.folderIds.map((f) => idx.folders.get(f)?.name ?? '')]).filter(Boolean))];
  const related = idx.snap.authors.filter((o) => o.id !== a.id && idx.itemList().some((i) => i.authorIds.includes(o.id) && (i.genres.some((g) => subjects.includes(g)) || i.folderIds.some((f) => items.some((x) => x.folderIds.includes(f)))))).slice(0, 12);
  const sessions = items.flatMap((i) => (idx.sessionsByItem.get(i.id) ?? []).map((s) => ({ s, i }))).sort((x, y) => y.s.startedAt - x.s.startedAt).slice(0, 12);
  const notesCount = items.reduce((s, i) => s + (idx.notesByItem.get(i.id)?.length ?? 0), 0);
  return (
    <div className="page">
      <div className="page-head"><div><div className="small muted">Author universe</div><h1>{a.name}</h1><div className="sub">{items.length} owned · {read.length} read · {ratings.length ? `avg ${(ratings.reduce((x, y) => x + y, 0) / ratings.length).toFixed(1)}★` : 'no ratings yet'} · {sec ? fmtDuration(sec) : 'no timed reading'} · {notesCount} notes</div></div></div>
      <div className="grid c3">
        <div className="card span-2">
          <div className="card-head"><h3>Books</h3></div>
          {items.sort((x, y) => (x.publishedYear ?? 9999) - (y.publishedYear ?? 9999)).map((i) => {
            const f = itemForecast(idx, i);
            const ins = idx.currentInstance(i);
            return (
              <Link key={i.id} to={`/item/${i.id}`} className="book-row">
                <Cover item={i} width={36} />
                <div className="grow"><div className="ellipsis" style={{ fontWeight: 500 }}>{i.title}</div><div className="small muted">{formatYear(i.publishedYear)}{ins?.finishedOn ? ` · finished ${formatKey(ins.finishedOn)}` : ''}{i.status === 'reading' && f.percent !== undefined ? ` · ${Math.round(f.percent * 100)}%` : ''}</div>{ins?.review && <div className="tiny faint ellipsis">“{ins.review}”</div>}</div>
                {idx.rating(i) && <Stars value={idx.rating(i)} size={12} />}
                <StatusChip status={i.status} />
              </Link>
            );
          })}
        </div>
        <div className="col gap-16">
          <div className="card"><div className="card-head"><h3>Subjects</h3></div><div className="row wrap gap-4">{subjects.map((s) => <span key={s} className="chip">{s}</span>)}</div></div>
          <div className="card"><div className="card-head"><h3>Related authors</h3></div>{related.length ? <div className="row wrap gap-4">{related.map((r) => <Link key={r.id} to={`/author/${r.id}`} className="chip">{r.name}</Link>)}</div> : <div className="small muted">None in your library yet.</div>}</div>
          <div className="card"><div className="card-head"><h3>Your notes on this author</h3></div><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => db.authors.update(a.id, { notes })} placeholder="Private notes…" /></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Reading history</h3></div>
          {sessions.length ? sessions.map(({ s, i }) => <div key={s.id} className="row small"><span className="faint" style={{ width: 70 }}>{formatKey(s.date, idx.today, { short: true })}</span><span className="ellipsis grow">{i.title}</span></div>) : <div className="small muted">No sessions yet.</div>}
        </div>
        <div className="card span-2">
          <div className="card-head"><h3>✦ Suggested reading order & similar authors</h3></div>
          <AIPanel kind="recommendation" title={`Author guide — ${a.name}`} buttonLabel="Suggest an order" build={() => ({
            system: BASE_SYSTEM,
            messages: [{ role: 'user', content: `Suggest a reading order for ${a.name}'s works (start with owned ones, note which are owned and read), and 3–5 related authors (mark which are in the library).\n\nOWNED BY THIS AUTHOR:\n${items.map((i) => itemLine(idx, i, { share: idx.settings.ai.share, withProgress: true })).join('\n')}\n\n${libraryDigest(idx, idx.settings.ai.share, idx.itemList(), 80)}` }],
          })} />
        </div>
      </div>
    </div>
  );
}
