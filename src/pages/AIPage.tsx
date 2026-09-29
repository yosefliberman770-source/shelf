import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { type AIMessage, complete, completeJSON } from '../ai/client';
import { BASE_SYSTEM, folderDigest, itemContext, itemLine, libraryDigest, relevantItems } from '../ai/context';
import { brainSummary } from '../ai/summaries';
import { AIErrorNotice, AIOff, AISetupCard, SharedPreview, useAICall, useAIReady } from '../ai/ui';
import { AIBadge, Cover, Empty, ItemPicker, Markdown, Segmented, Tabs } from '../components/common';
import { addItem, deleteAIRecord, deleteAllAIData, saveAIRecord } from '../db/actions';
import type { ContentType, Item, Status } from '../db/types';
import { formatKey, keyFromMs } from '../engine/dates';
import { libraryForecast, overallPace } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { isEmptyQuery, type LibraryQuery, parseQuestion, progressOf, runQuery } from '../engine/query';
import { fmtNum, pagesOf } from '../engine/units';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';

type Tab = 'assistant' | 'ask' | 'recommend' | 'tutor' | 'notebook';

export default function AIPage() {
  const idx = useLibrary();
  const loc = useLocation();
  const nav = useNavigate();
  const seg = loc.pathname.split('/')[2] as Tab | undefined;
  const tab: Tab = ['assistant', 'ask', 'recommend', 'tutor', 'notebook'].includes(seg ?? '') ? seg! : 'assistant';
  const ready = useAIReady();
  return (
    <div className="page">
      <div className="ai-card mb-24">
        <div className="row between wrap">
          <h1 style={{ color: '#fff' }}>Your reading assistant</h1>
          <Link className="chip" to="/settings?tab=ai">Settings & privacy</Link>
        </div>
        <p style={{ opacity: 0.92, marginTop: 8, maxWidth: 620 }}>It works from your real library. Shelf calculates every number; the assistant explains, recommends and connects — and never changes your books by itself.</p>
      </div>
      {!ready && <div className="card mb-16"><AISetupCard onGo={() => nav('/settings?tab=ai')} /></div>}
      <Tabs<Tab> value={tab} onChange={(t) => nav(`/ai/${t}`)} tabs={[{ id: 'assistant', label: 'Chat' }, { id: 'recommend', label: 'What to read' }, { id: 'ask', label: 'Search my library' }, { id: 'tutor', label: 'Quiz me' }, { id: 'notebook', label: `Saved · ${idx.snap.ai.length}` }]} />
      {tab === 'ask' && <AskLibrary idx={idx} />}
      {tab === 'assistant' && <Assistant idx={idx} />}
      {tab === 'recommend' && <Recommendations idx={idx} />}
      {tab === 'tutor' && <Tutor idx={idx} />}
      {tab === 'notebook' && <Notebook idx={idx} />}
      <div className="grid auto mt-24">
        <Link to="/explore/gaps" className="card tight"><b>🔍 Gap finder</b><div className="small muted">Areas you’ve read little about</div></Link>
        <Link to="/explore/paths" className="card tight"><b>🧭 Reading paths</b><div className="small muted">Beginner → advanced, from books you own</div></Link>
        <Link to="/insights/brain" className="card tight"><b>🧠 Reading coach</b><div className="small muted">Patterns in your habits</div></Link>
        <Link to="/plan/whatif" className="card tight"><b>🧮 What-if planner</b><div className="small muted">Plans in plain language</div></Link>
        <Link to="/explore/compare" className="card tight"><b>⚖ Book comparison</b><div className="small muted">Complementary, not ranked</div></Link>
        <Link to="/explore/rabbit" className="card tight"><b>🕳 Rabbit hole</b><div className="small muted">Branch through any subject</div></Link>
      </div>
    </div>
  );
}

// ── Ask My Library ─────────────────────────────────────────────────────

const ALLOWED_KEYS: (keyof LibraryQuery)[] = ['subject', 'text', 'statuses', 'favorite', 'minRating', 'maxRating', 'minPages', 'maxPages', 'author', 'genres', 'contentTypes', 'publishedBefore', 'publishedAfter', 'startedNotFinished', 'hasDeadline', 'maxHours', 'histFrom', 'histTo', 'difficulty', 'untouchedDays', 'behindSchedule'];
const STATUSES: Status[] = ['want', 'reading', 'read', 'paused', 'dnf'];

