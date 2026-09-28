/* Shelfmark plan simulator */
const PLAN_COLORS = ['var(--s-read)','var(--s-torah)','var(--s-listen)'];
const PLAN_PRESETS = [['20 min every day',[20,20,20,20,20,20,0]],['1h Sunday + 15 weekdays',[60,15,15,15,15,15,0]],['2h Motzei Shabbos',[0,0,0,0,0,0,120]],['45 min weeknights',[45,45,45,45,45,0,0]]];
const defaultPlans = () => [{name:'Plan A', m:[20,20,20,20,20,20,0]},{name:'Plan B', m:[60,15,15,15,15,15,0]},{name:'Plan C', m:[0,0,0,0,0,0,120]}];
const unitKey = it => it.unit === 'custom' ? 'custom:' + (it.cu||'unit') : it.unit;
function planTarget(){
  if (!S.planSel) return null;
  const type = S.planSel[0], id = S.planSel.slice(2);
  if (type === 'f' && state.folders[id]) { const all = subtreeItems(id); return {items:all.filter(i => !isFinished(i)), goal:state.folders[id].goal, all}; }
  if (type === 'i' && state.items[id]) return {items:[state.items[id]].filter(i => !isFinished(i)), goal:state.items[id].goal, all:[state.items[id]]};
  if (type === 's') { const all = Object.values(state.items).filter(i => shelfOf(i) === id); return {items:all, goal:null, all}; }
  return null;
}
function viewPlan(){
  if (!state.settings.plans) state.settings.plans = defaultPlans();
  state.settings.paceOverrides ||= {};
  const shelfOpts = ['reading','want'].filter(k => Object.values(state.items).some(i => shelfOf(i) === k)).map(k => ({k:'s:' + k, l:`Shelf · ${SHELVES[k].label}`}));
  const opts = [...shelfOpts, ...Object.values(state.folders).filter(f => subtreeItems(f.id).some(i => !isFinished(i))).map(f => ({k:'f:'+f.id, l:'Folder · ' + pathName(f.id)})), ...Object.values(state.items).filter(i => !isFinished(i) && !isDnf(i)).map(i => ({k:'i:'+i.id, l:i.title}))];
  if (!S.planSel || !opts.some(o => o.k === S.planSel)) S.planSel = (opts.find(o => o.k.startsWith('f:') && state.folders[o.k.slice(2)].goal) || opts[0])?.k || null;
  const tg = planTarget();
  if (!tg) return `<div class="block-head"><h2>Plan simulator</h2></div><div class="empty">Add something unfinished to your library to plan it.</div>`;
  const groups = {}; tg.items.forEach(it => { const k = unitKey(it); (groups[k] ||= {u:U(it), rem:0}).rem += total(it) - done(it); });
  return `<div class="block-head"><h2>Plan simulator</h2><span class="hint">See when different schedules would get you there</span></div>
  <div class="card"><div class="field" style="margin-top:0"><label for="plan-sel">What do you want to finish?</label><select id="plan-sel">${opts.map(o => `<option value="${esc(o.k)}" ${o.k===S.planSel?'selected':''}>${esc(o.l)}</option>`).join('')}</select></div>
    <div class="sub" style="margin-top:8px">${plural(tg.items.length,'unfinished item','unfinished items')}${tg.goal ? ` · goal ${fmtDateY(tg.goal)}` : ''}</div>
    <div class="eyebrow" style="margin-top:14px">How fast you go</div>
    <div class="paces">${Object.entries(groups).map(([k,g]) => { const learned = paceOf(Object.values(state.items).filter(i => unitKey(i) === k)); const ov = state.settings.paceOverrides[k]; const val = ov ?? (learned ? round1(learned) : g.u.pace);
      return `<label>${g.u.time ? 'Listening, minutes per hour' : `${g.u.many[0].toUpperCase() + g.u.many.slice(1)} per hour`}<span class="inrow"><input type="number" step="0.1" min="0.1" data-pace="${esc(k)}" value="${val}"><small>${ov != null ? 'your number' : learned ? 'learned from your timer' : 'estimate, edit it'}</small></span><small>${esc(fmtAmt(g.rem, g.u))} left</small></label>`; }).join('')}</div>
    <div class="sub" style="margin-top:10px" id="plan-hours"></div>
  </div>
  <div class="plans">${state.settings.plans.map((p, pi) => `<div class="plan" style="--c:${PLAN_COLORS[pi]}"><input class="pname" data-pname="${pi}" value="${esc(p.name)}" aria-label="Plan name">
    <div class="days7">${DOW3.map((d, di) => `<label>${di === 6 ? 'Sat nt' : d}<input type="number" min="0" step="5" inputmode="numeric" data-plan="${pi}" data-day="${di}" value="${p.m[di]}" aria-label="${DOW[di]} minutes"></label>`).join('')}</div>
    <div class="presets">${PLAN_PRESETS.map(([l], qi) => `<button type="button" data-a="plan-preset" data-p="${pi}" data-q="${qi}">${l}</button>`).join('')}</div>
    <div class="plan-out" id="plan-out-${pi}"></div></div>`).join('')}</div>
  <div class="card" style="margin-top:18px"><h3>How each plan plays out</h3><div class="sub">Hours of work left over time, in minutes per day of the week.</div><div class="chart" id="plan-chart"></div>
    <div class="legend" id="plan-legend"></div></div>
  ${futureCard()}`;
}
function recalcPlans(){
  const tg = planTarget(); if (!tg || !$('#plan-hours')) return;
  let hrs = 0;
  for (const it of tg.items) { const inp = $$('[data-pace]').find(x => x.dataset.pace === unitKey(it)); const pace = Math.max(0.01, Number(inp?.value) || U(it).pace); hrs += (total(it) - done(it)) / pace; }
  $('#plan-hours').innerHTML = `That's about <b>${fmtHours(hrs*60)}</b> of work left.`;
  const t = todayK(); const plans = state.settings.plans;
  const sims = plans.map(p => { const week = p.m.reduce((a,b) => a + (Number(b)||0), 0); if (!week) return {p, week, finish:null, pts:[]};
    let left = hrs * 60, k = t, n = 0; const pts = [[k, left/60]];
    while (n < 3650) { left -= Number(p.m[parseD(k).getDay()]) || 0; n++; if (left <= 0) break; k = addDays(k,1); if (n % 2 === 0) pts.push([k, left/60]); }
    pts.push([k, Math.max(0,left)/60]); return {p, week, finish: left <= 0 ? k : null, pts}; });
  const g = goalCalc(tg.all, tg.goal);
  sims.forEach((sm, i) => { const el = $('#plan-out-' + i); if (!el) return;
    el.innerHTML = !sm.week ? '<span class="muted">Add some minutes to see a finish date.</span>' : sm.finish ? `<b>${fmtDateY(sm.finish)}</b><span>${fmtHours(sm.week)} a week · ${plural(diffDays(t, sm.finish),'day','days')} from now</span>${tg.goal ? (sm.finish <= tg.goal ? `<span class="pill good">${plural(diffDays(sm.finish, tg.goal),'day','days')} before your goal</span>` : `<span class="pill bad">${plural(diffDays(tg.goal, sm.finish),'day','days')} after your goal</span>`) : ''}` : `<span class="muted">More than 10 years at ${fmtHours(sm.week)} a week.</span>`; });
  const el = $('#plan-chart');
  const endK = [...sims.filter(x => x.finish).map(x => x.finish), tg.goal, g.projected].filter(k => k && k > t).sort().pop() || addDays(t, 30);
  const span = Math.max(7, diffDays(t, endK)); const maxH = Math.max(1, hrs);
  const W = 640, H = 220, L = 40, R = 16, T = 14, B = 26;
  const x = k => L + clamp(diffDays(t, k), 0, span) / span * (W - L - R), y = v => T + (H - T - B) * (1 - v / maxH);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:340px" role="img" aria-label="Plans compared">`;
  [0, .5, 1].forEach(f => { s += `<line x1="${L}" x2="${W-R}" y1="${y(maxH*f)}" y2="${y(maxH*f)}" stroke="var(--line)"/><text x="${L-7}" y="${y(maxH*f)+4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${Math.round(maxH*f)}h</text>`; });
  for (let i = 0; i <= 4; i++) { const k = addDays(t, Math.round(span*i/4)); s += `<text x="${x(k)}" y="${H-6}" text-anchor="${i===0?'start':i===4?'end':'middle'}" font-size="11" fill="var(--ink-3)">${fmtDateY(k)}</text>`; }
  if (tg.goal && tg.goal > t) s += `<line x1="${x(tg.goal)}" x2="${x(tg.goal)}" y1="${T}" y2="${H-B}" stroke="var(--gold)" stroke-width="2" stroke-dasharray="4 3"/><text x="${x(tg.goal)-4}" y="${T+8}" text-anchor="end" font-size="10.5" fill="var(--gold)">Goal</text>`;
  if (g.projected && g.projected > t) s += `<path d="M${x(t)} ${y(maxH)}L${x(g.projected)} ${y(0)}" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="2 3" fill="none"/>`;
  sims.forEach((sm, i) => { if (!sm.pts.length) return; const pts = sm.pts.filter(p => p[0] <= endK).map(([k,v]) => [x(k), y(v)]); if (pts.length > 1) s += `<path d="${line(pts)}" stroke="${PLAN_COLORS[i]}" stroke-width="2" fill="none"/>`; if (sm.finish && sm.finish <= endK) s += `<circle cx="${x(sm.finish)}" cy="${y(0)}" r="4.5" fill="${PLAN_COLORS[i]}" stroke="var(--surface)" stroke-width="2" ${tipAttr(`<b>${esc(sm.p.name)}</b><br>Done ${fmtDateY(sm.finish)}`)}/>`; });
  el.innerHTML = s + '</svg>';
  $('#plan-legend').innerHTML = sims.map((sm,i) => `<span><i style="--c:${PLAN_COLORS[i]}"></i>${esc(sm.p.name)}</span>`).join('') + (g.projected ? `<span><i style="--c:var(--ink-3)"></i>Your actual pace, ${fmtDateY(g.projected)}</span>` : '') + (tg.goal ? `<span><i style="--c:var(--gold)"></i>Goal</span>` : '');
}
