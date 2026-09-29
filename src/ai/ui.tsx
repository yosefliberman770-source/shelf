// Reusable AI UI: an availability gate, a run-and-review panel that shows
// exactly what will be sent, and the context-aware "Ask AI" sheet that the
// centre button opens from anywhere in the app.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveAIRecord } from '../db/actions';
import type { AIKind, AIRecord } from '../db/types';
import { AIBadge, Markdown } from '../components/common';
import { Icon, type IconName, TONES, type Tone } from '../components/icons';
import { Illustration } from '../components/illustrations';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { AIError, type AIMessage, type AIRequest, type AIResponse, complete } from './client';
import { BASE_SYSTEM, statsDigest } from './context';
import { DEVICE_GEMINI, getGeminiKey } from './gemini';

export function useAIReady(): boolean {
  const idx = useLibrary();
  const { enabled, provider } = idx.settings.ai;
  return enabled && !!provider && (provider !== DEVICE_GEMINI || !!getGeminiKey());
}

export function AIOff({ compact }: { compact?: boolean }) {
  const idx = useLibrary();
  const msg = idx.settings.ai.enabled && idx.settings.ai.provider ? 'AI isn’t connected yet.' : 'Turn on free AI in a minute with a Google Gemini key.';
  return (
    <div className="notice ai">
      <div className="row between wrap">
        <span className="row"><Icon name="sparkle" /> {msg} {!compact && 'Everything else in Shelf works without AI.'}</span>
        <Link className="btn sm ai" to="/settings?tab=ai">Set up AI</Link>
      </div>
    </div>
  );
}

export function AIErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as AIError;
  if (e.kind === 'disabled' || e.kind === 'unconfigured') return <AIOff compact />;
  return <div className="notice bad">{e.message ?? 'The AI request failed.'} <span className="faint">Your data is unaffected.</span></div>;
}

/** Shows the exact payload that will be sent, to make data sharing transparent. */
export function SharedPreview({ req }: { req: AIRequest | null }) {
  if (!req) return null;
  const chars = req.system.length + req.messages.reduce((a, m) => a + m.content.length, 0);
  return (
    <details className="small">
      <summary className="faint" style={{ cursor: 'pointer' }}>What will be shared with the AI (~{Math.round(chars / 4).toLocaleString()} tokens)</summary>
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', background: 'var(--surface-2)', padding: 10, borderRadius: 10, fontSize: 11.5 }}>
        {req.messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n')}
      </pre>
    </details>
  );
}

export function useAICall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);
  const run = async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    ac.current?.abort();
    ac.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      return await fn(ac.current.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e);
      return undefined;
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, run, setError };
}

/**
 * Generic "ask → review → keep" panel for text answers. The result is always
 * labelled AI-generated and only saved when the user chooses to.
 */
