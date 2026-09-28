/* Shelfmark views: Today, Library, Journal */
function render(){
  $('#today-label').textContent = fmtDateLong(todayK());
  $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  renderTimer(); hideTip();
  const m = $('#main');
  m.innerHTML = S.tab === 'today' ? viewToday() : S.tab === 'library' ? viewLibrary() : S.tab === 'journal' ? viewJournal() : S.tab === 'stats' ? viewStats() : viewPlan();
  if (S.tab === 'stats') drawStats();
  if (S.tab === 'plan') recalcPlans();
}
const elapsed = s => { const sec = Math.max(0, Math.floor((Date.now() - s)/1000)); const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), x = sec%60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); };
function renderTimer(){
  const tm = state.settings.timer; const slot = $('#timer-slot');
  if (!tm || !state.items[tm.i]) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="timerbar"><div><span class="pulse"></span><span>${titleHTML(state.items[tm.i].title)}</span></div><div class="btn-row"><b data-tick="${tm.s}">${elapsed(tm.s)}</b><button class="btn sm" data-a="timer-discard">Discard</button><button class="btn sm primary" data-a="timer-stop">Stop &amp; log</button></div></div>`;
}
setInterval(() => { $$('[data-tick]').forEach(el => { el.textContent = elapsed(Number(el.dataset.tick)); }); }, 1000);

const todayAmt = id => (IX.byDay[todayK()] || {})[id] || 0;
const todayMinutes = () => state.sessions.filter(s => s.d === todayK()).reduce((m, s) => m + sessionMinutes(s), 0);
const showCover = it => isBookish(it) || !!it.cover;

function itemRow(it, o={}){
  const u = U(it); const p = pctOf(it); const fin = isFinished(it);
  const loc = o.noLoc ? '' : (it.folders||[]).filter(f => state.folders[f]).map(f => state.folders[f].name)[0];
  const sub = [kindLabel(it), it.author, loc].filter(Boolean).map(esc).join(' · ');
  const badges = [];
  if (!fin && p >= 80) badges.push('<span class="badge gold">Finish line</span>');
  if (isDnf(it)) badges.push('<span class="badge">Didn’t finish</span>');
  else if (isPaused(it)) badges.push('<span class="badge">Set aside</span>');
  else if (isStalled(it)) badges.push(`<span class="badge">Quiet ${diffDays(lastTouched(it.id), todayK())} days</span>`);
  if (fin) badges.push(it.rating ? starsHTML(it.rating, 12) : weatherPill('done'));
  const tm = state.settings.timer; const running = tm && tm.i === it.id;
  const quick = !fin && !u.time && !u.pct && u.quick[0] <= 2 ? `<button class="btn sm" data-a="quick" data-id="${it.id}">+${u.quick[0]} ${esc(unitWord(u,u.quick[0]))}</button>` : '';
  const timerBtn = fin ? '' : running ? `<button class="btn sm" data-a="timer-stop" aria-label="Stop timer"><svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" fill="currentColor"/></svg><span data-tick="${tm.s}">${elapsed(tm.s)}</span></button>` : `<button class="btn sm" data-a="timer-start" data-id="${it.id}" aria-label="Start timer"><svg viewBox="0 0 12 12"><path d="M3 2l7 4-7 4z" fill="currentColor"/></svg>Timer</button>`;
  let target = '';
  if (o.showTarget && it.daily && !fin) { const a = todayAmt(it.id); target = `<span style="display:inline-flex;gap:6px;align-items:center">${ringSVG(a/it.daily, colorOf(it))}${esc(fmtAmt(Math.max(0,a), u))} of ${esc(fmtAmt(it.daily, u))} today</span>`; }
  const actions = o.actionsHTML != null ? o.actionsHTML : `${quick}${timerBtn}${fin ? '' : `<button class="btn sm primary" data-a="log" data-id="${it.id}">Log</button>`}`;
  const cov = showCover(it);
  return `<div class="row${cov ? ' has-cover' : ''}" style="--c:${colorOf(it)}">
    ${cov ? `<button class="linkish" data-a="detail" data-id="${it.id}" tabindex="-1">${coverHTML(it, 'cv-s')}</button>` : '<span class="stripe"></span>'}
    <div><button class="linkish" data-a="detail" data-id="${it.id}"><span class="row-title">${titleHTML(it.title)}</span></button><div class="row-sub">${sub}</div>
      ${fin && o.finDate ? '' : `<div class="bar"><i style="width:${p}%"></i></div>`}
      <div class="row-pos">${fin && o.finDate ? `<span>Finished ${it.finishedAt ? fmtDateY(it.finishedAt) : '(no date)'}</span>` : `<span>${esc(posLabel(it))}</span><span>${Math.floor(p)}%</span>`}${badges.join('')}${target}</div></div>
    <div class="row-act">${actions}</div>
  </div>`;
}

