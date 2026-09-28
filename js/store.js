/* Shelfmark storage + mutations */
const APP_VERSION = '2.0.0';
const KEY = 'shelfmark-data';
const Cap = window.Capacitor; const P = (Cap && Cap.Plugins) || {};
const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
const Prefs = isNative && P.Preferences ? P.Preferences : null;
let saveTimer = null, saving = false, dirty = false;
function setSync(s, text){ const el = $('#sync'); if (!el) return; el.dataset.s = s; el.querySelector('span').textContent = text; }
async function readRaw(){ try { if (Prefs) { const r = await Prefs.get({key:KEY}); return r && r.value; } return localStorage.getItem(KEY); } catch(e){ return null; } }
async function writeRaw(v){ if (Prefs) await Prefs.set({key:KEY, value:v}); else localStorage.setItem(KEY, v); }
async function initStore(){ const raw = await readRaw(); if (!raw) return null; try { return migrate(JSON.parse(raw)); } catch(e){ return null; } }
const serialize = () => JSON.stringify({v:3, items:state.items, folders:state.folders, sessions:state.sessions, notes:state.notes, settings:state.settings});
function commit(){ dirty = true; rebuildIndex(); queueSave(); }
function queueSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); }
async function flush(){
  if (!state || !dirty) return;
  if (saving) { queueSave(); return; }
  saving = true; dirty = false;
  try { await writeRaw(serialize()); setSync('saved','Saved'); }
  catch(e) { dirty = true; setSync('error','Not saved'); toast("Couldn't save. Your phone may be out of space. Remove some uploaded cover photos or export a backup."); }
  finally { saving = false; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); flush(); } });
const haptic = kind => { try { if (!isNative || !P.Haptics) return; kind === 'success' ? P.Haptics.notification({type:'SUCCESS'}) : P.Haptics.impact({style:'LIGHT'}); } catch(e){} };

/* ============ mutations ============ */
let lastUndo = null;
function addNote(i, text, type, p, date){
  const n = {id:uid(), i, d:date || todayK(), t:Date.now(), p:p ?? null, type:type === 'quote' ? 'quote' : 'note', text};
  state.notes.push(n); return n;
}
function addSession(id, newPos, date, minutes, note, noteType){
  const it = state.items[id]; if (!it) return {delta:0};
  newPos = clamp(Math.round(newPos), it.start - 1, it.end);
  const delta = newPos - it.pos;
  if (!delta && !(minutes > 0) && !note) return {delta:0};
  const wasFinished = isFinished(it);
  const prev = {pos:it.pos, finishedAt:it.finishedAt, status:it.status, startedAt:it.startedAt};
  const now = new Date(); const dt = parseD(date); dt.setHours(now.getHours(), now.getMinutes());
  let s = null, n = null;
  if (delta || minutes > 0) { s = {id:uid(), i:id, d:date, t:dt.getTime(), a:delta, m:minutes > 0 ? Math.round(minutes) : null, p:newPos}; state.sessions.push(s); }
  if (note) n = addNote(id, note, noteType, newPos, date);
  it.pos = newPos;
  if (it.status === 'paused' || it.status === 'dnf' || (it.status === 'reading' && isStarted(it))) delete it.status;
  if (!it.startedAt && isStarted(it)) it.startedAt = date;
  if (isFinished(it)) it.finishedAt = it.finishedAt ?? date; else delete it.finishedAt;
  lastUndo = () => {
    if (s) state.sessions = state.sessions.filter(x => x.id !== s.id);
    if (n) state.notes = state.notes.filter(x => x.id !== n.id);
    it.pos = prev.pos;
    for (const k of ['finishedAt','status','startedAt']) { if (prev[k] !== undefined) it[k] = prev[k]; else delete it[k]; }
    commit(); render();
  };
  commit();
  if (delta) haptic();
  return {delta, logged:true, finishedNow: !wasFinished && isFinished(it)};
}
function deleteSession(sid){
  const s = state.sessions.find(x => x.id === sid); if (!s) return;
  const it = state.items[s.i];
  state.sessions = state.sessions.filter(x => x.id !== sid);
  if (it) { it.pos = clamp(it.pos - s.a, it.start - 1, it.end); if (!isFinished(it)) delete it.finishedAt; }
  commit();
}
function deleteItem(id){
  state.sessions = state.sessions.filter(s => s.i !== id);
  state.notes = state.notes.filter(n => n.i !== id);
  delete state.items[id];
  if (state.settings.timer && state.settings.timer.i === id) state.settings.timer = null;
  commit();
}
function deleteFolder(fid){
  const f = state.folders[fid]; if (!f) return;
  for (const c of kids(fid)) c.parent = f.parent || null;
  for (const it of Object.values(state.items)) it.folders = (it.folders||[]).filter(x => x !== fid);
  delete state.folders[fid];
  if (S.path === fid) S.path = f.parent || null;
  commit();
}
/* Goodreads-style: file the current read in history and start again from the beginning */
function readAgain(id){
  const it = state.items[id]; if (!it || !isFinished(it)) return;
  (it.reads ||= []).push({s:startDate(it), f:it.finishedAt || '', r:it.rating ?? null});
  it.pos = it.start - 1; delete it.finishedAt; it.startedAt = todayK(); it.status = 'reading';
  commit();
}
function startReading(id){ const it = state.items[id]; if (!it) return; if (!isStarted(it)) it.status = 'reading'; else delete it.status; if (!it.startedAt) it.startedAt = todayK(); commit(); }
function setRating(id, r){ const it = state.items[id]; if (!it) return; if (r > 0) it.rating = r; else delete it.rating; commit(); }