export function AIPanel({
  build,
  kind,
  title,
  buttonLabel = 'Generate',
  scope,
  children,
  autoRun = false,
}: {
  build: () => AIRequest;
  kind: AIKind;
  title: string;
  buttonLabel?: string;
  scope?: AIRecord['scope'];
  children?: ReactNode;
  autoRun?: boolean;
}) {
  const ready = useAIReady();
  const { toast } = useUI();
  const { loading, error, run } = useAICall();
  const [res, setRes] = useState<AIResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const req = ready ? safeBuild(build) : null;
  const go = async () => {
    setSaved(false);
    const r = await run((signal) => complete(build(), signal));
    if (r) setRes(r);
  };
  useEffect(() => {
    if (autoRun && ready) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ready) return <AIOff />;
  return (
    <div className="col gap-12">
      {children}
      <div className="row wrap">
        <button className="btn ai" disabled={loading} onClick={go}><Icon name="sparkle" />{loading ? 'Thinking…' : res ? 'Regenerate' : buttonLabel}</button>
        {res && !saved && (
          <button className="btn sm" onClick={async () => { await saveAIRecord({ kind, title, content: res.text, scope, provider: res.provider, model: res.model }); setSaved(true); toast('Saved to your AI notebook'); }}>
            Keep
          </button>
        )}
        {saved && <span className="small faint">Saved to your AI notebook</span>}
      </div>
      <SharedPreview req={req} />
      <AIErrorNotice error={error} />
      {res && (
        <div className="notice ai">
          <div className="row between mb-8"><AIBadge /><span className="tiny faint">{res.model}</span></div>
          <Markdown text={res.text} />
        </div>
      )}
    </div>
  );
}

function safeBuild(build: () => AIRequest): AIRequest | null {
  try {
    return build();
  } catch {
    return null;
  }
}

// ── Ask sheet: context-aware assistant, opened from anywhere ────────────

const ANSWER_FORMAT = `Formatting: when you mention the reader's own books, notes or numbers, put that part under a heading "#### From your library". Put interpretations, ideas and books that are NOT in their library under "#### Suggestions". Leave out a heading if there is nothing for it. Keep answers short and friendly.`;

const GENERAL = ['What should I read next?', 'How is my reading going this month?', 'What have I learned recently?'];

const TOOLS: { to: string; icon: IconName; tone: Tone; label: string }[] = [
  { to: '/ai/recommend', icon: 'sparkle', tone: 'plum', label: 'Recommendations' },
  { to: '/ai/ask', icon: 'search', tone: 'terracotta', label: 'Search my library' },
  { to: '/ai/tutor', icon: 'bulb', tone: 'gold', label: 'Quiz me' },
  { to: '/plan/whatif', icon: 'target', tone: 'green', label: 'Plan in plain words' },
  { to: '/ai/notebook', icon: 'bookmark', tone: 'brown', label: 'Saved answers' },
];

export function AskSheet() {
  const { concierge, sheet, close } = useUI();
  const idx = useLibrary();
  const ready = useAIReady();
  const nav = useNavigate();
  const [msgs, setMsgs] = useState<AIMessage[]>([]);
  const [text, setText] = useState('');
  const { loading, error, run } = useAICall();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openNow = sheet?.kind === 'ai';
  const question = sheet?.kind === 'ai' ? sheet.question : undefined;
  const asked = useRef<string | undefined>(undefined);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, loading]);
  useEffect(() => setMsgs([]), [concierge?.label]);
  useEffect(() => {
    if (!openNow) { asked.current = undefined; return; }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [openNow, close]);

  const contextText = () => {
    const share = idx.settings.ai.share;
    const parts = [`SCREEN: ${concierge?.label ?? 'Shelf'}`];
    if (concierge) parts.push(concierge.build());
    parts.push(statsDigest(idx, share));
    return parts.join('\n\n');
  };
  const send = async (q: string) => {
    if (!q.trim()) return;
    const history: AIMessage[] = [...msgs, { role: 'user', content: q.trim() }];
    setMsgs(history);
    setText('');
    const first = { role: 'user' as const, content: `${contextText()}\n\nQUESTION: ${history[0].content}` };
    const r = await run((signal) => complete({ system: `${BASE_SYSTEM}\n${ANSWER_FORMAT}`, messages: [first, ...history.slice(1)], maxTokens: 1500 }, signal));
    if (r) setMsgs([...history, { role: 'assistant', content: r.text }]);
  };
  // A question passed in when opening (e.g. from a suggestion chip).
  useEffect(() => {
    if (openNow && question && ready && asked.current !== question) {
      asked.current = question;
      send(question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNow, question, ready]);

  if (!openNow) return null;
  const suggestions = [...new Set([...(concierge?.suggestions ?? []), ...GENERAL])].slice(0, 5);
  const go = (to: string) => { close(); nav(to); };
  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Ask AI">
        <div className="sheet-handle" aria-hidden style={{ display: 'block', width: 44, height: 5, borderRadius: 5, background: 'var(--border-strong)', margin: '10px auto 0' }} />
        <div className="row between" style={{ padding: '12px 18px 10px', gap: 12 }}>
          <div className="row gap-12" style={{ minWidth: 0 }}>
            <span className="brand-mark" style={{ background: TONES.ai, color: '#fff' }}><Icon name="sparkle" /></span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 20 }}>Ask Shelf</h2>
              <div className="small faint ellipsis">{concierge ? `Knows you’re on: ${concierge.label}` : 'Knows your whole library'}</div>
            </div>
          </div>
          <div className="row gap-4">
            {msgs.length > 0 && <button className="btn sm ghost" onClick={() => setMsgs([])}>New chat</button>}
            <button className="btn ghost icon round" onClick={close} aria-label="Close"><Icon name="x" /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 16px' }}>
          {!ready ? (
            <AISetupCard onGo={() => go('/settings?tab=ai')} />
          ) : (
            <div className="chat">
              {msgs.length === 0 && (
                <div className="col gap-12">
                  <p className="qa-big" style={{ marginTop: 6 }}>What would you like to know?</p>
                  <div className="col" style={{ gap: 8 }}>
                    {suggestions.map((s) => (
                      <button key={s} className="rabbit-node" onClick={() => send(s)}>{s}<Icon name="arrowRight" className="faint" /></button>
                    ))}
                  </div>
                  <div className="eyebrow mt-8">More AI tools</div>
                  <div className="chips-scroll">
                    {TOOLS.map((t) => (
                      <button key={t.to} className="chip" style={{ minHeight: 36 }} onClick={() => go(t.to)}><Icon name={t.icon} />{t.label}</button>
                    ))}
                  </div>
                  <p className="tiny faint">Numbers come from Shelf’s own calculations — the AI only explains them. It never changes your books or progress.</p>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                  {m.role === 'assistant' ? <><AIBadge /><div className="mt-8"><Markdown text={m.content} /></div></> : m.content}
                </div>
              ))}
              {loading && <div className="msg ai faint">Thinking…</div>}
              <AIErrorNotice error={error} />
              <div ref={endRef} />
            </div>
          )}
        </div>
        {ready && (
          <div style={{ padding: '10px 14px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)' }} className="col">
            <form className="row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <input ref={inputRef} className="input" style={{ borderRadius: 999 }} placeholder="Ask about your books, reading, plans…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Your question" />
              <button className="btn ai-solid icon round" disabled={loading || !text.trim()} aria-label="Send"><Icon name="send" /></button>
            </form>
            <SharedPreview req={{ system: BASE_SYSTEM, messages: [{ role: 'user', content: contextText() }] }} />
          </div>
        )}
      </div>
    </>
  );
}

