// Reusable AI UI: an availability gate, a run-and-review panel that shows
// exactly what will be sent, and the context-aware "Ask AI" concierge.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { saveAIRecord } from '../db/actions';
import type { AIKind, AIRecord } from '../db/types';
import { AIBadge, Markdown } from '../components/common';
import { useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { AIError, type AIMessage, type AIRequest, type AIResponse, complete } from './client';
import { BASE_SYSTEM, statsDigest } from './context';

export function useAIReady(): boolean {
  const idx = useLibrary();
  return idx.settings.ai.enabled && !!idx.settings.ai.provider;
}

export function AIOff({ compact }: { compact?: boolean }) {
  const idx = useLibrary();
  const msg = !idx.settings.ai.enabled ? 'AI features are off.' : 'Choose an AI provider to use this feature.';
  return (
    <div className="notice ai">
      <div className="row between wrap">
        <span>✦ {msg} {!compact && 'Everything else in Shelf works without AI.'}</span>
        <Link className="btn sm ai" to="/settings?tab=ai">AI settings</Link>
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
      <summary className="faint" style={{ cursor: 'pointer' }}>What will be shared with the AI provider (~{Math.round(chars / 4).toLocaleString()} tokens)</summary>
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', background: 'var(--surface-2)', padding: 10, borderRadius: 8, fontSize: 11.5 }}>
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
        <button className="btn ai" disabled={loading} onClick={go}>{loading ? 'Thinking…' : `✦ ${res ? 'Regenerate' : buttonLabel}`}</button>
        {res && !saved && (
          <button className="btn sm" onClick={async () => { await saveAIRecord({ kind, title, content: res.text, scope, provider: res.provider, model: res.model }); setSaved(true); toast('Saved to AI notebook'); }}>
            Keep
          </button>
        )}
        {saved && <span className="small faint">Saved to AI notebook</span>}
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

// ── Concierge: context-aware Ask AI, available on every screen ──────────

export function Concierge() {
  const { concierge, sheet, open, close } = useUI();
  const idx = useLibrary();
  const ready = useAIReady();
  const [msgs, setMsgs] = useState<AIMessage[]>([]);
  const [text, setText] = useState('');
  const { loading, error, run } = useAICall();
  const endRef = useRef<HTMLDivElement>(null);
  const openNow = sheet?.kind === 'ai';
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, loading]);
  useEffect(() => setMsgs([]), [concierge?.label]);

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
    const r = await run((signal) => complete({ system: BASE_SYSTEM, messages: [first, ...history.slice(1)], maxTokens: 1500 }, signal));
    if (r) setMsgs([...history, { role: 'assistant', content: r.text }]);
  };

  return (
    <>
      {!openNow && (
        <button className="btn ai fab" onClick={() => open({ kind: 'ai' })} aria-label="Ask AI">✦ Ask AI</button>
      )}
      {openNow && (
        <div className="drawer" role="dialog" aria-label="Ask AI">
          <div className="modal-head">
            <div>
              <h2>✦ Ask AI</h2>
              <div className="small faint">{concierge?.label ?? 'Anywhere in Shelf'}</div>
            </div>
            <button className="btn ghost sm icon" onClick={close} aria-label="Close">✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {!ready ? (
              <AIOff />
            ) : (
              <div className="chat">
                {msgs.length === 0 && (
                  <div className="col">
                    <div className="small muted">Answers use your library data. Numbers come from Shelf’s reading engine; the AI only explains them.</div>
                    {(concierge?.suggestions ?? ['What should I read next?', 'What patterns do you see in my reading?']).map((s) => (
                      <button key={s} className="rabbit-node" onClick={() => send(s)}>{s}<span className="faint">→</span></button>
                    ))}
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
            <div style={{ padding: 12, borderTop: '1px solid var(--border)' }} className="col">
              <form className="row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
                <input className="input" placeholder="Ask about this screen…" value={text} onChange={(e) => setText(e.target.value)} />
                <button className="btn primary" disabled={loading || !text.trim()}>Send</button>
              </form>
              <SharedPreview req={{ system: BASE_SYSTEM, messages: [{ role: 'user', content: contextText() }] }} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Register context for the concierge while a screen is mounted. */
export function useConcierge(label: string, suggestions: string[], build: () => string, deps: unknown[] = []) {
  const { setConcierge } = useUI();
  useEffect(() => {
    setConcierge({ label, suggestions, build });
    return () => setConcierge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, ...deps]);
}
