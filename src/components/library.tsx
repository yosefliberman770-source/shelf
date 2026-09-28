// Library building blocks: folder tree, item list/grid views, filter panel,
// forecast summary and the zoomable library map.
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addItemsToFolder, updateFolder } from '../db/actions';
import type { ContentType, Folder, Item, Status } from '../db/types';
import { formatKey } from '../engine/dates';
import { type AggregateForecast, itemForecast } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { type LibraryQuery, progressOf } from '../engine/query';
import { CONTENT_TYPES, contentLabel, fmtNum, fmtUnits, pagesOf, toDisplay } from '../engine/units';
import { useUI } from '../state/ui';
import { Cover, DeadlineChip, ProgressBar, Stars, StatusChip, STATUS_LABEL } from './common';

// ── Folder tree with drag & drop ───────────────────────────────────────

export function FolderTree({
  idx,
  selected,
  onSelect,
  parent,
  depth = 0,
  filter,
}: {
  idx: LibraryIndex;
  selected?: string;
  onSelect: (f: Folder) => void;
  parent?: string;
  depth?: number;
  filter?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [over, setOver] = useState<string | null>(null);
  const { toast } = useUI();
  const kids = idx.childFolders.get(parent) ?? [];
  const matches = (f: Folder): boolean => !filter || f.name.toLowerCase().includes(filter.toLowerCase()) || (idx.childFolders.get(f.id) ?? []).some(matches);
  return (
    <ul className="tree">
      {kids.filter(matches).map((f) => {
        const has = (idx.childFolders.get(f.id) ?? []).length > 0;
        const isOpen = open[f.id] ?? (!!filter || depth < 1 || isAncestor(idx, f.id, selected));
        return (
          <li key={f.id}>
            <div
              className={`tree-row ${selected === f.id ? 'on' : ''} ${over === f.id ? 'drop' : ''}`}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('application/x-folder', f.id); e.stopPropagation(); }}
              onDragOver={(e) => { e.preventDefault(); setOver(f.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={async (e) => {
                e.preventDefault();
                setOver(null);
                const items = e.dataTransfer.getData('application/x-items');
                const folder = e.dataTransfer.getData('application/x-folder');
                if (items) {
                  const ids = JSON.parse(items) as string[];
                  await addItemsToFolder(ids, f.id);
                  toast(`Added ${ids.length} item${ids.length === 1 ? '' : 's'} to ${f.name}`);
                } else if (folder && folder !== f.id) {
                  try { await updateFolder(folder, { parentId: f.id }); toast('Folder moved'); } catch (err) { toast((err as Error).message, { error: true }); }
                }
              }}
              onClick={() => onSelect(f)}
            >
              <span className="caret" onClick={(e) => { e.stopPropagation(); setOpen({ ...open, [f.id]: !isOpen }); }}>{has ? (isOpen ? '▾' : '▸') : ''}</span>
              <span style={{ color: f.color }}>{f.icon ?? '📁'}</span>
              <span className="ellipsis">{f.name}</span>
              <span className="count">{idx.itemsInFolder(f.id).length}</span>
            </div>
            {has && isOpen && <FolderTree idx={idx} selected={selected} onSelect={onSelect} parent={f.id} depth={depth + 1} filter={filter} />}
          </li>
        );
      })}
    </ul>
  );
}

function isAncestor(idx: LibraryIndex, folderId: string, selected?: string): boolean {
  if (!selected) return false;
  return idx.folderPath(selected).some((f) => f.id === folderId) && folderId !== selected;
}

// ── Views ──────────────────────────────────────────────────────────────

export type ViewMode = 'list' | 'grid' | 'compact';

export function ItemViews({ idx, items, mode, selected = new Set(), onToggle }: { idx: LibraryIndex; items: Item[]; mode: ViewMode; selected?: Set<string>; onToggle?: (id: string) => void }) {
  const drag = (e: React.DragEvent, it: Item) => {
    const ids = selected.has(it.id) ? [...selected] : [it.id];
    e.dataTransfer.setData('application/x-items', JSON.stringify(ids));
  };
  if (mode === 'list') return <ListView idx={idx} items={items} selected={selected} onToggle={onToggle} onDrag={drag} />;
  return (
    <div className={`cover-grid ${mode === 'compact' ? 'compact' : ''}`}>
      {items.map((it) => {
        const p = progressOf(idx, it);
        return (
          <div key={it.id} className="cover-tile" draggable onDragStart={(e) => drag(e, it)} style={{ position: 'relative' }}>
            {onToggle && <label style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, opacity: selected.size ? 1 : undefined }} className="check" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle(it.id)} aria-label="Select" />
            </label>}
            <Link to={`/item/${it.id}`}><Cover item={it} width={mode === 'compact' ? 92 : 130} author={idx.authorLine(it)} showType /></Link>
            {it.status === 'reading' && p !== undefined && <ProgressBar value={p} thin />}
            <div className="ellipsis" style={{ fontWeight: 500, fontSize: mode === 'compact' ? 12 : 13.5 }} title={it.title}>{it.title}</div>
            {mode === 'grid' && <div className="small muted ellipsis">{idx.authorLine(it)}</div>}
            {mode === 'grid' && idx.rating(it) && <Stars value={idx.rating(it)} size={12} />}
          </div>
        );
      })}
    </div>
  );
}