export function AISetupCard({ onGo }: { onGo: () => void }) {
  return (
    <div className="col gap-12" style={{ alignItems: 'center', textAlign: 'center', padding: '8px 4px 20px' }}>
      <Illustration name="magic" className="illus" />
      <h3 className="qa-big">Meet your reading assistant</h3>
      <p className="muted" style={{ maxWidth: 380 }}>Ask about your books in plain words, get ideas for what to read next, quiz yourself on what you’ve read, and plan your reading.</p>
      <div className="col" style={{ gap: 6, alignSelf: 'stretch', textAlign: 'left' }}>
        {['“What should I read next?”', '“What have I learned about Rome?”', '“Can I finish these 3 books by December?”'].map((e) => (
          <div key={e} className="notice" style={{ fontSize: 14 }}>{e}</div>
        ))}
      </div>
      <button className="btn ai-solid lg block" onClick={onGo}><Icon name="sparkle" />Turn on free AI · 1 minute</button>
      <p className="tiny faint">Uses a free Google Gemini key. Everything else in Shelf works without it.</p>
    </div>
  );
}

/** A small button that opens the assistant with a ready-made question. */
export function AskChip({ question, label, className = 'chip ai' }: { question: string; label?: string; className?: string }) {
  const { open } = useUI();
  return <button className={className} onClick={() => open({ kind: 'ai', question })}><Icon name="sparkle" />{label ?? question}</button>;
}

/** Register context for the assistant while a screen is mounted. */
export function useConcierge(label: string, suggestions: string[], build: () => string, deps: unknown[] = []) {
  const { setConcierge } = useUI();
  useEffect(() => {
    setConcierge({ label, suggestions, build });
    return () => setConcierge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, ...deps]);
}
