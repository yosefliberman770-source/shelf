/* Shelfmark sheets: forms, detail, log, notes, import/export, settings */
function openSheet(html, onMount){
  $('#sheet-root').innerHTML = `<div class="scrim" data-a="close-scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const sheet = $('#sheet-root .sheet'); onMount && onMount(sheet);
  const first = sheet.querySelector('input:not([type=radio]):not([type=checkbox]):not([type=file]), select'); if (first && innerWidth > 640) first.focus();
}
const closeSheet = () => { $('#sheet-root').innerHTML = ''; hideTip(); };
function folderOptions(sel, exclude){
  const ex = exclude ? new Set(subtreeIds(exclude)) : new Set(); const out = [];
  const walk = (pid, depth) => { for (const f of kids(pid)) { if (ex.has(f.id)) continue; out.push(`<option value="${f.id}" ${f.id===sel?'selected':''}>${'   '.repeat(depth)}${esc(f.name)}</option>`); walk(f.id, depth+1); } };
  walk(null, 0); return out.join('');
}
function folderChecks(selected){
  const out = [];
  const walk = (pid, depth) => { for (const f of kids(pid)) { out.push(`<label style="padding-left:${depth*16}px"><input type="checkbox" name="fold" value="${f.id}" ${selected.includes(f.id)?'checked':''}>${esc(f.name)}</label>`); walk(f.id, depth+1); } };
  walk(null, 0); return out.join('') || '<div class="muted" style="font-size:13px">No folders yet. Name one below to create it.</div>';
}
const unitOptions = sel => Object.entries(UNITS).map(([k,u]) => `<option value="${k}" ${k===sel?'selected':''}>${u.time ? 'Minutes (time)' : u.pct ? 'Percent' : k === 'custom' ? 'Custom unit…' : u.many[0].toUpperCase()+u.many.slice(1)}</option>`).join('');

/* shrink a photo to a small JPEG so it fits comfortably in local storage */
function resizeImage(file, maxW = 240){
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const r = Math.min(1, maxW / img.width); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .72)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    img.src = url;
  });
}

/* ---- add / edit ---- */
function openItemForm(id, presetFolder, presetShelf){
  const pf = presetFolder && presetFolder !== '__unfiled' && state.folders[presetFolder] ? presetFolder : '';
  const it = id ? state.items[id] : {kind:'book', title:'', author:'', isbn:'', unit:'page', start:1, end:'', pos:0, folders:pf ? [pf] : [], tags:[], goal:'', daily:''};
  const isNew = !id; const u0 = U(it);
  const posVal = !id ? '' : u0.time ? fmtClock(done(it)) : u0.pct ? done(it) : isStarted(it) ? it.pos : '';
  const shelf0 = presetShelf || (S.tab === 'library' && S.libView === 'shelves' && ['want','read'].includes(S.shelf) ? S.shelf : 'reading');
  const fin = !isNew && isFinished(it);
  openSheet(`
    <h2>${isNew ? 'Add to your library' : 'Edit'}</h2>
    <form id="item-form" novalidate>
      <div class="field"><span class="lbl">What is it?</span><div class="kinds">${Object.entries(KINDS).map(([k,v]) => `<label><input type="radio" name="kind" value="${k}" ${it.kind===k?'checked':''}>${v.label}</label>`).join('')}</div></div>
      <div class="field" id="preset-field" hidden><label for="f-preset">Choose a sefer</label><input id="f-preset" list="preset-list" placeholder="Start typing: Berachos, Tehillim, Tanya…"><datalist id="preset-list">${PRESETS.map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist><span class="hint">Fills in the name and the daf, perek or siman range. Or type any sefer below.</span></div>
      <div class="field" id="lookup-field" hidden><label for="f-lookup">Search Open Library</label><div class="lookup"><input id="f-lookup" type="search" placeholder="Title, author or ISBN" enterkeyhint="search"><button type="button" class="btn" data-a="lookup">Find</button></div><div id="lookup-note"></div></div>
      <div class="cover-edit"><span id="cover-prev">${coverHTML(it, 'cv-l')}</span>
        <div class="btn-row"><label class="btn sm">Upload photo<input type="file" id="f-coverfile" accept="image/*" hidden></label><button type="button" class="btn sm ghost" data-a="cover-clear">Remove</button></div>
        <input type="hidden" id="f-cover" value="${esc(it.cover && !String(it.cover).startsWith('data:') ? it.cover : '')}"><input type="hidden" id="f-coverdata" value="${esc(String(it.cover||'').startsWith('data:') ? it.cover : '')}"></div>
      <div class="field"><label for="f-title">Title</label><input id="f-title" dir="auto" value="${esc(it.title)}"></div>
      <div class="field"><label for="f-author" id="author-lbl">Author</label><input id="f-author" dir="auto" value="${esc(it.author||'')}"></div>
      <div class="two" id="book-fields"><div class="field"><label for="f-isbn">ISBN <span class="muted">(optional)</span></label><input id="f-isbn" inputmode="numeric" value="${esc(it.isbn||'')}"></div>
        <div class="field"><label for="f-format">Format</label><select id="f-format"><option value="">—</option>${Object.entries(FORMATS).map(([k,l]) => `<option value="${k}" ${it.format===k?'selected':''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label for="f-year">Year published <span class="muted">(optional)</span></label><input id="f-year" inputmode="numeric" value="${esc(it.year||'')}" style="max-width:140px"></div>
      <div class="two"><div class="field"><label for="f-unit">Track it in</label><select id="f-unit">${unitOptions(it.unit)}</select></div>
        <div class="field" id="cu-field" hidden><label for="f-cu">Unit name</label><input id="f-cu" placeholder="e.g. module, drill" value="${esc(it.cu||'')}"></div></div>
      <div class="two" id="range-fields">
        <div class="field"><label for="f-start" id="start-lbl">First</label><input id="f-start" type="number" inputmode="numeric" value="${esc(it.start)}"></div>
        <div class="field"><label for="f-end" id="end-lbl">Last</label><input id="f-end" type="number" inputmode="numeric" value="${esc(it.end)}"></div>
      </div>
      <div class="field" id="len-field" hidden><label for="f-len">Total length (h:mm)</label><input id="f-len" placeholder="11:45" value="${u0.time && it.end ? fmtClock(total(it)) : ''}"></div>
      ${isNew ? `<div class="field"><span class="lbl">Shelf</span><div class="kinds">${['want','reading','read'].map(k => `<label><input type="radio" name="shelf" value="${k}" ${shelf0===k?'checked':''}>${SHELVES[k].label}</label>`).join('')}</div></div>` : ''}
      <div class="field" id="pos-field"><label for="f-pos" id="pos-lbl">Where you are now</label><input id="f-pos" inputmode="decimal" value="${esc(posVal)}" placeholder="Leave blank if not started"><span class="hint" id="pos-hint"></span></div>
      <div id="read-fields" ${isNew || fin ? '' : 'hidden'}>
        <div class="field"><label for="f-finished">Date finished</label><input id="f-finished" type="date" max="${todayK()}" value="${esc(fin ? it.finishedAt || '' : isNew ? todayK() : '')}"><span class="hint">Leave blank if you don't remember.</span></div>
        <div class="field"><span class="lbl">Rating</span><div id="f-stars">${starInput('form', it.rating, 'frate')}</div><input type="hidden" id="f-rating" value="${it.rating || ''}"></div>
        <div class="field"><label for="f-review">Review <span class="muted">(just for you)</span></label><textarea id="f-review" dir="auto" placeholder="What did you think?">${esc(it.review||'')}</textarea></div>
      </div>
      <div class="field"><span class="lbl">Folders <span class="muted">(as many as you like)</span></span><div class="ftree">${folderChecks(it.folders||[])}</div>
        <div class="two" style="margin-top:6px"><input id="f-newfolder" placeholder="New folder name" aria-label="New folder name"><select id="f-newparent" aria-label="New folder goes inside"><option value="">at the top level</option>${folderOptions(pf)}</select></div></div>
      <div class="field"><label for="f-tags">Tags & genres <span class="muted">(comma separated)</span></label><input id="f-tags" value="${esc((it.tags||[]).join(', '))}" placeholder="history, Rome, biography"></div>
      <div class="two" id="goal-fields">
        <div class="field"><label for="f-daily" id="daily-lbl">Daily target</label><input id="f-daily" inputmode="decimal" value="${esc(it.daily || '')}" placeholder="optional"></div>
        <div class="field"><label for="f-goal">Finish by</label><input id="f-goal" type="date" value="${esc(it.goal||'')}"></div>
      </div>
      <div class="note" id="form-err" hidden></div>
      <div class="sheet-foot">
        <div>${isNew ? '' : `<button type="button" class="btn danger" data-a="del-item" data-id="${id}">Delete</button>`}</div>
        <div class="btn-row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" type="submit">${isNew ? 'Add' : 'Save'}</button></div>
      </div>
    </form>`, sheet => {
    const f = $('#item-form', sheet);
    const sync = kindChanged => {
      const kind = f.querySelector('input[name=kind]:checked').value;
      if (kindChanged && isNew) $('#f-unit', f).value = KINDS[kind].unit;
      const unit = $('#f-unit', f).value; const cuv = $('#f-cu', f).value.trim() || 'unit';
      const u = unit === 'custom' ? {...UNITS.custom, one:cuv, many:cuv + 's'} : UNITS[unit];
      const bookish = kind === 'book' || kind === 'audiobook';
      const shelf = isNew ? f.querySelector('input[name=shelf]:checked').value : null;
      $('#preset-field', f).hidden = kind !== 'sefer';
      $('#lookup-field', f).hidden = !bookish;
      $('#book-fields', f).hidden = !bookish;
      $('#cu-field', f).hidden = unit !== 'custom';
      $('#author-lbl', f).textContent = {shiur:'Maggid shiur', podcast:'Host', audiobook:'Author / narrator', sefer:'Mechaber', course:'Teacher or provider'}[kind] || 'Author';
      $('#range-fields', f).hidden = !!(u.time || u.pct);
      $('#len-field', f).hidden = !u.time;
      $('#start-lbl', f).textContent = `First ${u.one}`; $('#end-lbl', f).textContent = `Last ${u.one}`;
      $('#pos-lbl', f).textContent = u.time ? 'Listened so far (h:mm)' : u.pct ? 'Percent done' : `Last ${u.one} you finished`;
      $('#pos-hint', f).textContent = u.time ? 'For example 2:15' : unit === 'daf' ? 'Gemara starts at daf 2' : '';
      $('#daily-lbl', f).textContent = `Daily target (${u.time ? 'minutes' : u.pct ? '%' : u.many})`;
      if (isNew) { $('#pos-field', f).hidden = shelf !== 'reading'; $('#read-fields', f).hidden = shelf !== 'read'; $('#goal-fields', f).hidden = shelf === 'read'; }
    };
    f.addEventListener('change', async e => {
      if (e.target.name === 'kind') sync(true);
      if (e.target.name === 'shelf') sync(false);
      if (e.target.id === 'f-unit') { if (UNITS[e.target.value].pct) { $('#f-start', f).value = 1; $('#f-end', f).value = 100; } sync(false); }
      if (e.target.id === 'f-preset') { const p = PRESETS.find(p => p.name === e.target.value); if (!p) return; $('#f-title', f).value = p.title; $('#f-unit', f).value = p.unit; $('#f-start', f).value = p.start; $('#f-end', f).value = p.end; sync(false); }
      if (e.target.id === 'f-coverfile' && e.target.files[0]) {
        try { const data = await resizeImage(e.target.files[0]); $('#f-coverdata', f).value = data; $('#f-cover', f).value = ''; updateCoverPreview(f); }
        catch(_) { toast("Couldn't read that image."); }
      }
    });
    f.addEventListener('input', e => { if (e.target.id === 'f-cu') sync(false); if (e.target.id === 'f-title' || e.target.id === 'f-isbn') updateCoverPreview(f); });
    f.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'f-lookup') { e.preventDefault(); runLookup(sheet); } });
    f.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'frate') { const r = nextRating(Number($('#f-rating', f).value) || 0, Number(b.dataset.n)); $('#f-rating', f).value = r || ''; $('#f-stars', f).innerHTML = starInput('form', r, 'frate'); }
      if (b.dataset.a === 'cover-clear') { $('#f-cover', f).value = ''; $('#f-coverdata', f).value = ''; $('#f-coverfile', f).value = ''; updateCoverPreview(f, true); }
    });
    f.addEventListener('submit', e => { e.preventDefault(); saveItemForm(f, id); });
    sync(false);
  });
}
function formDraft(f){
  const kind = f.querySelector('input[name=kind]:checked').value;
  return {kind, title:$('#f-title', f).value.trim() || 'Untitled', author:$('#f-author', f).value.trim(), isbn:$('#f-isbn', f).value.trim(), cover:$('#f-coverdata', f).value || $('#f-cover', f).value || null};
}
function updateCoverPreview(f, cleared){ const d = formDraft(f); if (cleared) d.isbn = ''; $('#cover-prev', f).innerHTML = coverHTML(d, 'cv-l'); }
function saveItemForm(f, id){
  const err = m => { const n = $('#form-err', f); n.textContent = m; n.hidden = false; n.scrollIntoView({block:'nearest'}); };
  const kind = f.querySelector('input[name=kind]:checked').value;
  const title = $('#f-title', f).value.trim(); if (!title) return err('Give it a title.');
  const unit = $('#f-unit', f).value; const cu = $('#f-cu', f).value.trim();
  if (unit === 'custom' && !cu) return err('Name your custom unit, like "module" or "drill".');
  const u = unit === 'custom' ? {...UNITS.custom, one:cu} : UNITS[unit];
  let start, end;
  if (u.time) { const len = parseAmount($('#f-len', f).value, u); if (!(len > 0)) return err('Enter the total length, like 11:45.'); start = 1; end = Math.round(len); }
  else if (u.pct) { start = 1; end = 100; }
  else { start = parseInt($('#f-start', f).value, 10); end = parseInt($('#f-end', f).value, 10); if (!Number.isFinite(start)) start = 1; if (!Number.isFinite(end) || end < start) return err(`Enter the last ${u.one} (${start} or more). For a book, that's the page count.`); }
  const shelf = id ? null : f.querySelector('input[name=shelf]:checked').value;
  const posRaw = $('#f-pos', f).value.trim(); let pos = start - 1;
  if (posRaw && (id || shelf === 'reading')) { const v = parseAmount(posRaw, u); if (!Number.isFinite(v)) return err('Where you are now should be a number.'); pos = u.time || u.pct ? start - 1 + v : v; }
  if (shelf === 'read') pos = end;
  pos = clamp(Math.round(pos), start - 1, end);
  const dailyRaw = $('#f-daily', f).value.trim(); const daily = dailyRaw ? Number(dailyRaw) : null;
  if (dailyRaw && !(daily > 0)) return err('The daily target should be a number above zero.');
  const yearRaw = $('#f-year', f).value.trim(); const year = yearRaw ? parseInt(yearRaw, 10) : null;
  if (yearRaw && !(year > -3000 && year <= new Date().getFullYear() + 1)) return err('The year published should be a year, like 1954.');
  const folders = $$('input[name=fold]:checked', f).map(x => x.value);
  const nf = $('#f-newfolder', f).value.trim();
  if (nf) { const fid = uid(); const par = $('#f-newparent', f).value || null; state.folders[fid] = {id:fid, name:nf, parent:par, created:todayK(), start:todayK(), goal:'', order:kids(par).length}; folders.push(fid); }
  const tags = [...new Set($('#f-tags', f).value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean))];
  const cover = $('#f-coverdata', f).value || $('#f-cover', f).value || null;
  const rating = Number($('#f-rating', f).value) || null;
  const review = $('#f-review', f).value.trim();
  const finDate = $('#f-finished', f).value;
  const fields = {kind, title, author:$('#f-author', f).value.trim(), isbn:$('#f-isbn', f).value.trim(), unit, start, end, folders, tags, goal:$('#f-goal', f).value || '', daily,
    format: (kind === 'book' || kind === 'audiobook') ? $('#f-format', f).value || undefined : undefined, year: year || undefined, cover: cover || undefined};
  if (unit === 'custom') fields.cu = cu;
  const t = todayK();
  let target;
  if (id) {
    const it = state.items[id]; const wasFin = isFinished(it);
    Object.assign(it, fields); for (const k of ['format','year','cover']) if (fields[k] === undefined) delete it[k];
    if (unit !== 'custom') delete it.cu;
    it.pos = clamp(it.pos, start - 1, end);
    if (pos !== it.pos) addSession(id, pos, t, null, null); else commit();
    if (isFinished(it)) { it.finishedAt = wasFin ? finDate : (finDate || it.finishedAt || t); if (wasFin) { if (rating) it.rating = rating; else delete it.rating; if (review) it.review = review; else delete it.review; } }
    else delete it.finishedAt;
    target = it;
  } else {
    const nid = uid();
    const it = {id:nid, ...fields, pos, created:t};
    for (const k of ['format','year','cover']) if (it[k] === undefined) delete it[k];
    if (folders[0]) it.order = directItems(folders[0]).length;
    if (shelf === 'reading') { it.status = 'reading'; it.startedAt = t; if (isStarted(it)) delete it.status; }
    if (isFinished(it)) { it.finishedAt = finDate || ''; if (rating) it.rating = rating; if (review) it.review = review; delete it.goal; delete it.daily; }
    state.items[nid] = it; target = it;
  }
  commit(); closeSheet(); render(); toast(id ? 'Saved' : `Added ${title}${shelf ? ' to ' + SHELVES[shelf].label.toLowerCase() : ''}`);
  return target;
}
let lookupResults = [];
async function runLookup(sheet){
  const q = $('#f-lookup', sheet).value.trim() || $('#f-title', sheet).value.trim();
  const note = $('#lookup-note', sheet);
  if (!q) { note.innerHTML = '<div class="note">Type a title, author or ISBN first.</div>'; return; }
  const btn = sheet.querySelector('[data-a=lookup]'); btn.disabled = true; btn.textContent = 'Looking…';
  note.innerHTML = '<div class="note">Searching Open Library…</div>';
  try {
    const isbn = q.replace(/[-\s]/g, ''); const isIsbn = /^(97[89])?\d{9}[\dXx]$/.test(isbn);
    const url = 'https://openlibrary.org/search.json?limit=8&fields=title,author_name,number_of_pages_median,isbn,subject,cover_i,first_publish_year&q=' + encodeURIComponent(isIsbn ? 'isbn:' + isbn : q);
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(url, {signal:ctl.signal}); clearTimeout(to);
    if (!res.ok) throw new Error('http');
    const docs = ((await res.json()).docs || []).filter(r => r && r.title);
    if (!docs.length) throw new Error('none');
    lookupResults = docs.map(r => ({...r, isbnPick: isIsbn ? isbn : (r.isbn || []).find(x => x.length === 13) || (r.isbn || [])[0] || ''}));
    note.innerHTML = `<div class="results">${lookupResults.map((r, i) => `<button type="button" class="result" data-a="pick-result" data-n="${i}">${coverHTML({title:r.title, author:(r.author_name||[])[0], kind:'book', cover:r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-M.jpg` : null}, 'cv-s')}<span><b>${esc(r.title)}</b><span class="sub">${esc((r.author_name||[]).slice(0,2).join(', '))}${r.first_publish_year ? ' · ' + r.first_publish_year : ''}${r.number_of_pages_median ? ' · ' + r.number_of_pages_median + ' pages' : ''}</span></span></button>`).join('')}</div>`;
  } catch(e) {
    note.innerHTML = `<div class="note">${navigator.onLine === false ? "You're offline. Fill in the details by hand." : "Couldn't find it. Fill in the details by hand."}</div>`;
  } finally { btn.disabled = false; btn.textContent = 'Find'; }
}
function pickResult(sheet, n){
  const r = lookupResults[n]; if (!r) return; const f = $('#item-form', sheet);
  const kind = f.querySelector('input[name=kind]:checked').value;
  $('#f-title', f).value = r.title;
  $('#f-author', f).value = (r.author_name || []).slice(0, 2).join(', ');
  if (r.isbnPick) $('#f-isbn', f).value = r.isbnPick;
  if (r.first_publish_year) $('#f-year', f).value = r.first_publish_year;
  if (r.cover_i) { $('#f-cover', f).value = `https://covers.openlibrary.org/b/id/${r.cover_i}-M.jpg`; $('#f-coverdata', f).value = ''; }
  const tags = (r.subject || []).filter(s => s.length <= 24 && !/[,:]/.test(s)).slice(0, 3);
  if (tags.length && !$('#f-tags', f).value) $('#f-tags', f).value = tags.join(', ');
  if (kind === 'book' && r.number_of_pages_median) { const us = $('#f-unit', f); us.value = 'page'; $('#f-start', f).value = 1; $('#f-end', f).value = r.number_of_pages_median; us.dispatchEvent(new Event('change', {bubbles:true})); }
  if (kind === 'book' && !$('#f-format', f).value) $('#f-format', f).value = 'paper';
  updateCoverPreview(f);
  $('#lookup-note', f).innerHTML = `<div class="note">Filled in from Open Library.${kind === 'book' ? ' Check the page count against your copy, since editions differ.' : ' Enter the listening time from your audiobook app.'}</div>`;
}

/* ---- log ---- */
function openLog(id, fromTimer){
  const it = state.items[id]; if (!it) return; const u = U(it);
  const cur = u.time ? fmtClock(done(it)) : u.pct ? done(it) : it.pos;
  const mins = fromTimer ? Math.max(1, Math.round((Date.now() - fromTimer) / 60000)) : '';
  openSheet(`
    <div class="sheet-hero">${showCover(it) ? coverHTML(it, 'cv-s') : ''}<div><div class="tag">${esc(kindLabel(it))}</div><h2 dir="auto">${esc(it.title)}</h2>
    <div class="sub">${esc(posLabel(it))} · ${Math.floor(pctOf(it))}%</div></div></div>
    <form id="log-form" novalidate>
      <div class="field"><label for="l-pos">${u.time ? 'Listened so far (h:mm)' : u.pct ? 'Percent done now' : `Now finished through ${u.one}`}</label><input id="l-pos" inputmode="decimal" value="${esc(cur)}"></div>
      <div class="field"><span class="lbl">Or add</span><div class="quick">${u.quick.map(q => `<button type="button" class="btn sm" data-add="${q}">+${u.time ? fmtMin(q) : q + (u.pct ? '%' : ' ' + unitWord(u,q))}</button>`).join('')}</div></div>
      <div class="two"><div class="field"><label for="l-date">Day</label><input id="l-date" type="date" value="${todayK()}" max="${todayK()}"></div>
        <div class="field"><label for="l-min">Time spent (min)</label><input id="l-min" inputmode="numeric" value="${mins}" placeholder="optional"></div></div>
      <div class="field"><div class="lbl-row"><label for="l-note">Note or quote <span class="muted">(pinned to where you are)</span></label><span class="seg sm"><label><input type="radio" name="ntype" value="note" checked>Note</label><label><input type="radio" name="ntype" value="quote">Quote</label></span></div><textarea id="l-note" dir="auto" placeholder="A chiddush, question, quote or idea"></textarea></div>
      <div class="note" id="log-err" hidden></div>
      <div class="sheet-foot"><button type="button" class="btn" data-a="finish" data-id="${id}">Mark finished</button>
        <div class="btn-row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div>
    </form>`, sheet => {
    const f = $('#log-form', sheet), inp = $('#l-pos', f);
    f.addEventListener('click', e => { const q = e.target.dataset && e.target.dataset.add; if (!q) return; const v = parseAmount(inp.value, u); const base = Number.isFinite(v) ? v : (u.time || u.pct ? 0 : it.start - 1); const nv = base + Number(q); inp.value = u.time ? fmtClock(nv) : nv; });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = parseAmount(inp.value, u);
      if (!Number.isFinite(v)) { const n = $('#log-err', f); n.textContent = 'Enter a number' + (u.time ? ' or h:mm' : '') + '.'; n.hidden = false; return; }
      const m = Number($('#l-min', f).value) || null; const note = $('#l-note', f).value.trim();
      const r = addSession(id, u.time || u.pct ? it.start - 1 + v : v, $('#l-date', f).value || todayK(), m, note, f.querySelector('input[name=ntype]:checked').value);
      if (fromTimer) { state.settings.timer = null; commit(); }
      closeSheet(); render(); afterLog(it, r);
    });
  });
}
function afterLog(it, r){
  if (r.finishedNow) return celebrate(it);
  if (r.delta) toast(`${r.delta > 0 ? 'Logged +' : 'Adjusted '}${fmtAmt(Math.abs(r.delta), U(it))} · ${it.title}`, true);
  else if (r.logged) toast('Saved', true);
}
function celebrate(it){
  const ss = sessOf(it.id); const first = startDate(it); const mins = ss.reduce((m,s) => m + sessionMinutes(s), 0);
  const torah = groupOf(it) === 'torah'; haptic('success');
  const y = (it.finishedAt || todayK()).slice(0,4); const ch = challengeFor(y);
  const chLine = ch.goal && challengeKinds().includes(it.kind) ? ` That's ${ch.n} of ${ch.goal} for your ${y} challenge.` : '';
  openSheet(`<div class="celebrate">${showCover(it) ? coverHTML(it, 'cv-l') : `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--accent-soft)"/><rect x="18" y="12" width="28" height="40" rx="3" fill="none" stroke="var(--accent)" stroke-width="3"/><path d="M34 12v22l5-4 5 4V12" fill="var(--gold)"/></svg>`}
    <div class="eyebrow" style="margin-top:8px">${torah ? 'Siyum' : 'Finished'} · ${fmtDateLong(it.finishedAt || todayK())}</div><h2>${titleHTML(it.title)}</h2><p class="sub" style="margin-top:6px">${torah ? 'Mazal tov on the siyum. It\'s in your siyum log.' : 'Another one on the shelf.'}${esc(chLine)}</p>
    <div style="display:flex;justify-content:center;margin-top:10px">${starInput(it.id, it.rating)}</div>
    <div class="statgrid" style="text-align:left"><div><b>${fmtDateY(first)}</b><span>started</span></div><div><b>${plural(diffDays(first, it.finishedAt || todayK())+1,'day','days')}</b><span>start to finish</span></div><div><b>${ss.length}</b><span>sessions</span></div>${mins ? `<div><b>${fmtHours(mins)}</b><span>time logged</span></div>` : ''}<div><b>${esc(fmtAmt(total(it), U(it)))}</b><span>covered</span></div>${paceOf([it]) && !U(it).time ? `<div><b>${round1(paceOf([it]))}</b><span>${esc(U(it).many)} per hour</span></div>` : ''}</div>
    <div class="sheet-foot" style="justify-content:center"><button class="btn" data-a="review" data-id="${it.id}">Write a review</button><button class="btn primary" data-a="close">Done</button></div></div>`);
}

/* ---- detail ---- */
function openDetail(id){
  const it = state.items[id]; if (!it) return; const u = U(it);
  const ss = sessOf(id); const mins = ss.reduce((m,s) => m + sessionMinutes(s), 0); const pace = paceOf([it]);
  const left = total(it) - done(it);
  const g = goalCalc([it], it.goal);
  const notes = state.notes.filter(n => n.i === id).sort((a,b) => b.d.localeCompare(a.d) || (b.t||0) - (a.t||0));
  const recent = ss.slice().reverse().slice(0, 25);
  const tl = isFinished(it) ? '—' : u.time ? fmtHours(left) : pace ? '~' + fmtHours(left / pace * 60) : '—';
  const sh = shelfOf(it); const fin = isFinished(it);
  const meta = [kindLabel(it), it.author, it.year, FORMATS[it.format], pagesOf(it) > 1 ? plural(pagesOf(it), 'page', 'pages') : null].filter(Boolean).map(esc).join(' · ');
  const start = startDate(it);
  let chart = '';
  if (ss.filter(s => s.a).length >= 2) { let pos = done(it) - ss.reduce((a,s) => a + s.a, 0); const pts = []; const byD = {}; ss.forEach(s => byD[s.d] = (byD[s.d]||0) + s.a);
    Object.keys(byD).sort().forEach((d, i) => { if (!i) pts.push([addDays(d, -1), Math.max(0, pos) / total(it) * 100]); pos += byD[d]; pts.push([d, pos / total(it) * 100]); });
    chart = `<div class="field"><span class="lbl">Progress</span><div class="chart">${lineSVG(pts, {h:150, fmt:v => Math.round(v) + '%', label:'Progress', tipFmt:v => round1(v) + '% done'})}</div></div>`; }
  const actions = {
    want:`<button class="btn sm primary" data-a="start" data-id="${id}">Start reading</button><button class="btn sm" data-a="log" data-id="${id}">Log</button>`,
    reading:`<button class="btn sm" data-a="timer-start" data-id="${id}">Timer</button><button class="btn sm primary" data-a="log" data-id="${id}">Log</button>`,
    read:`<button class="btn sm" data-a="read-again" data-id="${id}">Read again</button>`,
    paused:`<button class="btn sm primary" data-a="resume" data-id="${id}">Resume</button>`,
    dnf:`<button class="btn sm primary" data-a="resume" data-id="${id}">Pick it back up</button>`,
  }[sh];
  openSheet(`<div class="sheet-hero">${coverHTML(it, 'cv-l')}<div style="min-width:0"><div class="tag">${esc(SHELVES[sh].label)}</div><h2>${titleHTML(it.title)}</h2><div class="sub">${meta}</div>
      <div style="margin-top:8px">${starInput(id, it.rating)}</div></div></div>
    ${fin ? '' : `<div class="bar" style="--c:${colorOf(it)};height:8px;margin-top:14px"><i style="width:${pctOf(it)}%"></i></div>`}
    <div class="row-pos">${fin ? `<span>Finished ${it.finishedAt ? fmtDateY(it.finishedAt) : '(date unknown)'}</span>` : `<span>${esc(posLabel(it))}</span><span>${round1(pctOf(it))}%</span>`}${isStalled(it) ? `<span class="badge">Quiet ${diffDays(lastTouched(id), todayK())} days</span>` : ''}${(it.reads||[]).length ? `<span class="badge gold">Read ${it.reads.length + (fin ? 1 : 0)}×</span>` : ''}</div>
    <div class="btn-row" style="margin-top:12px">${actions}</div>
    <div class="statgrid"><div><b>${ss.length}</b><span>sessions</span></div><div><b>${mins ? fmtHours(mins) : '—'}</b><span>time logged</span></div>
      <div><b>${pace && !u.time ? `${round1(pace)} ${unitWord(u, round1(pace))}` : '—'}</b><span>${pace && !u.time ? 'per hour' : 'pace (use the timer)'}</span></div>
      <div><b>${tl}</b><span>time left</span></div>
      <div><b>${sh === 'want' ? '—' : fmtDateY(start)}</b><span>started</span></div>
      ${fin && it.finishedAt && start <= it.finishedAt ? `<div><b>${plural(diffDays(start, it.finishedAt)+1,'day','days')}</b><span>start to finish</span></div>` : `<div><b>${lastTouched(id) ? fmtDateY(lastTouched(id)) : '—'}</b><span>last session</span></div>`}
      ${ss.length ? `<div><b>${esc(fmtAmt(ss.reduce((a,s) => a + Math.max(0, s.a), 0) / ss.length, u))}</b><span>per session</span></div>` : ''}
      ${mins && ss.length ? `<div><b>${fmtMin(mins / ss.filter(s => sessionMinutes(s)).length)}</b><span>avg session</span></div>` : ''}
      <div><b>${fmtDateY(it.created)}</b><span>added</span></div></div>
    ${chart}
    ${!fin && (it.goal || g.projected) ? `<div style="margin-top:14px">${equationHTML(g)}</div>` : ''}
    ${it.review ? `<div class="field"><span class="lbl">Your review</span><div class="review" dir="auto">${esc(it.review)}</div></div>` : fin ? `<div class="field"><button class="btn sm" data-a="review" data-id="${id}">Write a review</button></div>` : ''}
    ${(it.reads||[]).length ? `<div class="field"><span class="lbl">Earlier reads</span><div class="slist">${it.reads.map((r, i) => `<div class="s"><span>Read ${i+1}${r.s && r.f ? ` · ${fmtDateY(r.s)} – ${fmtDateY(r.f)}` : r.f ? ` · finished ${fmtDateY(r.f)}` : ' · no dates'}</span><span>${r.r ? r.r + '★' : ''}</span><span></span></div>`).join('')}</div></div>` : ''}
    <div class="field"><div class="lbl-row"><span class="lbl">Notes & quotes${notes.length ? ` (${notes.length})` : ''}</span><button class="btn sm ghost" data-a="new-note" data-id="${id}">Add</button></div>${notes.length ? `<div class="notes compact">${notes.map(n => noteCard(n)).join('')}</div>` : ''}</div>
    <div class="field"><span class="lbl">Folders</span><div class="sub">${(it.folders||[]).filter(f => state.folders[f]).map(f => esc(pathName(f))).join('<br>') || 'Not in a folder'}</div>${(it.tags||[]).length ? `<div class="btn-row" style="margin-top:4px">${it.tags.map(t => `<span class="tagchip">#${esc(t)}</span>`).join('')}</div>` : ''}</div>
    ${recent.length ? `<div class="field"><span class="lbl">Sessions</span><div class="slist">${recent.map(s => `<div class="s"><span>${fmtDateY(s.d)}${s.t ? ' · ' + new Date(s.t).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : ''}</span><span>${s.a > 0 ? '+' : ''}${esc(fmtAmt(s.a, u))}${s.m ? ' · ' + fmtMin(s.m) : ''}</span><button class="x" data-a="del-session" data-id="${s.id}" data-item="${id}" aria-label="Delete session">✕</button></div>`).join('')}</div></div>` : ''}
    <div class="sheet-foot"><div class="btn-row"><button class="btn sm ghost" data-a="edit" data-id="${id}">Edit</button>${sh === 'reading' ? `<button class="btn sm ghost" data-a="pause" data-id="${id}">Set aside</button><button class="btn sm ghost" data-a="dnf" data-id="${id}">Didn't finish</button>` : ''}</div>
      <button class="btn sm" data-a="close">Close</button></div>`);
}
function openReview(id){
  const it = state.items[id]; if (!it) return;
  openSheet(`<h2>Review</h2><div class="sub">${titleHTML(it.title)}</div>
    <form id="rev-form" novalidate><div class="field"><span class="lbl">Rating</span><div id="rv-stars">${starInput('rv', it.rating, 'frate')}</div><input type="hidden" id="rv-rating" value="${it.rating || ''}"></div>
      <div class="field"><label for="rv-text">What did you think?</label><textarea id="rv-text" dir="auto" style="min-height:140px">${esc(it.review || '')}</textarea></div>
      <div class="sheet-foot"><span></span><div class="btn-row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div></form>`, sheet => {
    const f = $('#rev-form', sheet);
    f.addEventListener('click', e => { const b = e.target.closest('[data-a=frate]'); if (!b) return; const r = nextRating(Number($('#rv-rating', f).value) || 0, Number(b.dataset.n)); $('#rv-rating', f).value = r || ''; $('#rv-stars', f).innerHTML = starInput('rv', r, 'frate'); });
    f.addEventListener('submit', e => { e.preventDefault(); const r = Number($('#rv-rating', f).value) || 0; const t = $('#rv-text', f).value.trim();
      if (r) it.rating = r; else delete it.rating; if (t) it.review = t; else delete it.review; commit(); openDetail(id); render(); toast('Review saved'); });
  });
}

