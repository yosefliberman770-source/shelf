/* Shelfmark stats: Overview, Books (year in books), Habits, Progress */
function equationHTML(g){
  if (g.weather === 'done') return `<div class="eq"><div class="eq-head"><span class="eyebrow">The equation</span>${weatherPill('done')}</div><div class="sub">Everything here is finished.</div></div>`;
  const perDay = state.settings.skipShabbos ? 'per learning day' : 'per day';
  const buf = g.buffer;
  const shift = d => g.projected && d && d !== g.projected ? ` (${diffDays(g.projected, d) > 0 ? '+' : '−'}${Math.abs(diffDays(g.projected, d))}d)` : '';
  return `<div class="eq">
    <div class="eq-head"><span class="eyebrow">The equation${g.goal ? ` · goal ${fmtDateY(g.goal)}` : ''}</span>${weatherPill(g.weather)}</div>
    <div class="eq-grid">
      <div><b>${round1(g.pct)}%</b><span>complete</span></div>
      <div><b>${esc(remTxt(g))}</b><span>remaining</span></div>
      ${g.goal ? `<div><b>${Math.max(0, g.calDaysLeft)}</b><span>days left${state.settings.skipShabbos && g.daysLeft !== g.calDaysLeft ? ` (${g.daysLeft} learning)` : ''}</span></div>` : ''}
      <div><b>${esc(rateTxt(g.current, g))}</b><span>your pace, last 4 weeks</span></div>
      ${g.goal ? `<div><b>${esc(rateTxt(g.required, g))}</b><span>needed ${perDay}</span></div>
      <div><b class="${buf == null ? '' : buf >= 0 ? 'pos' : 'neg'}">${buf == null ? '—' : (buf >= 0 ? '+' : '−') + esc(rateTxt(Math.abs(buf), g))}</b><span>buffer</span></div>` : ''}
      <div><b>${g.projected ? fmtDateY(g.projected) : '—'}</b><span>projected finish</span></div>
      ${g.early && g.late && g.early !== g.late ? `<div><b>${fmtDate(g.early)} – ${fmtDate(g.late)}</b><span>likely range</span></div>` : ''}
    </div>
    ${g.goal && g.projected && g.goal >= todayK() ? `<div class="sub">${g.projected <= g.goal ? `At this pace you finish <b>${plural(diffDays(g.projected, g.goal),'day','days')} early</b>.` : `At this pace you finish <b>${plural(diffDays(g.goal, g.projected),'day','days')} late</b>. To catch up, do ${esc(rateTxt(g.required, g))}.`}</div>` : ''}
    ${g.whatIfs.length ? `<div class="whatif"><span class="eyebrow">What changes the equation</span>${g.whatIfs.map(([l,d]) => `<div><span>${esc(l)}</span><span>${d ? fmtDateY(d) + shift(d) : 'never'}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

const HEAT_MIX = [0, 30, 55, 78, 100];
const heatColor = l => l === 0 ? 'var(--surface-2)' : `color-mix(in oklab, var(--accent) ${HEAT_MIX[l]}%, var(--surface-2))`;
function rangeFrom(){ const t = todayK(); if (S.range !== 'all') return addDays(t, -(S.range - 1)); return state.sessions[0]?.d || t; }
const rangeLabel = () => S.range === 'all' ? 'All time' : S.range === 365 ? 'The last year' : `The last ${S.range} days`;
const tile = (b, l, extra = '') => `<div class="tile"${extra}><b>${b}</b><span>${l}</span></div>`;
const card = (title, sub, body, extra = '') => `<div class="card"${extra}><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}${body}</div>`;
const RANGES = [[30,'30d'],[90,'90d'],[365,'Year'],['all','All time']];

function viewStats(){
  const tabs = [['overview','Overview'],['books','Books'],['habits','Habits'],['progress','Progress']];
  const head = `<div class="block-head"><h2>Stats</h2><div class="seg">${tabs.map(([k,l]) => `<button aria-pressed="${S.statTab===k}" data-a="stat-tab" data-k="${k}">${l}</button>`).join('')}</div></div>`;
  if (!Object.keys(state.items).length) return head + `<div class="empty">Add something to your library and log a few sessions. Your stats build up here.</div>`;
  const rangeSeg = `<div class="filters"><div class="seg">${RANGES.map(([n,l]) => `<button aria-pressed="${S.range===n}" data-a="range" data-n="${n}">${l}</button>`).join('')}</div></div>`;
  if (S.statTab === 'books') return head + statsBooks();
  if (S.statTab === 'habits') return head + rangeSeg + statsHabits();
  if (S.statTab === 'progress') return head + statsProgress();
  return head + rangeSeg + statsOverview();
}
function drawStats(){
  if (S.statTab === 'overview') { drawHeat(); drawWeekly(); }
  if (S.statTab === 'progress') drawProgress();
}

/* ---- Overview ---- */
function statsOverview(){
  const t = todayK(); const from = rangeFrom();
  const st = streaks(); const days = diffDays(from, t) + 1;
  let active = 0; for (let k = from; k <= t; k = addDays(k,1)) if (activeDay(k)) active++;
  const inRange = state.sessions.filter(s => s.d >= from && s.d <= t && state.items[s.i]);
  const mins = inRange.reduce((m, s) => m + sessionMinutes(s), 0);
  const pages = Object.values(pagesByDay(from, t)).reduce((a,b) => a+b, 0);
  const fins = finishes().filter(f => f.d >= from && f.d <= t);
  const sums = {}; inRange.forEach(s => sums[s.i] = (sums[s.i]||0) + s.a);
  const rows = Object.entries(sums).filter(([id,v]) => v > 0).map(([id,v]) => ({it:state.items[id], v, p:v / total(state.items[id]) * 100})).sort((a,b) => b.p - a.p);
  return `
  <div class="tiles">
    ${tile(st.cur, 'current streak')}${tile(st.best, 'longest streak')}
    ${tile(`${active}<span class="of"> / ${days}</span>`, 'days active')}
    ${tile(fmtHours(mins), 'time logged')}
    ${tile(fmtNum(pages), 'pages read')}
    ${tile(inRange.length, 'sessions')}
    ${tile(active ? fmtMin(mins / active) : '—', 'per active day')}
    ${tile(fins.length, 'finished')}
  </div>
  <div class="card"><h3>Consistency</h3><div class="sub">Each square is a day. Darker means more things read or studied that day.</div>
    <div class="chart" id="heat"></div>
    <div class="legend" style="justify-content:space-between"><span>Less ${[0,1,2,3,4].map(l => `<i style="--c:${heatColor(l)}"></i>`).join('')} More</span>
      <label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="skip-shabbos" ${state.settings.skipShabbos ? 'checked' : ''}> Shabbos doesn't count against streaks or pace</label></div></div>
  ${monthlyCard()}
  <div class="card"><h3>Days active per week</h3><div class="sub">Last 12 weeks by category. The last point is this week so far.</div>
    <div class="chart" id="weekly"></div>
    <div class="legend">${Object.values(GROUPS).map(g => `<span><i style="--c:${g.c}"></i>${g.label}</span>`).join('')}</div></div>
  ${categoryCard(inRange)}
  ${recordsCard()}
  <div class="card totals"><h3>What you covered</h3><div class="sub" style="margin-bottom:8px">${rangeLabel()}. Bars show how much of each item that was.</div>
    ${rows.length ? rows.map(r => `<div class="t-row" style="--c:${colorOf(r.it)}"><div class="row-title" style="font-size:14px">${titleHTML(r.it.title)}</div><div class="t-amt">+${esc(fmtAmt(r.v, U(r.it)))} · ${Math.round(r.p)}%</div><div class="bar"><i style="width:${Math.min(100,r.p)}%"></i></div></div>`).join('') : '<div class="muted">No progress logged in this period.</div>'}</div>`;
}
const MONTH_METRICS = {time:'Time', pages:'Pages', sessions:'Sessions', days:'Active days', finished:'Finished'};
function monthlyCard(){
  const t = todayK(); const [y, m] = t.split('-').map(Number);
  const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); months.push(dkey(d).slice(0,7)); }
  const fins = finishes();
  const data = months.map(mk => {
    const a = `${mk}-01`, z = `${mk}-31`;
    const ss = state.sessions.filter(s => s.d >= a && s.d <= z && state.items[s.i]);
    let v;
    if (S.monthMetric === 'time') v = ss.reduce((q,s) => q + sessionMinutes(s), 0);
    else if (S.monthMetric === 'pages') v = Object.values(pagesByDay(a, z)).reduce((q,x) => q + x, 0);
    else if (S.monthMetric === 'sessions') v = ss.length;
    else if (S.monthMetric === 'days') v = new Set(ss.filter(s => s.a > 0).map(s => s.d)).size;
    else v = fins.filter(f => f.d.startsWith(mk)).length;
    const [yy, mo] = mk.split('-').map(Number);
    return {l:MON[mo-1], v, mk, cur: mk === t.slice(0,7), label:`${MONTH[mo-1]} ${yy}`};
  });
  const fmt = S.monthMetric === 'time' ? fmtHours : fmtNum;
  const vals = data.filter(d => !d.cur).map(d => d.v); const avg = mean(vals.filter(v => v > 0)) || 0;
  const best = data.reduce((a,b) => b.v > a.v ? b : a, data[0]);
  const bars = data.map(d => ({l:d.l, v:d.v, hi: d === best && d.v > 0, tip:`<b>${d.label}</b>${d.cur ? ' (so far)' : ''}<br>${esc(fmt(d.v))} ${S.monthMetric === 'time' ? '' : esc(MONTH_METRICS[S.monthMetric].toLowerCase())}`}));
  return `<div class="card"><div class="block-head" style="margin-bottom:0"><div><h3>Month by month</h3><div class="sub">The last 12 months. Gold is your best month.${avg ? ` Average ${esc(fmt(avg))} a month.` : ''}</div></div>
    <select class="inline" id="month-metric" aria-label="Measure">${Object.entries(MONTH_METRICS).map(([k,l]) => `<option value="${k}" ${S.monthMetric===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="chart">${barsSVG(bars, {fmt, label:'Month by month', every:1})}</div></div>`;
}
function categoryCard(inRange){
  const by = {}; inRange.forEach(s => { const it = state.items[s.i]; const g = groupOf(it); (by[g] ||= {m:0, n:0, items:new Set()}); by[g].m += sessionMinutes(s); by[g].n++; by[g].items.add(it.id); });
  const gs = Object.keys(GROUPS).filter(g => by[g]);
  if (!gs.length) return '';
  const hasTime = gs.some(g => by[g].m > 0);
  const totalV = gs.reduce((s,g) => s + (hasTime ? by[g].m : by[g].n), 0) || 1;
  return card('Where your time goes', `${rangeLabel()}, by ${hasTime ? 'time logged' : 'sessions'}.`,
    `<div class="stackbar">${gs.map(g => { const v = hasTime ? by[g].m : by[g].n; return `<i style="--c:${GROUPS[g].c};flex:${v}" ${tipAttr(`<b>${GROUPS[g].label}</b><br>${hasTime ? fmtHours(v) : plural(v,'session','sessions')} · ${Math.round(v/totalV*100)}%`)}></i>`; }).join('')}</div>
    <div class="legend">${gs.map(g => { const v = hasTime ? by[g].m : by[g].n; return `<span><i style="--c:${GROUPS[g].c}"></i>${GROUPS[g].label} · ${Math.round(v/totalV*100)}% <span class="muted">(${hasTime ? fmtHours(v) : v}, ${plural(by[g].items.size,'item','items')})</span></span>`; }).join('')}</div>`);
}
function recordsCard(){
  if (state.sessions.length < 3 && !finishes().length) return '';
  const recs = [];
  const perDayUnit = {}, unitFor = {};
  for (const d in IX.byDay) for (const id in IX.byDay[d]) { const it = state.items[id]; if (!it || IX.byDay[d][id] <= 0) continue; const u = U(it); if (u.pct) continue; const key = u.time ? 'listening' : u.many; unitFor[key] = u; const e = (perDayUnit[key] ||= {}); e[d] = (e[d]||0) + IX.byDay[d][id]; }
  for (const key in perDayUnit) { const [d, v] = Object.entries(perDayUnit[key]).sort((a,b) => b[1]-a[1])[0]; recs.push([key === 'listening' ? fmtMin(v) + ' listening' : `${fmtNum(v)} ${v === 1 ? unitFor[key].one : key}`, `most in one day · ${fmtDateY(d)}`]); }
  const longest = state.sessions.filter(s => s.m && state.items[s.i]).sort((a,b) => b.m - a.m)[0];
  if (longest) recs.push([fmtMin(longest.m), `longest session · ${state.items[longest.i].title}`]);
  const dayMins = {}; state.sessions.forEach(s => { const m = sessionMinutes(s); if (m) dayMins[s.d] = (dayMins[s.d]||0) + m; });
  const bd = Object.entries(dayMins).sort((a,b) => b[1]-a[1])[0]; if (bd) recs.push([fmtMin(bd[1]), `most time in one day · ${fmtDateY(bd[0])}`]);
  recs.push([plural(streaks().best, 'day', 'days'), 'longest streak']);
  const months = {}; Object.keys(IX.byDay).filter(activeDay).forEach(d => months[d.slice(0,7)] = (months[d.slice(0,7)]||0) + 1);
  const bm = Object.entries(months).sort((a,b) => b[1]-a[1])[0];
  if (bm) { const [y,m] = bm[0].split('-'); recs.push([plural(bm[1],'active day','active days'), `best month · ${MON[+m-1]} ${y}`]); }
  const fm = countBy(finishes().filter(f => f.d), f => f.d.slice(0,7))[0];
  if (fm && fm[1] > 1) { const [y,m] = fm[0].split('-'); recs.push([plural(fm[1],'finish','finishes'), `most in a month · ${MON[+m-1]} ${y}`]); }
  const fy = countBy(finishes().filter(f => f.d), f => f.d.slice(0,4))[0];
  if (fy && fy[1] > 1) recs.push([plural(fy[1],'finish','finishes'), `best year · ${fy[0]}`]);
  return `<div class="card"><h3>Personal records</h3><div class="records">${recs.map(([b,s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div></div>`;
}

/* ---- Books: Goodreads-style year in books ---- */
function statYears(){
  const ys = new Set([todayK().slice(0,4)]);
  finishes().forEach(f => f.d && ys.add(f.d.slice(0,4)));
  state.sessions.forEach(s => ys.add(s.d.slice(0,4)));
  return [...ys].sort().reverse();
}
const starLabel = r => r % 1 ? `${Math.floor(r)}½★` : `${r}★`;
function statsBooks(){
  const years = statYears();
  if (!S.statYear || (S.statYear !== 'all' && !years.includes(S.statYear))) S.statYear = years[0];
  const y = S.statYear, all = y === 'all';
  const b = bookYear(y);
  const sel = `<div class="filters"><select class="inline" id="stat-year" aria-label="Year">${years.map(v => `<option value="${v}" ${v===y?'selected':''}>${v}</option>`).join('')}<option value="all" ${all?'selected':''}>All years</option></select></div>`;
  const dnf = Object.values(state.items).filter(i => isDnf(i) && inYear(i.dnfAt || '', y));
  const intro = all ? 'Everything you’ve finished, across all years.' : `Your ${y} in books, seforim and everything else you finished.`;
  if (!b.n) return sel + (all ? '' : challengeCard(y)) + `<div class="empty">Nothing finished ${all ? 'yet' : 'in ' + y}. When you finish something (or import your Goodreads history), this fills with your year in books.</div>` + shelvesCard();
  const byP = (f) => f ? `${esc(f.it.title)} · ${fmtNum(pagesOf(f.it))} pages` : '—';
  /* per-period counts */
  let periods;
  if (!all) periods = MON.map((l, i) => { const mk = `${y}-${pad(i+1)}`; const fs = b.all.filter(f => f.d.startsWith(mk)); return {l, fs, label:`${MONTH[i]} ${y}`}; });
  else { const ys = [...new Set(b.all.filter(f => f.d).map(f => f.d.slice(0,4)))].sort(); const a = Number(ys[0] || todayK().slice(0,4)), z = Number(todayK().slice(0,4)); periods = []; for (let q = a; q <= z; q++) { const fs = b.all.filter(f => f.d.startsWith(String(q))); periods.push({l: z - a > 8 ? `'${String(q).slice(2)}` : String(q), fs, label:String(q)}); } }
  const cntBars = periods.map(p => ({l:p.l, v:p.fs.length, tip:`<b>${p.label}</b><br>${plural(p.fs.length,'finished','finished')}${p.fs.length ? '<br>' + p.fs.slice(0,6).map(f => esc(f.it.title)).join('<br>') + (p.fs.length > 6 ? '<br>…' : '') : ''}`}));
  const pgBars = periods.map(p => { const v = p.fs.reduce((s,f) => s + pagesOf(f.it), 0); return {l:p.l, v, tip:`<b>${p.label}</b><br>${fmtNum(v)} pages`}; });
  const bestP = cntBars.reduce((a,c) => c.v > a.v ? c : a, cntBars[0]); if (bestP.v) bestP.hi = true;
  const undated = b.all.filter(f => !f.d).length;
  /* distributions */
  const ratings = [5,4.5,4,3.5,3,2.5,2,1.5,1,.5].filter(r => Number.isInteger(r) || b.rated.some(f => f.r === r)).map(r => ({l:starLabel(r), v:b.rated.filter(f => f.r === r).length}));
  const topR = ratings.reduce((a,c) => c.v > a.v ? c : a, ratings[0]); if (topR && topR.v) topR.best = true;
  const LB = [['Under 200',0,200],['200–299',200,300],['300–399',300,400],['400–499',400,500],['500+',500,1e9]];
  const lens = LB.map(([l,a,z]) => ({l, v:b.all.filter(f => pagesOf(f.it) > 1 && pagesOf(f.it) >= a && pagesOf(f.it) < z).length}));
  const kinds = countBy(b.all, f => kindLabel(f.it)).map(([l,v]) => ({l, v}));
  const fmts = countBy(b.all.filter(f => isBookish(f.it)), f => FORMATS[f.it.format] || (f.it.kind === 'audiobook' ? 'Audio' : null)).map(([l,v]) => ({l, v}));
  const authors = countBy(b.all, f => f.it.author ? f.it.author.split(/,| & | and /)[0].trim() : null);
  const authRows = authors.slice(0, 8).map(([l,v]) => { const r = b.rated.filter(f => (f.it.author||'').startsWith(l)); return {l, v, txt: `${v}${r.length ? ' · ' + round1(mean(r.map(f => f.r))) + '★' : ''}`}; });
  const tags = countBy(b.all.flatMap(f => (f.it.tags||[]).map(t => ({t}))), x => x.t).slice(0, 10).map(([l,v]) => ({l:'#' + l, v}));
  const decades = countBy(b.all.filter(f => f.it.year), f => Math.floor(f.it.year / 10) * 10).sort((a,c) => c[0] - a[0]).map(([d,v]) => ({l:`${d}s`, v}));
  const pubYears = b.all.filter(f => f.it.year).map(f => f.it.year);
  const oldest = b.all.filter(f => f.it.year).sort((a,c) => a.it.year - c.it.year)[0];
  const distinctAuthors = authors.length;
  const hi = [];
  if (b.shortest && b.all.filter(f => pagesOf(f.it) > 1).length > 1) hi.push(['Shortest', byP(b.shortest), b.shortest.it]);
  if (b.longest) hi.push(['Longest', byP(b.longest), b.longest.it]);
  if (b.best) hi.push(['Highest rated', `${esc(b.best.it.title)} · ${b.best.r}★`, b.best.it]);
  if (b.fastest) hi.push(['Fastest finish', `${esc(b.fastest.f.it.title)} · ${plural(b.fastest.days,'day','days')}`, b.fastest.f.it]);
  if (b.slowest && b.slowest !== b.fastest) hi.push(['Longest journey', `${esc(b.slowest.f.it.title)} · ${plural(b.slowest.days,'day','days')}`, b.slowest.f.it]);
  if (oldest) hi.push(['Oldest', `${esc(oldest.it.title)} · ${oldest.it.year}`, oldest.it]);
  const dated = b.all.filter(f => f.d);
  if (dated.length > 1) { hi.push(['First finished', `${esc(dated[0].it.title)} · ${fmtDateY(dated[0].d)}`, dated[0].it]); hi.push(['Most recent', `${esc(dated[dated.length-1].it.title)} · ${fmtDateY(dated[dated.length-1].d)}`, dated[dated.length-1].it]); }
  const pace = !all && String(y) === todayK().slice(0,4) ? b.n / Math.max(1, diffDays(`${y}-01-01`, todayK()) + 1) * 7 : null;
  return sel + `
  ${all ? '' : challengeCard(y)}
  <div class="hero"><div class="eyebrow">${all ? 'All time' : y + ' in books'}</div><div class="hero-num"><b>${b.n}</b><span>${b.n === 1 ? 'thing' : 'things'} finished${b.books.length !== b.n ? ` · ${plural(b.books.length,'book','books')}` : ''}</span></div><div class="sub">${intro}${pace ? ` That’s about ${round1(pace)} a week.` : ''}</div></div>
  <div class="tiles">
    ${tile(fmtNum(b.pages), 'pages in finished books')}
    ${tile(b.avgPages ? fmtNum(b.avgPages) : '—', 'average length')}
    ${tile(b.avgRating ? round1(b.avgRating) + '★' : '—', `average rating${b.rated.length ? ` (${b.rated.length} rated)` : ''}`)}
    ${tile(b.medDays ? plural(Math.round(b.medDays),'day','days') : '—', 'typical time to finish')}
    ${tile(b.listenMin ? fmtHours(b.listenMin) : '—', 'audiobooks listened')}
    ${tile(distinctAuthors, 'different authors')}
    ${tile(b.rereads, 're-reads')}
    ${tile(dnf.length, 'didn’t finish')}
  </div>
  ${card(all ? 'Finished per year' : 'Finished per month', `Gold is your best ${all ? 'year' : 'month'}.${undated ? ` ${plural(undated,'finish has','finishes have')} no date and ${undated === 1 ? 'isn’t' : 'aren’t'} shown.` : ''}`, `<div class="chart">${barsSVG(cntBars, {label:'Finished per period', every:1, fmt:v => fmtNum(v)})}</div>`)}
  ${b.pages ? card(all ? 'Pages per year' : 'Pages per month', 'Total pages of the books you finished.', `<div class="chart">${barsSVG(pgBars, {label:'Pages per period', every:1})}</div>`) : ''}
  <div class="dna-grid">
    ${card('Ratings', b.avgRating ? `Average ${round1(b.avgRating)} from ${plural(b.rated.length,'rating','ratings')}.` : 'Rate what you finish to see this.', hbarsHTML(b.rated.length ? ratings : [], {empty:'No ratings yet.'}))}
    ${card('Length', 'Finished books by page count.', hbarsHTML(lens.some(x => x.v) ? lens : [], {empty:'No page counts yet.'}))}
    ${card('What you finished', 'By kind.', hbarsHTML(kinds))}
    ${fmts.length ? card('Format', 'Books and audiobooks.', hbarsHTML(fmts)) : ''}
    ${card('Top authors', authors.length > 8 ? `Top 8 of ${authors.length}.` : '', hbarsHTML(authRows, {empty:'No authors recorded.'}))}
    ${tags.length ? card('Top tags & genres', '', hbarsHTML(tags)) : ''}
    ${decades.length ? card('When they were written', pubYears.length ? `Median publication year ${Math.round(median(pubYears))}.` : '', hbarsHTML(decades)) : ''}
  </div>
  ${hi.length ? card('Highlights', '', `<div class="records">${hi.map(([l, txt, it]) => `<button class="linkish rec" data-a="detail" data-id="${it.id}"><b>${txt}</b><span>${l}</span></button>`).join('')}</div>`) : ''}
  ${card('Your shelf', `${plural(b.n,'finish','finishes')}${all ? '' : ' in ' + y}, in order.`, `<div class="cover-wall">${b.all.map(f => `<button class="linkish" data-a="detail" data-id="${f.it.id}" ${tipAttr(`<b>${esc(f.it.title)}</b>${f.it.author ? '<br>' + esc(f.it.author) : ''}${f.d ? '<br>Finished ' + fmtDateY(f.d) : ''}${f.r ? '<br>' + f.r + '★' : ''}`)}>${coverHTML(f.it, 'cv-m')}${f.r ? starsHTML(f.r, 9) : ''}</button>`).join('')}</div>`)}
  ${shelvesCard()}`;
}
function shelvesCard(){
  const all = Object.values(state.items);
  const rows = Object.entries(SHELVES).map(([k,v]) => ({l:v.label, v:all.filter(i => shelfOf(i) === k).length})).filter(r => r.v);
  const want = all.filter(i => shelfOf(i) === 'want');
  const tbrPages = want.reduce((s,i) => s + pagesOf(i), 0);
  const t = todayK(); const from = addDays(t, -89);
  const p90 = Object.values(pagesByDay(from, t)).reduce((a,b) => a+b, 0) / 90;
  const f365 = finishes().filter(f => f.d >= addDays(t, -364) && isBookish(f.it)).length;
  const wantBooks = want.filter(isBookish).length;
  const lines = [];
  if (tbrPages && p90 > 0) lines.push(`Your want-to-read shelf is <b>${fmtNum(tbrPages)} pages</b>. At your recent pace of ${round1(p90)} pages a day, that’s about <b>${plural(Math.ceil(tbrPages / p90),'day','days')}</b> of reading.`);
  else if (wantBooks && f365) lines.push(`At the ${plural(f365,'book','books')} you finished in the last year, your want-to-read shelf would take about <b>${round1(wantBooks / f365)} years</b>.`);
  return card('Your library', `${plural(all.length,'item','items')} in total.`, `${lines.length ? `<div class="insight">${lines.join(' ')}</div>` : ''}${hbarsHTML(rows)}`);
}

/* ---- Habits ---- */
function statsHabits(){
  const t = todayK(), from = rangeFrom();
  const ss = state.sessions.filter(s => s.d >= from && s.d <= t && state.items[s.i]);
  const timed = ss.filter(s => s.m > 0);
  const grid = Array.from({length:7}, () => Array(24).fill(0));
  ss.filter(s => s.t && (s.a > 0 || s.m)).forEach(s => { const d = new Date(s.t); grid[d.getDay()][d.getHours()]++; });
  /* speed */
  const pageTimed = timed.filter(s => s.a > 0 && state.items[s.i].unit === 'page');
  const pm = pageTimed.reduce((q,s) => q + s.m, 0), pp = pageTimed.reduce((q,s) => q + s.a, 0);
  const speed = pm >= 20 ? pp / pm * 60 : null;
  const perBook = {}; pageTimed.forEach(s => { const e = (perBook[s.i] ||= {m:0, a:0}); e.m += s.m; e.a += s.a; });
  const bookSpeeds = Object.entries(perBook).filter(([,e]) => e.m >= 20).map(([id,e]) => ({l:state.items[id].title, v:e.a / e.m * 60, txt:`${Math.round(e.a / e.m * 60)}/h`, tip:`<b>${esc(state.items[id].title)}</b><br>${fmtNum(e.a)} pages in ${fmtMin(e.m)}`})).sort((a,b) => b.v - a.v).slice(0, 8);
  if (bookSpeeds[0]) bookSpeeds[0].best = true;
  /* weekday averages */
  const wd = [0,1,2,3,4,5,6].map(d => { let n = 0, m = 0; for (let k = from; k <= t; k = addDays(k,1)) if (parseD(k).getDay() === d) { n++; } ss.forEach(s => { if (parseD(s.d).getDay() === d) m += sessionMinutes(s); }); return {l:DOW3[d], v: n ? m / n : 0}; });
  const hasMins = wd.some(x => x.v > 0);
  const topWd = wd.reduce((a,b) => b.v > a.v ? b : a, wd[0]); if (topWd.v) topWd.best = true;
  /* cumulative pages */
  const pbd = pagesByDay(from, t); const cum = []; let run = 0;
  for (let k = from; k <= t; k = addDays(k,1)) { run += pbd[k] || 0; cum.push([k, run]); }
  const step = Math.max(1, Math.ceil(cum.length / 120)); const cumPts = cum.filter((_, i) => i % step === 0 || i === cum.length - 1);
  const avgSess = median(timed.map(s => s.m));
  return `
  <div class="tiles">
    ${tile(speed ? Math.round(speed) : '—', 'pages per hour')}
    ${tile(avgSess ? fmtMin(avgSess) : '—', 'typical session')}
    ${tile(ss.length, 'sessions')}
    ${tile(timed.length ? Math.round(timed.length / ss.length * 100) + '%' : '—', 'sessions timed')}
    ${tile(speed ? fmtMin(300 / speed * 60) : '—', 'for a 300-page book')}
  </div>
  ${dnaCard(ss)}
  ${card('When you read', `${rangeLabel()}. Bigger dots mean more sessions at that hour.`, ss.some(s => s.t) ? `<div class="chart">${punchSVG(grid)}</div>` : '<div class="muted">No sessions yet.</div>')}
  ${hasMins ? card('Average time by weekday', `${rangeLabel()}, averaged over every ${DOW3[0]}, ${DOW3[1]} and so on, including days off.`, hbarsHTML(wd.map(x => ({...x, txt:fmtMin(x.v)})))) : ''}
  ${run ? card('Pages over time', `${fmtNum(run)} pages read in ${rangeLabel().toLowerCase()}, added up day by day.`, `<div class="chart">${lineSVG(cumPts, {label:'Cumulative pages', tipFmt:v => fmtNum(v) + ' pages so far'})}</div>`) : ''}
  ${card('Reading speed by book', 'Pages per hour, from sessions where you used the timer or entered time. Needs 20+ minutes per book.', hbarsHTML(bookSpeeds, {empty:'Use the timer (or enter time spent when logging) to see how fast you read each book.', wide:true}))}
  ${speedTrendCard()}`;
}
function speedTrendCard(){
  const t = todayK(); const [y, m] = t.split('-').map(Number);
  const data = []; for (let i = 11; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); const mk = dkey(d).slice(0,7);
    const ss = state.sessions.filter(s => s.d.startsWith(mk) && s.m > 0 && s.a > 0 && state.items[s.i] && state.items[s.i].unit === 'page');
    const mm = ss.reduce((q,s) => q + s.m, 0), pp = ss.reduce((q,s) => q + s.a, 0);
    data.push({l:MON[d.getMonth()], v: mm >= 20 ? pp / mm * 60 : 0, tip:`<b>${MONTH[d.getMonth()]} ${d.getFullYear()}</b><br>${mm >= 20 ? Math.round(pp / mm * 60) + ' pages per hour' : 'Not enough timed reading'}`}); }
  if (data.filter(d => d.v).length < 2) return '';
  return card('Speed month by month', 'Pages per hour over the last 12 months.', `<div class="chart">${barsSVG(data, {label:'Speed by month', every:1})}</div>`);
}
function dnaCard(ss){
  const timed = ss.filter(s => s.t && s.a > 0);
  if (timed.length < 10) return card('Progress DNA', 'After about 10 logged sessions in this period, this shows when you read best, how long your sessions run, and which habits keep you going.', '');
  const buckets = [['Early morning',4,9],['Late morning',9,12],['Afternoon',12,17],['Evening',17,21],['Night',21,28]];
  const tod = buckets.map(([l,a,b]) => ({l, n: timed.filter(s => { let h = new Date(s.t).getHours(); if (h < 4) h += 24; return h >= a && h < b; }).length}));
  const maxT = Math.max(...tod.map(x => x.n)) || 1;
  const t = todayK(), from = addDays(t, -89);
  const wd = [0,1,2,3,4,5,6].map(d => { let tot = 0, act = 0; for (let k = from; k <= t; k = addDays(k,1)) if (parseD(k).getDay() === d) { tot++; if (activeDay(k)) act++; } return {l:DOW3[d], d, r: tot ? act/tot : 0}; });
  const maxW = Math.max(...wd.map(x => x.r)) || 1;
  const withMin = ss.filter(s => s.m > 0);
  const lens = [['Under 15 min',0,15],['15–30 min',15,30],['30–60 min',30,60],['Over an hour',60,1e9]].map(([l,a,b]) => ({l, n: withMin.filter(s => s.m >= a && s.m < b).length}));
  const maxL = Math.max(...lens.map(x => x.n)) || 1;
  const med = median(withMin.map(s => s.m));
  const dayMin = {}; state.sessions.filter(s => s.m > 0).forEach(s => dayMin[s.d] = (dayMin[s.d]||0) + s.m);
  const cont = {short:[0,0], long:[0,0]};
  for (const d in dayMin) { let n = addDays(d,1); while (!learnDay(n)) n = addDays(n,1); if (n > t) continue; const k = dayMin[d] <= 30 ? 'short' : 'long'; cont[k][1]++; if (activeDay(n)) cont[k][0]++; }
  const topT = tod.reduce((a,b) => b.n > a.n ? b : a); const topW = [...wd].sort((a,b) => b.r - a.r).slice(0,2);
  const lines = [`You log most often in the <b>${topT.l.toLowerCase()}</b>, and you're most reliable on <b>${topW.map(x => DOW[x.d]).join(' and ')}</b>.`];
  if (med) lines.push(`A typical timed session runs <b>${fmtMin(med)}</b>.`);
  if (cont.short[1] >= 5 && cont.long[1] >= 5) { const s = cont.short[0]/cont.short[1], l = cont.long[0]/cont.long[1]; lines.push(`After a short day (30 min or less) you come back the next day <b>${Math.round(s*100)}%</b> of the time. After a longer day, <b>${Math.round(l*100)}%</b>. ${Math.abs(s-l) < .08 ? "Session length doesn't change your consistency much." : s > l ? 'Short, steady sessions keep you more consistent.' : 'Longer sessions build more momentum for you.'}`); }
  const hb = (arr, max, val, fmt, key) => arr.map(x => `<div class="hbar ${x === key ? 'best' : ''}"><span>${x.l}</span><span class="track"><i style="width:${val(x)/max*100}%"></i></span><span class="v">${fmt(x)}</span></div>`).join('');
  return `<div class="card"><h3>Progress DNA</h3><div class="sub">Patterns from ${plural(timed.length,'session','sessions')}. The gold bar is your strongest.</div>
    <div class="insight">${lines.join(' ')}</div>
    <div class="dna-grid" style="margin-top:14px">
      <div><div class="eyebrow">Time of day</div><div class="hbars">${hb(tod, maxT, x => x.n, x => Math.round(x.n/timed.length*100) + '%', topT)}</div></div>
      <div><div class="eyebrow">Days you read (last 90)</div><div class="hbars">${hb(wd, maxW, x => x.r, x => Math.round(x.r*100) + '%', topW[0])}</div></div>
      ${withMin.length ? `<div><div class="eyebrow">Session length</div><div class="hbars">${hb(lens, maxL, x => x.n, x => x.n, null)}</div></div>` : ''}
    </div></div>`;
}

/* ---- Progress ---- */
function statsProgress(){
  const progOpts = [...Object.values(state.folders).filter(f => subtreeItems(f.id).length).map(f => ({k:'f:'+f.id, l:pathName(f.id)})), ...Object.values(state.items).filter(i => isStarted(i) && sessOf(i.id).length).map(i => ({k:'i:'+i.id, l:i.title}))];
  if (!S.progSel || !progOpts.some(o => o.k === S.progSel)) S.progSel = (progOpts.find(o => o.k.startsWith('f:') && state.folders[o.k.slice(2)].goal) || progOpts[0])?.k || null;
  const goals = allGoals();
  return `
  <div class="card"><div class="block-head" style="margin-bottom:0"><div><h3>Progress over time</h3><div class="sub">Percent complete against an even pace to the goal date.</div></div>
    ${progOpts.length ? `<select class="inline" id="prog-sel" aria-label="Folder or item">${progOpts.map(o => `<option value="${esc(o.k)}" ${o.k===S.progSel?'selected':''}>${esc(o.l)}</option>`).join('')}</select>` : ''}</div>
    <div class="chart" id="prog"></div>
    <div class="legend"><span><i style="--c:var(--accent)"></i>Your progress</span><span><i style="--c:var(--gold)"></i>Even pace to goal</span></div></div>
  ${goals.length ? `<section class="block"><div class="block-head"><h2>Goals</h2><span class="hint">Tap one for details</span></div><div class="list">${goals.map(goalRow).join('')}</div></section>` : ''}
  ${deadZoneCard()}
  ${futureCard()}
  ${lifeCard()}`;
}
function deadZoneCard(){
  const dz = Object.values(state.items).filter(i => (isPaused(i) || isStalled(i)) && !isFinished(i));
  if (!dz.length) return '';
  const med = median(dz.map(pctOf));
  const byKind = {}; dz.forEach(i => byKind[i.kind] = (byKind[i.kind]||0) + 1);
  const kindTxt = Object.entries(byKind).map(([k,n]) => plural(n, KINDS[k].label.toLowerCase(), KINDS[k].plural.toLowerCase())).join(', ');
  return `<div class="card"><h3>Set aside, unfinished &amp; gone quiet</h3><div class="sub">Things you started and stopped. Nothing is deleted. Log a session to bring any of them back.</div>
    <div class="insight">You have ${kindTxt} on hold, and you usually stop around <b>${Math.round(med)}%</b>.${med < 35 ? ' Things tend to stall early for you, so getting through the first third is what decides it.' : ''}</div>
    <div class="list" style="margin-top:10px">${dz.sort((a,b) => pctOf(b) - pctOf(a)).map(i => itemRow(i, {actionsHTML:`<button class="btn sm" data-a="log" data-id="${i.id}">Resume</button>`})).join('')}</div></div>`;
}
function lifeCard(){
  const years = {};
  const Y = y => (years[y] ||= {fin:{}, mins:0, units:{}, active:new Set()});
  for (const s of state.sessions) { const it = state.items[s.i]; if (!it) continue; const y = Y(s.d.slice(0,4)); y.mins += sessionMinutes(s); if (s.a > 0) { const u = U(it); if (!u.time && !u.pct) y.units[u.many] = (y.units[u.many]||0) + s.a; y.active.add(s.d); } }
  const fins = finishes().filter(f => f.d).reverse();
  fins.forEach(f => { const y = Y(f.d.slice(0,4)); y.fin[f.it.kind] = (y.fin[f.it.kind]||0) + 1; });
  const ys = Object.keys(years).sort().reverse();
  if (!ys.length) return '';
  const siyumim = fins.slice(0, 15).map(f => { const i = f.it; const ss = sessOf(i.id); const first = f.s || i.created; const m = f.re ? 0 : ss.reduce((a,s) => a + sessionMinutes(s), 0);
    return `<div class="siyum"><span><b>${titleHTML(i.title)}</b> <span class="muted">· ${kindLabel(i)}${f.re ? ' · earlier read' : ''}</span></span><span class="d">${fmtDateY(f.d)}</span><span class="m">${first && first <= f.d ? plural(diffDays(first, f.d)+1,'day','days') + ' from ' + fmtDateY(first) : ''}${!f.re && ss.length ? ' · ' + plural(ss.length,'session','sessions') : ''}${m ? ' · ' + fmtHours(m) : ''}${f.r ? ' · ' + f.r + '★' : ''}</span></div>`; }).join('');
  return `<div class="card"><h3>Life so far</h3><div class="sub">A year-by-year record of what you've read and learned.</div>
    <div class="timeline">${ys.map(y => { const d = years[y]; const fin = Object.entries(d.fin);
      return `<div class="yr"><h4>${y}</h4><div class="yr-stats">${fin.map(([k,n]) => `<span><b>${n}</b> ${esc(n === 1 ? KINDS[k].label.toLowerCase() : KINDS[k].plural.toLowerCase())} finished</span>`).join('')}${d.mins ? `<span><b>${fmtHours(d.mins)}</b> logged</span>` : ''}${Object.entries(d.units).sort((a,b) => b[1]-a[1]).slice(0,4).map(([u,n]) => `<span><b>${n.toLocaleString()}</b> ${esc(u)}</span>`).join('')}${d.active.size ? `<span><b>${d.active.size}</b> active days</span>` : ''}</div></div>`; }).join('')}</div>
    ${siyumim ? `<div class="eyebrow" style="margin-top:4px">Siyum &amp; finish log</div><div>${siyumim}</div>` : ''}</div>`;
}
function futureCard(){
  const t = todayK(), from = addDays(t, -89);
  const recent = state.sessions.filter(s => s.d >= from && s.a > 0 && state.items[s.i]);
  if (recent.length < 5) return '';
  const span = Math.max(14, diffDays(recent[0].d, t) + 1);
  const per = {}; let mins = 0;
  recent.forEach(s => { const u = U(state.items[s.i]); mins += sessionMinutes(s); if (!u.time && !u.pct) per[u.many] = (per[u.many]||0) + s.a; });
  const fins = finishes().filter(f => f.d >= from).length;
  const row = d => `<div class="yr"><h4>In ${d === 365 ? 'a year' : d + ' days'}</h4><div class="yr-stats">${Object.entries(per).sort((a,b) => b[1]-a[1]).slice(0,4).map(([u,n]) => `<span><b>${Math.round(n/span*d).toLocaleString()}</b> ${esc(u)}</span>`).join('')}${mins ? `<span><b>${fmtHours(mins/span*d)}</b> logged</span>` : ''}${fins ? `<span><b>~${Math.round(fins/span*d)}</b> finished</span>` : ''}</div></div>`;
  return `<div class="card"><h3>Future you</h3><div class="sub">If you keep the pace of your last ${Math.min(90, span)} days.</div><div class="timeline">${[30,90,365].map(row).join('')}</div></div>`;
}

/* ---- charts with their own crosshair tooltips ---- */
function drawHeat(){
  const el = $('#heat'); if (!el) return;
  const weeks = innerWidth < 520 ? 20 : 53, cell = 11, gap = 3, left = 22, topPad = 16;
  const t = todayK(); const end = addDays(t, 6 - parseD(t).getDay()); const start = addDays(end, -(weeks*7 - 1));
  const W = left + weeks*(cell+gap), H = topPad + 7*(cell+gap);
  let s = `<svg data-own-tip viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${Math.round(W*1.7)}px" role="img" aria-label="Daily activity heatmap">`;
  [[1,'M'],[3,'W'],[5,'F'],[6,'Sh']].forEach(([i,d]) => { s += `<text x="${left-5}" y="${topPad + i*(cell+gap) + cell - 2}" text-anchor="end" font-size="8.5" fill="var(--ink-3)">${d}</text>`; });
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const wk = addDays(start, w*7); const m = parseD(wk).getMonth();
    if (m !== lastMonth && parseD(wk).getDate() <= 7 && w < weeks - 1) { s += `<text x="${left + w*(cell+gap)}" y="10" font-size="9" fill="var(--ink-3)">${MON[m]}</text>`; lastMonth = m; }
    for (let d = 0; d < 7; d++) {
      const k = addDays(wk, d); if (k > t) continue;
      const n = Object.values(IX.byDay[k] || {}).filter(v => v > 0).length;
      s += `<rect data-k="${k}" x="${left + w*(cell+gap)}" y="${topPad + d*(cell+gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${heatColor(Math.min(4,n))}" ${k===t?'stroke="var(--ink)" stroke-width="1.3"':''}/>`;
    }
  }
  el.innerHTML = s + '</svg>';
  const svg = el.querySelector('svg');
  const show = e => {
    const k = e.target.dataset && e.target.dataset.k; if (!k) return hideTip();
    const ss = state.sessions.filter(x => x.d === k && state.items[x.i]);
    showTip(`<b>${fmtDateLong(k)}</b><br>${ss.length ? ss.map(x => `<span class="sw" style="background:${colorOf(state.items[x.i])}"></span>${esc(state.items[x.i].title)} ${x.a > 0 ? '+' : ''}${esc(fmtAmt(x.a, U(state.items[x.i])))}${x.m ? ` · ${fmtMin(x.m)}` : ''}`).join('<br>') : 'Nothing logged'}`, e.clientX, e.clientY);
  };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hideTip);
}
function drawWeekly(){
  const el = $('#weekly'); if (!el) return;
  const t = todayK(); const thisWk = addDays(t, -parseD(t).getDay());
  const weeks = []; for (let i = 11; i >= 0; i--) weeks.push(addDays(thisWk, -7*i));
  const data = Object.fromEntries(Object.keys(GROUPS).map(g => [g, []]));
  for (const wk of weeks) {
    const cnt = Object.fromEntries(Object.keys(GROUPS).map(g => [g, 0]));
    for (let d = 0; d < 7; d++) { const k = addDays(wk, d); if (k > t) break; const day = IX.byDay[k] || {}; const seen = new Set(); for (const id in day) if (day[id] > 0 && state.items[id]) seen.add(groupOf(state.items[id])); seen.forEach(g => cnt[g]++); }
    for (const g in data) data[g].push(cnt[g]);
  }
  const groups = Object.keys(GROUPS).filter(g => data[g].some(v => v > 0));
  if (!groups.length) { el.innerHTML = '<div class="muted">No activity in the last 12 weeks.</div>'; return; }
  const W = 640, H = 210, L = 26, R = 118, T = 10, B = 24;
  const x = i => L + i * (W - L - R) / 11, y = v => T + (H - T - B) * (1 - v / 7);
  let s = `<svg data-own-tip viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:340px" role="img" aria-label="Days active per week by category">`;
  [0,2,4,6].forEach(v => { s += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-7}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${v}</text>`; });
  weeks.forEach((wk,i) => { if (i % 3 === 0 || i === 11) s += `<text x="${x(i)}" y="${H-6}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${fmtDate(wk)}</text>`; });
  const ends = groups.map(g => ({g, yy:y(data[g][11])})).sort((a,b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i-1].yy < 13) ends[i].yy = ends[i-1].yy + 13;
  for (const g of groups) s += `<path d="${line(data[g].map((v,i) => [x(i), y(v)]))}" fill="none" stroke="${GROUPS[g].c}" stroke-width="2" stroke-linejoin="round"/><circle cx="${x(11)}" cy="${y(data[g][11])}" r="4" fill="${GROUPS[g].c}" stroke="var(--surface)" stroke-width="2"/>`;
  ends.forEach(e => { s += `<text x="${W-R+9}" y="${e.yy+4}" font-size="11.5" fill="var(--ink-2)">${GROUPS[e.g].label}</text>`; });
  s += `<line id="wk-x" y1="${T}" y2="${H-B}" stroke="var(--ink-3)" visibility="hidden"/><rect id="wk-hit" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/>`;
  el.innerHTML = s + '</svg>';
  const svg = el.querySelector('svg'), hit = $('#wk-hit', svg), cross = $('#wk-x', svg);
  const show = e => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W; const i = clamp(Math.round((px - L) / ((W - L - R) / 11)), 0, 11);
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility','visible');
    showTip(`<b>Week of ${fmtDate(weeks[i])}</b>${i === 11 ? ' (so far)' : ''}<br>${groups.map(g => `<span class="sw" style="background:${GROUPS[g].c}"></span>${GROUPS[g].label}: ${plural(data[g][i],'day','days')}`).join('<br>')}`, e.clientX, e.clientY); };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility','hidden'); hideTip(); });
}
function drawProgress(){
  const el = $('#prog'); if (!el) return;
  if (!S.progSel) { el.innerHTML = '<div class="muted">Log some progress to see this chart.</div>'; return; }
  const type = S.progSel[0], id = S.progSel.slice(2);
  let items, start, goal;
  if (type === 'f') { const f = state.folders[id]; items = subtreeItems(id); start = f.start || f.created; goal = f.goal; }
  else { const it = state.items[id]; items = [it]; start = it.startedAt || it.created; goal = it.goal; }
  const firstLog = items.flatMap(i => sessOf(i.id)).map(s => s.d).sort()[0]; if (firstLog && firstLog < start) start = firstLog;
  const t = todayK(); if (start > t) start = t;
  const endK = goal && goal > t ? goal : t;
  const cur = Object.fromEntries(items.map(i => [i.id, done(i)]));
  const agg = aggregate(items);
  const pctNow = () => agg.uniform ? items.reduce((s,i) => s + clamp(cur[i.id],0,total(i)), 0) / agg.total * 100 : items.reduce((s,i) => s + clamp(cur[i.id],0,total(i))/total(i)*100, 0) / items.length;
  const series = [];
  for (let k = t; k >= start; k = addDays(k, -1)) { series.push([k, pctNow()]); const day = IX.byDay[k] || {}; for (const iid in cur) if (day[iid]) cur[iid] -= day[iid]; }
  series.reverse();
  const span = Math.max(1, diffDays(start, endK));
  const W = 640, H = 230, L = 38, R = 16, T = 12, B = 26;
  const x = k => L + diffDays(start, k) / span * (W - L - R), y = v => T + (H - T - B) * (1 - v / 100);
  let s = `<svg data-own-tip viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:340px" role="img" aria-label="Progress over time">`;
  [0,25,50,75,100].forEach(v => { s += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${v}%</text>`; });
  for (let i = 0; i <= 4; i++) { const k = addDays(start, Math.round(span * i / 4)); s += `<text x="${x(k)}" y="${H-6}" text-anchor="${i===0?'start':i===4?'end':'middle'}" font-size="11" fill="var(--ink-3)">${fmtDate(k)}</text>`; }
  if (goal) s += `<path d="M${x(start)} ${y(series[0][1])}L${x(goal)} ${y(100)}" stroke="var(--gold)" stroke-width="2" stroke-dasharray="5 4" fill="none"/>`;
  if (t < endK) s += `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H-B}" stroke="var(--line)" stroke-dasharray="2 3"/><text x="${x(t)+4}" y="${T+10}" font-size="10.5" fill="var(--ink-3)">Today</text>`;
  const pts = series.map(([k,v]) => [x(k), y(v)]);
  s += `<path d="${line(pts)}L${pts[pts.length-1][0]} ${y(0)}L${pts[0][0]} ${y(0)}Z" fill="var(--accent)" opacity=".10"/><path d="${line(pts)}" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
  const lp = pts[pts.length-1]; s += `<circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
  s += `<line id="pg-x" y1="${T}" y2="${H-B}" stroke="var(--ink-3)" visibility="hidden"/><circle id="pg-d" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/><rect id="pg-hit" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/>`;
  el.innerHTML = s + '</svg>';
  const svg = el.querySelector('svg'), hit = $('#pg-hit', svg), cx = $('#pg-x', svg), dot = $('#pg-d', svg);
  const show = e => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W; const k = addDays(start, clamp(Math.round((px - L) / (W - L - R) * span), 0, span)); const pt = series.find(p => p[0] === k);
    cx.setAttribute('x1', x(k)); cx.setAttribute('x2', x(k)); cx.setAttribute('visibility','visible');
    if (pt) { dot.setAttribute('cx', x(k)); dot.setAttribute('cy', y(pt[1])); dot.setAttribute('visibility','visible'); } else dot.setAttribute('visibility','hidden');
    const tgt = goal ? series[0][1] + (100 - series[0][1]) * clamp(diffDays(start, k) / Math.max(1, diffDays(start, goal)), 0, 1) : null;
    showTip(`<b>${fmtDateLong(k)}</b><br>${pt ? `Progress: ${round1(pt[1])}%` : 'Upcoming'}${tgt != null ? `<br>Even pace: ${round1(tgt)}%` : ''}`, e.clientX, e.clientY); };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { cx.setAttribute('visibility','hidden'); dot.setAttribute('visibility','hidden'); hideTip(); });
}
