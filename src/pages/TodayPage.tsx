// Today: a calm home base. What you're reading, one tap to continue or log,
// today's progress, a few useful nudges (each with "why"), what's next and a
// quote from your own collection.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { itemContext } from '../ai/context';
import { useConcierge } from '../ai/ui';
import { Ring } from '../components/charts';
import { Cover, DeadlineChip, Empty, ProgressBar } from '../components/common';
import { KIND_ICON } from '../components/entity';
import { Icon, type IconName } from '../components/icons';
import { fmtClock, useTick } from '../components/sheets';
import { setStatus, startTimer, timerElapsedMs } from '../db/actions';
import { loadSampleLibrary } from '../db/seed';
import type { Item } from '../db/types';
import { untouched } from '../engine/brain';
import { formatKey, WEEKDAYS_LONG, weekday } from '../engine/dates';
import { itemForecast, type ItemForecast, projectForecast } from '../engine/forecast';
import { readingOrder, timeBudget } from '../engine/future';
import { goalMetricLabel, goalProgress } from '../engine/goals';
import type { LibraryIndex } from '../engine/model';
import { activeDays, minutesByDay, pagesByDay } from '../engine/stats';
import { computeStreaks, momentum } from '../engine/streaks';
import { fmtDuration, fmtNum, fmtUnits, toDisplay, unitLabel } from '../engine/units';
import { readingFormat } from '../lib/ebooks';
import { timeForChars } from '../lib/readingSpeed';
import { useEbookIds, useLibrary, useTimer } from '../state/library';
import { useUI } from '../state/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const DISMISS = 'shelf.dismissedNudges';
function loadDismissed(today: string): Record<string, string> {
  try {
    const all = JSON.parse(localStorage.getItem(DISMISS) ?? '{}') as Record<string, string>;
    return Object.fromEntries(Object.entries(all).filter(([, d]) => d === today));
  } catch { return {}; }
}

/** Reading time left for an item, from timed sessions or the ebook reader. */
export function timeLeft(item: Item, f: ItemForecast, hasFile: boolean): string | undefined {
  if (f.timeRemainingSec) return fmtDuration(f.timeRemainingSec);
  if (hasFile && item.ebookChars && f.percent !== undefined) return timeForChars(item.ebookChars * (1 - f.percent));
  return undefined;
}