/* ---- notes ---- */
function openNote(noteId, itemId){
  const n = noteId ? state.notes.find(x => x.id === noteId) : {i:itemId || S.nItem || '', type:'quote', text:'', p:null, d:todayK()};
  if (!n) return;
  const items = Object.values(state.items).sort((a,b) => activity(b).localeCompare(activity(a)));
  if (!items.length) return toast('Add something to your library first.');
  const it0 = state.items[n.i] || items[0];
  openSheet(`<h2>${noteId ? 'Edit' : 'New'} ${n.type === 'quote' ? 'quote' : 'note'}</h2>
    <form id="note-form" novalidate>
      <div class="field"><span class="lbl">Type</span><div class="kinds"><label><input type="radio" name="nt" value="quote" ${n.type==='quote'?'checked':''}>Quote</label><label><input type="radio" name="nt" value="note" ${n.type!=='quote'?'checked':''}>Note</label></div></div>
      <div class="field"><label for="n-item">From</label><select id="n-item">${items.map(i => `<option value="${i.id}" ${i.id===it0.id?'selected':''}>${esc(i.title)}</option>`).join('')}</select></div>
      <div class="field"><label for="n-text">Text</label><textarea id="n-text" dir="auto" style="min-height:120px">${esc(n.text)}</textarea></div>
      <div class="two"><div class="field"><label for="n-pos" id="n-pos-lbl">${esc(U(it0).pre || 'Position')}</label><input id="n-pos" inputmode="numeric" value="${n.p != null && !U(it0).time && !U(it0).pct ? esc(n.p) : ''}" placeholder="optional"></div>
        <div class="field"><label for="n-date">Date</label><input id="n-date" type="date" max="${todayK()}" value="${esc(n.d)}"></div></div>
      <div class="note" id="n-err" hidden></div>
      <div class="sheet-foot"><div>${noteId ? `<button type="button" class="btn danger" data-a="del-note" data-id="${noteId}">Delete</button>` : ''}</div>
        <div class="btn-row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div>
    </form>`, sheet => {
    const f = $('#note-form', sheet);
    f.addEventListener('change', e => { if (e.target.id === 'n-item') $('#n-pos-lbl', f).textContent = U(state.items[e.target.value]).pre || 'Position'; });
    f.addEventListener('submit', e => { e.preventDefault();
      const text = $('#n-text', f).value.trim(); if (!text) { const x = $('#n-err', f); x.textContent = 'Write something first.'; x.hidden = false; return; }
      const i = $('#n-item', f).value, type = f.querySelector('input[name=nt]:checked').value, d = $('#n-date', f).value || todayK();
      const pr = $('#n-pos', f).value.trim(); const p = pr && Number.isFinite(Number(pr)) ? Number(pr) : null;
      if (noteId) Object.assign(n, {i, type, text, d, p}); else addNote(i, text, type, p, d);
      commit(); closeSheet(); render(); toast(noteId ? 'Saved' : type === 'quote' ? 'Quote saved' : 'Note saved');
    });
  });
}

