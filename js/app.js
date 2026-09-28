/* Shelfmark events + boot */
let toastTimer = null;
function toast(msg, undo){ const r = $('#toast-root'); r.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${undo && lastUndo ? '<button data-a="undo">Undo</button>' : ''}</div>`; clearTimeout(toastTimer); toastTimer = setTimeout(() => { r.innerHTML = ''; }, 5000); }

const armed = {};
function armConfirm(b, key, label){ if (armed[key]) { armed[key] = false; return true; } armed[key] = true; const old = b.textContent; b.textContent = label; setTimeout(() => { armed[key] = false; if (b.isConnected) b.textContent = old; }, 3000); return false; }
const go = (tab, top = true) => { S.tab = tab; render(); if (top) scrollTo({top:0}); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a], nav.tabs button'); if (!b || !state) return;
  if (b.matches('nav.tabs button')) { go(b.dataset.tab); return; }
  const a = b.dataset.a, id = b.dataset.id;
  if (b.closest('#item-form, #rev-form, #ch-form') && ['frate','cover-clear','ch-clear'].includes(a)) return; // handled by the form
  switch (a) {
    case 'close-scrim': if (e.target === b) closeSheet(); break;
    case 'close': closeSheet(); break;
    case 'add': openItemForm(null, b.dataset.folder || (S.tab === 'library' && S.libView === 'folders' ? S.path : null)); break;
    case 'edit': openItemForm(id); break;
    case 'detail': openDetail(id); break;
    case 'log': openLog(id); break;
    case 'quick': { const it = state.items[id]; const r = addSession(id, it.pos + U(it).quick[0], todayK(), null, null); render(); afterLog(it, r); break; }
    case 'finish': { const it = state.items[id]; const r = addSession(id, it.end, todayK(), null, null); closeSheet(); render(); if (r.finishedNow) celebrate(it); else toast('Already finished'); break; }
    case 'undo': if (lastUndo) { lastUndo(); lastUndo = null; $('#toast-root').innerHTML = ''; } break;
    case 'pause': state.items[id].status = 'paused'; commit(); closeSheet(); render(); toast('Set aside. It stays in your library and Stats until you pick it back up.'); break;
    case 'dnf': state.items[id].status = 'dnf'; state.items[id].dnfAt = todayK(); commit(); closeSheet(); render(); toast("Moved to Didn't finish. Nothing is deleted."); break;
    case 'resume': { const it = state.items[id]; delete it.status; delete it.dnfAt; if (!isStarted(it)) it.status = 'reading'; commit(); closeSheet(); render(); toast('Back in progress'); break; }
    case 'start': startReading(id); closeSheet(); render(); toast(`Started ${state.items[id].title}`); break;
    case 'read-again': readAgain(id); openDetail(id); render(); toast('Starting a new read. Your earlier read is kept in the history.'); break;
    case 'rate': { const it = state.items[id]; if (!it) break; const r = nextRating(it.rating || 0, Number(b.dataset.n)); setRating(id, r); const g = b.closest('.stars.input'); if (g) g.outerHTML = starInput(id, r); render(); break; }
    case 'review': openReview(id); break;
    case 'timer-start': { const tm = state.settings.timer; if (tm && tm.i !== id && state.items[tm.i]) { toast(`Stop the timer on ${state.items[tm.i].title} first`); break; } const it = state.items[id]; if (!it.startedAt) it.startedAt = todayK(); if (it.status === 'paused' || it.status === 'dnf' || (!isStarted(it) && !it.status)) it.status = 'reading'; state.settings.timer = {i:id, s:Date.now()}; commit(); closeSheet(); render(); scrollTo({top:0}); break; }
    case 'timer-stop': { const tm = state.settings.timer; if (tm) openLog(tm.i, tm.s); break; }
    case 'timer-discard': if (armConfirm(b, 'td', 'Tap again')) { state.settings.timer = null; commit(); render(); } break;
    case 'del-session': if (armConfirm(b, 'ds' + id, '?')) { deleteSession(id); openDetail(b.dataset.item); render(); } break;
    case 'del-item': if (armConfirm(b, 'di' + id, 'Tap again to delete')) { const t = state.items[id].title; deleteItem(id); closeSheet(); render(); toast(`Deleted ${t}`); } break;
    case 'del-folder': if (armConfirm(b, 'df' + id, 'Tap again to delete')) { deleteFolder(id); closeSheet(); render(); toast('Folder deleted. Its items and subfolders were kept.'); } break;
    case 'del-note': if (armConfirm(b, 'dn' + id, 'Tap again to delete')) { state.notes = state.notes.filter(n => n.id !== id); commit(); closeSheet(); render(); toast('Deleted'); } break;
    case 'edit-note': openNote(id); break;
    case 'new-note': openNote(null, id); break;
    case 'settings': openSettings(); break;
    case 'erase': if (armConfirm(b, 'er', 'Tap again to erase everything')) { state = emptyState(); S.path = null; commit(); closeSheet(); applyReminder(); applyTheme(); render(); toast('Everything erased'); } break;
    case 'open-folder': S.tab = 'library'; S.libView = 'folders'; S.path = id || null; closeSheet(); render(); scrollTo({top:0}); break;
    case 'new-folder': openFolderForm(null, b.dataset.parent); break;
    case 'edit-folder': openFolderForm(id); break;
    case 'template': openTemplate(b.dataset.parent); break;
    case 'challenge': openChallenge(b.dataset.y); break;
    case 'lookup': runLookup(b.closest('.sheet')); break;
    case 'pick-result': pickResult(b.closest('.sheet'), Number(b.dataset.n)); break;
    case 'lib-view': S.libView = b.dataset.k; render(); break;
    case 'shelf': S.shelf = b.dataset.k; render(); break;
    case 'shelf-go': S.tab = 'library'; S.libView = 'shelves'; S.shelf = b.dataset.k; render(); scrollTo({top:0}); break;
    case 'layout': S.layout = b.dataset.k; try { localStorage.setItem('shelfmark-layout', S.layout); } catch(_) {} render(); break;
    case 'kind': S.kind = b.dataset.k; render(); break;
    case 'tag': S.tag = S.tag === b.dataset.k ? null : b.dataset.k; render(); break;
    case 'range': S.range = b.dataset.n === 'all' ? 'all' : Number(b.dataset.n); render(); break;
    case 'stat-tab': S.statTab = b.dataset.k; render(); break;
    case 'j-view': S.jView = b.dataset.k; render(); break;
    case 'j-month': S.jMonth = b.dataset.k; S.jDay = null; render(); break;
    case 'j-day': S.jDay = S.jDay === b.dataset.k ? null : b.dataset.k; render(); break;
    case 'n-type': S.nType = b.dataset.k; render(); break;
    case 'map-all': S.mapOpen = new Set(b.dataset.k === '1' ? Object.keys(state.folders) : []); render(); break;
    case 'plan-preset': { const p = state.settings.plans[b.dataset.p]; const [l, m] = PLAN_PRESETS[b.dataset.q]; p.m = [...m]; p.name = l; commit(); render(); break; }
    case 'export-json': saveFile(`shelfmark-backup-${todayK()}.json`, exportJSON()); break;
    case 'export-csv': saveFile(`shelfmark-sessions-${todayK()}.csv`, exportCSV()); break;
    case 'export-lib': saveFile(`shelfmark-library-${todayK()}.csv`, exportLibraryCSV()); break;
    case 'export-notes': saveFile(`shelfmark-notes-${todayK()}.csv`, exportNotesCSV()); break;
    case 'import': $('#import-file').click(); break;
    case 'import-gr': $('#gr-file').click(); break;
    case 'do-import-gr': importGoodreads(); break;
    case 'do-import': { const d = pendingImport; if (!d) break; state = migrate({v:d.v, items:d.items, folders:d.folders||{}, sessions:d.sessions, notes:d.notes || [], settings:{...(d.settings||{}), timer:null}}); commit(); pendingImport = null; closeSheet(); S.path = null; applyTheme(); render(); toast('Backup restored'); break; }
  }
});
document.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.fid && S.mapOpen) { if (d.open) S.mapOpen.add(d.dataset.fid); else S.mapOpen.delete(d.dataset.fid); } }, true);
let planTimer = null;
const rerenderKeepingFocus = sel => { const el = $(sel); const pos = el ? el.selectionStart : null; render(); const q = $(sel); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch(_){} } };
document.addEventListener('input', e => {
  const t = e.target; if (!state) return;
  if (t.id === 'lib-q') { S.q = t.value; rerenderKeepingFocus('#lib-q'); }
  if (t.id === 'notes-q') { S.nq = t.value; rerenderKeepingFocus('#notes-q'); }
  if (t.dataset.plan != null) { state.settings.plans[t.dataset.plan].m[t.dataset.day] = Math.max(0, Number(t.value) || 0); recalcPlans(); clearTimeout(planTimer); planTimer = setTimeout(() => commit(), 800); }
  if (t.dataset.pname != null) { state.settings.plans[t.dataset.pname].name = t.value; clearTimeout(planTimer); planTimer = setTimeout(() => { commit(); recalcPlans(); }, 800); }
  if (t.dataset.pace != null) { const v = Number(t.value); if (v > 0) { state.settings.paceOverrides[t.dataset.pace] = v; recalcPlans(); clearTimeout(planTimer); planTimer = setTimeout(() => commit(), 800); } }
});
document.addEventListener('change', e => {
  if (!state) return;
  const t = e.target;
  if (t.id === 'skip-shabbos') { state.settings.skipShabbos = t.checked; commit(); applyReminder(false); render(); }
  if (t.id === 'prog-sel') { S.progSel = t.value; drawProgress(); }
  if (t.id === 'plan-sel') { S.planSel = t.value; render(); }
  if (t.id === 'lib-sort') { S.sort = t.value; render(); }
  if (t.id === 'stat-year') { S.statYear = t.value; render(); }
  if (t.id === 'month-metric') { S.monthMetric = t.value; render(); }
  if (t.id === 'n-item') { S.nItem = t.value; render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet-root').innerHTML) closeSheet(); });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state && S.tab === 'stats' && S.statTab === 'overview') drawHeat(); }, 200); });

/* ============ boot ============ */
(async () => {
  const loaded = await initStore();
  state = loaded || emptyState();
  try { S.layout = localStorage.getItem('shelfmark-layout') || 'list'; } catch(_) {}
  if (!Object.values(state.items).some(i => shelfOf(i) === 'reading') && Object.keys(state.items).length) S.shelf = 'all';
  rebuildIndex();
  applyTheme();
  render();
  applyReminder(false);
  try { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js'); } catch(e) {}
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e) {}
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state) { render(); applyReminder(false); } });
})();
