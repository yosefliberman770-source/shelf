import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConcierge } from '../ai/ui';
import { itemContext } from '../ai/context';
import { Ring } from '../components/charts';
import { Cover, DeadlineChip, Empty, ProgressBar } from '../components/common';
import { fmtClock, useTick } from '../components/sheets';
import { setStatus, startTimer, timerElapsedMs } from '../db/actions';
import type { Item } from '../db/types';
import { untouched } from '../engine/brain';
import { formatKey, WEEKDAYS_LONG, weekday } from '../engine/dates';
import { itemForecast, type ItemForecast, projectForecast } from '../engine/forecast';
import { readingOrder, timeBudget } from '../engine/future';
import { goalMetricLabel, goalProgress } from '../engine/goals';
import type { LibraryIndex } from '../engine/model';
import { activeDays, pagesByDay } from '../engine/stats';
import { computeStreaks, momentum } from '../engine/streaks';
import { fmtDuration, fmtNum, fmtUnits, toDisplay, unitLabel } from '../engine/units';
import { useEbookIds, useLibrary, useTimer } from '../state/library';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../state/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function TodayPage() {
  const idx = useLibrary();
  const { open } = useUI();
  const s = idx.settings;
  const reading = useMemo(() => readingOrder(idx).filter((i) => i.status === 'reading'), [idx]);
  const forecasts = useMemo(() => new Map(reading.map((i) => [i.id, itemForecast(idx, i)])), [idx, reading]);
  const streak = useMemo(() => computeStreaks(activeDays(idx.sessions), idx.today, idx.streakRules), [idx]);
  const mom = useMemo(() => momentum(pagesByDay(idx), idx.today), [idx]);
  const goals = idx.snap.goals.filter((g) => g.active);
  const daily = goals.filter((g) => g.period === 'daily').map((g) => goalProgress(idx, g));
  const longer = goals.filter((g) => g.period !== 'daily').map((g) => goalProgress(idx, g));

  useConcierge('Today', ['What should I read today?', 'Which book should I prioritise to hit my deadlines?', 'Summarise my reading momentum.'], () =>
    reading.slice(0, 6).map((i) => itemContext(idx, i, s.ai.share)).join('\n\n'), [idx]);

  if (idx.itemList().length === 0)
    return (
      <div className="page">
        <div className="page-head"><div><h1>{greeting()}</h1><div className="sub">{WEEKDAYS_LONG[weekday(idx.today)]}, {formatKey(idx.today)}</div></div></div>
        <div className="card">
          <Empty icon="📚" title="Your library is empty" action={<div className="row"><button className="btn primary" onClick={() => open({ kind: 'add' })}>Add your first book</button><Link className="btn" to="/library/import">Import from Goodreads</Link></div>}>
            Add something you’re reading — a book, audiobook, course, article or anything else. Your statistics will appear here as you read.
          </Empty>
        </div>
      </div>
    );

  const finishLine = reading.filter((i) => (forecasts.get(i.id)?.percent ?? 0) >= s.finishLineThreshold && (forecasts.get(i.id)?.remaining ?? 0) > 0);
  const closest = reading
    .map((i) => ({ i, f: forecasts.get(i.id)! }))
    .filter((x) => x.f.remaining && x.f.remaining > 0)
    .sort((a, b) => (a.f.timeRemainingSec ?? (a.f.readingDaysRemaining ?? 1e9) * 1e6) - (b.f.timeRemainingSec ?? (b.f.readingDaysRemaining ?? 1e9) * 1e6))
    .slice(0, 3);
  const stale = untouched(idx, s.staleDays);
  const quotes = idx.snap.notes.filter((n) => n.kind === 'quote');
  const qotd = quotes.length ? quotes[hashDay(idx.today) % quotes.length] : undefined;
  const challenge = longer.find((g) => g.goal.period === 'annual');
  const deadlineItems = [...forecasts.entries()].filter(([, f]) => f.deadline).map(([id, f]) => ({ item: idx.items.get(id)!, f }));
  const projects = idx.snap.projects.filter((p) => p.status === 'active');

  return (
    <div className="page">
      {s.sampleData && <div className="notice mb-16">You’re exploring a <b>sample library</b>. Statistics shown are generated from sample sessions. <Link to="/settings?tab=data" style={{ textDecoration: 'underline' }}>Erase it</Link> when you’re ready to start your own.</div>}
      <div className="page-head">
        <div>
          <h1>{greeting()}{s.userName ? `, ${s.userName}` : ''}</h1>
          <div className="sub">{WEEKDAYS_LONG[weekday(idx.today)]}, {formatKey(idx.today)}{idx.planningRules.weekdays.includes(weekday(idx.today)) ? ' · a non-reading day' : ''}</div>
        </div>
      </div>

      <div className="grid c4">
        <div className="card">
          <div className="stat">
            <span className="label">🔥 Day streak</span>
            <span className="value lg">{streak.current}</span>
            <span className="hint">{streak.pendingToday && streak.current > 0 ? 'Read today to keep it going' : streak.current ? `Longest: ${streak.longest} days` : idx.sessions.length ? `Longest: ${streak.longest} days` : 'Log a session to start one'}</span>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <span className="label">Momentum</span>
            {mom.enoughData ? (
              <>
                <span className="value lg" style={{ color: (mom.change ?? 0) >= 0 ? 'var(--good)' : 'var(--text)' }}>{(mom.change ?? 0) >= 0 ? '📈 +' : '📉 '}{Math.round((mom.change ?? 0) * 100)}%</span>
                <span className="hint">{(mom.change ?? 0) >= 0 ? 'More' : 'Less'} than the two weeks before ({fmtNum(mom.recent)} vs {fmtNum(mom.previous)} pages)</span>
              </>
            ) : (
              <><span className="value" style={{ fontSize: 16, marginTop: 8 }}>Not enough data yet</span><span className="hint">Needs reading from 2–4 weeks ago</span></>
            )}
          </div>
        </div>
        <div className="card">
          {daily.length ? (
            <div className="row gap-12">
              <Ring value={daily[0].ratio} size={78} stroke={8}>
                <div><div style={{ fontWeight: 600 }}>{fmtNum(daily[0].value)}</div><div className="tiny faint">/ {fmtNum(daily[0].target)}</div></div>
              </Ring>
              <div className="stat"><span className="label">Daily goal</span><span className="hint">{goalMetricLabel(daily[0].goal)} today</span>{daily[0].ratio >= 1 ? <span className="chip good">Done ✓</span> : <span className="hint">{fmtNum(daily[0].target - daily[0].value)} to go</span>}</div>
            </div>
          ) : (
            <div className="stat"><span className="label">Daily goal</span><span className="hint">No daily goal set.</span><Link className="btn sm mt-8" to="/plan">Set a goal</Link></div>
          )}
        </div>
        <div className="card">
          {challenge ? (
            <div className="stat">
              <span className="label">{challenge.goal.year ?? idx.today.slice(0, 4)} challenge</span>
              <span className="value">{fmtNum(challenge.value)} <span className="faint" style={{ fontSize: 15 }}>/ {fmtNum(challenge.target)} {goalMetricLabel(challenge.goal)}</span></span>
              <ProgressBar value={challenge.ratio} />
              <span className="hint">{challenge.value >= challenge.expected ? 'On pace' : `${fmtNum(challenge.expected - challenge.value, 1)} behind even pace`} · projected {fmtNum(challenge.projected)}</span>
            </div>
          ) : (
            <div className="stat"><span className="label">Reading challenge</span><span className="hint">Set an annual goal — books or pages.</span><Link className="btn sm mt-8" to="/plan">Create challenge</Link></div>
          )}
        </div>
      </div>

      <div className="section-title">Currently reading</div>
      {reading.length === 0 ? (
        <div className="card"><Empty icon="📖" title="Nothing in progress" action={<Link className="btn" to="/reading/queue">Pick from your queue</Link>}>Start something from your Want to Read list.</Empty></div>
      ) : (
        <div className="grid auto">
          {reading.map((i) => <ActiveCard key={i.id} item={i} f={forecasts.get(i.id)!} idx={idx} />)}
        </div>
      )}

      <div className="grid c3 mt-24">
        <div className="card">
          <div className="card-head"><h3>🏁 Finish line</h3><span className="small faint">≥ {Math.round(s.finishLineThreshold * 100)}%</span></div>
          {finishLine.length === 0 ? <div className="small muted">No books near the end yet.</div> : finishLine.map((i) => {
            const f = forecasts.get(i.id)!;
            return (
              <Link to={`/item/${i.id}`} key={i.id} className="book-row">
                <Cover item={i} width={32} />
                <div className="grow"><div className="ellipsis" style={{ fontWeight: 500 }}>{i.title}</div><div className="small muted">You’re {fmtUnits(i, f.remaining)} from finishing.</div></div>
              </Link>
            );
          })}
        </div>
        <div className="card">
          <div className="card-head"><h3>⏳ Closest finishes</h3><span className="small faint">by reading time left</span></div>
          {closest.length === 0 ? <div className="small muted">Add lengths to your active books to see this.</div> : closest.map(({ i, f }) => (
            <Link to={`/item/${i.id}`} key={i.id} className="book-row">
              <Cover item={i} width={32} />
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 500 }}>{i.title}</div>
                <div className="small muted">{f.timeRemainingSec ? `≈ ${fmtDuration(f.timeRemainingSec)} of reading` : `${fmtNum(f.readingDaysRemaining, 1)} reading days`} · {fmtUnits(i, f.remaining)} left</div>
              </div>
            </Link>
          ))}
        </div>
        <TimeBudgetCard idx={idx} reading={reading} />
      </div>

      <div className="grid c2 mt-16">
        <div className="card">
          <div className="card-head"><h3>🎯 Goal forecast</h3><Link className="small muted" to="/plan">Plan →</Link></div>
          {deadlineItems.length === 0 && projects.filter((p) => p.deadline).length === 0 && <div className="small muted">No deadlines yet. Everything still has an estimated finish based on your pace.</div>}
          <div className="col">
            {deadlineItems.map(({ item, f }) => (
              <div key={item.id} className="row between">
                <div className="grow ellipsis"><Link to={`/item/${item.id}`}><b>{item.title}</b></Link> <span className="small muted">— {forecastSentence(f)}</span></div>
                <DeadlineChip status={f.status} delta={f.delta} deadline={f.deadline} />
              </div>
            ))}
            {projects.filter((p) => p.deadline).map((p) => {
              const f = projectForecast(idx, p.id);
              return (
                <div key={p.id} className="row between">
                  <div className="grow ellipsis"><Link to={`/plan/project/${p.id}`}><b>{p.name}</b></Link> <span className="small muted">— needs {fmtNum(f.requiredPace)} pages/day; you’re at {fmtNum(f.pace)}</span></div>
                  <DeadlineChip status={f.status} delta={f.delta} deadline={f.deadline} />
                </div>
              );
            })}
          </div>
        </div>
        <UpNext idx={idx} />
      </div>

      <div className="grid c2 mt-16">
        <div className="card">
          <div className="card-head"><h3>❝ Quote of the day</h3></div>
          {qotd ? (
            <>
              <div className="quote">{qotd.text}</div>
              {qotd.itemId && <div className="small muted mt-8">— {idx.items.get(qotd.itemId)?.title}{qotd.page ? `, p. ${qotd.page}` : ''}</div>}
            </>
          ) : <div className="small muted">Your saved quotes will appear here, one per day.</div>}
        </div>
        <div className="card">
          <div className="card-head"><h3>🕸 Haven’t read recently</h3><span className="small faint">{s.staleDays}+ days</span></div>
          {stale.length === 0 ? <div className="small muted">Every book in progress has been touched recently.</div> : stale.slice(0, 5).map((i) => (
            <div key={i.id} className="row between">
              <Link to={`/item/${i.id}`} className="ellipsis grow">{i.title}</Link>
              <span className="small faint">{idx.lastReadDate(i) ? `last ${formatKey(idx.lastReadDate(i))}` : 'never logged'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function forecastSentence(f: ItemForecast): string {
  if (f.status === 'behind') return `at your current pace you’ll finish ${-(f.delta ?? 0)} reading days after your deadline`;
  if (f.status === 'ahead') return `on course to finish ${f.delta} reading days early`;
  if (f.status === 'on-track') return 'on course to finish right on time';
  if (f.status === 'overdue') return 'the deadline has passed';
  if (f.status === 'unreachable') return 'not reachable at the current pace';
  return f.estimatedFinish ? `estimated ${formatKey(f.estimatedFinish)}` : '';
}

function hashDay(k: string) {
  let h = 0;
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function ActiveCard({ item, f, idx }: { item: Item; f: ItemForecast; idx: LibraryIndex }) {
  const { open, toast } = useUI();
  const nav = useNavigate();
  const hasFile = useEbookIds().has(item.id);
  const timer = useTimer();
  const mine = timer?.itemId === item.id;
  useTick(!!mine && !!timer?.runningSince);
  const u = unitLabel(item);
  const todayDone = f.todayTarget !== undefined && f.todayAmount >= f.todayTarget;
  return (
    <div className="card">
      <div className="active-card">
        <Link to={`/item/${item.id}`}><Cover item={item} width={78} author={idx.authorLine(item)} showType /></Link>
        <div className="meta">
          <Link to={`/item/${item.id}`} className="book-title ellipsis">{item.title}</Link>
          <div className="small muted ellipsis">{idx.authorLine(item)}</div>
          {f.total ? (
            <>
              <div className="row between small"><span className="num">{fmtNum(toDisplay(item, f.completed), 1)} / {fmtUnits(item, f.total)}</span><b className="num">{Math.round((f.percent ?? 0) * 100)}%</b></div>
              <ProgressBar value={f.percent} />
              <div className="small muted">{fmtUnits(item, f.remaining)} remaining{f.pace ? ` · ${fmtNum(toDisplay(item, f.pace), 1)} ${u}/day` : ''}</div>
              {f.readingDaysRemaining !== undefined && <div className="small muted">{fmtNum(f.readingDaysRemaining, 1)} reading days · est. {formatKey(f.estimatedFinish)}</div>}
            </>
          ) : <div className="small muted">At {fmtUnits(item, f.completed)} · add a length for forecasts</div>}
          {f.todayTarget !== undefined && (
            <div className={`small ${todayDone ? '' : ''}`}>
              Today: <b>{fmtNum(toDisplay(item, f.todayAmount), 1)}</b> / {fmtUnits(item, f.todayTarget)} {todayDone && <span className="chip good">✓</span>}
            </div>
          )}
          {item.deadline && <div><DeadlineChip status={f.status} delta={f.delta} deadline={f.deadline} /></div>}
        </div>
      </div>
      <div className="row wrap mt-16 gap-4">
        {hasFile && <button className="btn sm accent" onClick={() => nav(`/read/${item.id}`)}>📖 Read</button>}
        <button className={`btn sm ${hasFile ? '' : 'primary'}`} onClick={() => open({ kind: 'log', itemId: item.id })}>Log</button>
        {mine ? (
          <button className="btn sm accent" onClick={() => open({ kind: 'timer-stop' })}>⏱ {fmtClock(timerElapsedMs(timer!))}</button>
        ) : (
          <button className="btn sm" onClick={async () => { if (timer && !confirm('Another timer is running. Replace it?')) return; await startTimer(item.id); toast('Timer started'); }}>Timer</button>
        )}
        <button className="btn sm" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'note' })}>Note</button>
        <button className="btn sm" onClick={() => open({ kind: 'note', itemId: item.id, noteKind: 'quote' })}>Quote</button>
        <button className="btn sm ghost" onClick={async () => { await setStatus(item.id, 'paused'); toast(`Set aside “${item.title}”`, { undo: () => setStatus(item.id, 'reading') }); }}>Pause</button>
      </div>
    </div>
  );
}

function TimeBudgetCard({ idx, reading }: { idx: LibraryIndex; reading: Item[] }) {
  const [minutes, setMinutes] = useState(30);
  const [itemId, setItemId] = useState(reading[0]?.id ?? '');
  const item = idx.items.get(itemId);
  const tb = timeBudget(idx, minutes, item);
  return (
    <div className="card">
      <div className="card-head"><h3>⌛ Time budget</h3></div>
      <div className="row wrap gap-4 mb-8">
        {[5, 10, 20, 30, 60].map((m) => <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(m)}>{m < 60 ? `${m}m` : '1h'}</button>)}
        <input className="input sm" style={{ width: 70 }} type="number" min={1} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} />
      </div>
      {reading.length > 0 && (
        <select className="select sm mb-8" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Any book (overall speed)</option>
          {reading.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </select>
      )}
      {tb.amount !== undefined ? (
        <p>With {minutes} minutes you can probably read about <b>{item ? fmtUnits(item, tb.amount, 0) : `${fmtNum(tb.amount)} pages`}</b> at your current speed.</p>
      ) : (
        <p className="small muted">Time a few sessions with the timer and Shelf will estimate how far you can get.</p>
      )}
    </div>
  );
}

function UpNext({ idx }: { idx: LibraryIndex }) {
  const next = idx.itemList().filter((i) => i.queue === 'next').sort((a, b) => a.queueOrder - b.queueOrder)[0];
  const projectNext = idx.snap.projects
    .filter((p) => p.status === 'active')
    .map((p) => ({ p, item: idx.itemsInProject(p).find((i) => i.status === 'want' || i.status === 'paused') }))
    .filter((x) => x.item);
  const folderNext = idx.snap.folders
    .filter((f) => f.deadline || f.goalPace)
    .map((f) => ({ f, item: readingOrder(idx, idx.itemsInFolder(f.id)).find((i) => i.status !== 'reading') }))
    .filter((x) => x.item);
  const rows = [
    ...(next ? [{ label: 'Queue', item: next }] : []),
    ...projectNext.map((x) => ({ label: x.p.name, item: x.item! })),
    ...folderNext.map((x) => ({ label: x.f.name, item: x.item! })),
  ].slice(0, 6);
  return (
    <div className="card">
      <div className="card-head"><h3>⏭ Up next</h3><Link className="small muted" to="/reading/queue">Queue →</Link></div>
      {rows.length === 0 ? <div className="small muted">Move books into “Next” in your reading queue, or add them to a project.</div> : rows.map((r, i) => (
        <Link key={i} to={`/item/${r.item.id}`} className="book-row">
          <Cover item={r.item} width={28} />
          <div className="grow"><div className="ellipsis" style={{ fontWeight: 500 }}>{r.item.title}</div><div className="tiny faint">{r.label}</div></div>
        </Link>
      ))}
    </div>
  );
}
