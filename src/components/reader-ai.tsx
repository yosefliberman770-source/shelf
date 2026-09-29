// Ask AI while reading. The assistant sees only what it needs: the book,
// chapter, the page you're on and anything you selected — never the whole
// book. Answers can become knowledge: related people, places, events and
// ideas link into your Knowledge Atlas, and you choose what to keep.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeJSON } from '../ai/client';
import { BASE_SYSTEM, SPOILER_LEVELS } from '../ai/context';
import { AIErrorNotice, AISetupCard, useAICall, useAIReady } from '../ai/ui';
import { addNote, link, saveAIRecord, saveCurriculum } from '../db/actions';
import type { ConceptKind } from '../db/types';
import { runQuery } from '../engine/query';
import { resolveEntity } from '../lib/entities';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { AIBadge, Markdown } from './common';
import { Icon } from './icons';

export interface ReadingContext {
  itemId: string;
  title: string;
  author: string;
  chapter?: string;
  pageText: string;
  selection?: string;
  position?: string;
}

export type AIMode = 'summary' | 'explain' | 'context' | 'people' | 'place' | 'timeline' | 'compare' | 'primary' | 'debate' | 'simplify' | 'deeper' | 'ask';

export const MODES: { id: AIMode; label: string; prompt: string }[] = [
  { id: 'summary', label: '⚡ Quick summary', prompt: 'Give a quick summary of {T} in 3–5 short bullet points.' },
  { id: 'explain', label: 'Explain', prompt: 'Explain what {T} means, in plain language.' },
  { id: 'context', label: 'Context', prompt: 'Explain the historical and background context someone needs to understand {T}.' },
  { id: 'people', label: 'People', prompt: 'Identify the people mentioned in {T} and briefly explain who each is and why they matter here.' },
  { id: 'place', label: 'Places', prompt: 'Explain the places mentioned in {T}: where they are and why they matter here.' },
  { id: 'timeline', label: 'Timeline', prompt: 'Give a short dated timeline of what happened just before and just after the events in {T}. Mark approximate dates with “c.” and use BC/AD.' },
  { id: 'compare', label: 'Compare', prompt: 'Compare {T} with the most natural related person, event or book, and explain the similarities and differences.' },
  { id: 'primary', label: 'Primary sources', prompt: 'List original (primary) sources relevant to {T}: author, work, when it was written and why it’s relevant. Say clearly if you are unsure a source covers this.' },
  { id: 'debate', label: 'Debate', prompt: 'Summarise the main scholarly interpretations or disputes relevant to {T}, attributing each to historians or schools where you can. If there is no real dispute, say so. Do not pick a winner.' },
  { id: 'simplify', label: 'Simplify', prompt: 'Explain {T} as if I am completely new to this subject.' },
  { id: 'deeper', label: 'Go deeper', prompt: 'Give an advanced, more sophisticated explanation of {T} for a well-read reader.' },
];

export interface AIAnswer {
  answer: string;
  related?: { people?: string[]; places?: string[]; events?: string[]; concepts?: string[] };
  books?: { title: string; author?: string; why?: string }[];
}

interface Turn { q: string; mode: AIMode; target: string; answer?: AIAnswer; aiId?: string; model?: string }

const SHAPE = `Return JSON: {"answer":"markdown answer","related":{"people":["full names"],"places":["names"],"events":["names"],"concepts":["short names"]},"books":[{"title":"...","author":"...","why":"one line"}]}. "related" lists only things actually relevant to the answer (at most 6 each). "books": up to 4 well-known real books worth reading on this, or [] if unsure.`;

function buildPrompt(ctx: ReadingContext, mode: AIMode, question: string): string {
  const target = ctx.selection ? 'the selected text' : 'the page I’m reading';
  const ask = mode === 'ask' ? question : MODES.find((m) => m.id === mode)!.prompt.replace('{T}', target) + (question ? `\n\nMy question: ${question}` : '');
  return [
    `BOOK: "${ctx.title}" by ${ctx.author}${ctx.chapter ? ` — chapter: ${ctx.chapter}` : ''}${ctx.position ? ` (reader is ${ctx.position} through)` : ''}`,
    `SPOILER BOUNDARY: ${SPOILER_LEVELS[0].rule}`,
    ctx.selection ? `SELECTED TEXT:\n"""${ctx.selection.slice(0, 1500)}"""` : '',
    `CURRENT PAGE (for context):\n"""${ctx.pageText.slice(0, 3000)}"""`,
    `TASK: ${ask}`,
  ].filter(Boolean).join('\n\n');
}

