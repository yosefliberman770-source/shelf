// Lightweight inline-SVG chart engine. Thin marks, recessive grid, hover
// tooltips, legends for multi-series, and a table view on every ChartCard.
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
export const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth);
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const fmtDefault = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v * 10) / 10}`);

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function ticks(max: number, n = 4): number[] {
  return Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  );
}

export interface Datum {
  label: string;
  value: number;
  /** Tooltip label override. */
  title?: string;
}

// ── Bar / column ────────────────────────────────────────────────────────

export function BarChart({
  data,
  height = 200,
  format = fmtDefault,
  color = SERIES[0],
  labelEvery,
  horizontal = false,
  onClick,
}: {
  data: Datum[];
  height?: number;
  format?: (v: number) => string;
  color?: string;
  labelEvery?: number;
  horizontal?: boolean;
  onClick?: (d: Datum) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  if (horizontal) return <HBar data={data} format={format} color={color} onClick={onClick} />;
  const padL = 36, padB = 22, padT = 8;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const iw = Math.max(0, w - padL);
  const ih = height - padB - padT;
  const band = data.length ? iw / data.length : 0;
  const bw = Math.min(24, Math.max(2, band - 4));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(iw / 44))));
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img">
          <g className="axis">
            {ticks(max).map((t) => {
              const y = padT + ih - (t / max) * ih;
              return (
                <g key={t}>
                  <line className="gridline" x1={padL} x2={w} y1={y} y2={y} />
                  <text x={padL - 6} y={y + 4} textAnchor="end">{format(t)}</text>
                </g>
              );
            })}
            {data.map((d, i) =>
              i % every === 0 ? (
                <text key={i} x={padL + band * i + band / 2} y={height - 5} textAnchor="middle">{d.label}</text>
              ) : null,
            )}
          </g>
          {data.map((d, i) => {
            const h = (Math.max(0, d.value) / max) * ih;
            const x = padL + band * i + (band - bw) / 2;
            const y = padT + ih - h;
            const r = Math.min(4, bw / 2, h);
            return (
              <g key={i}>
                <rect
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={ih}
                  fill="transparent"
                  style={{ cursor: onClick ? 'pointer' : undefined }}
                  onClick={() => onClick?.(d)}
                  onMouseMove={() => setTip({ x: x + bw / 2, y, content: <><b>{d.title ?? d.label}</b> · {format(d.value)}</> })}
                />
                {h > 0 && <path d={roundTop(x, y, bw, h, r)} fill={color} pointerEvents="none" />}
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

function roundTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function HBar({ data, format, color, onClick }: { data: Datum[]; format: (v: number) => string; color: string; onClick?: (d: Datum) => void }) {
  const max = Math.max(1e-9, ...data.map((d) => d.value));
  return (
    <div className="col gap-4">
      {data.map((d, i) => (
        <div key={i} className="row" style={{ cursor: onClick ? 'pointer' : undefined }} onClick={() => onClick?.(d)} title={`${d.title ?? d.label}: ${format(d.value)}`}>
          <div className="ellipsis small" style={{ width: '34%' }}>{d.label}</div>
          <div className="grow" style={{ height: 14 }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: color, borderRadius: '0 4px 4px 0', minWidth: d.value > 0 ? 2 : 0 }} />
          </div>
          <div className="small num muted" style={{ width: 56, textAlign: 'right' }}>{format(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Line / area ─────────────────────────────────────────────────────────

export interface Series {
  name: string;
  points: { x: string; y: number }[];
  color?: string;
  dashed?: boolean;
}

export function LineChart({
  series,
  height = 220,
  area = false,
  format = fmtDefault,
  xFormat = (x: string) => x,
  yMax,
  markers = false,
}: {
  series: Series[];
  height?: number;
  area?: boolean;
  format?: (v: number) => string;
  xFormat?: (x: string) => string;
  yMax?: number;
  markers?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  const padL = 40, padB = 22, padT = 10, padR = 10;
  const iw = Math.max(0, w - padL - padR);
  const ih = height - padB - padT;
  const max = yMax ?? niceMax(Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.y))));
  const xPos = (x: string) => padL + (xs.length <= 1 ? iw / 2 : (xs.indexOf(x) / (xs.length - 1)) * iw);
  const yPos = (y: number) => padT + ih - (Math.max(0, y) / max) * ih;
  const nLabels = Math.max(2, Math.floor(iw / 80));
  const labelIdx = new Set(xs.length <= nLabels ? xs.map((_, i) => i) : Array.from({ length: nLabels }, (_, i) => Math.round((i * (xs.length - 1)) / (nLabels - 1))));
  const hx = hover !== null ? xs[hover] : undefined;
  return (
    <div
      className="chart"
      ref={ref}
      onMouseMove={(e) => {
        if (!xs.length) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const px = e.clientX - rect.left - padL;
        const i = xs.length <= 1 ? 0 : Math.round((px / iw) * (xs.length - 1));
        setHover(Math.max(0, Math.min(xs.length - 1, i)));
      }}
      onMouseLeave={() => setHover(null)}
    >
      {w > 0 && (
        <svg width={w} height={height} role="img">
          <g className="axis">
            {ticks(max).map((t) => (
              <g key={t}>
                <line className="gridline" x1={padL} x2={w - padR} y1={yPos(t)} y2={yPos(t)} />
                <text x={padL - 6} y={yPos(t) + 4} textAnchor="end">{format(t)}</text>
              </g>
            ))}
            {xs.map((x, i) => (labelIdx.has(i) ? <text key={x} x={xPos(x)} y={height - 5} textAnchor={i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'}>{xFormat(x)}</text> : null))}
          </g>
          {series.map((s, si) => {
            const color = s.color ?? SERIES[si % SERIES.length];
            const pts = s.points.filter((p) => xs.includes(p.x)).sort((a, b) => a.x.localeCompare(b.x));
            if (!pts.length) return null;
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xPos(p.x)},${yPos(p.y)}`).join('');
            return (
              <g key={s.name}>
                {area && <path d={`${d}L${xPos(pts[pts.length - 1].x)},${yPos(0)}L${xPos(pts[0].x)},${yPos(0)}Z`} fill={color} opacity={0.1} />}
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
                {(markers || pts.length === 1) && pts.map((p) => <circle key={p.x} cx={xPos(p.x)} cy={yPos(p.y)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />)}
                {!markers && pts.length > 1 && <circle cx={xPos(pts[pts.length - 1].x)} cy={yPos(pts[pts.length - 1].y)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            );
          })}
          {hx !== undefined && (
            <g pointerEvents="none">
              <line x1={xPos(hx)} x2={xPos(hx)} y1={padT} y2={padT + ih} stroke="var(--border-strong)" />
              {series.map((s, si) => {
                const p = s.points.find((pp) => pp.x === hx);
                return p ? <circle key={s.name} cx={xPos(hx)} cy={yPos(p.y)} r={4.5} fill={s.color ?? SERIES[si % SERIES.length]} stroke="var(--surface)" strokeWidth={2} /> : null;
              })}
            </g>
          )}
        </svg>
      )}
      {hx !== undefined && (
        <div className="tooltip" style={{ left: xPos(hx), top: padT + 4 }}>
          <b>{xFormat(hx)}</b>
          {series.map((s, si) => {
            const p = s.points.find((pp) => pp.x === hx);
            return p ? (
              <div key={s.name}>
                <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color ?? SERIES[si % SERIES.length], marginRight: 6 }} />
                {series.length > 1 ? `${s.name}: ` : ''}{format(p.y)}
              </div>
            ) : null;
          })}
        </div>
      )}
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.name, color: s.color ?? SERIES[i % SERIES.length] }))} />}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <i style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── Stacked columns ─────────────────────────────────────────────────────

