import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { itemContext } from '../ai/context';
import { useConcierge } from '../ai/ui';
import { Cover, DeadlineChip, Empty, Modal, ProgressBar, Segmented, Tabs } from '../components/common';
import { Icon } from '../components/icons';
import { EbooksShelf } from './EbooksPage';
import { timeLeft } from './TodayPage';
import { moveInQueue, startTimer } from '../db/actions';
import type { DateKey, Item, QueueLane } from '../db/types';
import { addDays, endOfMonth, formatKey, formatMonth, fromKey, monthKey, startOfMonth, startOfWeek, WEEKDAYS, WEEKDAYS_LONG, weekday } from '../engine/dates';
import { itemForecast } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { progressOf } from '../engine/query';
import { sessionPages } from '../engine/stats';
import { fmtDuration, fmtNum, fmtUnits, toDisplay, unitLabel } from '../engine/units';
import { useEbookIds, useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Tab = 'now' | 'queue' | 'ebooks' | 'journal';

export default function ReadingPage() {
  const idx = useLibrary();
  const loc = useLocation();
  const nav = useNavigate();
  const tab: Tab = loc.pathname.includes('queue') ? 'queue' : loc.pathname.includes('journal') ? 'journal' : loc.pathname.includes('ebooks') ? 'ebooks' : 'now';
  const reading = idx.itemList().filter((i) => i.status === 'reading').sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
  const ebookIds = useEbookIds();
  useConcierge('Reading', ['Which of my current books should I focus on?', 'Am I reading too many books at once?', 'What should I read after these?'], () => reading.map((i) => itemContext(idx, i, idx.settings.ai.share)).join('\n\n'), [idx]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Reading</h1><div className="sub">What you’re reading now, what’s next, your ebooks, and every day you’ve read.</div></div></div>
      <Tabs<Tab> value={tab} onChange={(t) => nav(t === 'now' ? '/reading' : `/reading/${t}`)} tabs={[{ id: 'now', label: `Now${reading.length ? ` · ${reading.length}` : ''}` }, { id: 'queue', label: 'Up next' }, { id: 'ebooks', label: `Ebooks${ebookIds.size ? ` · ${ebookIds.size}` : ''}` }, { id: 'journal', label: 'Journal' }]} />
      {tab === 'now' && <NowTab idx={idx} reading={reading} />}
      {tab === 'queue' && <QueueBoard idx={idx} />}
      {tab === 'ebooks' && <EbooksShelf />}
      {tab === 'journal' && <Journal idx={idx} />}
    </div>
  );
}

function NowTab({ idx, reading }: { idx: LibraryIndex; reading: Item[] }) {
  const { open, toast } = useUI();
  const nav = useNavigate();
  const ebookIds = useEbookIds();
  const todaySessions = idx.sessions.filter((s) => s.date === idx.today);
  const todaySec = todaySessions.reduce((a, s) => a + (s.durationSec ?? 0), 0);
  const todayPages = todaySessions.reduce((a, s) => a + (sessionPages(idx, s) ?? 0), 0);
  if (!reading.length) return <div className="card"><Empty illustration="reading" title="Nothing in progress" action={<div className="row wrap" style={{ justifyContent: 'center' }}><Link className="btn primary" to="/reading/queue">Choose from Up next</Link><Link className="btn" to="/reading/ebooks">Open an ebook</Link></div>}>Start a book from your Want to Read list, or open one of your ebooks.</Empty></div>;
  return (
    <div className="col gap-16">
      <div className="row wrap gap-8">
        <span className="pill"><Icon name="calendar" />Today</span>
        <span className="pill">{fmtNum(todayPages)} pages</span>
        <span className="pill">{todaySec ? fmtDuration(todaySec) : '0m'}</span>
        <span className="pill">{todaySessions.length} session{todaySessions.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid auto">
        {reading.map((i) => {
          const f = itemForecast(idx, i);
          const hasFile = ebookIds.has(i.id);
          const left = timeLeft(i, f, hasFile);
          return (
            <div key={i.id} className="card">
              <div className="row top gap-16">
                <Link to={`/item/${i.id}`}><Cover item={i} width={76} author={idx.authorLine(i)} showType /></Link>
                <div className="grow col" style={{ gap: 5, minWidth: 0 }}>
                  <Link to={`/item/${i.id}`} className="book-title clamp-2">{i.title}</Link>
                  <div className="small muted ellipsis">{idx.authorLine(i)}</div>
                  {f.percent !== undefined ? (
                    <>
                      <ProgressBar value={f.percent} />
                      <div className="small muted"><b style={{ color: 'var(--text)' }}>{Math.round(f.percent * 100)}%</b> · {fmtUnits(i, f.remaining)} left{left ? ` · ~${left}` : ''}</div>
                    </>
                  ) : <div className="small muted">At {fmtUnits(i, f.completed)} · length unknown</div>}
                  <div className="tiny faint">{f.pace ? `${fmtNum(toDisplay(i, f.pace), 1)} ${unitLabel(i)}/day · ` : ''}{f.estimatedFinish ? `finish ~${formatKey(f.estimatedFinish)}` : ''}</div>
                  {i.deadline && <div><DeadlineChip status={f.status} delta={f.delta} deadline={i.deadline} /></div>}
                </div>
              </div>
              <div className="row mt-16">
                {hasFile && <button className="btn accent grow" onClick={() => nav(`/read/${i.id}`)}><Icon name="book" />Read</button>}
                <button className={`btn grow ${hasFile ? '' : 'primary'}`} onClick={() => open({ kind: 'log', itemId: i.id })}><Icon name="logPlus" />Log</button>
                <button className="btn icon" aria-label={`Start a timer for ${i.title}`} onClick={async () => { await startTimer(i.id); toast('Timer started — tap Stop when you’re done'); }}><Icon name="clock" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LANES: { id: QueueLane; label: string; hint: string }[] = [
  { id: 'now', label: 'Now', hint: 'Currently reading' },
  { id: 'next', label: 'Next', hint: 'Planning to read soon' },
  { id: 'later', label: 'Later', hint: 'Want to read eventually' },
  { id: 'paused', label: 'Paused', hint: 'Temporarily stopped' },
  { id: 'finished', label: 'Finished', hint: 'Completed' },
];

function QueueBoard({ idx }: { idx: LibraryIndex }) {
  const { toast } = useUI();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ lane: QueueLane; before?: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const lanes = useMemo(() => {
    const m = new Map<QueueLane, Item[]>(LANES.map((l) => [l.id, []]));
    for (const i of idx.itemList()) m.get(i.queue)?.push(i);
    for (const [k, v] of m) v.sort((a, b) => (k === 'finished' ? (b.updatedAt - a.updatedAt) : a.queueOrder - b.queueOrder));
    return m;
  }, [idx]);
  const drop = async (lane: QueueLane, before?: string) => {
    if (!dragging) return;
    const it = idx.items.get(dragging);
    setDragging(null);
    setOver(null);
    if (!it) return;
    await moveInQueue(it.id, lane, before);
    if (it.queue !== lane) toast(`Moved “${it.title}” to ${LANES.find((l) => l.id === lane)?.label}`);
  };
  return (
    <>
      <p className="small muted mb-16">Drag cards between lanes, or tap <b>⋯</b> on a card to move it. Moving a book to Now starts reading; to Finished marks it read.</p>
      {moving && <MoveSheet idx={idx} id={moving} lanes={lanes} onClose={() => setMoving(null)} />}
      <div className="queue-board">
        {LANES.map((l) => {
          const items = lanes.get(l.id) ?? [];
          return (
            <div key={l.id} className={`lane ${over?.lane === l.id && !over.before ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); if (over?.lane !== l.id || over.before) setOver({ lane: l.id }); }} onDrop={(e) => { e.preventDefault(); drop(l.id, over?.before); }}>
              <h3><span>{l.label}</span><span>{items.length}</span></h3>
              {items.length === 0 && <div className="small faint" style={{ padding: 6 }}>{l.hint}</div>}
              {items.slice(0, l.id === 'finished' ? 30 : 200).map((i) => {
                const p = progressOf(idx, i);
                return (
                  <div
                    key={i.id}
                    className={`q-card ${dragging === i.id ? 'dragging' : ''} ${over?.before === i.id ? 'drop-before' : ''}`}
                    draggable
                    onDragStart={(e) => { setDragging(i.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i.id); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver({ lane: l.id, before: i.id }); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(l.id, i.id); }}
                  >
                    <Cover item={i} width={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <Link to={`/item/${i.id}`} className="ellipsis" style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>{i.title}</Link>
                      <div className="tiny faint ellipsis">{idx.authorLine(i)}</div>
                      {i.status === 'reading' && p !== undefined && <ProgressBar value={p} thin />}
                    </div>
                    <button className="btn xs ghost icon" aria-label={`Move ${i.title}`} onClick={() => setMoving(i.id)}><Icon name="dots" /></button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

function MoveSheet({ idx, id, lanes, onClose }: { idx: LibraryIndex; id: string; lanes: Map<QueueLane, Item[]>; onClose: () => void }) {
  const { toast } = useUI();
  const it = idx.items.get(id);
  if (!it) return null;
  const lane = lanes.get(it.queue) ?? [];
  const pos = lane.findIndex((x) => x.id === id);
  const move = async (to: QueueLane, before?: string) => {
    await moveInQueue(id, to, before);
    if (to !== it.queue) toast(`Moved “${it.title}” to ${LANES.find((l) => l.id === to)?.label}`);
    onClose();
  };
  return (
    <Modal title={`Move “${it.title}”`} onClose={onClose}>
      <div className="col gap-8">
        {LANES.filter((l) => l.id !== it.queue).map((l) => (
          <button key={l.id} className="rabbit-node" onClick={() => move(l.id)}>
            <span><b>{l.label}</b> <span className="small muted">— {l.hint}</span></span><Icon name="chevronRight" className="faint" />
          </button>
        ))}
        {lane.length > 1 && (
          <div className="row mt-8">
            <button className="btn grow" disabled={pos <= 0} onClick={() => move(it.queue, lane[pos - 1]?.id)}>↑ Move up</button>
            <button className="btn grow" disabled={pos < 0 || pos >= lane.length - 1} onClick={() => move(it.queue, lane[pos + 2]?.id)}>↓ Move down</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

type JView = 'day' | 'week' | 'month' | 'year';

function Journal({ idx }: { idx: LibraryIndex }) {
  const [view, setView] = useState<JView>('month');
  const [cursor, setCursor] = useState<DateKey>(idx.today);
  const [sel, setSel] = useState<DateKey>(idx.today);
  const [q, setQ] = useState('');
  const byDay = useMemo(() => {
    const m = new Map<DateKey, { item: Item; amount: number; sec: number; notes: string[] }[]>();
    for (const s of idx.sessions) {
      const item = idx.items.get(s.itemId);
      if (!item) continue;
      const list = m.get(s.date) ?? [];
      let e = list.find((x) => x.item.id === item.id);
      if (!e) { e = { item, amount: 0, sec: 0, notes: [] }; list.push(e); }
      e.amount += s.amount;
      e.sec += s.durationSec ?? 0;
      if (s.note) e.notes.push(s.note);
      m.set(s.date, list);
    }
    return m;
  }, [idx]);
  const notesByDay = useMemo(() => {
    const m = new Map<DateKey, number>();
    for (const n of idx.snap.notes) {
      const d = new Date(n.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [idx]);
  const step = (dir: number) => {
    const d = fromKey(cursor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    if (view === 'month') d.setMonth(d.getMonth() + dir, 1);
    if (view === 'year') d.setFullYear(d.getFullYear() + dir, 0, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setCursor(k);
    if (view === 'day') setSel(k);
  };
  const search = q.trim().toLowerCase();
  const searchHits = search
    ? [...byDay.entries()].filter(([, list]) => list.some((e) => e.item.title.toLowerCase().includes(search) || e.notes.some((n) => n.toLowerCase().includes(search)))).map(([d]) => d).sort().reverse()
    : [];
  const title = view === 'year' ? cursor.slice(0, 4) : view === 'month' ? formatMonth(monthKey(cursor), true) : view === 'week' ? `Week of ${formatKey(startOfWeek(cursor))}` : `${WEEKDAYS_LONG[weekday(cursor)]}, ${formatKey(cursor)}`;
  const dayLine = (d: DateKey) => {
    const list = byDay.get(d) ?? [];
    const sec = list.reduce((a, e) => a + e.sec, 0);
    return { list, sec };
  };
  return (
    <div className="grid journal-grid" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
      <style>{`@media (max-width: 860px) { .journal-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div className="card" style={{ minWidth: 0 }}>
        <div className="row wrap between mb-16">
          <div className="row"><button className="btn sm icon" onClick={() => step(-1)}>‹</button><h2 style={{ minWidth: 180, textAlign: 'center' }}>{title}</h2><button className="btn sm icon" onClick={() => step(1)}>›</button><button className="btn sm ghost" onClick={() => { setCursor(idx.today); setSel(idx.today); }}>Today</button></div>
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
        </div>
        <input className="input sm mb-16" placeholder="Search the journal (titles, session notes)…" value={q} onChange={(e) => setQ(e.target.value)} />
        {search ? (
          <div className="col">{searchHits.length === 0 ? <div className="small faint">No matching days.</div> : searchHits.slice(0, 60).map((d) => <button key={d} className="rabbit-node" onClick={() => { setSel(d); setQ(''); setCursor(d); setView('day'); }}>{formatKey(d)}<span className="small faint">{dayLine(d).list.map((e) => e.item.title).join(', ')}</span></button>)}</div>
        ) : view === 'month' ? (
          <div className="cal">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
            {(() => {
              const start = startOfWeek(startOfMonth(cursor));
              const end = endOfMonth(cursor);
              const cells: DateKey[] = [];
              for (let d = start; d <= end || weekday(d) !== 1; d = addDays(d, 1)) cells.push(d);
              return cells.map((d) => {
                const { list, sec } = dayLine(d);
                return (
                  <div key={d} className={`day ${d.slice(0, 7) !== cursor.slice(0, 7) ? 'out' : ''} ${d === idx.today ? 'today' : ''} ${d === sel ? 'sel' : ''} ${list.length ? 'has' : ''}`} onClick={() => setSel(d)}>
                    <span className="d">{Number(d.slice(8))}</span>
                    {list.slice(0, 2).map((e) => <span key={e.item.id} className="e">{e.item.title} — {fmtUnits(e.item, e.amount)}</span>)}
                    {list.length > 2 && <span className="e faint">+{list.length - 2} more</span>}
                    {sec > 0 && <span className="e faint">{fmtDuration(sec)}</span>}
                  </div>
                );
              });
            })()}
          </div>
        ) : view === 'week' ? (
          <div className="col">
            {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((d) => {
              const { list, sec } = dayLine(d);
              return (
                <button key={d} className={`rabbit-node ${d === sel ? 'on' : ''}`} onClick={() => setSel(d)}>
                  <span><b>{WEEKDAYS[weekday(d)]} {formatKey(d, idx.today, { short: true })}</b> <span className="small muted">{list.map((e) => `${e.item.title} — ${fmtUnits(e.item, e.amount)}`).join(' · ') || 'No reading'}</span></span>
                  <span className="small faint">{sec ? fmtDuration(sec) : ''}</span>
                </button>
              );
            })}
          </div>
        ) : view === 'year' ? (
          <div className="grid c3">
            {Array.from({ length: 12 }, (_, m) => `${cursor.slice(0, 4)}-${String(m + 1).padStart(2, '0')}`).map((ym) => {
              const days = [...byDay.keys()].filter((d) => d.startsWith(ym));
              const items = new Set(days.flatMap((d) => byDay.get(d)!.map((e) => e.item.title)));
              const sec = days.reduce((a, d) => a + dayLine(d).sec, 0);
              return (
                <button key={ym} className="card tight" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => { setCursor(`${ym}-01`); setView('month'); }}>
                  <b>{formatMonth(ym, true)}</b>
                  <div className="small muted">{days.length} active days{sec ? ` · ${fmtDuration(sec)}` : ''}</div>
                  <div className="tiny faint ellipsis">{[...items].slice(0, 3).join(', ')}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <DayDetail idx={idx} day={cursor} entries={dayLine(cursor).list} notes={notesByDay.get(cursor) ?? 0} />
        )}
      </div>
      <div className="card" style={{ minWidth: 0 }}>
        <DayDetail idx={idx} day={sel} entries={dayLine(sel).list} notes={notesByDay.get(sel) ?? 0} />
      </div>
    </div>
  );
}

function DayDetail({ idx, day, entries, notes }: { idx: LibraryIndex; day: DateKey; entries: { item: Item; amount: number; sec: number; notes: string[] }[]; notes: number }) {
  const sessions = idx.sessions.filter((s) => s.date === day);
  const sec = entries.reduce((a, e) => a + e.sec, 0);
  return (
    <div className="col">
      <h3>{WEEKDAYS_LONG[weekday(day)]}, {formatKey(day)}</h3>
      {entries.length === 0 ? <div className="small faint">No reading recorded.</div> : (
        <>
          <div className="small muted">{sessions.length} session{sessions.length === 1 ? '' : 's'}{sec ? ` · ${fmtDuration(sec)}` : ''}{notes ? ` · ${notes} note${notes === 1 ? '' : 's'}` : ''}</div>
          {entries.map((e) => (
            <Link key={e.item.id} to={`/item/${e.item.id}?tab=sessions`} className="book-row">
              <Cover item={e.item} width={30} />
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 500 }}>{e.item.title}</div>
                <div className="small muted">{fmtUnits(e.item, e.amount)}{e.sec ? ` · ${fmtDuration(e.sec)}` : ''}</div>
                {e.notes.map((n, i) => <div key={i} className="tiny faint">“{n}”</div>)}
              </div>
            </Link>
          ))}
          <div className="divider" />
          {sessions.map((s) => (
            <div key={s.id} className="row small">
              <span className="faint num" style={{ width: 48 }}>{new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="ellipsis grow">{idx.items.get(s.itemId)?.title}</span>
              <span className="num">{idx.items.get(s.itemId) ? fmtUnits(idx.items.get(s.itemId)!, s.amount) : s.amount}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