function sanitizeQuery(raw: Record<string, unknown>): LibraryQuery {
  const q: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) {
    const v = raw[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'statuses') { const s = (Array.isArray(v) ? v : [v]).filter((x) => STATUSES.includes(x as Status)); if (s.length) q.statuses = s; }
    else if (k === 'contentTypes' || k === 'genres') { if (Array.isArray(v) && v.length) q[k] = v.map(String) as ContentType[]; }
    else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') q[k] = v;
  }
  return q as LibraryQuery;
}

function describeQuery(q: LibraryQuery): string[] {
  const out: string[] = [];
  if (q.subject) out.push(`about “${q.subject}”`);
  if (q.text) out.push(`matching “${q.text}”`);
  if (q.statuses) out.push(q.statuses.join('/'));
  if (q.startedNotFinished) out.push('started, not finished');
  if (q.minRating !== undefined) out.push(`rated ≥ ${q.minRating}★`);
  if (q.maxRating !== undefined) out.push(`rated ≤ ${q.maxRating}★`);
  if (q.minPages !== undefined) out.push(`≥ ${q.minPages} pages`);
  if (q.maxPages !== undefined) out.push(`≤ ${q.maxPages} pages`);
  if (q.author) out.push(`by ${q.author}`);
  if (q.contentTypes) out.push(q.contentTypes.join('/'));
  if (q.genres) out.push(`genre ${q.genres.join('/')}`);
  if (q.publishedBefore !== undefined) out.push(`published before ${q.publishedBefore}`);
  if (q.publishedAfter !== undefined) out.push(`published after ${q.publishedAfter}`);
  if (q.favorite) out.push('favorites');
  if (q.maxHours !== undefined) out.push(`≤ ${q.maxHours} hours`);
  if (q.histFrom !== undefined || q.histTo !== undefined) out.push(`covering ${q.histFrom ?? '…'}–${q.histTo ?? '…'}`);
  if (q.difficulty) out.push(q.difficulty);
  return out;
}

