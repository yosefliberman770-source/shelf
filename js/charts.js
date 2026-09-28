/* Shelfmark chart + widget helpers. Charts are plain SVG strings; any element with
   data-tip="html" gets a hover/tap tooltip through one delegated listener. */
const tip = $('#tip');
function showTip(html, x, y){ tip.innerHTML = html; tip.hidden = false; const r = tip.getBoundingClientRect(); let l = x + 14, t = y + 14; if (l + r.width > innerWidth - 8) l = x - r.width - 14; if (t + r.height > innerHeight - 8) t = y - r.height - 14; tip.style.left = Math.max(8,l) + 'px'; tip.style.top = Math.max(8,t) + 'px'; }
const hideTip = () => { tip.hidden = true; };
const tipAttr = html => `data-tip="${esc(html)}"`;
for (const ev of ['pointermove','pointerdown']) document.addEventListener(ev, e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) showTip(el.dataset.tip, e.clientX, e.clientY);
  else if (!e.target.closest || !e.target.closest('.chart svg[data-own-tip]')) hideTip();
});
addEventListener('scroll', hideTip, {passive:true});

const line = pts => pts.map((p,i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
/* rounded-top bar anchored to the baseline */
const barPath = (x, y, w, h, r = 4) => { if (h <= 0) return ''; r = Math.min(r, w/2, h); return `M${x} ${y+h}V${y+r}Q${x} ${y} ${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h}Z`; };

/* vertical bars. data: [{l:label, v:value, tip:html, c?:color, hi?:bool}] */
function barsSVG(data, o = {}){
  const W = o.w || 480, H = o.h || 190, L = 40, R = 6, T = 12, B = 24;
  const max = niceMax(Math.max(...data.map(d => d.v), o.min || 0));
  const n = data.length, slot = (W - L - R) / n, bw = Math.max(2, Math.min(34, slot - 2));
  const y = v => T + (H - T - B) * (1 - v / max);
  const fmt = o.fmt || fmtNum;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:${o.minW || 280}px" role="img" aria-label="${esc(o.label || 'Bar chart')}">`;
  [0, .5, 1].forEach(f => { s += `<line x1="${L}" x2="${W-R}" y1="${y(max*f)}" y2="${y(max*f)}" stroke="var(--line)"/><text x="${L-7}" y="${y(max*f)+4}" text-anchor="end" font-size="12" fill="var(--ink-3)">${esc(fmt(max*f))}</text>`; });
  const every = o.every || Math.ceil(n / 12);
  data.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    if (i % every === 0 || i === n - 1 && o.lastLabel) s += `<text x="${x + bw/2}" y="${H-7}" text-anchor="middle" font-size="12" fill="var(--ink-3)">${esc(d.l)}</text>`;
    s += `<path d="${barPath(x, y(d.v), bw, H - B - y(d.v))}" fill="${d.c || (d.hi ? 'var(--gold)' : 'var(--accent)')}"/>`;
    s += `<rect x="${L + i*slot}" y="${T}" width="${slot}" height="${H-T-B}" fill="transparent" ${tipAttr(d.tip || `<b>${esc(d.l)}</b><br>${esc(fmt(d.v))}`)}/>`;
  });
  return s + '</svg>';
}
/* horizontal bars with labels + values, as HTML. rows: [{l, v, txt, best?, tip?}] */
function hbarsHTML(rows, o = {}){
  if (!rows.length) return `<div class="muted" style="font-size:13px;margin-top:8px">${o.empty || 'Nothing yet.'}</div>`;
  const max = Math.max(...rows.map(r => r.v)) || 1;
  return `<div class="hbars" ${o.wide ? 'style="--lw:150px"' : ''}>${rows.map(r => `<div class="hbar ${r.best ? 'best' : ''}" ${r.tip ? tipAttr(r.tip) : ''}><span class="lab" title="${esc(r.l)}">${r.lHTML || esc(r.l)}</span><span class="track"><i style="width:${r.v/max*100}%"></i></span><span class="v">${esc(r.txt ?? fmtNum(r.v))}</span></div>`).join('')}</div>`;
}
/* one line (optionally filled) over dates. pts: [[dateKey, value]] */
function lineSVG(pts, o = {}){
  const W = 480, H = o.h || 190, L = 44, R = 12, T = 12, B = 24;
  if (pts.length < 2) return '<div class="muted">Not enough data yet.</div>';
  const a = pts[0][0], z = pts[pts.length-1][0], span = Math.max(1, diffDays(a, z));
  const max = niceMax(Math.max(...pts.map(p => p[1])));
  const fmt = o.fmt || fmtNum;
  const x = k => L + diffDays(a, k) / span * (W - L - R), y = v => T + (H - T - B) * (1 - v / max);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:280px" role="img" aria-label="${esc(o.label || 'Line chart')}">`;
  [0, .5, 1].forEach(f => { s += `<line x1="${L}" x2="${W-R}" y1="${y(max*f)}" y2="${y(max*f)}" stroke="var(--line)"/><text x="${L-7}" y="${y(max*f)+4}" text-anchor="end" font-size="12" fill="var(--ink-3)">${esc(fmt(max*f))}</text>`; });
  for (let i = 0; i <= 4; i++) { const k = addDays(a, Math.round(span * i / 4)); s += `<text x="${x(k)}" y="${H-6}" text-anchor="${i===0?'start':i===4?'end':'middle'}" font-size="12" fill="var(--ink-3)">${fmtDate(k)}</text>`; }
  const P = pts.map(([k,v]) => [x(k), y(v)]);
  if (o.fill !== false) s += `<path d="${line(P)}L${P[P.length-1][0]} ${y(0)}L${P[0][0]} ${y(0)}Z" fill="${o.c || 'var(--accent)'}" opacity=".10"/>`;
  s += `<path d="${line(P)}" stroke="${o.c || 'var(--accent)'}" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
  const lp = P[P.length-1]; s += `<circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" fill="${o.c || 'var(--accent)'}" stroke="var(--surface)" stroke-width="2"/>`;
  const step = (W - L - R) / pts.length;
  pts.forEach(([k,v], i) => { s += `<rect x="${x(k) - step/2}" y="${T}" width="${step}" height="${H-T-B}" fill="transparent" ${tipAttr(`<b>${fmtDateLong(k)}</b><br>${esc(o.tipFmt ? o.tipFmt(v, k) : fmt(v))}`)}/>`; });
  return s + '</svg>';
}
/* 7 x 24 punch card. grid[d][h] = count */
function punchSVG(grid){
  const cell = 16, L = 30, T = 8, B = 20, W = L + 24 * cell, H = T + 7 * cell + B;
  const max = Math.max(1, ...grid.flat());
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:300px" role="img" aria-label="Sessions by weekday and hour">`;
  for (let d = 0; d < 7; d++) {
    s += `<text x="${L-6}" y="${T + d*cell + cell/2 + 4}" text-anchor="end" font-size="10.5" fill="var(--ink-3)">${DOW3[d]}</text>`;
    s += `<line x1="${L}" x2="${W}" y1="${T + d*cell + cell/2}" y2="${T + d*cell + cell/2}" stroke="var(--line)"/>`;
    for (let h = 0; h < 24; h++) { const v = grid[d][h]; if (!v) continue; const r = 2 + Math.sqrt(v / max) * 5.5;
      s += `<circle cx="${L + h*cell + cell/2}" cy="${T + d*cell + cell/2}" r="${r.toFixed(1)}" fill="var(--accent)" ${tipAttr(`<b>${DOW[d]}, ${hourLabel(h)}</b><br>${plural(v,'session','sessions')}`)}/>`; }
  }
  [0,6,12,18,23].forEach(h => { s += `<text x="${L + h*cell + cell/2}" y="${H-5}" text-anchor="middle" font-size="10.5" fill="var(--ink-3)">${hourLabel(h)}</text>`; });
  return s + '</svg>';
}
const hourLabel = h => h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p';

