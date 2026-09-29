// My ebooks: every book with a file you can read inside the app, with the
// one you were last reading front and centre.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cover, Empty, ProgressBar, Segmented } from '../components/common';
import type { Item } from '../db/types';
import { progressOf } from '../engine/query';
import { timeForChars } from '../lib/readingSpeed';
import { useEbookIds, useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Filter = 'all' | 'reading' | 'new' | 'done';
type Sort = 'recent' | 'title' | 'progress';

export function EbooksShelf() {
  const idx = useLibrary();
  const { open } = useUI();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const ids = useEbookIds();
  const books = idx.itemList().filter((i) => ids.has(i.id));
  const frac = (i: Item) => progressOf(idx, i) ?? 0;
  const done = (i: Item) => i.status === 'read' || frac(i) >= 0.999;
  const started = (i: Item) => !!i.readerLocation || frac(i) > 0;
  const leftText = (i: Item) => (i.ebookChars && !done(i) ? `${timeForChars(i.ebookChars * (1 - frac(i)))} left` : '');
  const pctText = (i: Item) => (done(i) ? 'Finished' : started(i) ? `${Math.max(1, Math.round(frac(i) * 100))}%` : 'New');

  const hero = books.filter((i) => started(i) && !done(i)).sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))[0];
  const shown = books
    .filter((i) => filter === 'all' || (filter === 'reading' ? started(i) && !done(i) : filter === 'new' ? !started(i) : done(i)))
    .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : sort === 'progress' ? frac(b) - frac(a) : (b.lastReadAt ?? b.createdAt) - (a.lastReadAt ?? a.createdAt)));

  const addButtons = (
    <>
      <button className="btn primary" onClick={() => open({ kind: 'add', preset: { step: 'epub' } })}>📄 Open an ePub file</button>
      <button className="btn" onClick={() => open({ kind: 'add', preset: { step: 'free' } })}>🆓 Find free ebooks</button>
    </>
  );

  return (
    <div>
      {books.length > 0 && <div className="row wrap gap-8 mb-16">{addButtons}</div>}

      {!books.length ? (
        <div className="card">
          <Empty illustration="reading" title="No ebooks yet" action={<div className="row wrap gap-8" style={{ justifyContent: 'center' }}>{addButtons}</div>}>
            Open an ePub file from your phone (for example from your Downloads), or pick a free classic. It will appear here, ready to read.
          </Empty>
        </div>
      ) : (
        <>
          {hero && (
            <div className="hero mb-16" style={{ cursor: 'pointer' }} onClick={() => nav(`/read/${hero.id}`)}>
              <div className="row gap-16" style={{ alignItems: 'center' }}>
                <Cover item={hero} width={84} author={idx.authorLine(hero)} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small faint">Continue reading</div>
                  <div className="book-title" style={{ fontSize: 19, margin: '2px 0' }}>{hero.title}</div>
                  <div className="small muted ellipsis">{idx.authorLine(hero)}</div>
                  <div className="mt-8"><ProgressBar value={frac(hero)} /></div>
                  <div className="small muted mt-8">{pctText(hero)}{leftText(hero) ? ` · about ${leftText(hero)}` : ''}</div>
                  <button className="btn accent mt-8" onClick={(e) => { e.stopPropagation(); nav(`/read/${hero.id}`); }}>Continue reading</button>
                </div>
              </div>
            </div>
          )}

          <div className="row wrap between gap-8 mb-16">
            <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: `All · ${books.length}` }, { value: 'reading', label: 'Reading' }, { value: 'new', label: 'Not started' }, { value: 'done', label: 'Finished' }]} />
            <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recent' }, { value: 'title', label: 'A–Z' }, { value: 'progress', label: 'Progress' }]} />
          </div>

          {shown.length ? (
            <div className="cover-grid">
              {shown.map((i) => (
                <div key={i.id} className="cover-tile">
                  <div className="shelf-slot">
                    <button onClick={() => nav(`/read/${i.id}`)} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }} aria-label={`Read ${i.title}`}>
                      <Cover item={i} width={128} author={idx.authorLine(i)} />
                    </button>
                  </div>
                  {started(i) && !done(i) && <ProgressBar value={frac(i)} thin />}
                  <div className="meta">
                    <div className="small ellipsis" style={{ fontWeight: 700 }}>{i.title}</div>
                    <div className="tiny faint">{pctText(i)} · <Link to={`/item/${i.id}`} style={{ textDecoration: 'underline' }} aria-label={`Details for ${i.title}`}>details</Link></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="small muted">Nothing here.</div>
          )}
        </>
      )}
    </div>
  );
}
