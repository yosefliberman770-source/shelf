// Interactive, zoomable, searchable, filterable knowledge graph (d3-force).
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeType } from '../db/types';
import type { LibraryIndex } from '../engine/model';
import { SERIES } from './charts';

export interface GNode extends SimulationNodeDatum {
  id: string;
  type: NodeType;
  label: string;
  refId: string;
  weight: number;
}

export interface GLink extends SimulationLinkDatum<GNode> {
  ai: boolean;
  relation?: string;
}

const TYPE_COLOR: Record<NodeType, string> = { item: SERIES[0], author: SERIES[1], concept: SERIES[2], note: SERIES[4], folder: SERIES[6], tag: SERIES[3] };
export const TYPE_LABEL: Record<NodeType, string> = { item: 'Books', author: 'Authors', concept: 'Concepts', note: 'Notes', folder: 'Folders', tag: 'Tags' };

export function buildGraph(idx: LibraryIndex, types: Set<NodeType>, focus?: { type: NodeType; id: string }, depth = 2): { nodes: GNode[]; links: GLink[] } {
  const nodes = new Map<string, GNode>();
  const links: GLink[] = [];
  const add = (type: NodeType, refId: string, label: string) => {
    const id = `${type}:${refId}`;
    if (!nodes.has(id)) nodes.set(id, { id, type, refId, label, weight: 0 });
    return id;
  };
  const edge = (a: string, b: string, ai = false, relation?: string) => {
    if (a === b) return;
    links.push({ source: a, target: b, ai, relation });
  };
  for (const it of idx.itemList()) {
    if (types.has('item')) add('item', it.id, it.title);
    if (types.has('author')) for (const a of it.authorIds) { const n = idx.authors.get(a); if (n) { add('author', a, n.name); if (types.has('item')) edge(`item:${it.id}`, `author:${a}`); } }
    if (types.has('folder')) for (const f of it.folderIds) { const n = idx.folders.get(f); if (n) { add('folder', f, n.name); if (types.has('item')) edge(`item:${it.id}`, `folder:${f}`); } }
    if (types.has('tag')) for (const t of it.tagIds) { const n = idx.tags.get(t); if (n) { add('tag', t, `#${n.name}`); if (types.has('item')) edge(`item:${it.id}`, `tag:${t}`); } }
  }
  if (types.has('folder')) for (const f of idx.snap.folders) if (f.parentId && idx.folders.has(f.parentId)) { add('folder', f.id, f.name); add('folder', f.parentId, idx.folders.get(f.parentId)!.name); edge(`folder:${f.id}`, `folder:${f.parentId}`); }
  if (types.has('concept')) for (const c of idx.snap.concepts) { add('concept', c.id, c.name); if (c.parentId && idx.concepts.has(c.parentId)) edge(`concept:${c.id}`, `concept:${c.parentId}`, c.source === 'ai'); }
  if (types.has('note'))
    for (const n of idx.snap.notes) {
      add('note', n.id, n.text.slice(0, 40) + (n.text.length > 40 ? '…' : ''));
      if (n.itemId && types.has('item')) edge(`note:${n.id}`, `item:${n.itemId}`);
      if (types.has('concept')) for (const c of n.conceptIds) if (idx.concepts.has(c)) edge(`note:${n.id}`, `concept:${c}`);
    }
  for (const l of idx.snap.links) {
    if (!types.has(l.fromType) || !types.has(l.toType)) continue;
    const a = `${l.fromType}:${l.fromId}`;
    const b = `${l.toType}:${l.toId}`;
    if (nodes.has(a) && nodes.has(b)) edge(a, b, l.source === 'ai', l.relation);
  }
  let keep: Set<string> | undefined;
  if (focus) {
    keep = new Set([`${focus.type}:${focus.id}`]);
    for (let d = 0; d < depth; d++) {
      for (const l of links) {
        const s = l.source as string, t = l.target as string;
        if (keep.has(s)) keep.add(t);
        else if (keep.has(t)) keep.add(s);
      }
    }
  }
  const finalLinks = links.filter((l) => !keep || (keep.has(l.source as string) && keep.has(l.target as string)));
  for (const l of finalLinks) { nodes.get(l.source as string)!.weight++; nodes.get(l.target as string)!.weight++; }
  const finalNodes = [...nodes.values()].filter((n) => !keep || keep.has(n.id));
  return { nodes: finalNodes, links: finalLinks };
}