function ringSVG(frac, c, size = 30){ const r = size * .4, C = 2*Math.PI*r, m = size/2; return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${size*.13}"/><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${c}" stroke-width="${size*.13}" stroke-linecap="round" stroke-dasharray="${(C*clamp(frac,0,1)).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${m} ${m})"/>${frac >= 1 ? `<path d="M${m-5} ${m+.5}l3.3 3.3 6.4-7.3" stroke="${c}" stroke-width="2.2" fill="none"/>` : ''}</svg>`; }

const STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';
/* read-only stars; supports halves */
function starsHTML(r, size = 14){
  if (!r) return '';
  let s = `<span class="stars" style="--sz:${size}px" aria-label="${r} out of 5 stars">`;
  for (let i = 1; i <= 5; i++) { const f = clamp(r - i + 1, 0, 1); s += `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" class="s-bg"/>${f > 0 ? `<path d="${STAR}" class="s-fg" ${f < 1 ? 'style="clip-path:inset(0 50% 0 0)"' : ''}/>` : ''}</svg>`; }
  return s + '</span>';
}
/* tappable stars: tap a star to set it, tap again for half, a third time to clear */
function starInput(id, r, act = 'rate'){
  let s = `<div class="stars input" role="group" aria-label="Your rating">`;
  for (let i = 1; i <= 5; i++) { const f = clamp((r||0) - i + 1, 0, 1); s += `<button type="button" data-a="${act}" data-id="${id}" data-n="${i}" aria-label="${i} star${i>1?'s':''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" class="s-bg"/>${f > 0 ? `<path d="${STAR}" class="s-fg" ${f < 1 ? 'style="clip-path:inset(0 50% 0 0)"' : ''}/>` : ''}</svg></button>`; }
  return s + `<span class="sub" style="margin-left:6px">${r ? r + ' / 5' : 'Tap to rate'}</span></div>`;
}
const nextRating = (cur, n) => cur === n ? n - .5 : cur === n - .5 ? 0 : n;

/* book cover with a generated fallback (title on a colored spine) underneath */
function coverHTML(it, cls = ''){
  const src = coverSrc(it);
  return `<span class="cover ${cls}" style="--h:${hueOf(it.title + (it.author||''))}" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-cover referrerpolicy="no-referrer">` : ''}<span class="ct">${esc(it.title)}</span></span>`;
}
/* hide covers that fail to load (e.g. Open Library has none) so the fallback shows */
document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset.cover != null) t.remove(); }, true);
/* Open Library returns a 1x1 image for some misses */
document.addEventListener('load', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset.cover != null && t.naturalWidth < 5) t.remove(); }, true);