function AskLibrary({ idx }: { idx: LibraryIndex }) {
  const ready = useAIReady();
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<{ q: string; query: LibraryQuery; intent: string; results: Item[]; via: 'rules' | 'ai' } | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const { loading, error, run } = useAICall();
  const examples = ['What books do I own about medieval England?', 'Which books have I rated four stars and are under 300 pages?', 'What books have I started but never finished?', 'What books connect history and political philosophy?', 'How many pages of history do I have left?', 'What should I read next?'];
  const ask = async (text: string) => {
    setQuestion(text);
    setAnswer(null);
    const parsed = parseQuestion(text, idx);
    let query = parsed.query;
    let via: 'rules' | 'ai' = 'rules';
    // 1. Structured query first (rules); AI may refine the structure but never the results.
    if (ready && (isEmptyQuery(query) || /connect|about|similar|related/i.test(text))) {
      const r = await run((signal) => completeJSON<Record<string, unknown>>({
        system: `Convert a question about the user's personal library into a JSON filter. Allowed keys: ${ALLOWED_KEYS.join(', ')}. statuses ⊂ [want, reading, read, paused, dnf]. "subject" is free text matched against titles, descriptions, genres, folders, tags and linked concepts — use the most distinctive 1–3 words. Years are numbers (negative = BCE). Return only JSON.\n\nUser's folders:\n${folderDigest(idx)}`,
        messages: [{ role: 'user', content: text }],
        maxTokens: 300,
      }, signal));
      if (r) { const aiQ = sanitizeQuery(r.data); if (!isEmptyQuery(aiQ)) { query = { ...query, ...aiQ }; via = 'ai'; } }
    }
    let results = parsed.intent === 'next' ? [] : runQuery(idx, query);
    // Fallback: a multi-subject question ("history and philosophy") — try each word group.
    if (!results.length && query.subject && /\band\b/.test(query.subject)) {
      const parts = query.subject.split(/\band\b/).map((s) => s.trim()).filter(Boolean);
      const sets = parts.map((p) => new Set(runQuery(idx, { ...query, subject: p }).map((i) => i.id)));
      results = idx.itemList().filter((i) => sets.every((s) => s.has(i.id)));
      if (!results.length) results = idx.itemList().filter((i) => sets.some((s) => s.has(i.id)));
    }
    setAsked({ q: text, query, intent: parsed.intent, results, via });
    // 2. Only the computed results go to the AI for phrasing.
    if (ready) {
      const lib = libraryForecast(idx);
      const remaining = results.reduce((a, i) => a + (i.total && pagesOf(i) ? Math.max(0, pagesOf(i)! - (idx.pageEquivalent(i, idx.position(i)) ?? 0)) : 0), 0);
      const facts = parsed.intent === 'next'
        ? `READING NOW:\n${idx.itemList().filter((i) => i.status === 'reading').map((i) => itemLine(idx, i, { share: idx.settings.ai.share, withProgress: true })).join('\n') || 'none'}\nUP NEXT / WANT TO READ:\n${idx.itemList().filter((i) => i.status === 'want').slice(0, 60).map((i) => itemLine(idx, i, { share: idx.settings.ai.share })).join('\n')}\n\n${brainSummary(idx)}`
        : `MATCHING ITEMS (${results.length}, computed by the app):\n${results.slice(0, 60).map((i) => itemLine(idx, i, { share: idx.settings.ai.share, withProgress: true })).join('\n') || 'none'}\n${parsed.intent === 'remaining' ? `PAGES REMAINING across these (computed): ${Math.round(remaining)}. Current pace: ${fmtNum(overallPace(idx), 1)} pages/day. Library total remaining: ${Math.round(lib.remaining)}.` : ''}`;
      const a = await run((signal) => complete({ system: BASE_SYSTEM, messages: [{ role: 'user', content: `Answer the question using only the data below. If nothing matches, say so plainly.\n\nQUESTION: ${text}\n\n${facts}` }], maxTokens: 1000 }, signal));
      if (a) setAnswer(a.text);
    }
  };
  const remaining = asked?.intent === 'remaining' ? asked.results.reduce((a, i) => a + (pagesOf(i) ? Math.max(0, pagesOf(i)! - (idx.pageEquivalent(i, idx.position(i)) ?? 0)) : 0), 0) : undefined;
  const pace = overallPace(idx);
  return (
    <div className="col gap-16">
      <div className="card col">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask(question.trim()); }}>
          <input className="input" style={{ fontSize: 15, height: 42 }} placeholder="Ask anything about your library…" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <button className="btn primary" style={{ height: 42 }} disabled={loading || !question.trim()}>Ask</button>
        </form>
        <div className="row wrap gap-4">{examples.map((e) => <button key={e} className="chip" onClick={() => ask(e)}>{e}</button>)}</div>
        <div className="tiny faint">Shelf searches your structured data first. {ready ? 'The AI may help interpret the question and phrase the answer, but results always come from your database.' : 'AI is off — answers come straight from your database.'}</div>
      </div>
      {asked && (
        <div className="grid c2">
          <div className="card">
            <div className="card-head"><h3>From your library</h3><span className="small faint">{asked.via === 'ai' ? 'filters interpreted by AI' : 'filters from your question'}</span></div>
            <div className="row wrap gap-4 mb-8">{describeQuery(asked.query).map((d) => <span key={d} className="chip accent">{d}</span>)}</div>
            {asked.intent === 'next' ? (
              <NextUp idx={idx} />
            ) : asked.results.length === 0 ? <div className="small muted">No matching items in your library.</div> : (
              <>
                {asked.intent === 'count' && <p className="mb-8">You have <b>{asked.results.length}</b> matching item{asked.results.length === 1 ? '' : 's'}.</p>}
                {remaining !== undefined && <p className="mb-8"><b>{fmtNum(remaining)} pages</b> left across {asked.results.length} items{pace ? ` — about ${fmtNum(remaining / pace)} reading days at ${fmtNum(pace, 1)}/day` : ''}.</p>}
                <div className="col" style={{ maxHeight: 460, overflowY: 'auto' }}>
                  {asked.results.slice(0, 100).map((i) => (
                    <Link key={i.id} to={`/item/${i.id}`} className="book-row"><Cover item={i} width={28} /><div className="grow"><div className="ellipsis" style={{ fontWeight: 500 }}>{i.title}</div><div className="small muted">{idx.authorLine(i)} · {i.status}{idx.rating(i) ? ` · ${idx.rating(i)}★` : ''}{pagesOf(i) ? ` · ${pagesOf(i)}p` : ''}{progressOf(idx, i) !== undefined && i.status === 'reading' ? ` · ${Math.round(progressOf(idx, i)! * 100)}%` : ''}</div></div></Link>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3>✦ Answer</h3></div>
            {!ready ? <div className="small muted">Enable AI for a conversational answer. The list on the left is the authoritative result.</div> : loading ? <div className="small muted">Thinking…</div> : answer ? <div className="notice ai"><AIBadge /><div className="mt-8"><Markdown text={answer} /></div></div> : null}
            <AIErrorNotice error={error} />
          </div>
        </div>
      )}
    </div>
  );
}

function NextUp({ idx }: { idx: LibraryIndex }) {
  const next = idx.itemList().filter((i) => i.queue === 'next').sort((a, b) => a.queueOrder - b.queueOrder);
  const reading = idx.itemList().filter((i) => i.status === 'reading');
  return (
    <div className="col">
      {reading.length > 0 && <div className="small muted">You’re currently reading {reading.length} item{reading.length === 1 ? '' : 's'}: {reading.map((i) => i.title).join(', ')}.</div>}
      {next.length ? next.slice(0, 5).map((i) => <Link key={i.id} to={`/item/${i.id}`} className="book-row"><Cover item={i} width={28} /><span className="grow ellipsis">{i.title}</span><span className="chip">Next in queue</span></Link>) : <div className="small muted">Nothing in your “Next” lane. See Recommendations for suggestions.</div>}
    </div>
  );
}

// ── Assistant chat ─────────────────────────────────────────────────────

function Assistant({ idx }: { idx: LibraryIndex }) {
  const ready = useAIReady();
  const [msgs, setMsgs] = useState<AIMessage[]>([]);
  const [text, setText] = useState('');
  const [ctx, setCtx] = useState({ library: true, stats: true, current: true });
  const { loading, error, run } = useAICall();
  const context = () => [
    ctx.current ? `CURRENTLY READING:\n${idx.itemList().filter((i) => i.status === 'reading').map((i) => itemContext(idx, i, idx.settings.ai.share)).join('\n\n') || 'none'}` : '',
    ctx.stats ? brainSummary(idx) : '',
    ctx.library ? `${folderDigest(idx)}\n\n${libraryDigest(idx, idx.settings.ai.share, relevantItems(idx, msgs.map((m) => m.content).join(' ') + ' ' + text, 120))}` : '',
  ].filter(Boolean).join('\n\n');
  const send = async (q: string) => {
    if (!q.trim()) return;
    const history: AIMessage[] = [...msgs, { role: 'user', content: q.trim() }];
    setMsgs(history);
    setText('');
    const first = { role: 'user' as const, content: `${context()}\n\nQUESTION: ${history[0].content}` };
    const r = await run((signal) => complete({ system: BASE_SYSTEM, messages: [first, ...history.slice(1)], maxTokens: 2000 }, signal));
    if (r) setMsgs([...history, { role: 'assistant', content: r.text }]);
  };
  if (!ready) return <AIOff />;
  return (
    <div className="card col gap-12">
      <div className="row wrap gap-4 small">
        <span className="muted">Share with the AI:</span>
        {(['current', 'stats', 'library'] as const).map((k) => <label key={k} className="check"><input type="checkbox" checked={ctx[k]} onChange={(e) => setCtx({ ...ctx, [k]: e.target.checked })} /> {k === 'current' ? 'Current books & notes' : k === 'stats' ? 'Reading stats' : 'Relevant library items'}</label>)}
      </div>
      <div className="chat" style={{ minHeight: 200 }}>
        {msgs.length === 0 && <div className="row wrap gap-4">{['What should I read next?', 'Why do I keep abandoning books?', 'What books in my library are similar to my current read?', 'Give me something shorter.', 'What subjects am I most interested in?'].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>{m.role === 'assistant' ? <><AIBadge /><div className="mt-8"><Markdown text={m.content} /></div></> : m.content}</div>)}
        {loading && <div className="msg ai faint">Thinking…</div>}
      </div>
      <AIErrorNotice error={error} />
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="input" placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" disabled={loading || !text.trim()}>Send</button>
        {msgs.length > 0 && <button type="button" className="btn ghost" onClick={() => setMsgs([])}>New chat</button>}
      </form>
      <SharedPreview req={{ system: BASE_SYSTEM, messages: [{ role: 'user', content: context() }] }} />
    </div>
  );
}

// ── Recommendations ────────────────────────────────────────────────────

const MODES = [
  { id: 'next', label: "What's next?", prompt: 'Recommend what to read next, prioritising unread books the reader already owns that fit their current interests, pace and goals.' },
  { id: 'new', label: 'Take me somewhere new', prompt: 'Recommend books that take the reader into subjects or genres they have NOT explored much, but that connect to things they rated highly.' },
  { id: 'quick', label: 'Give me something quick', prompt: 'Recommend short reads (by page count or hours) that fit the reader’s taste — prefer owned books under ~250 pages or ~6 hours.' },
  { id: 'deeper', label: 'Go deeper', prompt: 'Recommend books that go deeper into the subjects the reader has read most about — more advanced treatments, primary sources, specialist works.' },
  { id: 'connect', label: 'Connect my books', prompt: 'Recommend books that bridge two or more of the reader’s existing interests, explaining the connection.' },
] as const;

interface Rec { title: string; author?: string; itemId?: string; why: string; length?: string }

function Recommendations({ idx }: { idx: LibraryIndex }) {
  const ready = useAIReady();
  const { toast } = useUI();
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('next');
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const { loading, error, run } = useAICall();
  const m = MODES.find((x) => x.id === mode)!;
  const dnf = idx.itemList().filter((i) => i.status === 'dnf');
  const req = useMemo(() => ({
    task: 'recommendation' as const,
    system: `${BASE_SYSTEM}\nEvery recommendation must explain why it fits, referencing the reader's actual history (ratings, genres, authors, notes, goals, abandoned books, reading speed).`,
    messages: [{ role: 'user' as const, content: `${m.prompt}\nReturn JSON {"recommendations":[{"title":"...","author":"...","itemId":"library id if owned, else omit","why":"one or two sentences","length":"e.g. 240 pages"}]} with 5–8 items; owned books first.\n\n${brainSummary(idx)}\n\nABANDONED: ${dnf.map((i) => i.title).join(', ') || 'none'}\n\n${folderDigest(idx)}\n\n${libraryDigest(idx, idx.settings.ai.share, idx.itemList(), 160)}` }],
    maxTokens: 2500,
  }), [idx, m, dnf]);
  const go = async () => {
    const r = await run((s) => completeJSON<{ recommendations: Rec[] }>(req, s));
    if (r) setRecs((r.data.recommendations ?? []).map((x) => ({ ...x, itemId: x.itemId && idx.items.has(x.itemId) ? x.itemId : undefined })));
  };
  if (!ready) return <AIOff />;
  return (
    <div className="col gap-16">
      <div className="card col">
        <Segmented value={mode} onChange={(v) => { setMode(v); setRecs(null); }} options={MODES.map((x) => ({ value: x.id, label: x.label }))} />
        <div className="row"><button className="btn ai" disabled={loading} onClick={go}>{loading ? 'Thinking…' : '✦ Recommend'}</button>{recs && <button className="btn sm" onClick={async () => { await saveAIRecord({ kind: 'recommendation', title: m.label, content: recs.map((r) => `**${r.title}** — ${r.why}`).join('\n'), data: recs }); toast('Saved'); }}>Keep</button>}</div>
        <SharedPreview req={req} />
        <AIErrorNotice error={error} />
      </div>
      {recs && (
        <div className="grid auto">
          {recs.map((r, i) => {
            const it = r.itemId ? idx.items.get(r.itemId) : undefined;
            return (
              <div key={i} className="card">
                <div className="row top gap-12">
                  {it ? <Cover item={it} width={52} /> : <div className="cover" style={{ width: 52, height: 78, display: 'grid', placeItems: 'center', fontSize: 20 }}>🔎</div>}
                  <div className="grow">
                    {it ? <Link to={`/item/${it.id}`} className="book-title">{it.title}</Link> : <div className="book-title">{r.title}</div>}
                    <div className="small muted">{it ? idx.authorLine(it) : r.author}{r.length ? ` · ${r.length}` : ''}</div>
                    <div className="mt-8">{it ? <span className="chip good">In your library</span> : <span className="chip ai">Suggestion — not in library</span>}</div>
                  </div>
                </div>
                <p className="small mt-8">{r.why}</p>
                {!it && <button className="btn xs mt-8" onClick={async () => { await addItem({ title: r.title, authors: r.author ? [r.author] : [], status: 'want', source: 'ai', description: `AI suggestion: ${r.why}` }); toast('Added to Want to Read'); }}>＋ Want to Read</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tutor ──────────────────────────────────────────────────────────────

const TUTOR_MODES = [
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'mcq', label: 'Multiple choice' },
  { id: 'short', label: 'Short answer' },
  { id: 'essay', label: 'Essay questions' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'explain', label: 'Explain it back' },
  { id: 'socratic', label: 'Socratic discussion' },
] as const;
type TutorMode = (typeof TUTOR_MODES)[number]['id'];

interface Card { q: string; a: string; options?: string[]; answerIndex?: number }

function Tutor({ idx }: { idx: LibraryIndex }) {
  const ready = useAIReady();
  const [mode, setMode] = useState<TutorMode>('flashcards');
  const [scope, setScope] = useState<'read' | 'selected'>('read');
  const [onlyRead, setOnlyRead] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [flip, setFlip] = useState<Record<number, boolean>>({});
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [chat, setChat] = useState<AIMessage[]>([]);
  const [reply, setReply] = useState('');
  const { loading, error, run } = useAICall();
  const items = scope === 'read' ? idx.itemList().filter((i) => i.status === 'read' || (i.status === 'reading' && idx.position(i) > 0)) : ids.map((i) => idx.items.get(i)!).filter(Boolean);
  const material = () => items.slice(0, 20).map((i) => itemContext(idx, i, idx.settings.ai.share, onlyRead ? 'read' : 'full')).join('\n\n---\n\n');
  const scopeRule = onlyRead ? 'Only use material the reader has marked as read: for books in progress, nothing beyond their current position. Prefer the reader’s own notes and quotes.' : 'The reader allows questions about entire books.';
  const conversational = mode === 'explain' || mode === 'socratic';
  const start = async () => {
    setCards(null); setFlip({}); setChosen({}); setChat([]);
    if (conversational) {
      const first: AIMessage = { role: 'user', content: `${mode === 'explain' ? 'Ask me to explain one key idea from this material in my own words, then give feedback on my explanation (accuracy, gaps) and ask the next.' : 'Lead a Socratic discussion: ask one probing question at a time about ideas in this material and respond to my answers with further questions.'} ${scopeRule}\n\nMATERIAL:\n${material()}` };
      const r = await run((s) => complete({ task: 'general', system: `${BASE_SYSTEM}\nYou are a patient tutor.`, messages: [first], maxTokens: 800 }, s));
      if (r) setChat([first, { role: 'assistant', content: r.text }]);
      return;
    }
    const shape = mode === 'mcq' ? '{"cards":[{"q":"question","options":["a","b","c","d"],"answerIndex":0,"a":"brief explanation"}]}' : '{"cards":[{"q":"question or prompt","a":"answer or model answer points"}]}';
    const what = mode === 'flashcards' ? '10 flashcards (term/idea → explanation)' : mode === 'mcq' ? '8 multiple-choice questions' : mode === 'short' ? '8 short-answer questions' : mode === 'essay' ? '4 essay questions with model answer outlines' : '8 timeline questions (order events or date them), answers include dates';
    const r = await run((s) => completeJSON<{ cards: Card[] }>({ system: `${BASE_SYSTEM}\nYou are a tutor. ${scopeRule}`, messages: [{ role: 'user', content: `Create ${what} from this material. Return JSON ${shape}.\n\nMATERIAL:\n${material()}` }], maxTokens: 3000 }, s));
    if (r) setCards(r.data.cards ?? []);
  };
  const send = async () => {
    if (!reply.trim()) return;
    const h: AIMessage[] = [...chat, { role: 'user', content: reply.trim() }];
    setChat(h); setReply('');
    const r = await run((s) => complete({ system: `${BASE_SYSTEM}\nYou are a patient tutor. ${scopeRule}`, messages: h, maxTokens: 800 }, s));
    if (r) setChat([...h, { role: 'assistant', content: r.text }]);
  };
  if (!ready) return <AIOff />;
  return (
    <div className="col gap-16">
      <div className="card col gap-12">
        <div className="row wrap gap-4">{TUTOR_MODES.map((m) => <button key={m.id} className={`chip ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)}>{m.label}</button>)}</div>
        <div className="row wrap">
          <Segmented size="sm" value={scope} onChange={setScope} options={[{ value: 'read', label: 'Everything I’ve read' }, { value: 'selected', label: 'Selected books' }]} />
          <label className="check small"><input type="checkbox" checked={onlyRead} onChange={(e) => setOnlyRead(e.target.checked)} /> Only quiz me on material I’ve marked as read</label>
        </div>
        {scope === 'selected' && <ItemPicker idx={idx} value={ids} onChange={setIds} />}
        <div className="row"><button className="btn ai" disabled={loading || !items.length} onClick={start}>{loading && !chat.length ? 'Preparing…' : '✦ Start'}</button><span className="small faint">{items.length} book(s) in scope · {items.reduce((a, i) => a + (idx.notesByItem.get(i.id)?.length ?? 0), 0)} notes</span></div>
        {!items.length && <div className="small muted">Nothing in scope yet — finish or start a book, or pick books above.</div>}
        <SharedPreview req={items.length ? { system: '', messages: [{ role: 'user', content: material() }] } : null} />
        <AIErrorNotice error={error} />
      </div>
      {cards && (
        <div className="grid auto">
          {cards.map((c, i) => (
            <div key={i} className="card" style={{ cursor: c.options ? undefined : 'pointer' }} onClick={() => !c.options && setFlip({ ...flip, [i]: !flip[i] })}>
              <div className="small faint mb-8">{i + 1} / {cards.length} <AIBadge /></div>
              <div style={{ fontWeight: 500 }}>{c.q}</div>
              {c.options ? (
                <div className="col mt-8">
                  {c.options.map((o, j) => {
                    const picked = chosen[i] === j;
                    const show = chosen[i] !== undefined;
                    return <button key={j} className={`rabbit-node ${show && j === c.answerIndex ? 'on' : ''}`} style={show && picked && j !== c.answerIndex ? { borderColor: 'var(--bad)' } : undefined} onClick={() => setChosen({ ...chosen, [i]: j })}>{o}{show && j === c.answerIndex ? ' ✓' : show && picked ? ' ✗' : ''}</button>;
                  })}
                  {chosen[i] !== undefined && <div className="small muted">{c.a}</div>}
                </div>
              ) : flip[i] ? <div className="notice mt-8"><Markdown text={c.a} /></div> : <div className="small faint mt-8">Click to reveal</div>}
            </div>
          ))}
        </div>
      )}
      {chat.length > 0 && (
        <div className="card col gap-12">
          <div className="chat">{chat.slice(1).map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>{m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}</div>)}{loading && <div className="msg ai faint">…</div>}</div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); send(); }}><input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Your answer…" /><button className="btn primary" disabled={loading}>Reply</button></form>
        </div>
      )}
    </div>
  );
}

// ── AI notebook ────────────────────────────────────────────────────────

function Notebook({ idx }: { idx: LibraryIndex }) {
  const { toast } = useUI();
  const recs = [...idx.snap.ai].sort((a, b) => b.createdAt - a.createdAt);
  const aiConcepts = idx.snap.concepts.filter((c) => c.source === 'ai').length;
  const aiLinks = idx.snap.links.filter((l) => l.source === 'ai').length;
  const aiItems = idx.itemList().filter((i) => i.source === 'ai').length;
  return (
    <div className="col gap-16">
      <div className="notice ai row wrap between">
        <span>AI-generated content is always stored separately and labelled: {recs.length} saved answers · {aiConcepts} AI concepts · {aiLinks} AI connections{aiItems ? ` · ${aiItems} books added from AI suggestions` : ''}.</span>
        <button className="btn sm danger" onClick={async () => { if (confirm('Delete all AI-generated answers, concepts and connections? Your own notes, books and reading data are not affected.')) { await deleteAllAIData(); toast('AI-generated data deleted'); } }}>Delete all AI data</button>
      </div>
      {recs.length === 0 ? <div className="card"><Empty icon="✦" title="Nothing saved yet">When an AI answer is useful, press “Keep” and it’s saved here.</Empty></div> : recs.map((r) => (
        <div key={r.id} className="card">
          <div className="card-head"><div><h3>{r.title}</h3><div className="small faint">{r.kind} · {formatKey(keyFromMs(r.createdAt))}{r.model ? ` · ${r.model}` : ''}</div></div><div className="row"><AIBadge /><button className="btn xs ghost" onClick={() => deleteAIRecord(r.id)}>Delete</button></div></div>
          <Markdown text={r.content} />
        </div>
      ))}
    </div>
  );
}