export default function TodayPage() {
  const idx = useLibrary();
  const { open } = useUI();
  const s = idx.settings;
  const ebookIds = useEbookIds();
  const reading = useMemo(() => readingOrder(idx).filter((i) => i.status === 'reading').sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0)), [idx]);
  const forecasts = useMemo(() => new Map(reading.map((i) => [i.id, itemForecast(idx, i)])), [idx, reading]);
  const streak = useMemo(() => computeStreaks(activeDays(idx.sessions), idx.today, idx.streakRules), [idx]);
  const [dismissed, setDismissed] = useState(() => loadDismissed(idx.today));
  const [busy, setBusy] = useState(false);

  useConcierge('Reading', ['What should I read today?', 'Which book should I focus on to hit my deadlines?', 'How is my reading going?'], () =>
    reading.slice(0, 6).map((i) => itemContext(idx, i, s.ai.share)).join('\n\n'), [idx]);

  const dateLine = `${WEEKDAYS_LONG[weekday(idx.today)]}, ${formatKey(idx.today)}`;

  if (idx.itemList().length === 0)
    return (
      <div className="page">
        <div className="eyebrow">{dateLine}</div>
        <h1 className="mb-16">{greeting()}{s.userName ? `, ${s.userName}` : ''}</h1>
        <div className="card">
          <Empty
            illustration="shelf"
            title="Let’s fill your shelves"
            action={
              <div className="col" style={{ alignItems: 'stretch', width: 'min(320px, 80vw)' }}>
                <button className="btn primary lg" onClick={() => open({ kind: 'add' })}><Icon name="plus" />Add your first book</button>
                <button className="btn" onClick={() => open({ kind: 'add', preset: { step: 'epub' } })}><Icon name="file" />Open an ePub file</button>
                <Link className="btn" to="/library/import"><Icon name="download" />Import from Goodreads</Link>
                <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); await loadSampleLibrary(); }}>Try a sample library</button>
              </div>
            }
          >
            Add something you’re reading — a book, ebook, audiobook, course or article. Everything else appears here as you read.
          </Empty>
        </div>
      </div>
    );

  const current = reading[0];
  const unreadEbook = current ? undefined : [...ebookIds].map((id) => idx.items.get(id)).find((i) => i && i.status !== 'read');
  const others = reading.slice(1);
  const pages = pagesByDay(idx).get(idx.today) ?? 0;
  const minutes = minutesByDay(idx).get(idx.today) ?? 0;
  const daily = idx.snap.goals.filter((g) => g.active && g.period === 'daily').map((g) => goalProgress(idx, g))[0];
  const annual = idx.snap.goals.filter((g) => g.active && g.period === 'annual').map((g) => goalProgress(idx, g))[0];
  const nudges = buildNudges(idx, reading, forecasts).filter((n) => !dismissed[n.key]).slice(0, 3);
  const dismiss = (key: string) => {
    const next = { ...dismissed, [key]: idx.today };
    setDismissed(next);
    try { localStorage.setItem(DISMISS, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const quotes = idx.snap.notes.filter((n) => n.kind === 'quote');
  const qotd = quotes.length ? quotes[hashDay(idx.today) % quotes.length] : undefined;

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      {s.sampleData && <div className="notice mb-16 small">You’re exploring a <b>sample library</b>. <Link to="/settings?tab=data" style={{ textDecoration: 'underline' }}>Erase it</Link> when you’re ready to start your own.</div>}
      <div className="row between wrap mb-16" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">{dateLine}{idx.planningRules.weekdays.includes(weekday(idx.today)) ? ' · a rest day' : ''}</div>
          <h1>{greeting()}{s.userName ? `, ${s.userName}` : ''}</h1>
        </div>
        {streak.current > 0 && (
          <span className="pill flame" title={`Longest streak: ${streak.longest} days`}><Icon name="flame" />{streak.current}-day streak</span>
        )}
      </div>
      <div className="chips-scroll mb-16" role="navigation" aria-label="Reading">
        <Link className="chip on" to="/">Now</Link>
        <Link className="chip" to="/reading">All in progress{reading.length ? ` · ${reading.length}` : ''}</Link>
        <Link className="chip" to="/reading/queue">Up next</Link>
        <Link className="chip" to="/reading/ebooks">Ebooks{ebookIds.size ? ` · ${ebookIds.size}` : ''}</Link>
        <Link className="chip" to="/reading/journal">Journal</Link>
      </div>

      {current ? <ContinueHero item={current} f={forecasts.get(current.id)!} idx={idx} hasFile={ebookIds.has(current.id)} /> : unreadEbook ? (
        <Link to={`/read/${unreadEbook.id}`} className="hero row gap-16" style={{ display: 'flex' }}>
          <Cover item={unreadEbook} width={72} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Start reading</div>
            <div className="hero-title">{unreadEbook.title}</div>
            <div className="small muted">{idx.authorLine(unreadEbook)} · tracked automatically</div>
          </div>
        </Link>
      ) : (
        <div className="card">
          <Empty illustration="reading" title="Nothing in progress" action={<div className="row wrap" style={{ justifyContent: 'center' }}><Link className="btn primary" to="/reading/queue">Choose what to read</Link><button className="btn" onClick={() => open({ kind: 'add' })}>Add a book</button></div>}>
            Pick a book from your Want to Read list, or add a new one.
          </Empty>
        </div>
      )}

      <EbookShelf idx={idx} ebookIds={ebookIds} skip={current?.id} />

      {others.length > 0 && (
        <>
          <div className="section-row"><h2 className="section-title">Also reading</h2><Link to="/reading">See all</Link></div>
          <div className="chips-scroll" style={{ gap: 12, paddingBottom: 6 }}>
            {others.map((i) => <MiniCard key={i.id} item={i} f={forecasts.get(i.id)!} hasFile={ebookIds.has(i.id)} />)}
          </div>
        </>
      )}

      <Universe idx={idx} hasEbooks={ebookIds.size > 0} />

      <div className="section-row"><h2 className="section-title">Today</h2><Link to="/insights">All stats</Link></div>
      <div className="card">
        <div className="row gap-16">
          {daily ? (
            <Ring value={daily.ratio} size={88} stroke={9}>
              <div><div style={{ fontWeight: 800, fontSize: 19 }}>{fmtNum(daily.value)}</div><div className="tiny faint">of {fmtNum(daily.target)}</div></div>
            </Ring>
          ) : (
            <Ring value={0} size={88} stroke={9}><Icon name="book" size={26} /></Ring>
          )}
          <div className="col grow" style={{ gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{fmtNum(pages)} page{pages === 1 ? '' : 's'}{minutes ? ` · ${fmtDuration(minutes * 60)}` : ''}</div>
            {daily ? (
              <div className="small muted">{daily.ratio >= 1 ? <span className="chip good">Daily goal done ✓</span> : <>{fmtNum(daily.target - daily.value)} {goalMetricLabel(daily.goal)} to reach your daily goal</>}</div>
            ) : (
              <Link className="small" style={{ color: 'var(--accent-ink)', fontWeight: 700 }} to="/plan/goals?new=1">Set a gentle daily goal →</Link>
            )}
            <div className="small faint">
              {streak.current > 0 ? (streak.pendingToday ? `Read today to keep your ${streak.current}-day streak going.` : `Longest streak: ${streak.longest} days.`) : 'Read today to start a streak.'}
            </div>
          </div>
        </div>
        {annual && (
          <div className="mt-16">
            <div className="row between small"><b>{annual.goal.year ?? idx.today.slice(0, 4)} challenge</b><span className="num">{fmtNum(annual.value)} / {fmtNum(annual.target)} {goalMetricLabel(annual.goal)}</span></div>
            <ProgressBar value={annual.ratio} />
            <div className="tiny faint mt-8">{annual.value >= annual.expected ? 'On pace' : `${fmtNum(annual.expected - annual.value, 1)} behind an even pace`} · on track for about {fmtNum(annual.projected)}</div>
          </div>
        )}
      </div>

      {nudges.length > 0 && (
        <>
          <div className="section-title">Worth a look</div>
          <div className="col gap-12">
            {nudges.map((n) => <Nudge key={n.key} n={n} onDismiss={() => dismiss(n.key)} />)}
          </div>
        </>
      )}

      <UpNext idx={idx} />

      <div className="mt-24">
        <div className="card">
          <div className="card-head"><h3 className="row"><Icon name="quote" /> Quote of the day</h3>{quotes.length > 0 && <Link className="small muted" to="/knowledge/notes">All quotes</Link>}</div>
          {qotd ? (
            <>
              <div className="quote">{qotd.text}</div>
              {qotd.itemId && <div className="small muted mt-8">— {idx.items.get(qotd.itemId)?.title}{qotd.page ? `, p. ${qotd.page}` : ''}</div>}
            </>
          ) : <div className="small muted">Save quotes while you read (in the ebook reader, press and hold on text) and one will greet you here each day.</div>}
        </div>
      </div>
    </div>
  );
}

function hashDay(k: string) {
  let h = 0;
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function ContinueHero({ item, f, idx, hasFile }: { item: Item; f: ItemForecast; idx: LibraryIndex; hasFile: boolean }) {
  const { open, toast } = useUI();
  const nav = useNavigate();
  const timer = useTimer();
  const mine = timer?.itemId === item.id;
  useTick(!!mine && !!timer?.runningSince);
  const left = timeLeft(item, f, hasFile);
  const budget = timeBudget(idx, 20, item).amount;
  const format = readingFormat(item, hasFile);
  return (
    <div className="hero">
      <div className="hero-body">
        <Link to={`/item/${item.id}`} aria-label={`Open ${item.title}`}><Cover item={item} width={96} author={idx.authorLine(item)} showType /></Link>
        <div className="hero-meta">
          <div className="eyebrow">{idx.position(item) > 0 ? 'Continue reading' : 'Start reading'}</div>
          <Link to={`/item/${item.id}`} className="hero-title">{item.title}</Link>
          <div className="small muted ellipsis">{idx.authorLine(item)}</div>
          {f.total ? (
            <>
              <ProgressBar value={f.percent} />
              <div className="small muted">
                <b style={{ color: 'var(--text)' }}>{Math.round((f.percent ?? 0) * 100)}%</b> · {fmtUnits(item, f.remaining)} left{left ? ` · about ${left}` : ''}
              </div>
            </>
          ) : <div className="small muted">At {fmtUnits(item, f.completed)}</div>}
          {f.todayTarget !== undefined && f.todayTarget > 0 && (
            <div className="small">{f.todayAmount >= f.todayTarget ? <span className="chip good">Today’s target done ✓</span> : <>Today: <b>{fmtNum(toDisplay(item, f.todayAmount), 1)}</b> of {fmtUnits(item, f.todayTarget)}</>}</div>
          )}
          {item.deadline && <div><DeadlineChip status={f.status} delta={f.delta} deadline={f.deadline} /></div>}
        </div>
      </div>
      <div className="row wrap mt-16">
        {hasFile ? (
          <button className="btn accent lg grow" onClick={() => nav(`/read/${item.id}`)}><Icon name="book" />Continue reading</button>
        ) : (
          <button className="btn primary lg grow" onClick={() => open({ kind: 'log', itemId: item.id })}><Icon name="logPlus" />Log reading</button>
        )}
        {mine ? (
          <button className="btn lg" onClick={() => open({ kind: 'timer-stop' })}><Icon name="clock" />{fmtClock(timerElapsedMs(timer!))}</button>
        ) : hasFile ? (
          format === 'both' ? <button className="btn lg" onClick={() => open({ kind: 'log', itemId: item.id })} aria-label="Log pages read in your paper copy">📖 Paper</button> : null
        ) : (
          <button className="btn lg" onClick={async () => { if (timer && !confirm('Another timer is running. Replace it?')) return; await startTimer(item.id); toast('Timer started — tap Stop when you’re done'); }}><Icon name="clock" />Timer</button>
        )}
      </div>
      {hasFile && format !== 'print' && <div className="tiny faint mt-8">📱 Logged automatically while you read{format === 'both' ? ' — tap Paper for pages read in your paper copy' : ''}.</div>}
      {budget !== undefined && budget > 0 && f.remaining ? <div className="tiny faint mt-8">Got 20 minutes? That’s about {fmtUnits(item, Math.min(budget, f.remaining), 0)} at your speed.</div> : null}
    </div>
  );
}

function MiniCard({ item, f, hasFile }: { item: Item; f: ItemForecast; hasFile: boolean }) {
  const { open } = useUI();
  const nav = useNavigate();
  return (
    <div className="card tight" style={{ width: 250, flex: 'none' }}>
      <div className="row gap-12">
        <Link to={`/item/${item.id}`}><Cover item={item} width={46} /></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <Link to={`/item/${item.id}`} className="ellipsis" style={{ display: 'block', fontWeight: 800 }}>{item.title}</Link>
          {f.percent !== undefined ? <><ProgressBar value={f.percent} thin /><div className="tiny faint mt-8">{Math.round(f.percent * 100)}% · {fmtUnits(item, f.remaining)} left</div></> : <div className="tiny faint">At {fmtUnits(item, f.completed)}</div>}
        </div>
      </div>
      <div className="row mt-8">
        {hasFile && <button className="btn sm accent grow" onClick={() => nav(`/read/${item.id}`)}>Read</button>}
        {readingFormat(item, hasFile) !== 'ebook' && <button className={`btn sm grow ${hasFile ? '' : 'primary'}`} onClick={() => open({ kind: 'log', itemId: item.id })}>{hasFile ? '📖 Paper' : 'Log'}</button>}
      </div>
    </div>
  );
}

// ── Nudges: at most three, each explained ──────────────────────────────

interface NudgeData { key: string; icon: IconName; tone: string; text: React.ReactNode; why: string }

function buildNudges(idx: LibraryIndex, reading: Item[], forecasts: Map<string, ItemForecast>): NudgeData[] {
  const out: NudgeData[] = [];
  const s = idx.settings;
  for (const i of reading) {
    const f = forecasts.get(i.id)!;
    if (i.deadline && (f.status === 'behind' || f.status === 'unreachable')) {
      out.push({
        key: `behind:${i.id}`, icon: 'calendar', tone: 'var(--warn-soft)',
        text: f.status === 'behind' ? <>At your current pace you’ll finish <b>{i.title}</b> {-(f.delta ?? 0)} reading day{f.delta === -1 ? '' : 's'} after your deadline.</> : <>Your deadline for <b>{i.title}</b> isn’t reachable at your current pace.</>,
        why: `Deadline ${formatKey(i.deadline)}. You’d need ${f.requiredPace !== undefined ? fmtNum(toDisplay(i, f.requiredPace), 1) : '?'} ${unitLabel(i)} a day; your recent pace is ${f.pace ? fmtNum(toDisplay(i, f.pace), 1) : 'unknown'}.`,
      });
    }
  }
  for (const i of reading) {
    const f = forecasts.get(i.id)!;
    if ((f.percent ?? 0) >= s.finishLineThreshold && (f.remaining ?? 0) > 0) {
      out.push({
        key: `finish:${i.id}`, icon: 'trophy', tone: 'var(--good-soft)',
        text: <>You’re only <b>{fmtUnits(i, f.remaining)}</b> from finishing <b>{i.title}</b>.</>,
        why: `It’s ${Math.round((f.percent ?? 0) * 100)}% done — past your “finish line” of ${Math.round(s.finishLineThreshold * 100)}% (you can change this in Settings).`,
      });
    }
  }
  for (const i of untouched(idx, s.staleDays).filter((x) => x.status === 'reading')) {
    const last = idx.lastReadDate(i);
    out.push({
      key: `stale:${i.id}`, icon: 'clock', tone: 'var(--surface-2)',
      text: <>You haven’t opened <b>{i.title}</b> in a while. Pick it back up?</>,
      why: `${last ? `Last read ${formatKey(last)}.` : 'Never logged.'} Books show here after ${s.staleDays} days without reading.`,
    });
  }
  const mom = momentum(pagesByDay(idx), idx.today);
  if (mom.enoughData && mom.change !== undefined && Math.abs(mom.change) >= 0.15) {
    out.push({
      key: 'momentum', icon: 'chart', tone: mom.change > 0 ? 'var(--good-soft)' : 'var(--surface-2)',
      text: <>You’ve read <b>{Math.round(Math.abs(mom.change) * 100)}% {mom.change > 0 ? 'more' : 'less'}</b> in the last two weeks than the two before.</>,
      why: `${fmtNum(mom.recent)} pages in the last 14 days, compared with ${fmtNum(mom.previous)} in the 14 days before.`,
    });
  }
  return out;
}

function Nudge({ n, onDismiss }: { n: NudgeData; onDismiss: () => void }) {
  const [why, setWhy] = useState(false);
  const nav = useNavigate();
  const { open, toast } = useUI();
  const [kind, id] = n.key.split(':');
  const actions = kind === 'behind' ? [{ label: 'Try a plan', run: () => nav(`/plan/whatif?item=${id}`) }]
    : kind === 'finish' ? [{ label: 'Log reading', run: () => open({ kind: 'log', itemId: id }) }]
    : kind === 'stale' ? [{ label: 'Pick it up', run: () => nav(`/item/${id}`) }, { label: 'Set aside', run: async () => { await setStatus(id, 'paused'); toast('Set aside — it’s in Reading → Up next', { undo: () => setStatus(id, 'reading') }); } }]
    : [{ label: 'See insights', run: () => nav('/insights') }];
  return (
    <div className="nudge">
      <span className="n-ico" style={{ background: n.tone }}><Icon name={n.icon} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div>{n.text}</div>
        {why ? <div className="why">{n.why}</div> : <button className="why-link mt-8" onClick={() => setWhy(true)}>Why am I seeing this?</button>}
        <div className="row wrap mt-8">
          {actions.map((a, i) => <button key={a.label} className={`btn sm ${i === 0 ? 'primary' : ''}`} onClick={a.run}>{a.label}</button>)}
          <button className="btn sm ghost" onClick={onDismiss}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function UpNext({ idx }: { idx: LibraryIndex }) {
  const next = idx.itemList().filter((i) => i.queue === 'next').sort((a, b) => a.queueOrder - b.queueOrder);
  const projectNext = idx.snap.projects
    .filter((p) => p.status === 'active')
    .map((p) => ({ p, item: idx.itemsInProject(p).find((i) => i.status === 'want' || i.status === 'paused'), f: p.deadline ? projectForecast(idx, p.id) : undefined }))
    .filter((x) => x.item);
  const seen = new Set<string>();
  const rows = [...next.map((i) => ({ item: i, label: 'Next in your queue' })), ...projectNext.map((x) => ({ item: x.item!, label: x.p.name }))]
    .filter((r) => (seen.has(r.item.id) ? false : (seen.add(r.item.id), true)))
    .slice(0, 8);
  return (
    <>
      <div className="section-row"><h2 className="section-title">Up next</h2><Link to="/reading/queue">Edit</Link></div>
      {rows.length === 0 ? (
        <div className="small muted">Choose what’s next in <Link to="/reading/queue" style={{ textDecoration: 'underline' }}>Reading → Up next</Link>, or add books to a project.</div>
      ) : (
        <div className="shelf-row">
          {rows.map((r) => (
            <div key={r.item.id} className="cover-tile">
              <div className="shelf-slot"><Link to={`/item/${r.item.id}`} aria-label={r.item.title}><Cover item={r.item} width={96} author={idx.authorLine(r.item)} /></Link></div>
              <div className="meta"><div className="small ellipsis" style={{ fontWeight: 700 }}>{r.item.title}</div><div className="tiny faint ellipsis">{r.label}</div></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

type LibFilter = 'all' | 'reading' | 'unread' | 'finished' | 'paper';
type LibSort = 'recent' | 'title' | 'author' | 'progress';
const LIB_PREF = 'shelf.kindleLib';

/** The Kindle-style library: every ebook, one tap from reading. */
function EbookShelf({ idx, ebookIds }: { idx: LibraryIndex; ebookIds: Set<string>; skip?: string }) {
  const { open } = useUI();
  const [pref, setPref] = useState<{ f: LibFilter; s: LibSort }>(() => { try { return { f: 'all', s: 'recent', ...JSON.parse(localStorage.getItem(LIB_PREF) ?? '{}') }; } catch { return { f: 'all', s: 'recent' }; } });
  const set = (p: Partial<typeof pref>) => { const n = { ...pref, ...p }; setPref(n); try { localStorage.setItem(LIB_PREF, JSON.stringify(n)); } catch { /* ignore */ } };
  const pctOf = (i: Item) => (i.total ? Math.min(1, idx.position(i) / i.total) : 0);
  const ebooks = [...ebookIds].map((id) => idx.items.get(id)).filter((i): i is Item => !!i);
  const paper = idx.itemList().filter((i) => !ebookIds.has(i.id) && (i.status === 'reading' || i.status === 'paused'));
  let books = pref.f === 'paper' ? paper : ebooks.filter((i) => pref.f === 'all' || (pref.f === 'reading' ? i.status === 'reading' : pref.f === 'finished' ? i.status === 'read' : i.status === 'want' && pctOf(i) === 0));
  books = [...books].sort((a, b) => pref.s === 'title' ? a.title.localeCompare(b.title) : pref.s === 'author' ? idx.authorLine(a).localeCompare(idx.authorLine(b)) : pref.s === 'progress' ? pctOf(b) - pctOf(a) : (b.lastReadAt ?? b.createdAt ?? 0) - (a.lastReadAt ?? a.createdAt ?? 0));
  return (
    <>
      <div className="section-row">
        <h2 className="section-title">Your library</h2>
        <select className="select sm" style={{ width: 'auto' }} value={pref.s} onChange={(e) => set({ s: e.target.value as LibSort })} aria-label="Sort books">
          <option value="recent">Recent</option><option value="title">Title</option><option value="author">Author</option><option value="progress">Progress</option>
        </select>
      </div>
      <div className="chips-scroll mb-16">
        {([['all', `All · ${ebooks.length}`], ['reading', 'Reading'], ['unread', 'Not started'], ['finished', 'Finished'], ['paper', `📖 Paper books${paper.length ? ` · ${paper.length}` : ''}`]] as [LibFilter, string][]).map(([f, l]) => <button key={f} className={`chip ${pref.f === f ? 'on' : ''}`} onClick={() => set({ f })}>{l}</button>)}
      </div>
      <div className="cover-grid compact">
        {books.map((i) => {
          const pct = Math.round(pctOf(i) * 100);
          const to = ebookIds.has(i.id) ? `/read/${i.id}` : `/item/${i.id}`;
          return (
            <div key={i.id} className="cover-tile">
              <Link to={to} aria-label={`${ebookIds.has(i.id) ? 'Read' : 'Open'} ${i.title}`}><Cover item={i} width={92} author={idx.authorLine(i)} /></Link>
              <div className="meta" style={{ textAlign: 'left' }}>
                <div className="small clamp-2" style={{ fontWeight: 700 }}>{i.title}</div>
                {i.status === 'read' ? <div className="tiny faint">Finished ✓</div> : pct > 0 ? <><ProgressBar value={pct / 100} thin /><div className="tiny faint">{pct}%</div></> : <div className="tiny faint">New</div>}
              </div>
            </div>
          );
        })}
        {pref.f !== 'paper' && (
          <div className="cover-tile">
            <button className="add-slot" onClick={() => open({ kind: 'add', preset: { step: 'epub' } })} aria-label="Add an ePub">
              <span style={{ width: 92, height: 138, borderRadius: 8, border: '2px dashed var(--border-strong)', display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}><Icon name="plus" size={28} /></span>
            </button>
            <div className="meta" style={{ textAlign: 'left' }}><div className="small" style={{ fontWeight: 700 }}>Add an ePub</div></div>
          </div>
        )}
      </div>
      {!books.length && pref.f !== 'all' && <div className="small muted">Nothing here yet.</div>}
    </>
  );
}

/** People, places and events you've met recently — your reading universe. */
function Universe({ idx, hasEbooks }: { idx: LibraryIndex; hasEbooks: boolean }) {
  const recent = idx.snap.concepts.filter((c) => c.kind !== 'subject').sort((a, b) => b.createdAt - a.createdAt).slice(0, 14);
  if (!recent.length)
    return hasEbooks ? (
      <div className="nudge mt-16">
        <span className="n-ico" style={{ background: 'var(--ai-soft)' }}><Icon name="sparkle" /></span>
        <div className="small">While reading, tap the middle of the page for <b>Ask AI</b>, <b>Map</b>, <b>Images</b> and <b>Explore</b>. Names you look up get underlined in every book, and build your <Link to="/knowledge" style={{ textDecoration: 'underline' }}>Knowledge Atlas</Link>.</div>
      </div>
    ) : null;
  return (
    <>
      <div className="section-row"><h2 className="section-title">Your reading universe</h2><Link to="/knowledge">Atlas</Link></div>
      <div className="chips-scroll">
        {recent.map((c) => <Link key={c.id} className="chip" to={`/knowledge/concept/${c.id}`}>{KIND_ICON[c.kind]} {c.name}</Link>)}
      </div>
    </>
  );
}