export function ReaderAI({ ctx, initialMode, onEntity, compact }: { ctx: ReadingContext; initialMode?: AIMode; onEntity?: (name: string, kind: ConceptKind) => void; compact?: boolean }) {
  const ready = useAIReady();
  const { close } = useUI();
  const nav = useNavigate();
  const { loading, error, run } = useAICall();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const started = useRef(false);

  const ask = async (mode: AIMode, question = '') => {
    const q = mode === 'ask' ? question : `${MODES.find((m) => m.id === mode)!.label.replace('⚡ ', '')}${question ? `: ${question}` : ''}`;
    const turn: Turn = { q, mode, target: ctx.selection ? `“${ctx.selection.slice(0, 80)}${ctx.selection.length > 80 ? '…' : ''}”` : 'this page' };
    setTurns((t) => [...t, turn]);
    setText('');
    const history = turns.filter((t) => t.answer).slice(-2).map((t) => `Earlier Q: ${t.q}\nEarlier A: ${t.answer!.answer.slice(0, 600)}`).join('\n\n');
    const r = await run((signal) => completeJSON<AIAnswer>({ system: `${BASE_SYSTEM}\n${SHAPE}`, messages: [{ role: 'user', content: `${buildPrompt(ctx, mode, question)}${history ? `\n\n${history}` : ''}` }], maxTokens: 1800 }, signal));
    if (r) setTurns((t) => t.map((x) => (x === turn ? { ...x, answer: r.data, model: r.response.model } : x)));
    else setTurns((t) => t.filter((x) => x !== turn));
  };
  useEffect(() => {
    if (!started.current && initialMode && ready) { started.current = true; ask(initialMode); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, ready]);
  if (!ready) return <AISetupCard onGo={() => { close(); nav('/settings?tab=ai'); }} />;

  return (
    <div className="col gap-12">
      <div className="small muted">
        {ctx.selection ? <>About your selection: <i>“{ctx.selection.slice(0, 120)}{ctx.selection.length > 120 ? '…' : ''}”</i></> : <>About this page{ctx.chapter ? ` in “${ctx.chapter}”` : ''}. Select text first to ask about a specific passage.</>}
      </div>
      <div className="chips-scroll" role="toolbar" aria-label="Question types">
        {MODES.map((m) => <button key={m.id} className={`chip ${m.id === 'summary' ? 'accent' : ''}`} style={{ minHeight: 34 }} disabled={loading} onClick={() => ask(m.id)}>{m.label}</button>)}
      </div>
      {turns.map((t, i) => <TurnView key={i} t={t} ctx={ctx} onEntity={onEntity} saveAnswerId={(id) => setTurns((all) => all.map((x) => (x === t ? { ...x, aiId: id } : x)))} />)}
      {loading && <div className="msg ai faint">Thinking…</div>}
      <AIErrorNotice error={error} />
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) ask('ask', text.trim()); }}>
        <input className="input" style={{ borderRadius: 999 }} placeholder={ctx.selection ? 'Ask about the selection…' : 'Ask anything about this page…'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" />
        <button className="btn ai-solid icon round" disabled={loading || !text.trim()} aria-label="Ask"><Icon name="send" /></button>
      </form>
      {!compact && <p className="tiny faint">Shares only the book title, chapter, this page{ctx.selection ? ' and your selection' : ''} — never the whole book.</p>}
    </div>
  );
}