export function StackedBars({
  rows,
  keys,
  height = 220,
  format = fmtDefault,
}: {
  rows: { label: string; values: Record<string, number> }[];
  keys: string[];
  height?: number;
  format?: (v: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const padL = 36, padB = 22, padT = 8;
  const max = niceMax(Math.max(0, ...rows.map((r) => keys.reduce((a, k) => a + (r.values[k] ?? 0), 0))));
  const iw = Math.max(0, w - padL);
  const ih = height - padB - padT;
  const band = rows.length ? iw / rows.length : 0;
  const bw = Math.min(24, Math.max(3, band - 4));
  const every = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(iw / 44))));
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height}>
          <g className="axis">
            {ticks(max).map((t) => {
              const y = padT + ih - (t / max) * ih;
              return (
                <g key={t}>
                  <line className="gridline" x1={padL} x2={w} y1={y} y2={y} />
                  <text x={padL - 6} y={y + 4} textAnchor="end">{format(t)}</text>
                </g>
              );
            })}
            {rows.map((r, i) => (i % every === 0 ? <text key={i} x={padL + band * i + band / 2} y={height - 5} textAnchor="middle">{r.label}</text> : null))}
          </g>
          {rows.map((r, i) => {
            let acc = 0;
            const x = padL + band * i + (band - bw) / 2;
            const total = keys.reduce((a, k) => a + (r.values[k] ?? 0), 0);
            return (
              <g
                key={i}
                onMouseMove={() =>
                  setTip({
                    x: x + bw / 2,
                    y: padT + ih - (total / max) * ih,
                    content: (
                      <>
                        <b>{r.label}</b>
                        {keys.filter((k) => r.values[k]).map((k) => (
                          <div key={k}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SERIES[keys.indexOf(k) % 8], marginRight: 6 }} />{k}: {format(r.values[k])}</div>
                        ))}
                      </>
                    ),
                  })
                }
              >
                <rect x={padL + band * i} y={padT} width={band} height={ih} fill="transparent" />
                {keys.map((k, ki) => {
                  const v = r.values[k] ?? 0;
                  if (v <= 0) return null;
                  const h = (v / max) * ih;
                  const y = padT + ih - acc - h;
                  acc += h;
                  return <rect key={k} x={x} y={y} width={bw} height={Math.max(0, h - 2)} fill={SERIES[ki % 8]} rx={1.5} pointerEvents="none" />;
                })}
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
      <Legend items={keys.map((k, i) => ({ label: k, color: SERIES[i % 8] }))} />
    </div>
  );
}

