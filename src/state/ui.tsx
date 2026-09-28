// Global UI actions: toasts (with Undo), and the sheets that can be opened
// from anywhere (log reading, note/quote, add item, completion, Ask AI).
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export interface Toast {
  id: number;
  text: string;
  undo?: () => Promise<void> | void;
  error?: boolean;
}

export interface ConciergeContext {
  /** Short label of where the user is, e.g. "Folder: Roman History". */
  label: string;
  /** Suggested prompts for this screen. */
  suggestions: string[];
  /** Deterministic context text for the AI (already privacy-filtered). */
  build: () => string;
}

export type Sheet =
  | { kind: 'log'; itemId: string }
  | { kind: 'note'; itemId?: string; noteKind: 'note' | 'quote'; noteId?: string }
  | { kind: 'add'; preset?: { status?: 'want' | 'reading'; folderId?: string; query?: string; step?: 'epub' | 'free' } }
  | { kind: 'complete'; itemId: string }
  | { kind: 'timer-stop' }
  | { kind: 'search' }
  | { kind: 'ai' };

interface UI {
  toasts: Toast[];
  toast: (text: string, opts?: { undo?: Toast['undo']; error?: boolean }) => void;
  dismiss: (id: number) => void;
  sheet: Sheet | null;
  open: (s: Sheet) => void;
  close: () => void;
  concierge: ConciergeContext | null;
  setConcierge: (c: ConciergeContext | null) => void;
}

const Ctx = createContext<UI | null>(null);
let tid = 0;

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [concierge, setConcierge] = useState<ConciergeContext | null>(null);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback<UI['toast']>((text, opts) => {
    const id = ++tid;
    setToasts((t) => [...t.slice(-2), { id, text, ...opts }]);
    setTimeout(() => dismiss(id), opts?.undo ? 8000 : 4000);
  }, [dismiss]);
  const value = useMemo<UI>(() => ({ toasts, toast, dismiss, sheet, open: setSheet, close: () => setSheet(null), concierge, setConcierge }), [toasts, toast, dismiss, sheet, concierge]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI(): UI {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside provider');
  return v;
}

export function Toasts() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
          <span>{t.text}</span>
          {t.undo && (
            <button
              onClick={async () => {
                await t.undo?.();
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