function TurnView({ t, ctx, onEntity, saveAnswerId }: { t: Turn; ctx: ReadingContext; onEntity?: (name: string, kind: ConceptKind) => void; saveAnswerId: (id: string) => void }) {
  const idx = useLibrary();
  const { toast } = useUI();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [curr, setCurr] = useState<{ cid: string; lid: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const a = t.answer;
  const groups: [string, ConceptKind, string[]][] = a ? [['People', 'person', a.related?.people ?? []], ['Places', 'place', a.related?.places ?? []], ['Events', 'event', a.related?.events ?? []], ['Ideas', 'concept', a.related?.concepts ?? []]] : [];
  const all = groups.flatMap(([, k, names]) => names.map((n) => ({ n, k })));
  const inLibrary = a ? [...new Set(all.flatMap(({ n }) => runQuery(idx, { subject: n }).slice(0, 3)))].filter((i) => i.id !== ctx.itemId).slice(0, 4) : [];
  const saveAnswer = async () => {
    if (t.aiId) return t.aiId;
    const id = await saveAIRecord({ kind: 'book-qa', title: `${ctx.title}: ${t.q}`, content: a!.answer, scope: { type: 'item', id: ctx.itemId }, model: t.model });
    saveAnswerId(id);
    return id;
  };
  const toAtlas = async () => {
    setBusy(true);
    const chosen = all.filter(({ n }) => picked.size === 0 || picked.has(n));
    const aiId = await saveAnswer();
    for (const { n, k } of chosen) {
      const c = await resolveEntity(n, { kind: k, source: 'ai' });
      await link('concept', c.id, 'item', ctx.itemId, 'appears in');
      await link('concept', c.id, 'ai', aiId, 'explained in');
    }
    setBusy(false);
    toast(`Added ${chosen.length} to your Knowledge Atlas`);
  };
  return (
    <div className="col gap-8">
      <div className="msg user" style={{ alignSelf: 'flex-end' }}>{t.q} <span style={{ opacity: 0.7 }}>· {t.target}</span></div>
      {a && (
        <div className="msg ai" style={{ maxWidth: '100%' }}>
          <div className="row between"><AIBadge /><span className="tiny faint">{t.model}</span></div>
          <div className="mt-8"><Markdown text={a.answer} /></div>
          {all.length > 0 && (
            <div className="col mt-16" style={{ gap: 6 }}>
              {groups.filter(([, , n]) => n.length).map(([label, kind, names]) => (
                <div key={label} className="row wrap gap-4">
                  <span className="tiny faint" style={{ width: 52, fontWeight: 800 }}>{label}</span>
                  {names.map((n) => (
                    <span key={n} className={`chip ${picked.has(n) ? 'on' : ''}`} style={{ paddingRight: 4 }}>
                      <button style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }} onClick={() => onEntity?.(n, kind)}>{n}</button>
                      <input type="checkbox" aria-label={`Include ${n}`} checked={picked.has(n)} onChange={() => setPicked((p) => { const x = new Set(p); if (x.has(n)) x.delete(n); else x.add(n); return x; })} />
                    </span>
                  ))}
                </div>
              ))}
              <div className="tiny faint">Tap a name to explore it. Tick some to save only those (or none to save all).</div>
            </div>
          )}
          {(inLibrary.length > 0 || (a.books ?? []).length > 0) && (
            <div className="mt-16 small">
              <div className="eyebrow mb-8">Related books</div>
              {inLibrary.map((i) => <div key={i.id}>📚 <b>{i.title}</b> <span className="chip good" style={{ minHeight: 20 }}>in your library</span></div>)}
              {(a.books ?? []).filter((b) => !idx.itemList().some((i) => i.title.toLowerCase() === b.title.toLowerCase())).map((b) => <div key={b.title}>✦ <b>{b.title}</b>{b.author ? ` — ${b.author}` : ''} <span className="faint">{b.why}</span> <span className="chip ai" style={{ minHeight: 20 }}>AI suggestion</span></div>)}
            </div>
          )}
          <div className="row wrap mt-16 gap-4">
            <button className="btn xs" onClick={async () => { await saveAnswer(); toast('Answer saved'); }}><Icon name="bookmark" />{t.aiId ? 'Saved' : 'Save answer'}</button>
            {all.length > 0 && <button className="btn xs" disabled={busy} onClick={toAtlas}><Icon name="map" />{busy ? 'Adding…' : 'Add to Atlas'}</button>}
            <button className="btn xs" onClick={async () => { await addNote({ itemId: ctx.itemId, kind: 'note', text: `${t.q}\n\n${a.answer}`, chapter: ctx.chapter, source: 'ai' }); toast('Added to your notes (marked AI)'); }}><Icon name="pencil" />Add to notes</button>
            <button className="btn xs" onClick={async () => { await addNote({ itemId: ctx.itemId, kind: 'question', text: t.q, chapter: ctx.chapter }); toast('Question saved'); }}><Icon name="help" />Save question</button>
            {idx.snap.curricula.length > 0 && <button className="btn xs" onClick={() => setCurr({ cid: idx.snap.curricula[0].id, lid: idx.snap.curricula[0].levels[0]?.id ?? '' })}><Icon name="layers" />Add to curriculum</button>}
          </div>
          {curr && (
            <div className="row wrap mt-8">
              <select className="select sm" style={{ width: 'auto' }} value={curr.cid} onChange={(e) => setCurr({ cid: e.target.value, lid: idx.snap.curricula.find((c) => c.id === e.target.value)?.levels[0]?.id ?? '' })}>{idx.snap.curricula.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select className="select sm" style={{ width: 'auto' }} value={curr.lid} onChange={(e) => setCurr({ ...curr, lid: e.target.value })}>{(idx.snap.curricula.find((c) => c.id === curr.cid)?.levels ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <button className="btn xs primary" disabled={!curr.lid} onClick={async () => {
                const c = idx.snap.curricula.find((x) => x.id === curr.cid)!;
                const aiId = await saveAnswer();
                await saveCurriculum({ ...c, levels: c.levels.map((l) => (l.id === curr.lid ? { ...l, questions: [...(l.questions ?? []), t.q] } : l)) });
                await link('curriculum', c.id, 'ai', aiId, 'question');
                setCurr(null);
                toast(`Added to ${c.name}`);
              }}>Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