/* ---- folders, templates, challenge ---- */
function openFolderForm(id, parent){
  const f = id ? state.folders[id] : {name:'', parent:parent || null, start:todayK(), goal:''};
  openSheet(`<h2>${id ? 'Edit folder' : parent ? 'New subfolder' : 'New library'}</h2>
    <form id="folder-form" novalidate>
      <div class="field"><label for="fo-name">Name</label><input id="fo-name" dir="auto" value="${esc(f.name)}" placeholder="${parent ? 'e.g. Rishonim, Ancient Rome' : 'e.g. Kodesh, Secular, Courses'}"></div>
      <div class="field"><label for="fo-parent">Inside</label><select id="fo-parent"><option value="">Top level (a library)</option>${folderOptions(f.parent || '', id)}</select></div>
      <div class="two"><div class="field"><label for="fo-start">Goal counts from</label><input id="fo-start" type="date" value="${esc(f.start || todayK())}"></div>
        <div class="field"><label for="fo-goal">Finish everything by</label><input id="fo-goal" type="date" value="${esc(f.goal||'')}"></div></div>
      <div class="hint sub" style="margin-top:6px">The goal is optional. It covers everything in this folder and its subfolders.</div>
      <div class="note" id="fo-err" hidden></div>
      <div class="sheet-foot"><div>${id ? `<button type="button" class="btn danger" data-a="del-folder" data-id="${id}">Delete folder</button>` : ''}</div>
        <div class="btn-row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" type="submit">${id ? 'Save' : 'Create'}</button></div></div>
    </form>`, sheet => {
    $('#folder-form', sheet).addEventListener('submit', e => {
      e.preventDefault(); const fm = e.target;
      const name = $('#fo-name', fm).value.trim(), par = $('#fo-parent', fm).value || null, start = $('#fo-start', fm).value || todayK(), goal = $('#fo-goal', fm).value;
      const err = m => { const n = $('#fo-err', fm); n.textContent = m; n.hidden = false; };
      if (!name) return err('Name the folder.');
      if (goal && goal <= start) return err('The finish date needs to be after the start date.');
      if (id) Object.assign(state.folders[id], {name, parent:par, start, goal});
      else { const fid = uid(); state.folders[fid] = {id:fid, name, parent:par, start, goal, created:todayK(), order:kids(par).length}; S.path = fid; }
      commit(); closeSheet(); S.tab = 'library'; S.libView = 'folders'; render(); toast(id ? 'Folder saved' : `Created ${name}`);
    });
  });
}
function openTemplate(parent){
  openSheet(`<h2>Torah templates</h2><div class="sub">Adds every sefer with its full range${parent ? ` inside ${esc(state.folders[parent].name)}` : ''}, ready to log.</div>
    <form id="tmpl-form" novalidate>
      <div class="tmpl">${Object.entries(TEMPLATES).map(([k,v],i) => `<label><input type="radio" name="tmpl" value="${k}" ${i===0?'checked':''}><span><b>${v.name}</b><small>${v.desc}</small></span></label>`).join('')}</div>
      <div class="field"><label for="t-goal">Finish by <span class="muted">(optional)</span></label><input id="t-goal" type="date"></div>
      <div class="sheet-foot"><span></span><div class="btn-row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" type="submit">Create</button></div></div>
    </form>`, sheet => {
    $('#tmpl-form', sheet).addEventListener('submit', e => {
      e.preventDefault(); const k = e.target.querySelector('input[name=tmpl]:checked').value, tp = TEMPLATES[k], t = todayK();
      const root = uid(); state.folders[root] = {id:root, name:tp.name, parent:parent || null, start:t, goal:$('#t-goal', e.target).value || '', created:t, order:kids(parent||null).length};
      tp.build().forEach((grp, gi) => { let fid = root; if (grp.folder) { fid = uid(); state.folders[fid] = {id:fid, name:grp.folder, parent:root, start:t, goal:'', created:t, order:gi}; }
        grp.items.forEach((x, i) => { const id = uid() + i; state.items[id] = {id, kind:'sefer', title:x.title, author:'', unit:x.unit, start:x.start, end:x.end, pos:x.start-1, folders:[fid], tags:[], created:t, order:i}; }); });
      commit(); closeSheet(); S.tab = 'library'; S.libView = 'folders'; S.path = root; render(); toast(`Created ${tp.name}`);
    });
  });
}
function openChallenge(y){
  const cur = (state.settings.challenges || {})[y] || '';
  const kinds = challengeKinds();
  openSheet(`<h2>${y} reading challenge</h2><div class="sub">How many do you want to finish in ${y}?</div>
    <form id="ch-form" novalidate>
      <div class="field"><label for="ch-n">Goal</label><input id="ch-n" type="number" min="1" inputmode="numeric" value="${esc(cur)}" placeholder="e.g. 24" style="max-width:160px"></div>
      <div class="field"><span class="lbl">What counts</span><div class="ftree" style="max-height:none">${Object.entries(KINDS).map(([k,v]) => `<label><input type="checkbox" name="chk" value="${k}" ${kinds.includes(k)?'checked':''}>${v.plural}</label>`).join('')}</div><span class="hint">This applies to every year's challenge.</span></div>
      <div class="sheet-foot"><div>${cur ? '<button type="button" class="btn danger" data-a="ch-clear">Remove goal</button>' : ''}</div><div class="btn-row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div>
    </form>`, sheet => {
    const f = $('#ch-form', sheet);
    const save = n => { state.settings.challenges ||= {}; if (n > 0) state.settings.challenges[y] = n; else delete state.settings.challenges[y];
      const ks = $$('input[name=chk]:checked', f).map(x => x.value); state.settings.challengeKinds = ks.length ? ks : ['book','audiobook'];
      commit(); closeSheet(); render(); };
    f.addEventListener('submit', e => { e.preventDefault(); save(parseInt($('#ch-n', f).value, 10) || 0); toast('Challenge saved'); });
    f.addEventListener('click', e => { if (e.target.closest('[data-a=ch-clear]')) { save(0); toast('Challenge removed'); } });
  });
}