export function KnowledgeGraph({ idx, onOpen, focus, initialTypes = ['item', 'author', 'concept', 'folder'], height = 560 }: { idx: LibraryIndex; onOpen: (n: GNode) => void; focus?: { type: NodeType; id: string }; initialTypes?: NodeType[]; height?: number }) {
  const [types, setTypes] = useState<Set<NodeType>>(new Set(initialTypes));
  const [q, setQ] = useState('');
  const [aiOnly, setAiOnly] = useState<'all' | 'user' | 'ai'>('all');
  const [, setTick] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; node?: GNode } | null>(null);
  const graph = useMemo(() => {
    const g = buildGraph(idx, types, focus);
    return { nodes: g.nodes, links: g.links.filter((l) => aiOnly === 'all' || (aiOnly === 'ai' ? l.ai : !l.ai)) };
  }, [idx, types, focus, aiOnly]);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  useEffect(() => {
    const w = wrap.current?.clientWidth ?? 800;
    const sim = forceSimulation<GNode>(graph.nodes)
      .force('link', forceLink<GNode, GLink>(graph.links).id((d) => d.id).distance(60).strength(0.4))
      .force('charge', forceManyBody().strength(-160))
      .force('center', forceCenter(w / 2, height / 2))
      .force('collide', forceCollide<GNode>().radius((d) => radius(d) + 4))
      .alphaDecay(0.04)
      .on('tick', () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => { sim.stop(); };
  }, [graph, height]);
  const hit = q ? new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())).map((n) => n.id)) : null;
  const toggle = (t: NodeType) => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const toLocal = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  };
  return (
    <div className="graph-wrap" ref={wrap} style={{ height }}>
      <svg
        onWheel={(e) => {
          const r = wrap.current!.getBoundingClientRect();
          const k = Math.min(4, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
          const mx = e.clientX - r.left, my = e.clientY - r.top;
          setView({ k, x: mx - ((mx - view.x) * k) / view.k, y: my - ((my - view.y) * k) / view.k });
        }}
        onPointerDown={(e) => { drag.current = { x: e.clientX - view.x, y: e.clientY - view.y }; (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (d.node) { const p = toLocal(e); d.node.fx = p.x; d.node.fy = p.y; simRef.current?.alphaTarget(0.2).restart(); }
          else setView({ ...view, x: e.clientX - d.x, y: e.clientY - d.y });
        }}
        onPointerUp={() => { if (drag.current?.node) { drag.current.node.fx = null; drag.current.node.fy = null; simRef.current?.alphaTarget(0); } drag.current = null; }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {graph.links.map((l, i) => {
            const s = l.source as GNode, t = l.target as GNode;
            if (s.x === undefined || t.x === undefined) return null;
            const dim = hit && !hit.has(s.id) && !hit.has(t.id);
            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={l.ai ? 'var(--ai)' : 'var(--border-strong)'} strokeDasharray={l.ai ? '4 3' : undefined} strokeOpacity={dim ? 0.15 : 0.8} strokeWidth={1}><title>{l.ai ? 'AI-generated connection' : 'Your connection'}{l.relation ? ` — ${l.relation}` : ''}</title></line>;
          })}
          {graph.nodes.map((n) => {
            if (n.x === undefined) return null;
            const dim = hit && !hit.has(n.id);
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.2 : 1} style={{ cursor: 'pointer' }}
                onPointerDown={(e) => { e.stopPropagation(); drag.current = { x: 0, y: 0, node: n }; (e.currentTarget.ownerSVGElement as Element).setPointerCapture(e.pointerId); }}
                onDoubleClick={() => onOpen(n)}
              >
                <circle r={radius(n)} fill={TYPE_COLOR[n.type]} stroke={hit?.has(n.id) ? 'var(--text)' : 'var(--surface)'} strokeWidth={2} />
                {(n.weight >= 2 || view.k > 1.3 || hit?.has(n.id) || graph.nodes.length < 40) && <text className="node-label" x={radius(n) + 3} y={4}>{n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label}</text>}
                <title>{TYPE_LABEL[n.type]}: {n.label} (double-click to open)</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="graph-controls">
        <input className="input sm" style={{ maxWidth: 200 }} placeholder="Search graph…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(Object.keys(TYPE_LABEL) as NodeType[]).map((t) => (
          <button key={t} className={`chip ${types.has(t) ? 'on' : ''}`} onClick={() => toggle(t)}><i style={{ width: 8, height: 8, borderRadius: 4, background: TYPE_COLOR[t], display: 'inline-block' }} /> {TYPE_LABEL[t]}</button>
        ))}
        <select className="select sm" style={{ width: 150 }} value={aiOnly} onChange={(e) => setAiOnly(e.target.value as typeof aiOnly)}>
          <option value="all">All connections</option><option value="user">Mine only</option><option value="ai">AI-generated only</option>
        </select>
      </div>
      <div className="graph-zoom">
        <button className="btn sm icon" onClick={() => setView({ ...view, k: Math.min(4, view.k * 1.2) })}>＋</button>
        <button className="btn sm icon" onClick={() => setView({ ...view, k: Math.max(0.2, view.k / 1.2) })}>－</button>
        <button className="btn sm icon" title="Reset view" onClick={() => setView({ x: 0, y: 0, k: 1 })}>⟲</button>
      </div>
      <div style={{ position: 'absolute', left: 10, bottom: 10 }} className="tiny faint">{graph.nodes.length} nodes · {graph.links.length} links · dashed violet = AI-generated · double-click a node to open</div>
      {graph.nodes.length === 0 && <div className="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center' }}>Nothing to show yet — add books, concepts and connections.</div>}
    </div>
  );
}

function radius(n: GNode) {
  return Math.min(16, 5 + Math.sqrt(n.weight) * 2.2);
}
