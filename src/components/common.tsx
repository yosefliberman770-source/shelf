import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DateKey, Item, Status } from '../db/types';
import { formatKey } from '../engine/dates';
import type { DeadlineStatus } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { contentTypeInfo } from '../engine/units';
import { Illustration, type IllusName } from './illustrations';

// ── Cover ──────────────────────────────────────────────────────────────

const COVER_TONES = ['#2f4858', '#6b4e3d', '#3d5a45', '#553a5c', '#7a3b3b', '#34495e', '#5c5236', '#2e5266', '#4a3f35', '#3b4f6b'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Cover({ item, width = 64, author, showType = false }: { item: Pick<Item, 'id' | 'title' | 'coverUrl' | 'coverData' | 'contentType'>; width?: number; author?: string; showType?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = item.coverData ?? item.coverUrl;
  const height = Math.round(width * 1.5);
  const tone = COVER_TONES[hash(item.title) % COVER_TONES.length];
  useEffect(() => setFailed(false), [src]);
  return (
    <div className="cover" style={{ width, height, background: tone }}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} onLoad={(e) => { if ((e.target as HTMLImageElement).naturalWidth <= 1) setFailed(true); }} />
      ) : (
        width < 56 ? (
          <div className="fallback" style={{ justifyContent: 'center', alignItems: 'center', fontSize: width * 0.5, padding: 0 }} aria-hidden>
            <span style={{ fontWeight: 600 }}>{item.title.replace(/^(the|a|an)\s+/i, '').charAt(0).toUpperCase()}</span>
          </div>
        ) : (
          <div className="fallback" style={{ fontSize: Math.max(9, width / 7.5) }}>
            <span className="t">{item.title}</span>
            {author && width >= 70 && <span className="a">{author}</span>}
          </div>
        )
      )}
      {showType && item.contentType !== 'book' && <span className="type-badge">{contentTypeInfo(item.contentType).icon}</span>}
    </div>
  );
}

// ── Stars (half-star capable) ──────────────────────────────────────────

export function Stars({ value, onChange, size = 16 }: { value?: number; onChange?: (v: number | undefined) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <span className={`stars ${onChange ? 'editable' : ''}`} style={{ fontSize: size }} onMouseLeave={() => setHover(null)} role={onChange ? 'slider' : undefined} aria-label={`Rating ${value ?? 0} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const full = shown >= i;
        const half = !full && shown >= i - 0.5;
        return (
          <span
            key={i}
            style={{ position: 'relative', display: 'inline-block', width: '1em' }}
            onMouseMove={(e) => {
              if (!onChange) return;
              const r = (e.currentTarget as HTMLSpanElement).getBoundingClientRect();
              setHover(e.clientX - r.left < r.width / 2 ? i - 0.5 : i);
            }}
            onClick={() => {
              if (!onChange || hover === null) return;
              onChange(hover === value ? undefined : hover);
            }}
          >
            <span className="off">★</span>
            {(full || half) && <span style={{ position: 'absolute', left: 0, top: 0, width: full ? '100%' : '50%', overflow: 'hidden' }}>★</span>}
          </span>
        );
      })}
    </span>
  );
}

// ── Misc ───────────────────────────────────────────────────────────────

export function ProgressBar({ value, good, thin }: { value?: number; good?: boolean; thin?: boolean }) {
  return (
    <div className={`bar ${good || (value ?? 0) >= 1 ? 'good' : ''} ${thin ? 'thin' : ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(1, value ?? 0)) * 100}%` }} />
    </div>
  );
}

export function Empty({ icon = '📖', illustration, title, children, action }: { icon?: string; illustration?: IllusName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {illustration ? <Illustration name={illustration} /> : <div className="ico" aria-hidden>{icon}</div>}
      <h3>{title}</h3>
      {children && <div style={{ maxWidth: 440, fontSize: 14.5 }}>{children}</div>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'wide' | 'full' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-handle" aria-hidden />
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, size }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' }) {
  return (
    <div className={`btn-group ${size ?? ''}`}>
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="row" style={{ cursor: 'pointer', justifyContent: 'space-between', gap: 12 }}>
      {label && <span>{label}</span>}
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export const STATUS_LABEL: Record<Status, string> = {
  want: 'Want to Read',
  reading: 'Reading',
  read: 'Read',
  paused: 'Set Aside',
  dnf: "Didn't Finish",
};

export function StatusChip({ status }: { status: Status }) {
  const cls = status === 'reading' ? 'accent' : status === 'read' ? 'good' : status === 'dnf' ? 'bad' : status === 'paused' ? 'warn' : '';
  return <span className={`chip ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function DeadlineChip({ status, delta, deadline }: { status: DeadlineStatus; delta?: number; deadline?: DateKey }) {
  if (!deadline) return <span className="chip">No deadline yet</span>;
  switch (status) {
    case 'ahead':
      return <span className="chip good">{delta} reading day{delta === 1 ? '' : 's'} ahead</span>;
    case 'on-track':
      return <span className="chip good">On track</span>;
    case 'behind':
      return <span className="chip warn">{-(delta ?? 0)} reading day{delta === -1 ? '' : 's'} behind</span>;
    case 'overdue':
      return <span className="chip bad">Deadline passed ({formatKey(deadline)})</span>;
    case 'unreachable':
      return <span className="chip warn">Not reachable at current pace</span>;
    case 'done':
      return <span className="chip good">Done</span>;
    default:
      return <span className="chip">Due {formatKey(deadline)}</span>;
  }
}

export function AIBadge({ label = 'AI-generated' }: { label?: string }) {
  return <span className="ai-badge" title="Produced by an AI model. Review before relying on it.">✦ {label}</span>;
}

/** Render a small, safe subset of Markdown (paragraphs, lists, bold, headings). */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const out: ReactNode[] = [];
    const lines = text.replace(/\r/g, '').split('\n');
    let list: string[] = [];
    const flush = () => {
      if (list.length) out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
      list = [];
    };
    let para: string[] = [];
    const flushP = () => {
      if (para.length) out.push(<p key={out.length}>{inline(para.join(' '))}</p>);
      para = [];
    };
    for (const line of lines) {
      const t = line.trim();
      const li = t.match(/^([-*•]|\d+[.)])\s+(.*)$/);
      const h = t.match(/^#{1,4}\s+(.*)$/);
      if (li) { flushP(); list.push(li[2]); }
      else if (h) { flushP(); flush(); out.push(<h4 key={out.length}>{inline(h[1])}</h4>); }
      else if (!t) { flushP(); flush(); }
      else { flush(); para.push(t); }
    }
    flushP();
    flush();
    return out;
  }, [text]);
  return <div className="md">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : p));
}