/* ============ import / export ============ */
async function saveFile(filename, data){
  const note = $('#backup-note');
  const type = filename.endsWith('.csv') ? 'text/csv' : 'application/json';
  try {
    if (isNative && P.Filesystem && P.Share) {
      const w = await P.Filesystem.writeFile({path:filename, data, directory:'CACHE', encoding:'utf8'});
      await P.Share.share({title:filename, url:w.uri, dialogTitle:'Save your Shelfmark backup'});
    } else if (navigator.canShare && navigator.canShare({files:[new File(['x'], filename, {type})]}) && matchMedia('(pointer:coarse)').matches) {
      await navigator.share({files:[new File([data], filename, {type})], title:filename});
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], {type}));
      a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    if (filename.endsWith('.json')) { state.settings.lastBackup = todayK(); commit(); }
    if (note) note.innerHTML = `<div class="note">Exported ${esc(filename)}. Keep it in Google Drive or Downloads to keep it safe.</div>`;
  } catch(e) {
    if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || e.errorMessage || ''))) return;
    if (note) note.innerHTML = `<div class="note">Couldn't export the file. Try again, or free up some space on your phone.</div>`;
  }
}
const exportJSON = () => JSON.stringify({app:'shelfmark', v:3, exported:new Date().toISOString(), items:state.items, folders:state.folders, sessions:state.sessions, notes:state.notes, settings:{...state.settings, timer:null}}, null, 1);
const csvQ = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v; };
function exportCSV(){
  const rows = [['date','time','title','kind','unit','amount','position','minutes','folders','tags']];
  for (const s of state.sessions) { const it = state.items[s.i]; if (!it) continue; const u = U(it);
    rows.push([s.d, s.t ? new Date(s.t).toTimeString().slice(0,5) : '', it.title, kindLabel(it), u.time ? 'minutes' : u.many, s.a, s.p ?? '', s.m ?? '', (it.folders||[]).filter(f => state.folders[f]).map(pathName).join(' | '), (it.tags||[]).join(' | ')]); }
  return rows.map(r => r.map(csvQ).join(',')).join('\n');
}
function exportLibraryCSV(){
  const rows = [['title','author','kind','shelf','rating','format','isbn','year published','unit','length','position','percent','date added','date started','date finished','times read','tags','folders','review']];
  for (const it of Object.values(state.items)) rows.push([it.title, it.author, kindLabel(it), SHELVES[shelfOf(it)].label, it.rating ?? '', FORMATS[it.format] || '', it.isbn, it.year ?? '', U(it).many, total(it), done(it), Math.round(pctOf(it)), it.created, it.startedAt || '', it.finishedAt || '', (it.reads||[]).length + (isFinished(it) ? 1 : 0), (it.tags||[]).join(' | '), (it.folders||[]).filter(f => state.folders[f]).map(pathName).join(' | '), it.review || '']);
  return rows.map(r => r.map(csvQ).join(',')).join('\n');
}
const exportNotesCSV = () => [['date','type','title','author','position','text'], ...state.notes.filter(n => state.items[n.i]).map(n => { const it = state.items[n.i]; return [n.d, n.type, it.title, it.author, n.p != null ? posAt(it, n.p) : '', n.text]; })].map(r => r.map(csvQ).join(',')).join('\n');

