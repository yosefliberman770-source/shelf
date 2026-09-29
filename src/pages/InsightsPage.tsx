import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { brainSummary } from '../ai/summaries';
import { BASE_SYSTEM } from '../ai/context';
import { AIPanel, AskChip, useConcierge } from '../ai/ui';
import { BarChart, CalendarHeatmap, ChartCard, Donut, LineChart, MatrixHeatmap, Scatter, StackedBars } from '../components/charts';
import { Cover, DateRangePicker, Empty, ProgressBar, type RangeId, Segmented, Tabs } from '../components/common';
import { download } from '../db/portability';
import { addDays, formatKey, formatMonth, resolveRange, startOfMonth, WEEKDAYS } from '../engine/dates';
import { readingBrain } from '../engine/brain';
import { overallPace } from '../engine/forecast';
import { futureYou, simulateQueue } from '../engine/future';
import { readingDNA } from '../engine/goals';
import type { LibraryIndex } from '../engine/model';
import { personalRecords } from '../engine/records';
import { constantSchedule } from '../engine/schedule';
import {
  balance, bookDurations, byMonth, byWeek, coverage, cumulative, decadeBreakdown, finishedIn, lengthBreakdown, minutesByDay, overview, pagesByDay, type RangeFilter,
  ratingBreakdown, sessionsIn, speedByItem, speedByMonth, timeProfile, topN, typeBreakdown, yearsWithData,
} from '../engine/stats';
import { fmtDuration, fmtNum, fmtUnits, pagesOf } from '../engine/units';
import { useEbookIds, useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { itemForecast } from '../engine/forecast';
import { readingFormat } from '../lib/ebooks';
import { readingSpeed } from '../lib/readingSpeed';

type Tab = 'overview' | 'books' | 'habits' | 'progress' | 'brain' | 'forecast' | 'dna' | 'records' | 'balance';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'books', label: 'Books' }, { id: 'habits', label: 'Habits' }, { id: 'progress', label: 'Progress' },
  { id: 'brain', label: 'Reading Brain' }, { id: 'forecast', label: 'Forecast' }, { id: 'dna', label: 'Reading DNA' }, { id: 'records', label: 'Hall of Fame' }, { id: 'balance', label: 'Balance' },
];

const fmtMonthShort = (k: string) => formatMonth(k).replace(/ \d{4}$/, (m) => ` ’${m.slice(-2)}`);

export default function InsightsPage() {
  const idx = useLibrary();
  const loc = useLocation();
  const nav = useNavigate();
  const seg = loc.pathname.split('/')[2] as Tab | undefined;
  const tab: Tab = TABS.some((t) => t.id === seg) ? seg! : 'overview';
  const [range, setRange] = useState<RangeId>('year');
  const [custom, setCustom] = useState<{ from: string; to: string }>();
  const r: RangeFilter = resolveRange(range, idx.today, custom);
  useConcierge('Insights', ['What patterns do you see in my reading?', 'When do I read best?', 'What changed in my reading this year?'], () => brainSummary(idx), [idx]);
  const enough = idx.sessions.length >= 3;
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Tracking</h1><div className="sub">Your reading in numbers. Ebooks are tracked automatically as you read.</div></div>
        {['overview', 'books', 'habits', 'balance'].includes(tab) && enough && <DateRangePicker value={range} today={idx.today} onChange={(v, c) => { setRange(v); setCustom(c); }} />}
      </div>
      {tab === 'overview' && <TrackingDashboard idx={idx} />}
      {enough && tab === 'overview' && <MonthSummary idx={idx} />}
      <Tabs<Tab> value={tab} onChange={(t) => nav(`/insights/${t}`)} tabs={TABS} />
      {!enough && tab !== 'dna' && tab !== 'books' ? (
        <div className="card"><Empty illustration="chart" title="Your statistics will grow here" action={<Link className="btn primary" to="/">Start reading</Link>}>Open an ebook and your reading is tracked automatically. Insights grow with your data — charts first, then patterns, forecasts and your Reading DNA.</Empty></div>
      ) : (
        <>
          {tab === 'overview' && <Overview idx={idx} r={r} />}
          {tab === 'books' && <Books idx={idx} r={r} />}
          {tab === 'habits' && <Habits idx={idx} r={r} />}
          {tab === 'progress' && <Progress idx={idx} />}
          {tab === 'brain' && <Brain idx={idx} />}
          {tab === 'forecast' && <Forecast idx={idx} />}
          {tab === 'dna' && <DNA idx={idx} />}
          {tab === 'records' && <Records idx={idx} />}
          {tab === 'balance' && <Balance idx={idx} r={r} />}
        </>
      )}
    </div>
  );
}