// ── Pickers ────────────────────────────────────────────────────────────

export function TagInput({ value, onChange, suggestions = [], placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [text, setText] = useState('');
  const add = (t: string) => {
    const v = t.trim();
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setText('');
  };
  const sugg = text ? suggestions.filter((s) => s.toLowerCase().includes(text.toLowerCase()) && !value.includes(s)).slice(0, 6) : [];
  return (
    <div className="col gap-4">
      <div className="row wrap gap-4">
        {value.map((t) => (
          <span key={t} className="chip">
            {t}
            <span className="x" onClick={() => onChange(value.filter((x) => x !== t))}>✕</span>
          </span>
        ))}
        <input
          className="input sm"
          style={{ flex: 1, minWidth: 120, width: 'auto' }}
          value={text}
          placeholder={placeholder ?? 'Type and press Enter'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(text);
            } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
        />
      </div>
      {sugg.length > 0 && (
        <div className="row wrap gap-4">
          {sugg.map((s) => <button key={s} className="chip" onMouseDown={(e) => { e.preventDefault(); add(s); }}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}

export function FolderPicker({ idx, value, onChange, multiple = true }: { idx: LibraryIndex; value: string[]; onChange: (v: string[]) => void; multiple?: boolean }) {
  const [q, setQ] = useState('');
  const flat = useMemo(() => {
    const out: { id: string; name: string; depth: number; path: string }[] = [];
    const walk = (parent: string | undefined, depth: number) => {
      for (const f of idx.childFolders.get(parent) ?? []) {
        out.push({ id: f.id, name: f.name, depth, path: idx.folderPath(f.id).map((x) => x.name).join(' / ') });
        walk(f.id, depth + 1);
      }
    };
    walk(undefined, 0);
    return out;
  }, [idx]);
  const shown = q ? flat.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())) : flat;
  if (!flat.length) return <div className="small faint">No folders yet — create them in the Library.</div>;
  return (
    <div className="col gap-4">
      {flat.length > 8 && <input className="input sm" placeholder="Filter folders…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
        {shown.map((f) => (
          <label key={f.id} className="check tree-row" style={{ paddingLeft: 8 + (q ? 0 : f.depth * 14) }}>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              checked={value.includes(f.id)}
              onChange={(e) => onChange(multiple ? (e.target.checked ? [...value, f.id] : value.filter((x) => x !== f.id)) : [f.id])}
            />
            <span className="ellipsis">{q ? f.path : f.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function ItemPicker({ idx, value, onChange, filter }: { idx: LibraryIndex; value: string[]; onChange: (v: string[]) => void; filter?: (i: Item) => boolean }) {
  const [q, setQ] = useState('');
  const items = idx.itemList().filter((i) => (!filter || filter(i)) && (!q || `${i.title} ${idx.authorLine(i)}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="col gap-4">
      <input className="input sm" placeholder="Search your library…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
        {items.length === 0 && <div className="small faint" style={{ padding: 8 }}>No matching items.</div>}
        {items.slice(0, 300).map((i) => (
          <label key={i.id} className="check tree-row">
            <input type="checkbox" checked={value.includes(i.id)} onChange={(e) => onChange(e.target.checked ? [...value, i.id] : value.filter((x) => x !== i.id))} />
            <span className="ellipsis grow">{i.title}</span>
            <span className="faint small ellipsis" style={{ maxWidth: '40%' }}>{idx.authorLine(i)}</span>
          </label>
        ))}
      </div>
      {value.length > 0 && <div className="small muted">{value.length} selected</div>}
    </div>
  );
}

export function ItemLink({ item, children }: { item: Pick<Item, 'id'>; children: ReactNode }) {
  return <Link to={`/item/${item.id}`}>{children}</Link>;
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t.current);
  }, [value, ms]);
  return v;
}

export function DateRangePicker({ value, onChange, today }: { value: RangeId; onChange: (r: RangeId, custom?: { from: string; to: string }) => void; today: string }) {
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + '01', to: today });
  return (
    <div className="row wrap">
      <Segmented
        size="sm"
        value={value}
        onChange={(v) => onChange(v, v === 'custom' ? custom : undefined)}
        options={RANGES.map((r) => ({ value: r.id, label: r.label }))}
      />
      {value === 'custom' && (
        <div className="row">
          <input type="date" className="input sm" value={custom.from} onChange={(e) => { const c = { ...custom, from: e.target.value }; setCustom(c); onChange('custom', c); }} />
          <span className="faint">→</span>
          <input type="date" className="input sm" value={custom.to} onChange={(e) => { const c = { ...custom, to: e.target.value }; setCustom(c); onChange('custom', c); }} />
        </div>
      )}
    </div>
  );
}

export type RangeId = 'today' | '7d' | '30d' | 'month' | 'year' | 'all' | 'custom';
export const RANGES: { id: RangeId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];