let pendingImport = null;
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try { const d = JSON.parse(await file.text()); if (!d || d.app !== 'shelfmark' || !d.items || !Array.isArray(d.sessions)) throw 0; pendingImport = d;
    openSheet(`<h2>Restore this backup?</h2><div class="sub">${plural(Object.keys(d.items).length,'item','items')}, ${plural(Object.keys(d.folders||{}).length,'folder','folders')}, ${plural(d.sessions.length,'session','sessions')}${d.notes ? ` and ${plural(d.notes.length,'note','notes')}` : ''} from ${esc((d.exported||'').slice(0,10))}. This replaces everything currently in Shelfmark.</div>
      <div class="sheet-foot"><span></span><div class="btn-row"><button class="btn ghost" data-a="close">Cancel</button><button class="btn primary" data-a="do-import">Replace and restore</button></div></div>`);
  } catch(_) { toast("That file isn't a Shelfmark backup."); }
});
let pendingGR = null;
const itemKey = it => cleanIsbn(it.isbn) || (it.title.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '') + '|' + (it.author||'').toLowerCase().replace(/[^a-z]+/g, ''));
$('#gr-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let drafts = null; try { drafts = goodreadsItems(await file.text()); } catch(_) {}
  if (!drafts) return toast("That doesn't look like a Goodreads export. Use the goodreads_library_export.csv file.");
  const have = new Set(Object.values(state.items).flatMap(it => [cleanIsbn(it.isbn), itemKey(it)]).filter(Boolean));
  const fresh = drafts.filter(d => !have.has(cleanIsbn(d.isbn)) && !have.has(itemKey(d)));
  const c = sh => fresh.filter(d => d.grShelf === sh).length;
  const other = fresh.length - c('read') - c('to-read') - c('currently-reading');
  pendingGR = fresh;
  openSheet(`<h2>Import from Goodreads</h2><div class="sub">Found ${plural(drafts.length,'book','books')} in your export.${drafts.length - fresh.length ? ` ${plural(drafts.length - fresh.length,'is','are')} already in your library and will be skipped.` : ''}</div>
    <div class="statgrid"><div><b>${c('read')}</b><span>read</span></div><div><b>${c('currently-reading')}</b><span>currently reading</span></div><div><b>${c('to-read') + other}</b><span>want to read</span></div><div><b>${fresh.filter(d => d.rating).length}</b><span>with ratings</span></div><div><b>${fresh.filter(d => d.finishedAt).length}</b><span>with a date read</span></div><div><b>${fresh.filter(d => d.unit === 'percent').length}</b><span>missing page counts</span></div></div>
    <div class="note">Your ratings, reviews, dates read, re-reads and custom shelves (as tags) come across. Books with no page count are tracked by percent. Covers load from Open Library when there's an ISBN.</div>
    <div class="sheet-foot"><span></span><div class="btn-row"><button class="btn ghost" data-a="close">Cancel</button><button class="btn primary" data-a="do-import-gr" ${fresh.length ? '' : 'disabled'}>Import ${plural(fresh.length,'book','books')}</button></div></div>`);
});
function importGoodreads(){
  const list = pendingGR || []; pendingGR = null;
  for (const d of list) { const id = uid(); const it = {...d, id}; delete it.grShelf; for (const k of Object.keys(it)) if (it[k] === undefined) delete it[k]; state.items[id] = it; }
  commit(); closeSheet(); S.tab = 'library'; S.libView = 'shelves'; S.shelf = 'read'; render(); toast(`Imported ${plural(list.length,'book','books')} from Goodreads`);
}