/* ---- Today ---- */
function allGoals(){
  const out = [];
  for (const f of Object.values(state.folders)) if (f.goal) { const its = subtreeItems(f.id); if (its.length) out.push({kind:'f', id:f.id, name:f.name, sub:pathOf(f.id).slice(0,-1).map(x => x.name).join(' › '), start:f.start || f.created, g:goalCalc(its, f.goal)}); }
  for (const it of Object.values(state.items)) if (it.goal && !isFinished(it)) out.push({kind:'i', id:it.id, name:it.title, sub:kindLabel(it), start:it.created, g:goalCalc([it], it.goal)});
  const order = {overdue:0, behind:1, risk:2, unknown:3, on:4, done:5};
  return out.sort((a,b) => order[a.g.weather] - order[b.g.weather] || a.g.goal.localeCompare(b.g.goal));
}
function goalRow(x){
  const g = x.g; const timePct = clamp(diffDays(x.start, todayK()) / Math.max(1, diffDays(x.start, g.goal)) * 100, 0, 100);
  return `<div class="row" style="--c:var(--accent)"><span class="stripe"></span>
    <div><button class="linkish" data-a="${x.kind === 'f' ? 'open-folder' : 'detail'}" data-id="${x.id}"><span class="row-title">${titleHTML(x.name)}</span></button>${x.sub ? `<div class="row-sub">${esc(x.sub)}</div>` : ''}
      <div class="bar"><i style="width:${g.pct}%"></i>${g.weather !== 'done' ? `<span class="mark" style="left:calc(${timePct}% - 1px)"></span>` : ''}</div>
      <div class="row-pos"><span>${Math.floor(g.pct)}%</span>${g.weather !== 'done' ? `<span>need ${esc(rateTxt(g.required, g))}</span><span>doing ${esc(rateTxt(g.current, g))}</span>${g.projected ? `<span>finish ~${fmtDateY(g.projected)}</span>` : ''}` : ''}</div></div>
    <div class="row-act">${weatherPill(g.weather)}</div></div>`;
}
function challengeCard(y, compact){
  const c = challengeFor(y);
  if (!c.goal) return compact ? '' : `<div class="card challenge"><div class="block-head" style="margin-bottom:0"><div><h3>${y} reading challenge</h3><div class="sub">Set how many books you want to finish this year.</div></div><button class="btn sm primary" data-a="challenge" data-y="${y}">Set a goal</button></div></div>`;
  const pct = clamp(c.n / c.goal * 100, 0, 100);
  const cur = String(y) === todayK().slice(0,4);
  const status = c.n >= c.goal ? `<span class="pill done">${WEATHER.done.text}</span>` : !cur ? '' : c.ahead > 0 ? `<span class="pill good">${plural(c.ahead,'book','books')} ahead</span>` : c.ahead < 0 ? `<span class="pill warn">${plural(-c.ahead,'book','books')} behind</span>` : `<span class="pill good">On track</span>`;
  const recent = c.list.slice().reverse().slice(0, compact ? 6 : 12);
  return `<div class="card challenge"><div class="block-head" style="margin-bottom:6px"><div><h3>${y} reading challenge</h3><div class="sub">${cur && c.n < c.goal ? `At this rate you’ll finish about ${c.projected} this year.` : c.n >= c.goal ? 'Goal reached.' : ''}</div></div><div class="btn-row">${status}<button class="btn sm ghost" data-a="challenge" data-y="${y}">Edit</button></div></div>
    <div class="ch-num"><b>${c.n}</b><span>of ${c.goal} books</span></div>
    <div class="bigbar"><i style="width:${pct}%"></i>${cur && c.n < c.goal ? `<span class="mark" style="left:calc(${clamp(c.elapsed / c.daysIn * 100, 0, 100)}% - 1px)" title="Where you'd be at an even pace"></span>` : ''}</div>
    ${recent.length ? `<div class="cover-strip">${recent.map(f => `<button class="linkish" data-a="detail" data-id="${f.it.id}" ${tipAttr(`<b>${esc(f.it.title)}</b>${f.d ? '<br>' + fmtDateY(f.d) : ''}`)}>${coverHTML(f.it, 'cv-m')}</button>`).join('')}</div>` : ''}</div>`;
}
function quoteOfDay(){
  const qs = state.notes.filter(n => n.type === 'quote' && state.items[n.i]); if (!qs.length) return '';
  const q = qs[hueOf(todayK()) % qs.length]; const it = state.items[q.i];
  return `<section class="block"><figure class="qod"><blockquote dir="auto">${esc(q.text)}</blockquote><figcaption>— <button class="linkish" data-a="detail" data-id="${it.id}">${titleHTML(it.title)}</button>${it.author ? ', ' + esc(it.author) : ''}${q.p != null ? ` · ${esc(posAt(it, q.p))}` : ''}</figcaption></figure></section>`;
}
function viewToday(){
  const items = Object.values(state.items);
  if (!items.length) return `<div class="empty"><h2 style="font-size:20px;margin-bottom:6px">Your library is empty</h2><p>Add a book, sefer, audiobook, podcast, shiur series or course. You can also start from a Torah template or bring in your Goodreads library.</p><div class="btn-row" style="justify-content:center;margin-top:12px"><button class="btn primary" data-a="add">Add something</button><button class="btn" data-a="new-folder">New library</button><button class="btn" data-a="template">Torah templates</button><button class="btn" data-a="import-gr">Import from Goodreads</button></div></div>`;
  const t = todayK(); const st = streaks(); const mo = momentum();
  const targets = items.filter(i => i.daily && !isFinished(i) && !isPaused(i));
  const met = targets.filter(i => todayAmt(i.id) >= i.daily).length;
  const open = items.filter(isOpen);
  const finishLine = open.filter(i => pctOf(i) >= 80).sort((a,b) => pctOf(b) - pctOf(a));
  const targetRows = targets.filter(i => pctOf(i) < 80);
  const rest = open.filter(i => pctOf(i) < 80 && !i.daily && !isStalled(i)).sort((a,b) => (lastTouched(b.id) || b.startedAt || '').localeCompare(lastTouched(a.id) || a.startedAt || ''));
  const stalled = open.filter(isStalled);
  const goals = allGoals().filter(x => x.g.weather !== 'done');
  let cleanup = [];
  if (open.length >= 8) cleanup = open.map(it => { const pace = paceOf([it]); const rem = total(it) - done(it); return {it, score: pace ? rem / pace : (100 - pctOf(it)) / 10}; }).sort((a,b) => a.score - b.score).slice(0,4);
  const next = [];
  for (const f of Object.values(state.folders)) { const d = directItems(f.id); if (!d.some(i => isStarted(i) && !isFinished(i))) { const n = d.find(i => !isFinished(i) && !isPaused(i)); if (n && !next.includes(n)) next.push(n); } }
  const want = items.filter(i => shelfOf(i) === 'want' && !(i.folders||[]).length).sort((a,b) => (b.created||'').localeCompare(a.created||''));
  const moSub = mo.d == null ? 'momentum' : `momentum · ${mo.d >= 0 ? '+' : '−'}${Math.abs(mo.d)}% vs the 2 weeks before`;
  const dm = state.settings.dailyMinutes || 0; const tmin = todayMinutes();
  const third = dm ? `<div><b class="mo">${ringSVG(tmin/dm, 'var(--accent)', 22)}${fmtMin(tmin)}<span style="font-size:15px;color:var(--ink-3)"> / ${fmtMin(dm)}</span></b><span>daily reading time</span></div>`
    : targets.length ? `<div><b>${met}<span style="font-size:15px;color:var(--ink-3)"> / ${targets.length}</span></b><span>daily targets met</span></div>`
    : `<div><b>${Object.values(IX.byDay[t]||{}).filter(v => v > 0).length}</b><span>items logged today</span></div>`;
  const y = t.slice(0,4);
  return `
  <div class="strip">
    <div><b>${st.cur}</b><span>day streak${state.settings.skipShabbos ? ' (Shabbos excluded)' : ''} · best ${st.best}</span></div>
    <div><b class="mo"><svg viewBox="0 0 16 16" aria-hidden="true">${MOMO[mo.k]}</svg>${mo.label}</b><span>${moSub}</span></div>
    ${third}
  </div>
  ${finishLine.length ? `<section class="block"><div class="block-head"><h2>Finish line</h2><span class="hint">80% or more. Close these out first.</span></div><div class="list">${finishLine.map(i => itemRow(i, {showTarget:true})).join('')}</div></section>` : ''}
  ${targetRows.length ? `<section class="block"><div class="block-head"><h2>Today's targets</h2></div><div class="list">${targetRows.sort((a,b) => (todayAmt(a.id) >= a.daily) - (todayAmt(b.id) >= b.daily)).map(i => itemRow(i, {showTarget:true})).join('')}</div></section>` : ''}
  <section class="block">
    <div class="block-head"><h2>${finishLine.length || targetRows.length ? 'Also in progress' : 'Currently reading & learning'}</h2><button class="btn sm" data-a="add">Add</button></div>
    ${rest.length ? `<div class="list">${rest.map(i => itemRow(i)).join('')}</div>` : `<div class="empty">${finishLine.length || targetRows.length ? 'Nothing else in progress.' : 'Nothing in progress yet. Tap Log on anything in your Library to start.'}</div>`}
  </section>
  ${challengeCard(y, true)}
  ${quoteOfDay()}
  ${goals.length ? `<section class="block"><div class="block-head"><h2>Goal forecast</h2><span class="hint">Tap one for the full equation</span></div><div class="list">${goals.map(goalRow).join('')}</div></section>` : ''}
  ${cleanup.length ? `<section class="block"><div class="block-head"><h2>Clean-up: closest finishes</h2><span class="hint">${open.length} things are open. These are the quickest to close.</span></div><div class="list">${cleanup.map(c => itemRow(c.it)).join('')}</div></section>` : ''}
  ${next.length ? `<section class="block"><div class="block-head"><h2>Up next in your folders</h2></div><div class="list">${next.slice(0,5).map(i => itemRow(i)).join('')}</div></section>` : ''}
  ${want.length && !rest.length ? `<section class="block"><div class="block-head"><h2>Want to read</h2><button class="btn sm ghost" data-a="shelf-go" data-k="want">See all ${want.length}</button></div><div class="list">${want.slice(0,4).map(i => itemRow(i, {actionsHTML:`<button class="btn sm primary" data-a="start" data-id="${i.id}">Start</button>`})).join('')}</div></section>` : ''}
  ${stalled.length ? `<section class="block"><div class="block-head"><h2>Gone quiet</h2><span class="hint">Nothing logged in ${stalledDays}+ days</span></div><div class="list">${stalled.map(i => itemRow(i, {actionsHTML:`<button class="btn sm" data-a="pause" data-id="${i.id}">Set aside</button><button class="btn sm primary" data-a="log" data-id="${i.id}">Log</button>`})).join('')}</div></section>` : ''}`;
}

/* ---- Library ---- */
function folderStats(fid){
  const its = subtreeItems(fid); const a = aggregate(its);
  return {its, a, fin: its.filter(isFinished).length, prog: its.filter(i => isStarted(i) && !isFinished(i)).length, not: its.filter(i => !isStarted(i)).length};
}
const FOLDER_ICO = '<svg class="folder-ico" viewBox="0 0 16 14" aria-hidden="true"><path d="M1 3a1 1 0 0 1 1-1h4l1.5 1.5H14a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" fill="none" stroke="var(--accent)" stroke-width="1.5"/></svg>';
function viewLibrary(){
  const seg = `<div class="seg">${[['shelves','Shelves'],['folders','Folders'],['map','Map']].map(([k,l]) => `<button aria-pressed="${S.libView===k}" data-a="lib-view" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (S.libView === 'map') return `<div class="block-head"><h2>Map</h2>${seg}</div>${viewMap()}`;
  if (S.libView === 'shelves') return `<div class="block-head"><h2>Library</h2>${seg}</div>${viewShelves()}`;
  if (S.path && S.path !== '__unfiled' && !state.folders[S.path]) S.path = null;
  if (S.path === '__unfiled') { const uf = unfiled(); return `<div class="block-head"><h2>Folders</h2>${seg}</div>${crumbs()}<div class="dash"><div class="dash-title"><h2>Not in a folder</h2></div><div class="sub">Edit an item to put it in one or more folders.</div></div>${uf.length ? `<div class="list">${uf.map(i => itemRow(i)).join('')}</div>` : '<div class="empty">Everything is filed.</div>'}`; }
  if (!S.path) {
    const roots = kids(null); const uf = unfiled();
    return `<div class="block-head"><h2>Folders</h2>${seg}</div>
      <div class="btn-row" style="margin-bottom:14px"><button class="btn sm primary" data-a="new-folder">New library</button><button class="btn sm" data-a="add">Add item</button><button class="btn sm" data-a="template">Torah templates</button></div>
      ${roots.length || uf.length ? `<div class="fgrid">${roots.map(folderCard).join('')}${uf.length ? `<button class="fcard" data-a="open-folder" data-id="__unfiled"><h3>Not in a folder</h3><div class="meta">${plural(uf.length,'item','items')}</div></button>` : ''}</div>` : `<div class="empty">Create top-level libraries like Kodesh, Secular or Courses, then nest folders inside them as deep as you like.</div>`}`;
  }
  const f = state.folders[S.path]; const fs = folderStats(f.id);
  const g = goalCalc(fs.its, f.goal);
  const subs = kids(f.id); const direct = directItems(f.id);
  const current = fs.its.filter(i => isStarted(i) && !isFinished(i) && !isPaused(i)).sort((a,b) => lastTouched(b.id).localeCompare(lastTouched(a.id)));
  const dActive = direct.filter(i => !isFinished(i) && !isPaused(i)), dFin = direct.filter(isFinished), dPaused = direct.filter(i => isPaused(i) && !isFinished(i));
  return `<div class="block-head"><h2>Folders</h2>${seg}</div>${crumbs()}
  <div class="dash">
    <div class="dash-title"><div><h2>${titleHTML(f.name)}</h2><div class="sub">${plural(fs.its.length,'item','items')}${subs.length ? ` · ${plural(subs.length,'folder','folders')}` : ''}</div></div>
      <div class="btn-row">${f.goal ? weatherPill(g.weather) : ''}<button class="btn sm ghost" data-a="edit-folder" data-id="${f.id}">Edit</button></div></div>
    <div class="bigbar"><i style="width:${fs.a.pct}%"></i></div>
    <div class="counts"><div><b>${round1(fs.a.pct)}%</b><span>overall${fs.a.uniform || !fs.its.length ? '' : ' (average)'}</span></div><div><b>${fs.fin}</b><span>completed</span></div><div><b>${fs.prog}</b><span>in progress</span></div><div><b>${fs.not}</b><span>not started</span></div></div>
    ${f.goal && fs.its.length ? equationHTML(g) : fs.its.length ? `<div><button class="btn sm" data-a="edit-folder" data-id="${f.id}">Set a goal date for this folder</button></div>` : ''}
    <div class="btn-row"><button class="btn sm primary" data-a="add" data-folder="${f.id}">Add item here</button><button class="btn sm" data-a="new-folder" data-parent="${f.id}">New subfolder</button><button class="btn sm" data-a="template" data-parent="${f.id}">Torah template here</button></div>
  </div>
  ${subs.length ? `<section class="block"><div class="block-head"><h2>Folders</h2></div><div class="list">${subs.map(s => { const x = folderStats(s.id); return `<button class="subf" data-a="open-folder" data-id="${s.id}"><span class="row-title" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${FOLDER_ICO}${titleHTML(s.name)}${s.goal && x.its.length ? weatherPill(goalCalc(x.its, s.goal).weather) : ''}</span><span class="pct">${Math.round(x.a.pct)}% · ${x.fin}/${x.its.length} done</span><span class="bar"><i style="width:${x.a.pct}%"></i></span></button>`; }).join('')}</div></section>` : ''}
  ${current.length && subs.length ? `<section class="block"><div class="block-head"><h2>Currently studying</h2><span class="hint">In this folder and below</span></div><div class="list">${current.map(i => itemRow(i)).join('')}</div></section>` : ''}
  ${direct.length ? `<section class="block"><div class="block-head"><h2>${subs.length ? 'Directly in this folder' : 'Items'}</h2></div>
    ${dActive.length ? `<div class="list">${dActive.slice(0, 12).map(i => itemRow(i, {noLoc:true})).join('')}${dActive.length > 12 ? `<details class="more"><summary>${dActive.length - 12} more</summary>${dActive.slice(12).map(i => itemRow(i, {noLoc:true})).join('')}</details>` : ''}</div>` : ''}
    ${dFin.length ? `<details class="more list" style="margin-top:10px"><summary style="border-top:0">Completed (${dFin.length})</summary>${dFin.map(i => itemRow(i, {noLoc:true})).join('')}</details>` : ''}
    ${dPaused.length ? `<details class="more list" style="margin-top:10px"><summary style="border-top:0">Set aside (${dPaused.length})</summary>${dPaused.map(i => itemRow(i, {noLoc:true})).join('')}</details>` : ''}
  </section>` : (!subs.length ? `<div class="empty">This folder is empty. Add items or subfolders.</div>` : '')}`;
}
function crumbs(){
  const path = S.path === '__unfiled' ? [{id:'__unfiled', name:'Not in a folder'}] : pathOf(S.path);
  return `<div class="crumbs"><button data-a="open-folder" data-id="">All libraries</button>${path.map((p, i) => ' › ' + (i === path.length - 1 ? `<span class="cur">${esc(p.name)}</span>` : `<button data-a="open-folder" data-id="${p.id}">${esc(p.name)}</button>`)).join('')}</div>`;
}
function folderCard(f){
  const x = folderStats(f.id); const g = f.goal && x.its.length ? goalCalc(x.its, f.goal) : null;
  return `<button class="fcard" data-a="open-folder" data-id="${f.id}"><h3>${FOLDER_ICO}${titleHTML(f.name)}</h3>
    <div class="bigbar" style="height:7px"><i style="width:${x.a.pct}%"></i></div>
    <div class="meta">${Math.round(x.a.pct)}% · ${plural(x.its.length,'item','items')} · ${x.fin} done · ${x.prog} in progress</div>${g ? `<div>${weatherPill(g.weather)}</div>` : ''}</button>`;
}
function viewMap(){
  if (!S.mapOpen) S.mapOpen = new Set(kids(null).map(f => f.id));
  const node = f => { const x = folderStats(f.id); const ch = kids(f.id); const its = directItems(f.id);
    return `<details data-fid="${f.id}" ${S.mapOpen.has(f.id) ? 'open' : ''}><summary><span class="tw">▸</span><b>${titleHTML(f.name)}</b><span class="mbar"><i style="width:${x.a.pct}%"></i></span><span class="mpct">${Math.round(x.a.pct)}% · ${x.its.length}</span></summary>
      ${ch.map(node).join('')}${its.map(it => `<div class="leaf" style="--c:${colorOf(it)}"><i class="dot"></i><button class="linkish t" data-a="detail" data-id="${it.id}">${titleHTML(it.title)}</button><span class="mbar"><i style="width:${pctOf(it)}%"></i></span><span class="mpct">${Math.floor(pctOf(it))}%</span></div>`).join('')}</details>`; };
  const roots = kids(null);
  return roots.length ? `<div class="map">${roots.map(node).join('')}</div><div class="btn-row" style="margin-top:10px"><button class="btn sm" data-a="map-all" data-k="1">Expand all</button><button class="btn sm" data-a="map-all" data-k="0">Collapse all</button></div>` : `<div class="empty">No folders yet.</div>`;
}
const SORTS = {recent:'Recently active', added:'Date added', finished:'Date finished', title:'Title', author:'Author', rating:'My rating', progress:'Progress', length:'Length'};
const activity = it => [lastTouched(it.id), it.finishedAt, it.startedAt, it.created].filter(Boolean).sort().pop() || '';
function viewShelves(){
  const all = Object.values(state.items);
  const counts = {all:all.length}; for (const k in SHELVES) counts[k] = all.filter(i => shelfOf(i) === k).length;
  let items = S.shelf === 'all' ? all : all.filter(i => shelfOf(i) === S.shelf);
  const kc = {}; items.forEach(i => kc[i.kind] = (kc[i.kind]||0) + 1);
  if (S.kind !== 'all' && !kc[S.kind]) S.kind = 'all';
  if (S.kind !== 'all') items = items.filter(i => i.kind === S.kind);
  const tags = [...new Set(items.flatMap(i => i.tags||[]))].sort();
  if (S.tag && !tags.includes(S.tag)) S.tag = null;
  if (S.tag) items = items.filter(i => (i.tags||[]).includes(S.tag));
  const q = S.q.trim().toLowerCase();
  if (q) items = items.filter(i => [i.title, i.author, i.isbn, i.review, ...(i.tags||[]), ...(i.folders||[]).map(f => state.folders[f]?.name)].join(' ').toLowerCase().includes(q));
  const cmp = {
    recent:(a,b) => activity(b).localeCompare(activity(a)), added:(a,b) => (b.created||'').localeCompare(a.created||''),
    finished:(a,b) => (b.finishedAt||'').localeCompare(a.finishedAt||''), title:(a,b) => a.title.localeCompare(b.title),
    author:(a,b) => (a.author||'~').localeCompare(b.author||'~') || a.title.localeCompare(b.title), rating:(a,b) => (b.rating||0) - (a.rating||0),
    progress:(a,b) => pctOf(b) - pctOf(a), length:(a,b) => pagesOf(b) - pagesOf(a),
  }[S.sort] || (() => 0);
  items.sort((a,b) => cmp(a,b) || a.title.localeCompare(b.title));
  const chip = (k, label, n, act) => `<button class="chip" aria-pressed="${act}" data-a="${k.startsWith('k:') ? 'kind' : 'shelf'}" data-k="${esc(k.replace(/^k:/,''))}">${label} <span class="muted num">${n}</span></button>`;
  const grid = S.layout === 'grid';
  return `<div class="btn-row" style="margin-bottom:12px"><button class="btn sm primary" data-a="add">Add</button><button class="btn sm" data-a="import-gr">Import from Goodreads</button></div>
    <div class="filters shelves">${['reading','want','read','paused','dnf'].filter(k => counts[k] || k === 'reading' || k === 'want' || k === 'read').map(k => chip(k, SHELVES[k].label, counts[k], S.shelf === k)).join('')}${chip('all', 'All', counts.all, S.shelf === 'all')}</div>
    <input class="search" id="lib-q" type="search" placeholder="Search titles, authors, tags, reviews, ISBN" value="${esc(S.q)}">
    ${Object.keys(kc).length > 1 ? `<div class="filters">${chip('k:all','All kinds', Object.values(kc).reduce((a,b) => a+b, 0), S.kind === 'all')}${Object.entries(KINDS).filter(([k]) => kc[k]).map(([k,v]) => chip('k:' + k, v.plural, kc[k], S.kind === k)).join('')}</div>` : ''}
    ${tags.length ? `<div class="filters tags">${tags.slice(0, 40).map(t => `<button class="chip sm" aria-pressed="${S.tag===t}" data-a="tag" data-k="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
    <div class="block-head"><span class="sub">${plural(items.length, 'item', 'items')}</span><div class="btn-row"><select class="inline" id="lib-sort" aria-label="Sort">${Object.entries(SORTS).map(([k,l]) => `<option value="${k}" ${S.sort===k?'selected':''}>${l}</option>`).join('')}</select>
      <div class="seg"><button aria-pressed="${!grid}" data-a="layout" data-k="list" aria-label="List view">List</button><button aria-pressed="${grid}" data-a="layout" data-k="grid" aria-label="Cover view">Covers</button></div></div></div>
    ${!items.length ? `<div class="empty">${S.q || S.tag ? 'Nothing matches.' : S.shelf === 'want' ? 'Nothing on your want-to-read shelf. Add books you plan to read.' : S.shelf === 'reading' ? 'Nothing in progress.' : 'Nothing here yet.'}</div>`
      : grid ? `<div class="cgrid">${items.map(i => `<button class="citem" data-a="detail" data-id="${i.id}">${coverHTML(i, 'cv-l')}<span class="ctitle">${titleHTML(i.title)}</span>${i.author ? `<span class="cauth">${esc(i.author)}</span>` : ''}${isFinished(i) ? (i.rating ? starsHTML(i.rating, 12) : '<span class="cauth">Read</span>') : isStarted(i) ? `<span class="bar" style="--c:${colorOf(i)}"><i style="width:${pctOf(i)}%"></i></span>` : ''}</button>`).join('')}</div>`
      : `<div class="list">${items.map(i => itemRow(i, {finDate:true, actionsHTML: shelfOf(i) === 'want' ? `<button class="btn sm" data-a="start" data-id="${i.id}">Start</button>` : undefined})).join('')}</div>`}`;
}

/* ---- Journal ---- */
function viewJournal(){
  const seg = `<div class="seg">${[['calendar','Calendar'],['notes','Notes & quotes']].map(([k,l]) => `<button aria-pressed="${S.jView===k}" data-a="j-view" data-k="${k}">${l}</button>`).join('')}</div>`;
  return `<div class="block-head"><h2>Journal</h2>${seg}</div>${S.jView === 'notes' ? viewNotes() : viewCalendar()}`;
}
function viewCalendar(){
  const t = todayK();
  if (!S.jMonth) S.jMonth = t.slice(0,7);
  const [yy, mm] = S.jMonth.split('-').map(Number);
  const first = `${S.jMonth}-01`; const days = new Date(yy, mm, 0).getDate(); const last = `${S.jMonth}-${pad(days)}`;
  const lead = parseD(first).getDay();
  const ss = state.sessions.filter(s => s.d >= first && s.d <= last && state.items[s.i]);
  const fins = finishes().filter(f => f.d >= first && f.d <= last);
  const mins = ss.reduce((m,s) => m + sessionMinutes(s), 0);
  const pages = Object.values(pagesByDay(first, last)).reduce((a,b) => a+b, 0);
  let active = 0; for (let k = first; k <= last; k = addDays(k,1)) if (activeDay(k)) active++;
  const notesN = state.notes.filter(n => n.d >= first && n.d <= last).length;
  let cells = ''; for (let i = 0; i < lead; i++) cells += '<span class="cday pad"></span>';
  for (let d = 1; d <= days; d++) {
    const k = `${S.jMonth}-${pad(d)}`; const day = IX.byDay[k] || {};
    const ids = Object.keys(day).filter(id => day[id] > 0 && state.items[id]);
    const fin = fins.filter(f => f.d === k);
    const lvl = Math.min(4, ids.length);
    const show = [...new Set([...fin.map(f => f.it.id), ...ids])].slice(0, 2).map(id => state.items[id]);
    cells += `<button class="cday${k === t ? ' today' : ''}${k === S.jDay ? ' sel' : ''}${k > t ? ' future' : ''}" data-a="j-day" data-k="${k}" style="--lv:${[0,30,55,78,100][lvl]}%" aria-label="${fmtDateLong(k)}: ${plural(ids.length,'item','items')}">
      <span class="dn">${d}</span>${fin.length ? '<span class="fin" title="Finished something"></span>' : ''}${show.length ? `<span class="cstack">${show.map(it => showCover(it) ? coverHTML(it, 'cv-xs') : `<i class="cdot" style="--c:${colorOf(it)}"></i>`).join('')}</span>` : ''}</button>`;
  }
  const sel = S.jDay && S.jDay.startsWith(S.jMonth) ? S.jDay : null;
  const prevM = dkey(new Date(yy, mm - 2, 1)).slice(0,7), nextM = dkey(new Date(yy, mm, 1)).slice(0,7);
  return `<div class="card">
    <div class="cal-head"><button class="iconbtn" data-a="j-month" data-k="${prevM}" aria-label="Previous month">‹</button><h3>${MONTH[mm-1]} ${yy}</h3><button class="iconbtn" data-a="j-month" data-k="${nextM}" aria-label="Next month" ${nextM > t.slice(0,7) ? 'disabled' : ''}>›</button></div>
    <div class="cal">${DOW3.map(d => `<span class="dow">${d[0]}</span>`).join('')}${cells}</div>
    <div class="statgrid"><div><b>${active}</b><span>active days</span></div><div><b>${mins ? fmtHours(mins) : '—'}</b><span>time logged</span></div><div><b>${pages ? fmtNum(pages) : '—'}</b><span>pages read</span></div><div><b>${ss.length}</b><span>sessions</span></div><div><b>${fins.length}</b><span>finished</span></div><div><b>${notesN}</b><span>notes & quotes</span></div></div>
  </div>
  ${sel ? dayDetail(sel) : `<div class="sub" style="text-align:center">Tap a day to see what you read.</div>`}
  ${fins.length ? `<section class="block" style="margin-top:18px"><div class="block-head"><h2>Finished in ${MONTH[mm-1]}</h2></div><div class="cover-strip big">${fins.map(f => `<button class="linkish" data-a="detail" data-id="${f.it.id}" ${tipAttr(`<b>${esc(f.it.title)}</b><br>${fmtDateY(f.d)}`)}>${coverHTML(f.it, 'cv-m')}${f.r ? starsHTML(f.r, 10) : ''}</button>`).join('')}</div></section>` : ''}`;
}
function dayDetail(k){
  const ss = state.sessions.filter(s => s.d === k && state.items[s.i]);
  const ns = state.notes.filter(n => n.d === k && state.items[n.i]);
  const fins = finishes().filter(f => f.d === k);
  const mins = ss.reduce((m,s) => m + sessionMinutes(s), 0);
  return `<section class="block"><div class="block-head"><h2>${fmtDateLong(k)}</h2><span class="hint">${plural(ss.length,'session','sessions')}${mins ? ' · ' + fmtMin(mins) : ''}</span></div>
    ${ss.length || ns.length || fins.length ? `<div class="list">${fins.map(f => `<div class="row" style="--c:var(--gold)"><span class="stripe"></span><div><button class="linkish" data-a="detail" data-id="${f.it.id}"><span class="row-title">Finished ${titleHTML(f.it.title)}</span></button>${f.r ? `<div>${starsHTML(f.r, 12)}</div>` : ''}</div><span></span></div>`).join('')}
      ${ss.map(s => { const it = state.items[s.i]; return `<div class="row" style="--c:${colorOf(it)}"><span class="stripe"></span><div><button class="linkish" data-a="detail" data-id="${it.id}"><span class="row-title">${titleHTML(it.title)}</span></button><div class="row-sub">${s.a > 0 ? '+' : ''}${esc(fmtAmt(s.a, U(it)))}${s.p != null && !U(it).time ? ` · to ${esc(posAt(it, s.p))}` : ''}${s.m ? ` · ${fmtMin(s.m)}` : ''}${s.t ? ` · ${new Date(s.t).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}` : ''}</div></div><span></span></div>`; }).join('')}
      ${ns.map(n => noteCard(n, true)).join('')}</div>` : '<div class="empty">Nothing logged this day.</div>'}</section>`;
}
function noteCard(n, inList){
  const it = state.items[n.i];
  return `<button class="note-card ${n.type}${inList ? ' in-list' : ''}" data-a="edit-note" data-id="${n.id}">
    ${n.type === 'quote' ? `<blockquote dir="auto">${esc(n.text)}</blockquote>` : `<p dir="auto">${esc(n.text)}</p>`}
    <span class="nmeta"><span class="tag">${n.type === 'quote' ? 'Quote' : 'Note'}</span> ${it ? titleHTML(it.title) : ''}${it && n.p != null ? ` · ${esc(posAt(it, n.p))}` : ''} · ${fmtDateY(n.d)}</span></button>`;
}
function viewNotes(){
  let ns = state.notes.filter(n => state.items[n.i]);
  const counts = {all:ns.length, note:ns.filter(n => n.type === 'note').length, quote:ns.filter(n => n.type === 'quote').length};
  const withNotes = [...new Set(ns.map(n => n.i))].map(id => state.items[id]).sort((a,b) => a.title.localeCompare(b.title));
  if (S.nType !== 'all') ns = ns.filter(n => n.type === S.nType);
  if (S.nItem && state.items[S.nItem]) ns = ns.filter(n => n.i === S.nItem);
  const q = S.nq.trim().toLowerCase();
  if (q) ns = ns.filter(n => (n.text + ' ' + state.items[n.i].title + ' ' + (state.items[n.i].author||'')).toLowerCase().includes(q));
  ns.sort((a,b) => b.d.localeCompare(a.d) || (b.t||0) - (a.t||0));
  return `<div class="btn-row" style="margin-bottom:12px"><button class="btn sm primary" data-a="new-note">Add a note or quote</button></div>
    <div class="filters">${[['all','All'],['quote','Quotes'],['note','Notes']].map(([k,l]) => `<button class="chip" aria-pressed="${S.nType===k}" data-a="n-type" data-k="${k}">${l} <span class="muted num">${counts[k]}</span></button>`).join('')}
      ${withNotes.length > 1 ? `<select class="inline" id="n-item" aria-label="Filter by item"><option value="">Every book</option>${withNotes.map(it => `<option value="${it.id}" ${S.nItem===it.id?'selected':''}>${esc(it.title)}</option>`).join('')}</select>` : ''}</div>
    <input class="search" id="notes-q" type="search" placeholder="Search your notes and quotes" value="${esc(S.nq)}">
    ${ns.length ? `<div class="notes">${ns.map(n => noteCard(n)).join('')}</div>` : `<div class="empty">${counts.all ? 'Nothing matches.' : 'Save quotes and thoughts as you read. Add them here, or in the note box when you log a session.'}</div>`}`;
}