// ── Donut ───────────────────────────────────────────────────────────────

export function Donut({ data, size = 180, format = fmtDefault, center }: { data: Datum[]; size?: number; format?: (v: number) => string; center?: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  const r = size / 2 - 4;
  const inner = r * 0.62;
  let a0 = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const frac = total ? Math.max(0, d.value) / total : 0;
    const a1 = a0 + frac * Math.PI * 2;
    const path = arc(size / 2, size / 2, r, inner, a0, a1 - (frac < 1 ? 0.02 : 0));
    a0 = a1;
    return { d, path, color: SERIES[i % 8], frac };
  });
  const h = hover !== null ? arcs[hover] : undefined;
  return (
    <div className="row gap-16 wrap" style={{ alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg width={size} height={size}>
          {total === 0 && <circle cx={size / 2} cy={size / 2} r={(r + inner) / 2} fill="none" stroke="var(--surface-3)" strokeWidth={r - inner} />}
          {arcs.map((a, i) => (a.frac > 0 ? <path key={i} d={a.path} fill={a.color} opacity={hover === null || hover === i ? 1 : 0.35} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} /> : null))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none', padding: inner * 0.3 }}>
          {h ? (
            <div><div className="small ellipsis" style={{ maxWidth: inner * 1.5 }}>{h.d.label}</div><div style={{ fontWeight: 600 }}>{Math.round(h.frac * 100)}%</div></div>
          ) : center}
        </div>
      </div>
      <div className="col gap-4" style={{ minWidth: 140, flex: 1 }}>
        {arcs.map((a, i) => (
          <div key={i} className="row small" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flex: 'none' }} />
            <span className="ellipsis grow">{a.d.label}</span>
            <span className="num muted">{Math.round(a.frac * 100)}%</span>
            <span className="num faint" style={{ minWidth: 44, textAlign: 'right' }}>{format(a.d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function arc(cx: number, cy: number, r: number, ri: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
  return `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${large} 0 ${p(ri, a0)}Z`;
}

// ── Progress ring ───────────────────────────────────────────────────────

export function Ring({ value, size = 120, stroke = 10, children, color = 'var(--accent)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} className="ring">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={value >= 1 ? 'var(--good)' : color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

// ── Calendar heatmap (GitHub-style year) ────────────────────────────────

export function CalendarHeatmap({
  values,
  from,
  to,
  format = fmtDefault,
  onClick,
}: {
  values: Map<string, number>;
  from: string;
  to: string;
  format?: (v: number) => string;
  onClick?: (date: string) => void;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const start = new Date(`${from}T12:00:00`);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(`${to}T12:00:00`);
  const cells: { key: string; x: number; y: number; v: number; inRange: boolean }[] = [];
  const max = Math.max(1, ...values.values());
  const d = new Date(start);
  let col = 0;
  const months: { x: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < 400 && d <= end; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = d.getDay();
    if (row === 0 && i > 0) col++;
    if (d.getDate() <= 7 && row === 0 && d.getMonth() !== lastMonth) {
      months.push({ x: col, label: d.toLocaleString(undefined, { month: 'short' }) });
      lastMonth = d.getMonth();
    }
    cells.push({ key, x: col, y: row, v: values.get(key) ?? 0, inRange: key >= from && key <= to });
    d.setDate(d.getDate() + 1);
  }
  const cs = 12, gap = 3;
  const w = (col + 1) * (cs + gap) + 24;
  const level = (v: number) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999)));
  return (
    <div className="chart" style={{ overflowX: 'auto' }} onMouseLeave={() => setTip(null)}>
      <svg width={w} height={7 * (cs + gap) + 18}>
        <g className="axis">
          {months.map((m) => <text key={m.x + m.label} x={24 + m.x * (cs + gap)} y={10}>{m.label}</text>)}
          {['M', 'W', 'F'].map((l, i) => <text key={l} x={0} y={18 + (i * 2 + 1) * (cs + gap) + 10}>{l}</text>)}
        </g>
        {cells.map((c) =>
          c.inRange ? (
            <rect
              key={c.key}
              x={24 + c.x * (cs + gap)}
              y={18 + c.y * (cs + gap)}
              width={cs}
              height={cs}
              rx={2.5}
              fill={SEQ[level(c.v)]}
              style={{ cursor: onClick ? 'pointer' : undefined }}
              onClick={() => onClick?.(c.key)}
              onMouseEnter={() => setTip({ x: 24 + c.x * (cs + gap) + cs / 2, y: 18 + c.y * (cs + gap), content: <><b>{c.key}</b> · {c.v ? format(c.v) : 'no reading'}</> })}
            />
          ) : null,
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

// ── Matrix heatmap (weekday × hour) ─────────────────────────────────────

export function MatrixHeatmap({ rows, rowLabels, colLabels, format = fmtDefault }: { rows: number[][]; rowLabels: string[]; colLabels: string[]; format?: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const max = Math.max(1e-9, ...rows.flat());
  const padL = 34;
  const cols = rows[0]?.length ?? 0;
  const cw = cols ? Math.max(8, (w - padL) / cols) : 0;
  const ch = 20;
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={rows.length * ch + 20}>
          <g className="axis">
            {rowLabels.map((l, i) => <text key={l} x={0} y={i * ch + 14}>{l}</text>)}
            {colLabels.map((l, i) => (i % Math.ceil(24 / Math.max(1, Math.floor((w - padL) / 34))) === 0 ? <text key={i} x={padL + i * cw + cw / 2} y={rows.length * ch + 14} textAnchor="middle">{l}</text> : null))}
          </g>
          {rows.map((r, ri) =>
            r.map((v, ci) => (
              <rect
                key={`${ri}-${ci}`}
                x={padL + ci * cw + 1}
                y={ri * ch + 1}
                width={Math.max(1, cw - 2)}
                height={ch - 2}
                rx={2}
                fill={SEQ[v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999))]}
                onMouseEnter={() => setTip({ x: padL + ci * cw + cw / 2, y: ri * ch, content: <><b>{rowLabels[ri]} {colLabels[ci]}</b> · {format(v)}</> })}
              />
            )),
          )}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

// ── Scatter ─────────────────────────────────────────────────────────────

export function Scatter({
  points,
  height = 240,
  xLabel,
  yLabel,
  xFormat = fmtDefault,
  yFormat = fmtDefault,
}: {
  points: { x: number; y: number; label: string; color?: string }[];
  height?: number;
  xLabel: string;
  yLabel: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const padL = 40, padB = 34, padT = 8, padR = 10;
  const xMax = niceMax(Math.max(0, ...points.map((p) => p.x)));
  const yMax = niceMax(Math.max(0, ...points.map((p) => p.y)));
  const iw = Math.max(0, w - padL - padR);
  const ih = height - padB - padT;
  const X = (v: number) => padL + (v / xMax) * iw;
  const Y = (v: number) => padT + ih - (v / yMax) * ih;
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height}>
          <g className="axis">
            {ticks(yMax).map((t) => (
              <g key={t}><line className="gridline" x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} /><text x={padL - 6} y={Y(t) + 4} textAnchor="end">{yFormat(t)}</text></g>
            ))}
            {ticks(xMax).map((t) => <text key={t} x={X(t)} y={padT + ih + 16} textAnchor="middle">{xFormat(t)}</text>)}
            <text x={padL + iw / 2} y={height - 2} textAnchor="middle">{xLabel}</text>
            <text x={4} y={padT - 0} textAnchor="start">{yLabel}</text>
          </g>
          {points.map((p, i) => (
            <circle
              key={i}
              cx={X(p.x)}
              cy={Y(p.y)}
              r={5}
              fill={p.color ?? SERIES[0]}
              fillOpacity={0.85}
              stroke="var(--surface)"
              strokeWidth={2}
              onMouseEnter={() => setTip({ x: X(p.x), y: Y(p.y), content: <><b>{p.label}</b><div>{xLabel}: {xFormat(p.x)} · {yLabel}: {yFormat(p.y)}</div></> })}
            />
          ))}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────

export function Sparkline({ values, width = 90, height = 26, color = 'var(--accent)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1e-9, ...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * width},${height - 2 - (v / max) * (height - 4)}`).join('');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Chart card with type switcher and table view ────────────────────────

export type ChartKind = 'bar' | 'line' | 'area' | 'table';

export function ChartCard({
  title,
  subtitle,
  data,
  kinds = ['bar', 'line', 'area', 'table'],
  initial = 'bar',
  format,
  xFormat,
  height,
  actions,
  empty,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  data: Datum[];
  kinds?: ChartKind[];
  initial?: ChartKind;
  format?: (v: number) => string;
  xFormat?: (x: string) => string;
  height?: number;
  actions?: ReactNode;
  empty?: ReactNode;
}) {
  const [kind, setKind] = useState<ChartKind>(initial);
  useEffect(() => setKind(initial), [initial]);
  const hasData = data.some((d) => d.value > 0);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <div className="small faint">{subtitle}</div>}
        </div>
        <div className="row">
          {actions}
          {kinds.length > 1 && hasData && (
            <div className="btn-group sm" role="tablist" aria-label="Chart type">
              {kinds.map((k) => (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)} title={k}>
                  {k === 'bar' ? '▮▮' : k === 'line' ? '╱' : k === 'area' ? '◢' : '☰'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {!hasData ? (
        empty ?? <div className="empty small">No data for this period yet.</div>
      ) : kind === 'table' ? (
        <div className="table-wrap" style={{ maxHeight: height ?? 220 }}>
          <table className="table">
            <tbody>
              {data.map((d) => (
                <tr key={d.label}><td>{d.title ?? (xFormat ? xFormat(d.label) : d.label)}</td><td className="r num">{(format ?? fmtDefault)(d.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : kind === 'bar' ? (
        <BarChart data={xFormat ? data.map((d) => ({ ...d, title: d.title ?? xFormat(d.label), label: xFormat(d.label) })) : data} format={format} height={height} />
      ) : (
        <LineChart series={[{ name: 'value', points: data.map((d) => ({ x: d.label, y: d.value })) }]} area={kind === 'area'} format={format} xFormat={xFormat} height={height} />
      )}
    </div>
  );
}