/* ============ settings + reminders ============ */
const reminderDays = h => [1,2,3,4,5,6,7].filter(d => !state.settings.skipShabbos || d <= 5 || (d === 6 && h < 12) || (d === 7 && h >= 21));
async function applyReminder(ask){
  const LN = isNative ? P.LocalNotifications : null; if (!LN) return 'unavailable';
  const r = state.settings.reminder || {};
  try {
    await LN.cancel({notifications:[1,2,3,4,5,6,7].map(d => ({id:100 + d}))});
    if (!r.on) return 'off';
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted') { if (!ask) return 'denied'; perm = await LN.requestPermissions(); }
    if (perm.display !== 'granted') return 'denied';
    const [h, m] = (r.time || '20:30').split(':').map(Number);
    const st = streaks().cur;
    const body = st > 1 ? `You're on a ${st}-day streak. Log today's reading to keep it going.` : "Open Shelfmark and log today's reading.";
    await LN.schedule({notifications: reminderDays(h).map(d => ({id:100 + d, title:'Time to read', body, schedule:{on:{weekday:d, hour:h, minute:m}, allowWhileIdle:true}}))});
    return 'on';
  } catch(e) { return 'error'; }
}
const applyTheme = () => { const th = state.settings.theme; if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme; };
function openSettings(){
  const r = state.settings.reminder || {on:false, time:'20:30'};
  const lb = state.settings.lastBackup;
  const y = todayK().slice(0,4);
  openSheet(`<h2>Settings</h2>
    ${!(isNative && P.LocalNotifications) ? '' : `<div class="field"><span class="lbl">Daily reminder</span>
      <label class="switch"><input type="checkbox" id="rem-on" ${r.on ? 'checked' : ''}>Remind me to read</label>
      <input id="rem-time" type="time" value="${esc(r.time || '20:30')}" aria-label="Reminder time" style="max-width:160px">
      <span class="hint" id="rem-hint">${state.settings.skipShabbos ? 'No reminders on Friday night or Shabbos day. A late reminder still comes on Motzei Shabbos.' : 'Every day at this time.'}</span>
      <div id="rem-note"></div></div>`}
    <div class="field"><label for="set-daily">Daily reading time goal (minutes)</label><input id="set-daily" type="number" min="0" step="5" inputmode="numeric" value="${state.settings.dailyMinutes || ''}" placeholder="off" style="max-width:160px"><span class="hint">Shows a ring on Today. Counts timed sessions and time you enter when logging.</span></div>
    <div class="field"><span class="lbl">Reading challenge</span><div><button class="btn sm" data-a="challenge" data-y="${y}">${(state.settings.challenges||{})[y] ? `${y}: ${state.settings.challenges[y]} books · Edit` : `Set a ${y} goal`}</button></div></div>
    <div class="field"><span class="lbl">Shabbos</span><label class="switch"><input type="checkbox" id="set-shabbos" ${state.settings.skipShabbos ? 'checked' : ''}>Shabbos doesn't count against streaks or pace</label></div>
    <div class="field"><label for="set-theme">Appearance</label><select id="set-theme" style="max-width:200px"><option value="">Match my phone</option><option value="light" ${state.settings.theme==='light'?'selected':''}>Light</option><option value="dark" ${state.settings.theme==='dark'?'selected':''}>Dark</option></select></div>
    <div class="field"><span class="lbl">Goodreads</span><div class="sub">On goodreads.com, go to My Books, then Import and export, then Export library. Then pick the downloaded .csv file here.</div><div><button class="btn sm" data-a="import-gr">Import Goodreads library (.csv)</button></div></div>
    <div class="field"><span class="lbl">Backup</span><div class="sub">Everything lives only on this device. Export a backup now and then and keep it in Google Drive or your Downloads.${lb ? ` Last backup ${fmtDateY(lb)}.` : ' No backup yet.'}</div>
      <div class="btn-row" style="margin-top:6px"><button class="btn sm" data-a="export-json">Export backup</button><button class="btn sm" data-a="import">Restore from backup</button></div>
      <div class="btn-row" style="margin-top:6px"><button class="btn sm" data-a="export-lib">Library spreadsheet (.csv)</button><button class="btn sm" data-a="export-csv">Sessions spreadsheet (.csv)</button><button class="btn sm" data-a="export-notes">Notes & quotes (.csv)</button></div><div id="backup-note"></div></div>
    <div class="field"><span class="lbl">Erase</span><div class="sub">Deletes every item, folder, session and note on this device. This can't be undone.</div><div><button class="btn sm danger" data-a="erase">Erase all data</button></div></div>
    <p class="sub" style="margin-top:22px">Shelfmark ${APP_VERSION}. No account and no tracking. Book search and covers come from Open Library.</p>
    <div class="sheet-foot"><span></span><button class="btn primary" data-a="close">Done</button></div>`, sheet => {
    const save = async ask => {
      state.settings.reminder = {on:$('#rem-on', sheet).checked, time:$('#rem-time', sheet).value || '20:30'}; commit();
      const res = await applyReminder(ask);
      const n = $('#rem-note', sheet); if (!n) return;
      n.innerHTML = res === 'denied' ? '<div class="note">Notifications are off for Shelfmark. Turn them on in the Settings app under Notifications, then try again.</div>' : res === 'unavailable' && state.settings.reminder.on ? '<div class="note">Reminders work in the phone app.</div>' : res === 'on' ? '<div class="note">Reminder set.</div>' : '';
      if (res === 'denied') { $('#rem-on', sheet).checked = false; state.settings.reminder.on = false; commit(); }
    };
    if ($('#rem-on', sheet)) { $('#rem-on', sheet).addEventListener('change', () => save(true)); $('#rem-time', sheet).addEventListener('change', () => save(false)); }
    $('#set-shabbos', sheet).addEventListener('change', e => { state.settings.skipShabbos = e.target.checked; commit(); applyReminder(false); render(); if ($('#rem-hint', sheet)) $('#rem-hint', sheet).textContent = e.target.checked ? 'No reminders on Friday night or Shabbos day. A late reminder still comes on Motzei Shabbos.' : 'Every day at this time.'; });
    $('#set-daily', sheet).addEventListener('change', e => { state.settings.dailyMinutes = Math.max(0, parseInt(e.target.value, 10) || 0); commit(); render(); });
    $('#set-theme', sheet).addEventListener('change', e => { state.settings.theme = e.target.value || undefined; commit(); applyTheme(); });
  });
}