function ListView({ idx, items, selected, onToggle, onDrag }: { idx: LibraryIndex; items: Item[]; selected: Set<string>; onToggle?: (id: string) => void; onDrag: (e: React.DragEvent, it: Item) => void }) {
  const nav = useNavigate();
  return (
    <div className="table-wrap card flat" style={{ padding: 0 }}>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 28 }} />
            <th>Title</th><th>Progress</th><th className="r">Length</th><th>Folder</th><th>Rating</th><th>Status</th><th>Deadline</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const f = itemForecast(idx, it);
            const folder = it.folderIds.map((id) => idx.folders.get(id)?.name).filter(Boolean);
            return (
              <tr key={it.id} draggable onDragStart={(e) => onDrag(e, it)} style={{ cursor: 'pointer' }} onClick={() => nav(`/item/${it.id}`)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle?.(it.id)} aria-label="Select" /></td>
                <td>
                  <div className="row">
                    <Cover item={it} width={30} />
                    <div style={{ minWidth: 0 }}>
                      <div className="ellipsis" style={{ fontWeight: 500, maxWidth: 320 }}>{it.title}</div>
                      <div className="small muted ellipsis" style={{ maxWidth: 320 }}>{idx.authorLine(it)} · {contentLabel(it)}</div>
                    </div>
                  </div>
                </td>
                <td style={{ minWidth: 110 }}>
                  {f.percent !== undefined && it.status !== 'want' ? <><ProgressBar value={f.percent} thin /><span className="tiny faint num">{Math.round(f.percent * 100)}%{it.status === 'reading' ? ` · ${fmtNum(toDisplay(it, f.completed))}` : ''}</span></> : <span className="faint">—</span>}
                </td>
                <td className="r num nowrap">{it.total ? fmtUnits(it, it.total) : <span className="faint">?</span>}</td>
                <td className="small ellipsis" style={{ maxWidth: 160 }}>{folder.join(', ') || <span className="faint">—</span>}</td>
                <td>{idx.rating(it) ? <Stars value={idx.rating(it)} size={12} /> : <span className="faint">—</span>}</td>
                <td><StatusChip status={it.status} /></td>
                <td className="small nowrap">{it.deadline ? <DeadlineChip status={f.status} delta={f.delta} deadline={it.deadline} /> : <span className="faint">No deadline yet</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Filters ────────────────────────────────────────────────────────────

export function FilterPanel({ idx, q, onChange }: { idx: LibraryIndex; q: LibraryQuery; onChange: (q: LibraryQuery) => void }) {
  const set = (p: Partial<LibraryQuery>) => onChange({ ...q, ...p });
  const num = (s: string) => (s === '' ? undefined : Number(s));
  const genres = useMemo(() => [...new Set(idx.itemList().flatMap((i) => i.genres))].sort(), [idx]);
  const toggle = <T,>(arr: T[] | undefined, v: T) => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);
  return (
    <div className="card flat col gap-12">
      <div className="row wrap gap-4">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <button key={s} className={`chip ${q.statuses?.includes(s) ? 'on' : ''}`} onClick={() => set({ statuses: toggle(q.statuses, s) })}>{STATUS_LABEL[s]}</button>
        ))}
        <button className={`chip ${q.favorite ? 'on' : ''}`} onClick={() => set({ favorite: q.favorite ? undefined : true })}>♥ Favorites</button>
        <button className={`chip ${q.hasDeadline ? 'on' : ''}`} onClick={() => set({ hasDeadline: q.hasDeadline ? undefined : true })}>Has deadline</button>
        <button className={`chip ${q.behindSchedule ? 'on' : ''}`} onClick={() => set({ behindSchedule: q.behindSchedule ? undefined : true })}>Behind schedule</button>
      </div>
      <div className="fields c3">
        <label className="field">Subject / folder / tag text<input className="input sm" value={q.subject ?? ''} onChange={(e) => set({ subject: e.target.value || undefined })} placeholder="e.g. history" /></label>
        <label className="field">Author<input className="input sm" value={q.author ?? ''} onChange={(e) => set({ author: e.target.value || undefined })} /></label>
        <label className="field">Genre
          <select className="select sm" value={q.genres?.[0] ?? ''} onChange={(e) => set({ genres: e.target.value ? [e.target.value] : undefined })}>
            <option value="">Any</option>{genres.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">Tag
          <select className="select sm" value={q.tagIds?.[0] ?? ''} onChange={(e) => set({ tagIds: e.target.value ? [e.target.value] : undefined })}>
            <option value="">Any</option>{idx.snap.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">Content type
          <select className="select sm" value={q.contentTypes?.[0] ?? ''} onChange={(e) => set({ contentTypes: e.target.value ? [e.target.value as ContentType] : undefined })}>
            <option value="">Any</option>{CONTENT_TYPES.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
          </select>
        </label>
        <label className="field">Min rating
          <select className="select sm" value={q.minRating ?? ''} onChange={(e) => set({ minRating: num(e.target.value) })}>
            <option value="">Any</option>{[1, 2, 3, 3.5, 4, 4.5, 5].map((r) => <option key={r} value={r}>{r}★+</option>)}
          </select>
        </label>
        <label className="field">Pages<div className="row"><input className="input sm" placeholder="min" type="number" value={q.minPages ?? ''} onChange={(e) => set({ minPages: num(e.target.value) })} /><input className="input sm" placeholder="max" type="number" value={q.maxPages ?? ''} onChange={(e) => set({ maxPages: num(e.target.value) })} /></div></label>
        <label className="field">Published<div className="row"><input className="input sm" placeholder="after" type="number" value={q.publishedAfter ?? ''} onChange={(e) => set({ publishedAfter: num(e.target.value) })} /><input className="input sm" placeholder="before" type="number" value={q.publishedBefore ?? ''} onChange={(e) => set({ publishedBefore: num(e.target.value) })} /></div></label>
        <label className="field">Reading speed (pages/h)<div className="row"><input className="input sm" placeholder="min" type="number" value={q.minSpeed ?? ''} onChange={(e) => set({ minSpeed: num(e.target.value) })} /><input className="input sm" placeholder="max" type="number" value={q.maxSpeed ?? ''} onChange={(e) => set({ maxSpeed: num(e.target.value) })} /></div></label>
        <label className="field">Started<div className="row"><input className="input sm" type="date" value={q.startedAfter ?? ''} onChange={(e) => set({ startedAfter: e.target.value || undefined })} /><input className="input sm" type="date" value={q.startedBefore ?? ''} onChange={(e) => set({ startedBefore: e.target.value || undefined })} /></div></label>
        <label className="field">Finished<div className="row"><input className="input sm" type="date" value={q.finishedAfter ?? ''} onChange={(e) => set({ finishedAfter: e.target.value || undefined })} /><input className="input sm" type="date" value={q.finishedBefore ?? ''} onChange={(e) => set({ finishedBefore: e.target.value || undefined })} /></div></label>
        <label className="field">Deadline before<input className="input sm" type="date" value={q.deadlineBefore ?? ''} onChange={(e) => set({ deadlineBefore: e.target.value || undefined })} /></label>
      </div>
    </div>
  );
}

export function activeFilterCount(q: LibraryQuery): number {
  return Object.entries(q).filter(([k, v]) => k !== 'text' && v !== undefined && !(Array.isArray(v) && !v.length)).length;
}

// ── Aggregate forecast summary (folders, projects) ─────────────────────

export function ForecastSummary({ f, onSetDeadline, extra }: { f: AggregateForecast; onSetDeadline?: () => void; extra?: ReactNode }) {
  return (
    <div className="card">
      <div className="stats-row">
        <div className="stat"><span className="label">Books</span><span className="value">{f.completedCount}<span className="faint" style={{ fontSize: 15 }}> / {f.itemCount}</span></span><span className="hint">{f.inProgressCount} in progress</span></div>
        <div className="stat"><span className="label">Pages</span><span className="value">{fmtNum(f.completed)}<span className="faint" style={{ fontSize: 15 }}> / {fmtNum(f.total)}</span></span><ProgressBar value={f.percent} thin /></div>
        <div className="stat"><span className="label">Remaining</span><span className="value">{fmtNum(f.remaining)}</span><span className="hint">pages{f.remainingTimeSec ? ` · ≈${fmtNum(f.remainingTimeSec / 3600)}h` : ''}</span></div>
        <div className="stat"><span className="label">Pace</span><span className="value">{f.pace ? fmtNum(f.pace, 1) : '—'}</span><span className="hint">{f.paceSource === 'current' ? 'pages/day (current)' : f.paceSource === 'target' ? 'pages/day (planned)' : f.paceSource === 'default' ? 'pages/day (default — no reading yet)' : 'no pace yet'}</span></div>
        <div className="stat"><span className="label">Estimated finish</span><span className="value" style={{ fontSize: 17 }}>{f.status === 'done' ? 'Complete' : f.estimatedFinish ? formatKey(f.estimatedFinish) : '—'}</span><span className="hint">{f.readingDays !== undefined && f.status !== 'done' ? `${fmtNum(f.readingDays, 1)} reading days` : ''}</span></div>
        <div className="stat">
          <span className="label">Deadline</span>
          {f.deadline ? (
            <>
              <span className="value" style={{ fontSize: 17 }}>{formatKey(f.deadline)}</span>
              <DeadlineChip status={f.status} delta={f.delta} deadline={f.deadline} />
            </>
          ) : (
            <>
              <span className="value" style={{ fontSize: 15, fontWeight: 500 }} >No deadline yet</span>
              {onSetDeadline && <button className="btn xs mt-8" onClick={onSetDeadline}>Add deadline</button>}
            </>
          )}
        </div>
      </div>
      {f.deadline && f.requiredPace !== undefined && f.status !== 'done' && (
        <div className={`notice mt-16 ${f.status === 'behind' || f.status === 'unreachable' ? 'warn' : 'good'}`}>
          Required pace: <b>{fmtNum(f.requiredPace, 1)} pages/day</b>{f.pace ? <> · current {fmtNum(f.pace, 1)} · {f.paceChange! > 0 ? <>read <b>{fmtNum(f.paceChange!, 1)} more pages/day</b> ({Math.round((f.paceChange! / f.pace) * 100)}% more) to hit the deadline</> : <>you have {fmtNum(-f.paceChange!, 1)} pages/day of slack</>}</> : null}.
        </div>
      )}
      {(f.separate.length > 0 || f.unknownLength.length > 0) && (
        <div className="small faint mt-8">
          {f.separate.length > 0 && <>Tracked separately (no page equivalent): {f.separate.map((s) => `${s.item.title} (${fmtUnits(s.item, s.remaining)} left)`).join(', ')}. </>}
          {f.unknownLength.length > 0 && <>{f.unknownLength.length} item{f.unknownLength.length === 1 ? '' : 's'} with unknown length not counted.</>}
        </div>
      )}
      {extra}
    </div>
  );
}

// ── Library map: zoomable, pannable, searchable tree of folders ────────

interface MapNode {
  id: string;
  name: string;
  count: number;
  read: number;
  x: number;
  y: number;
  children: MapNode[];
}

export function LibraryMap({ idx, onOpen }: { idx: LibraryIndex; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { nodes, height, width } = useMemo(() => {
    let row = 0;
    const build = (parent: string | undefined, depth: number): MapNode[] =>
      (idx.childFolders.get(parent) ?? []).map((f) => {
        const children = build(f.id, depth + 1);
        const items = idx.itemsInFolder(f.id);
        const y = children.length ? (children[0].y + children[children.length - 1].y) / 2 : row++ * 46;
        return { id: f.id, name: f.name, count: items.length, read: items.filter((i) => i.status === 'read').length, x: depth * 220, y, children };
      });
    const roots = build(undefined, 0);
    let maxDepth = 0;
    const walk = (n: MapNode[], d: number) => n.forEach((c) => { maxDepth = Math.max(maxDepth, d); walk(c.children, d + 1); });
    walk(roots, 0);
    return { nodes: roots, height: Math.max(200, row * 46 + 40), width: (maxDepth + 1) * 220 + 40 };
  }, [idx]);
  if (!nodes.length) return <div className="card"><div className="empty small">Create folders to see your library map.</div></div>;
  const flat: MapNode[] = [];
  const edges: [MapNode, MapNode][] = [];
  const walk = (n: MapNode[]) => n.forEach((c) => { flat.push(c); c.children.forEach((k) => edges.push([c, k])); walk(c.children); });
  walk(nodes);
  const hit = q ? new Set(flat.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())).map((n) => n.id)) : null;
  return (
    <div className="graph-wrap" style={{ height: 560 }}>
      <svg
        onWheel={(e) => {
          const k = Math.min(2.5, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
          setView({ ...view, k });
        }}
        onPointerDown={(e) => { drag.current = { x: e.clientX - view.x, y: e.clientY - view.y }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setView({ ...view, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
        onPointerUp={() => (drag.current = null)}
        viewBox={`0 0 ${Math.max(width, 800)} ${height}`}
        preserveAspectRatio="xMinYMin meet"
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map(([a, b]) => (
            <path key={a.id + b.id} d={`M${a.x + 180},${a.y + 18} C${a.x + 200},${a.y + 18} ${b.x - 20},${b.y + 18} ${b.x},${b.y + 18}`} fill="none" stroke="var(--border-strong)" />
          ))}
          {flat.map((n) => {
            const frac = n.count ? n.read / n.count : 0;
            const dim = hit && !hit.has(n.id);
            return (
              <g key={n.id} className="map-node" transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.3 : 1} onClick={() => onOpen(n.id)}>
                <rect width={180} height={36} rx={8} fill="var(--surface)" stroke={hit?.has(n.id) ? 'var(--accent)' : 'var(--border-strong)'} strokeWidth={hit?.has(n.id) ? 2 : 1} />
                <rect x={0} y={32} width={180 * frac} height={4} rx={2} fill="var(--good)" />
                <text x={10} y={22} fontSize={12.5} fill="var(--text)" fontFamily="var(--sans)">{n.name.length > 20 ? n.name.slice(0, 19) + '…' : n.name}</text>
                <text x={170} y={22} fontSize={11} fill="var(--text-3)" textAnchor="end" fontFamily="var(--sans)">{n.count}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="graph-controls">
        <input className="input sm" style={{ maxWidth: 240 }} placeholder="Find a folder…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="chip">Green bar = share finished</span>
      </div>
      <div className="graph-zoom">
        <button className="btn sm icon" onClick={() => setView({ ...view, k: Math.min(2.5, view.k * 1.2) })}>＋</button>
        <button className="btn sm icon" onClick={() => setView({ ...view, k: Math.max(0.3, view.k / 1.2) })}>－</button>
        <button className="btn sm icon" onClick={() => setView({ x: 20, y: 20, k: 1 })} title="Reset">⟲</button>
      </div>
    </div>
  );
}

export function lengthLabel(it: Item) {
  const p = pagesOf(it);
  return p ? `${p} pages` : it.total ? fmtUnits(it, it.total) : 'Unknown length';
}
