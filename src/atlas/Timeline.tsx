// The atlas timeline: ━━━━━━●━━━━━━  218 BCE
// Moves through BCE/CE without a year 0; the map's layers follow it.
import { useEffect, useRef, useState } from 'react';
import { clampYear, fromAstro, type HistYear, MAX_YEAR, MIN_YEAR, shiftYear, toAstro, yearLabel } from './time';

const SPANS = [
  { years: 50, label: '50 yrs' },
  { years: 200, label: '200 yrs' },
  { years: 1000, label: '1,000 yrs' },
  { years: 5500, label: 'All' },
];

export function Timeline({ year, onChange, marks = [] }: {
  year: HistYear;
  onChange: (y: HistYear) => void;
  /** Years worth marking on the track (e.g. dates in the book). */
  marks?: { year: HistYear; label: string }[];
}) {
  const [span, setSpan] = useState(200);
  const [playing, setPlaying] = useState(false);
  const yearRef = useRef(year);
  yearRef.current = year;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const next = shiftYear(yearRef.current, 1);
      if (next > MAX_YEAR) { setPlaying(false); return; }
      onChange(next);
    }, 900);
    return () => clearInterval(t);
  }, [playing, onChange]);

  // The track shows a window of `span` years around the year (astronomical, so it's continuous).
  const a = toAstro(year);
  const half = span / 2;
  let lo = Math.max(toAstro(MIN_YEAR), Math.round(a - half));
  let hi = Math.min(toAstro(MAX_YEAR), Math.round(a + half));
  if (hi - lo < span) { if (lo === toAstro(MIN_YEAR)) hi = Math.min(toAstro(MAX_YEAR), lo + span); else lo = Math.max(toAstro(MIN_YEAR), hi - span); }
  const pct = (v: number) => ((v - lo) / Math.max(1, hi - lo)) * 100;
  const step = (n: number) => onChange(clampYear(shiftYear(year, n)));

  return (
    <div className="atlas-timeline" role="group" aria-label="Timeline">
      <div className="atlas-tl-row">
        <button className="btn xs ghost" onClick={() => step(-10)} aria-label="10 years earlier">«</button>
        <button className="btn xs ghost" onClick={() => step(-1)} aria-label="1 year earlier">‹</button>
        <div className="atlas-tl-track">
          <input type="range" min={lo} max={hi} step={1} value={a} aria-label={`Year: ${yearLabel(year)}`} aria-valuetext={yearLabel(year)}
            onChange={(e) => onChange(clampYear(fromAstro(Number(e.target.value))))} />
          {marks.filter((m) => toAstro(m.year) >= lo && toAstro(m.year) <= hi).map((m) => (
            <button key={`${m.year}-${m.label}`} className="atlas-tl-mark" style={{ left: `${pct(toAstro(m.year))}%` }} title={`${m.label} (${yearLabel(m.year)})`} aria-label={`Go to ${m.label}, ${yearLabel(m.year)}`} onClick={() => onChange(m.year)} />
          ))}
        </div>
        <button className="btn xs ghost" onClick={() => step(1)} aria-label="1 year later">›</button>
        <button className="btn xs ghost" onClick={() => step(10)} aria-label="10 years later">»</button>
      </div>
      <div className="atlas-tl-row atlas-tl-foot">
        <span className="tiny faint">{yearLabel(fromAstro(lo))}</span>
        <span className="atlas-tl-year" aria-live="polite">{yearLabel(year)}</span>
        <span className="tiny faint">{yearLabel(fromAstro(hi))}</span>
      </div>
      <div className="atlas-tl-row" style={{ gap: 6 }}>
        <button className={`btn xs ${playing ? 'accent' : ''}`} onClick={() => setPlaying(!playing)}>{playing ? '■ Stop' : '▶ Play'}</button>
        <span className="tiny faint">Span</span>
        {SPANS.map((s) => <button key={s.years} className={`chip ${span === s.years ? 'on' : ''}`} style={{ minHeight: 24, fontSize: 11, padding: '0 8px' }} onClick={() => setSpan(s.years)}>{s.label}</button>)}
      </div>
    </div>
  );
}