/** Today, this week, pace and every book in progress — at a glance. */
function TrackingDashboard({ idx }: { idx: LibraryIndex }) {
  const { open } = useUI();
  const ebookIds = useEbookIds();
  const pd = pagesByDay(idx);
  const md = minutesByDay(idx);
  const days = Array.from({ length: 14 }, (_, i) => addDays(idx.today, i - 13));
  const sum = (m: Map<string, number>, ks: string[]) => ks.reduce((a, k) => a + (m.get(k) ?? 0), 0);
  const week = days.slice(-7);
  const lastWeek = days.slice(0, 7);
  const monthFrom = startOfMonth(idx.today);
  const month = overview(idx, { from: monthFrom, to: idx.today });
  const year = overview(idx, { from: `${idx.today.slice(0, 4)}-01-01`, to: idx.today });
  const ov = overview(idx, {});
  const speed = readingSpeed();
  const pph = idx.pagesPerMinute();
  const reading = idx.itemList().filter((i) => i.status === 'reading');
  const wkPages = sum(pd, week);
  const prevPages = sum(pd, lastWeek);
  const change = prevPages ? Math.round(((wkPages - prevPages) / prevPages) * 100) : undefined;
  return (
    <div className="col gap-16 mb-16">
      <div className="card">
        <div className="stats-row">
          <div className="stat"><span className="label">Today</span><span className="value">{fmtNum(pd.get(idx.today) ?? 0)}</span><span className="hint">pages · {fmtDuration((md.get(idx.today) ?? 0) * 60) || '0m'}</span></div>
          <div className="stat"><span className="label">Last 7 days</span><span className="value">{fmtNum(wkPages)}</span><span className="hint">pages{change !== undefined ? ` · ${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs week before` : ''}</span></div>
          <div className="stat"><span className="label">Streak</span><span className="value">{ov.currentStreak}</span><span className="hint">days · best {ov.longestStreak}</span></div>
          <div className="stat"><span className="label">Reading speed</span><span className="value">{speed.wpm}</span><span className="hint">words/min{pph ? ` · ${fmtNum(pph * 60)} pages/hr` : ''}</span></div>
          <div className="stat"><span className="label">This month</span><span className="value">{fmtDuration(month.minutes * 60) || '0m'}</span><span className="hint">{fmtNum(month.pages)} pages · {month.activeDays} days</span></div>
          <div className="stat"><span className="label">This year</span><span className="value">{year.booksFinished}</span><span className="hint">books finished · {fmtNum(year.pages)} pages</span></div>
        </div>
      </div>
      <ChartCard title="Last 14 days" subtitle="pages" data={days.map((d) => ({ label: d, value: pd.get(d) ?? 0, title: formatKey(d) }))} xFormat={(k) => WEEKDAYS[new Date(`${k}T12:00:00`).getDay()].slice(0, 2)} format={(v) => fmtNum(v)} />
      {reading.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>In progress</h3><button className="btn xs" onClick={() => open({ kind: 'log' })}>📖 Log a paper book</button></div>
          <div className="col" style={{ gap: 12 }}>
            {reading.map((i) => {
              const f = itemForecast(idx, i);
              const auto = readingFormat(i, ebookIds.has(i.id)) !== 'print';
              return (
                <Link key={i.id} to={`/item/${i.id}`} className="row gap-12">
                  <Cover item={i} width={34} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row between small"><b className="ellipsis">{i.title}</b><span className="num">{Math.round((f.percent ?? 0) * 100)}%</span></div>
                    <div className="mt-8"><ProgressBar value={f.percent} thin /></div>
                    <div className="tiny faint mt-8">{auto ? '📱 auto-tracked' : '📖 paper'}{f.pace ? ` · ${fmtNum(f.pace, 1)}/day` : ''}{f.estimatedFinish ? ` · finish ~${formatKey(f.estimatedFinish)}` : ''}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <div className="chips-scroll">
        <Link className="chip" to="/reading/journal">📅 Reading journal</Link>
        <Link className="chip" to="/plan/goals">🎯 Goals</Link>
        <Link className="chip" to="/plan">🗓 Plans & projects</Link>
        <Link className="chip" to="/insights/records">🏆 Records</Link>
      </div>
    </div>
  );
}

function MonthSummary({ idx }: { idx: LibraryIndex }) {
  const today = idx.today;
  const from = startOfMonth(today);
  const day = Number(today.slice(8));
  const prevFrom = startOfMonth(addDays(from, -1));
  const prevTo = addDays(prevFrom, day - 1);
  const now = overview(idx, { from, to: today });
  const before = overview(idx, { from: prevFrom, to: prevTo < from ? prevTo : addDays(from, -1) });
  const lines: string[] = [];
  if (now.minutes >= 1) lines.push(`You’ve read for ${fmtDuration(now.minutes * 60)} this month.`);
  if (now.pages >= 1) lines.push(`That’s ${fmtNum(now.pages)} pages across ${now.activeDays} day${now.activeDays === 1 ? '' : 's'}.`);
  if (now.booksFinished) lines.push(`You finished ${now.booksFinished} book${now.booksFinished === 1 ? '' : 's'}.`);
  if (now.avgSessionMin) lines.push(`Your average session is ${fmtNum(now.avgSessionMin)} minutes.`);
  if (before.pages > 0 && now.pages > 0) {
    const ch = (now.pages - before.pages) / before.pages;
    if (Math.abs(ch) >= 0.05) lines.push(`That’s ${Math.round(Math.abs(ch) * 100)}% ${ch > 0 ? 'more' : 'less'} than at this point last month.`);
  }
  if (!lines.length) lines.push('No reading logged yet this month — your summary will appear here.');
  return (
    <div className="hero mb-16">
      <div className="eyebrow">Your month so far</div>
      <div className="col mt-8" style={{ gap: 6 }}>
        {lines.map((l) => <p key={l} className="serif" style={{ fontSize: 19, lineHeight: 1.35 }}>{l}</p>)}
      </div>
      <div className="row wrap mt-16"><AskChip question="Why has my reading changed recently?" /><AskChip question="When do I read best?" /></div>
    </div>
  );
}

function Overview({ idx, r }: { idx: LibraryIndex; r: RangeFilter }) {
  const ov = overview(idx, r);
  const pd = useMemo(() => pagesByDay(idx, sessionsIn(idx, r)), [idx, r]);
  const md = useMemo(() => minutesByDay(idx, sessionsIn(idx, r)), [idx, r]);
  const [heat, setHeat] = useState<'pages' | 'minutes'>('pages');
  const heatFrom = r.from && r.from > addDays(idx.today, -365) ? r.from : addDays(idx.today, -364);
  const months = byMonth(idx, r, 'pages');
  const minutesMonths = byMonth(idx, r, 'minutes');
  const weeks = byWeek(idx, r);
  const cat = topN(balance(idx, 'folder', r, 'minutes'), 6);
  const cov = coverage(idx, r);
  const recs = personalRecords(idx).filter((x) => x.value).slice(0, 4);
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="stats-row">
          <div className="stat"><span className="label">Current streak</span><span className="value">{ov.currentStreak}</span><span className="hint">days</span></div>
          <div className="stat"><span className="label">Longest streak</span><span className="value">{ov.longestStreak}</span><span className="hint">days</span></div>
          <div className="stat"><span className="label">Active days</span><span className="value">{ov.activeDays}</span></div>
          <div className="stat"><span className="label">Reading time</span><span className="value">{fmtDuration(ov.minutes * 60)}</span></div>
          <div className="stat"><span className="label">Pages</span><span className="value">{fmtNum(ov.pages)}</span></div>
          <div className="stat"><span className="label">Sessions</span><span className="value">{ov.sessions}</span></div>
          <div className="stat"><span className="label">Finished</span><span className="value">{ov.booksFinished}</span></div>
        </div>
        {Object.entries(ov.unitsByFamily).filter(([k]) => k !== 'pages').length > 0 && <div className="small faint mt-8">Also: {Object.entries(ov.unitsByFamily).filter(([k]) => k !== 'pages').map(([k, v]) => `${fmtNum(k === 'minutes' ? v / 60 : v, 1)} ${k === 'minutes' ? 'hours listened' : k}`).join(' · ')}</div>}
      </div>
      <div className="card">
        <div className="card-head"><h3>Reading calendar</h3><Segmented size="sm" value={heat} onChange={setHeat} options={[{ value: 'pages', label: 'Pages' }, { value: 'minutes', label: 'Minutes' }]} /></div>
        <CalendarHeatmap values={heat === 'pages' ? pd : md} from={heatFrom} to={r.to ?? idx.today} format={(v) => `${fmtNum(v)} ${heat}`} />
      </div>
      <div className="grid c2">
        <ChartCard title="Month by month" subtitle="pages" data={months.map((m) => ({ label: m.key, value: m.value }))} xFormat={fmtMonthShort} format={(v) => fmtNum(v)} />
        <ChartCard title="Time by month" subtitle="hours" initial="line" data={minutesMonths.map((m) => ({ label: m.key, value: m.value / 60 }))} xFormat={fmtMonthShort} format={(v) => fmtNum(v, 1)} />
        <ChartCard title="Active days by week" data={weeks.map((w) => ({ label: w.key, value: w.extra ?? 0, title: `Week of ${formatKey(w.key)}` }))} xFormat={(k) => formatKey(k, idx.today, { short: true })} format={(v) => fmtNum(v)} />
        <div className="card">
          <div className="card-head"><h3>Where time goes</h3><span className="small faint">by top-level folder</span></div>
          {cat.length ? <Donut data={cat.map((c) => ({ label: c.key, value: c.value }))} format={(v) => fmtDuration(v * 60)} /> : <div className="empty small">Time a session to see where your time goes.</div>}
        </div>
      </div>
      <div className="grid c2">
        <div className="card">
          <div className="card-head"><h3>What you covered</h3><span className="small faint">{cov.length} items</span></div>
          <div className="col" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {cov.map((c) => (
              <Link key={c.item.id} to={`/item/${c.item.id}`} className="row small">
                <Cover item={c.item} width={22} />
                <span className="ellipsis grow">{c.item.title}</span>
                <span className="num muted">{fmtUnits(c.item, c.amount)}</span>
                <span className="num faint" style={{ width: 60, textAlign: 'right' }}>{c.sec ? fmtDuration(c.sec) : ''}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Personal records</h3><Link to="/insights/records" className="small muted">All →</Link></div>
          <div className="grid c2">{recs.map((x) => <div key={x.id} className="stat"><span className="label">{x.label}</span><span className="value" style={{ fontSize: 18 }}>{x.display}</span><span className="hint">{x.item?.title ?? (x.date ? formatKey(x.date) : x.detail)}</span></div>)}</div>
        </div>
      </div>
    </div>
  );
}

function Books({ idx, r }: { idx: LibraryIndex; r: RangeFilter }) {
  const fin = finishedIn(idx, r);
  const items = fin.map((f) => f.item);
  const durations = bookDurations(idx, r).sort((a, b) => a.days - b.days);
  const lens = items.filter((i) => pagesOf(i)).sort((a, b) => pagesOf(a)! - pagesOf(b)!);
  const authors = topN(countBy(items.flatMap((i) => idx.authorNames(i))), 8);
  const genres = topN(countBy(items.flatMap((i) => i.genres)), 8);
  const tags = topN(countBy(items.flatMap((i) => i.tagIds.map((t) => idx.tags.get(t)?.name ?? ''))), 8);
  const want = idx.itemList().filter((i) => i.status === 'want');
  const wantPages = want.reduce((a, i) => a + (pagesOf(i) ?? 0), 0);
  const ppm = idx.pagesPerMinute();
  const pace = overallPace(idx);
  if (!fin.length && !want.length) return <div className="card"><Empty icon="📚" title="No finished books in this period">Finish a book (or widen the date range) to see your year in books.</Empty></div>;
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="stats-row">
          <div className="stat"><span className="label">Books finished</span><span className="value lg">{fin.length}</span></div>
          <div className="stat"><span className="label">Longest</span><span className="value" style={{ fontSize: 15 }}>{lens.length ? `${lens[lens.length - 1].title} · ${pagesOf(lens[lens.length - 1])}p` : '—'}</span></div>
          <div className="stat"><span className="label">Shortest</span><span className="value" style={{ fontSize: 15 }}>{lens.length ? `${lens[0].title} · ${pagesOf(lens[0])}p` : '—'}</span></div>
          <div className="stat"><span className="label">Fastest</span><span className="value" style={{ fontSize: 15 }}>{durations.length ? `${durations[0].item.title} · ${durations[0].days}d` : '—'}</span></div>
          <div className="stat"><span className="label">Slowest</span><span className="value" style={{ fontSize: 15 }}>{durations.length ? `${durations[durations.length - 1].item.title} · ${durations[durations.length - 1].days}d` : '—'}</span></div>
        </div>
      </div>
      {fin.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Finished — cover wall</h3></div>
          <div className="cover-wall">{fin.map((f) => <Link key={f.item.id + f.instanceNumber} to={`/item/${f.item.id}`} title={`${f.item.title} — ${formatKey(f.finishedOn)}`}><Cover item={f.item} width={62} /></Link>)}</div>
        </div>
      )}
      <div className="grid c2">
        <ChartCard title="Books finished per month" data={byMonth(idx, r, 'books').map((m) => ({ label: m.key, value: m.value }))} xFormat={fmtMonthShort} />
        <ChartCard title="Pages per month" data={byMonth(idx, r, 'pages').map((m) => ({ label: m.key, value: m.value }))} xFormat={fmtMonthShort} />
        <ChartCard title="Rating breakdown" kinds={['bar', 'table']} data={ratingBreakdown(idx, r).map((b) => ({ label: `${b.key}★`, value: b.value }))} />
        <ChartCard title="Book length" subtitle="finished books by pages" kinds={['bar', 'table']} data={lengthBreakdown(items).map((b) => ({ label: b.key, value: b.value }))} />
        <div className="card"><div className="card-head"><h3>Print · ebook · audio</h3></div>{items.length ? <Donut data={typeBreakdown(items).map((b) => ({ label: b.key, value: b.value }))} /> : <div className="empty small">—</div>}</div>
        <ChartCard title="Publication decades" kinds={['bar', 'table']} data={decadeBreakdown(items).map((b) => ({ label: b.key, value: b.value }))} />
        <div className="card"><div className="card-head"><h3>Top authors</h3></div>{authors.length ? <BarChart horizontal data={authors.map((a) => ({ label: a.key, value: a.value }))} /> : <div className="small muted">—</div>}</div>
        <div className="card"><div className="card-head"><h3>Top genres</h3></div>{genres.length ? <BarChart horizontal data={genres.map((a) => ({ label: a.key, value: a.value }))} color="var(--s3)" /> : <div className="small muted">Add genres to your books to see this.</div>}</div>
        {tags.length > 0 && <div className="card"><div className="card-head"><h3>Top tags</h3></div><BarChart horizontal data={tags.map((a) => ({ label: a.key, value: a.value }))} color="var(--s7)" /></div>}
        <div className="card">
          <div className="card-head"><h3>Your Want-to-Read list</h3></div>
          <div className="stats-row">
            <div className="stat"><span className="label">Items</span><span className="value">{want.length}</span></div>
            <div className="stat"><span className="label">Pages</span><span className="value">{fmtNum(wantPages)}</span></div>
            <div className="stat"><span className="label">Reading time</span><span className="value">{ppm ? fmtDuration((wantPages / ppm) * 60) : '—'}</span><span className="hint">{ppm ? 'at your speed' : 'time sessions to estimate'}</span></div>
            <div className="stat"><span className="label">Reading days</span><span className="value">{pace ? fmtNum(wantPages / pace) : '—'}</span><span className="hint">at your pace</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function countBy(xs: string[]) {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

function Habits({ idx, r }: { idx: LibraryIndex; r: RangeFilter }) {
  const tp = useMemo(() => timeProfile(idx, r), [idx, r]);
  const hours = Array.from({ length: 24 }, (_, h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`);
  const speeds = speedByItem(idx).slice(0, 12);
  const ppm = idx.pagesPerMinute();
  const timedMinutes = tp.hours.reduce((a, b) => a + b, 0);
  const cum = cumulative(idx, r);
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="stats-row">
          <div className="stat"><span className="label">Pages / hour</span><span className="value">{ppm ? fmtNum(ppm * 60) : '—'}</span><span className="hint">from timed page sessions</span></div>
          <div className="stat"><span className="label">Timed reading</span><span className="value">{fmtDuration(timedMinutes * 60)}</span></div>
          <div className="stat"><span className="label">Avg session</span><span className="value">{overview(idx, r).avgSessionMin ? fmtDuration(overview(idx, r).avgSessionMin! * 60) : '—'}</span></div>
        </div>
      </div>
      {timedMinutes < 30 ? <div className="notice">Use the timer (or add minutes when logging) to unlock time-of-day and speed analytics.</div> : (
        <>
          <div className="grid c2">
            <ChartCard title="Reading time by hour" kinds={['bar', 'area', 'table']} data={tp.hours.map((v, h) => ({ label: hours[h], value: v }))} format={(v) => `${fmtNum(v)}m`} />
            <ChartCard title="Reading time by weekday" kinds={['bar', 'table']} data={tp.weekdays.map((v, d) => ({ label: WEEKDAYS[d], value: v / 60 }))} format={(v) => `${fmtNum(v, 1)}h`} />
            <ChartCard title="Average session by weekday" kinds={['bar', 'table']} data={tp.avgSessionByWeekday.map((v, d) => ({ label: WEEKDAYS[d], value: v }))} format={(v) => `${fmtNum(v)}m`} />
            <ChartCard title="Reading speed by month" subtitle="pages/hour" initial="line" data={speedByMonth(idx, r).map((b) => ({ label: b.key, value: b.value }))} xFormat={fmtMonthShort} />
          </div>
          <div className="card"><div className="card-head"><h3>Weekday × hour</h3><span className="small faint">minutes</span></div><MatrixHeatmap rows={tp.grid} rowLabels={WEEKDAYS} colLabels={hours} format={(v) => `${fmtNum(v)} min`} /></div>
        </>
      )}
      <div className="grid c2">
        <div className="card"><div className="card-head"><h3>Total pages over time</h3></div>{cum.length > 1 ? <LineChart area series={[{ name: 'Pages', points: cum.map((c) => ({ x: c.key, y: c.value })) }]} xFormat={(x) => formatKey(x, idx.today, { short: true })} /> : <div className="empty small">More sessions needed.</div>}</div>
        <div className="card"><div className="card-head"><h3>Reading speed per book</h3><span className="small faint">pages/hour</span></div>{speeds.length ? <BarChart horizontal data={speeds.map((s) => ({ label: s.item.title, value: s.speed }))} format={(v) => fmtNum(v)} /> : <div className="small muted">Time sessions to compare books.</div>}</div>
      </div>
    </div>
  );
}

function Progress({ idx }: { idx: LibraryIndex }) {
  const years = yearsWithData(idx);
  const cum = cumulative(idx, {});
  const setAside = idx.itemList().filter((i) => i.status === 'paused');
  const dnf = idx.itemList().filter((i) => i.status === 'dnf');
  const fy = futureYou(idx);
  return (
    <div className="col gap-16">
      <div className="card"><div className="card-head"><h3>Progress over time</h3><span className="small faint">cumulative pages, all time</span></div>{cum.length > 1 ? <LineChart area series={[{ name: 'Pages', points: cum.map((c) => ({ x: c.key, y: c.value })) }]} xFormat={(x) => formatKey(x, idx.today, { short: true })} /> : <div className="empty small">Keep reading.</div>}</div>
      <FutureYouCard fy={fy} />
      <div className="grid c2">
        <div className="card"><div className="card-head"><h3>Set aside ({setAside.length})</h3></div>{setAside.length ? setAside.map((i) => <Link key={i.id} to={`/item/${i.id}`} className="row small"><Cover item={i} width={22} /><span className="grow ellipsis">{i.title}</span><span className="faint">{i.total ? `${Math.round((idx.position(i) / i.total) * 100)}%` : ''}</span></Link>) : <div className="small muted">Nothing set aside.</div>}</div>
        <div className="card"><div className="card-head"><h3>Didn’t finish ({dnf.length})</h3></div>{dnf.length ? dnf.map((i) => <Link key={i.id} to={`/item/${i.id}`} className="row small"><Cover item={i} width={22} /><span className="grow ellipsis">{i.title}</span><span className="faint">stopped at {i.total ? `${Math.round((idx.position(i) / i.total) * 100)}%` : '?'}</span></Link>) : <div className="small muted">No abandoned books.</div>}</div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Year by year</h3></div>
        {years.length === 0 ? <div className="small muted">—</div> : (
          <>
            <StackedBars rows={years.slice().reverse().map((y) => { const o = overview(idx, { from: `${y}-01-01`, to: `${y}-12-31` }); return { label: String(y), values: { Pages: o.pages } }; })} keys={['Pages']} />
            <div className="col mt-16">
              {years.map((y) => {
                const f = finishedIn(idx, { from: `${y}-01-01`, to: `${y}-12-31` });
                const o = overview(idx, { from: `${y}-01-01`, to: `${y}-12-31` });
                return (
                  <details key={y}>
                    <summary style={{ cursor: 'pointer' }}><b>{y}</b> <span className="small muted">— {f.length} finished · {fmtNum(o.pages)} pages · {fmtDuration(o.minutes * 60)} · {o.activeDays} active days</span></summary>
                    <div className="cover-wall mt-8">{f.map((x) => <Link key={x.item.id + x.instanceNumber} to={`/item/${x.item.id}`} title={x.item.title}><Cover item={x.item} width={48} /></Link>)}</div>
                  </details>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FutureYouCard({ fy }: { fy: ReturnType<typeof futureYou> }) {
  if (!fy.pace) return <div className="card"><div className="card-head"><h3>Future you</h3></div><div className="small muted">Not enough recent reading to project forward yet.</div></div>;
  return (
    <div className="card">
      <div className="card-head"><h3>Future you</h3><span className="small faint">at {fmtNum(fy.pace, 1)} pages/day, through your queue</span></div>
      <div className="grid c3">
        {fy.horizons.map((h) => (
          <div key={h.days} className="stat">
            <span className="label">{h.label}</span>
            <span className="value">{h.sim.finished.length} book{h.sim.finished.length === 1 ? '' : 's'}</span>
            <span className="hint">{fmtNum(h.sim.pages)} pages{h.sim.equivalentBooks ? ` · ≈${fmtNum(h.sim.equivalentBooks, 1)} average-length books` : ''}</span>
            <div className="small muted ellipsis">{h.sim.finished.slice(0, 3).map((f) => f.item.title).join(', ')}{h.sim.finished.length > 3 ? '…' : ''}</div>
          </div>
        ))}
      </div>
      <div className="tiny faint mt-8">“Books” counts items from your library that would be finished, in queue order (current books first).</div>
    </div>
  );
}

function Brain({ idx }: { idx: LibraryIndex }) {
  const obs = readingBrain(idx);
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="card-head"><h3>🧠 Reading Brain</h3><span className="small faint">computed from your data — nothing is guessed</span></div>
        {obs.length === 0 ? <Empty icon="🌱" title="Not enough data yet">Keep reading. We’ll start identifying patterns once we have enough data — each observation needs a minimum amount of evidence.</Empty> : (
          <div className="col gap-12">
            {obs.map((o) => (
              <div key={o.id} className={`notice ${o.tone === 'attention' ? 'warn' : o.tone === 'positive' ? 'good' : ''}`}>
                <div style={{ fontSize: 15, color: 'var(--text)' }}>{o.text}</div>
                <div className="small faint">{o.evidence}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-head"><h3>✦ Reading coach</h3></div>
        <AIPanel kind="coach" title="Reading coach" buttonLabel="What patterns do you see?" build={() => ({
          system: BASE_SYSTEM,
          messages: [{ role: 'user', content: `Act as a neutral reading coach. Interpret ONLY the computed stats and observations below. Point out 2–4 patterns and 1–2 gentle, optional suggestions. If data is thin, say "Not enough data yet."\n\n${brainSummary(idx)}` }],
        })} />
      </div>
    </div>
  );
}

function Forecast({ idx }: { idx: LibraryIndex }) {
  const current = overallPace(idx);
  const [pace, setPace] = useState<number>(Math.round(current ?? idx.settings.defaultPace));
  const sims = [30, 90, 365].map((d) => ({ d, cur: current ? simulateQueue(idx, constantSchedule(current), d) : undefined, hyp: simulateQueue(idx, constantSchedule(pace), d) }));
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="row wrap gap-24">
          <div className="stat"><span className="label">Current pace</span><span className="value lg">{current ? fmtNum(current, 1) : '—'}</span><span className="hint">pages per reading day (last {idx.settings.paceWindowDays} days)</span></div>
          <label className="field grow" style={{ minWidth: 240 }}>Try a hypothetical pace: <b>{pace} pages/day</b>
            <input type="range" min={5} max={150} step={1} value={pace} onChange={(e) => setPace(Number(e.target.value))} />
          </label>
        </div>
      </div>
      <div className="grid c3">
        {sims.map((s) => (
          <div key={s.d} className="card">
            <div className="card-head"><h3>{s.d === 365 ? 'One year' : `${s.d} days`}</h3></div>
            <dl className="kv">
              <dt>At current pace</dt><dd>{s.cur ? `${fmtNum(s.cur.pages)} p · ${s.cur.finished.length} books` : '—'}</dd>
              <dt>At {pace}/day</dt><dd><b>{fmtNum(s.hyp.pages)} p · {s.hyp.finished.length} books</b></dd>
            </dl>
            <div className="small muted mt-8 ellipsis">{s.hyp.finished.slice(0, 4).map((f) => f.item.title).join(', ')}</div>
          </div>
        ))}
      </div>
      <FutureYouCard fy={futureYou(idx)} />
      <div className="card">
        <div className="card-head"><h3>✦ Explain my forecast</h3></div>
        <AIPanel kind="coach" title="Forecast explanation" buttonLabel="Explain in plain language" build={() => ({
          system: BASE_SYSTEM,
          messages: [{ role: 'user', content: `Explain what these deterministic forecasts mean in everyday terms (e.g. "roughly six months"). Do not recalculate.\n\n${brainSummary(idx)}\n\nHorizons at current pace: ${sims.map((s) => `${s.d} days → ${s.cur ? `${Math.round(s.cur.pages)} pages, ${s.cur.finished.length} books` : 'n/a'}`).join('; ')}.` }],
        })} />
      </div>
    </div>
  );
}

function DNA({ idx }: { idx: LibraryIndex }) {
  const years = yearsWithData(idx);
  const [year, setYear] = useState<number | 'life'>(years[0] ?? 'life');
  const dna = readingDNA(idx, year === 'life' ? undefined : year);
  const text = `MY ${dna.label.toUpperCase()} READING DNA\n${dna.books} books · ${fmtNum(dna.pages)} pages · ${fmtNum(dna.hours)} hours\nAverage book: ${dna.avgBookPages ? fmtNum(dna.avgBookPages) + ' pages' : '—'}\nAverage rating: ${dna.avgRating ? dna.avgRating.toFixed(1) : '—'}\nPeak month: ${dna.peakMonth ? formatMonth(dna.peakMonth, true) : '—'}\nAverage session: ${dna.avgSessionMin ? fmtNum(dna.avgSessionMin) + ' min' : '—'}\nLongest streak: ${dna.longestStreak} days\nFastest speed: ${dna.fastestSpeed ? fmtNum(dna.fastestSpeed) + ' pages/hour' : '—'}\nTop category: ${dna.topCategory ?? '—'}\n— made with Shelf`;
  if (!dna.hasData) return <div className="card"><Empty icon="🧬" title="Your Reading DNA appears as you read">Finish a book or log a few sessions to see your profile.</Empty></div>;
  const Tile = ({ k, v }: { k: string; v: string }) => <div className="stat"><span className="label">{k}</span><span className="value" style={{ fontSize: 20 }}>{v}</span></div>;
  return (
    <div className="col gap-16">
      <div className="row wrap gap-4">{years.map((y) => <button key={y} className={`chip ${year === y ? 'on' : ''}`} onClick={() => setYear(y)}>{y}</button>)}<button className={`chip ${year === 'life' ? 'on' : ''}`} onClick={() => setYear('life')}>Lifetime</button></div>
      <div className="dna">
        <div className="small" style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>Your {dna.label} Reading DNA</div>
        <div className="row wrap gap-24 mt-16">
          <div><div className="big">{dna.books}</div><div className="muted">books</div></div>
          <div><div className="big">{fmtNum(dna.pages)}</div><div className="muted">pages</div></div>
          <div><div className="big">{fmtNum(dna.hours)}</div><div className="muted">hours</div></div>
          <div><div className="big">{dna.activeDays}</div><div className="muted">active days</div></div>
        </div>
        <div className="grid c4 mt-24">
          <Tile k="Average book" v={dna.avgBookPages ? `${fmtNum(dna.avgBookPages)} pages` : '—'} />
          <Tile k="Average rating" v={dna.avgRating ? `${dna.avgRating.toFixed(1)} ★` : '—'} />
          <Tile k="Peak month" v={dna.peakMonth ? formatMonth(dna.peakMonth, true).split(' ')[0] : '—'} />
          <Tile k="Average session" v={dna.avgSessionMin ? `${fmtNum(dna.avgSessionMin)} min` : '—'} />
          <Tile k="Longest streak" v={`${dna.longestStreak} days`} />
          <Tile k="Fastest speed" v={dna.fastestSpeed ? `${fmtNum(dna.fastestSpeed)} p/h` : '—'} />
          <Tile k="Top category" v={dna.topCategory ?? '—'} />
          <Tile k="Top author" v={dna.topAuthor ?? '—'} />
        </div>
        {dna.covers.length > 0 && <div className="cover-wall mt-24">{dna.covers.slice(0, 40).map((c, i) => <Cover key={`${c.id}-${i}`} item={{ id: c.id, title: c.title, coverUrl: c.cover, contentType: 'book' }} width={44} />)}</div>}
      </div>
      <div className="row">
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); alert('Copied your Reading DNA summary.'); } catch { download(`reading-dna-${dna.label}.txt`, text); } }}>Copy shareable summary</button>
        <button className="btn ghost" onClick={() => download(`reading-dna-${dna.label}.txt`, text)}>Download as text</button>
      </div>
    </div>
  );
}

function Records({ idx }: { idx: LibraryIndex }) {
  const recs = personalRecords(idx);
  return (
    <div className="grid auto">
      {recs.map((r) => (
        <div key={r.id} className="card">
          <div className="stat">
            <span className="label">🏆 {r.label}</span>
            <span className="value">{r.display}</span>
            <span className="hint">{r.item ? <Link to={`/item/${r.item.id}`}>{r.item.title}</Link> : r.date ? formatKey(r.date) : r.detail ?? (r.value ? '' : 'Not set yet')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Balance({ idx, r }: { idx: LibraryIndex; r: RangeFilter }) {
  const [dim, setDim] = useState<'genre' | 'tag' | 'folder' | 'contentType' | 'author'>('folder');
  const [w, setW] = useState<'pages' | 'minutes' | 'items'>('pages');
  const data = topN(balance(idx, dim, r, w), 7);
  const total = data.reduce((a, b) => a + b.value, 0);
  const pts = speedByItem(idx).map((s) => ({ x: pagesOf(s.item) ?? 0, y: s.speed, label: s.item.title })).filter((p) => p.x > 0);
  return (
    <div className="col gap-16">
      <div className="card">
        <div className="row wrap between mb-16">
          <Segmented size="sm" value={dim} onChange={setDim} options={[{ value: 'folder', label: 'Folder' }, { value: 'genre', label: 'Genre' }, { value: 'tag', label: 'Tag' }, { value: 'contentType', label: 'Type' }, { value: 'author', label: 'Author' }]} />
          <Segmented size="sm" value={w} onChange={setW} options={[{ value: 'pages', label: 'Pages read' }, { value: 'minutes', label: 'Time' }, { value: 'items', label: 'Library items' }]} />
        </div>
        {total === 0 ? <div className="empty small">No data for this combination.</div> : <Donut size={220} data={data.map((d) => ({ label: d.key, value: d.value }))} format={(v) => (w === 'minutes' ? fmtDuration(v * 60) : fmtNum(v))} />}
        <p className="small faint mt-16">Descriptive only — this shows what your reading is made of, not what it should be.</p>
      </div>
      {pts.length >= 3 && <div className="card"><div className="card-head"><h3>Length vs. speed</h3></div><Scatter points={pts} xLabel="pages" yLabel="pages/hour" /></div>}
    </div>
  );
}
