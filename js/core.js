/* Shelfmark core: helpers, domain model and analytics. No DOM access at load time,
   so this file can also be loaded by the Node tests (tests/core.test.js). */

/* ============ helpers ============ */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseD = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const todayK = () => dkey(new Date());
const addDays = (k, n) => { const d = parseD(k); d.setDate(d.getDate()+n); return dkey(d); };
const diffDays = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = n => Math.round(n*10)/10;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Shabbos'];
const DOW3 = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const fmtDate = k => { const d = parseD(k); return `${MON[d.getMonth()]} ${d.getDate()}`; };
const fmtDateY = k => { const d = parseD(k); const y = d.getFullYear(); return `${MON[d.getMonth()]} ${d.getDate()}${y !== new Date().getFullYear() ? ', ' + y : ''}`; };
const fmtDateLong = k => { const d = parseD(k); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
const fmtMin = m => { m = Math.round(m); const h = Math.floor(m/60), r = m%60; return h ? `${h}h ${pad(r)}m` : `${r}m`; };
const fmtHours = m => m >= 600 ? `${Math.round(m/60).toLocaleString()}h` : m >= 60 ? `${round1(m/60)}h` : `${Math.round(m)}m`;
const fmtClock = m => `${Math.floor(m/60)}:${pad(Math.round(m%60))}`;
const fmtNum = n => Math.round(n).toLocaleString();
const hasHe = s => /[֐-׿]/.test(s||'');
const titleHTML = s => hasHe(s) ? `<span class="he" dir="auto">${esc(s)}</span>` : esc(s);
const median = a => { if (!a.length) return null; const s = [...a].sort((x,y) => x-y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; };
const mean = a => a.length ? a.reduce((s,x) => s + x, 0) / a.length : null;
const plural = (n, one, many) => `${typeof n === 'number' ? n.toLocaleString() : n} ${n === 1 ? one : many}`;
const hueOf = s => { let h = 0; for (const c of String(s||'')) h = (h * 31 + c.codePointAt(0)) >>> 0; return h % 360; };
const countBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (k == null || k === '') continue; m.set(k, (m.get(k)||0) + 1); } return [...m.entries()].sort((a,b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };

/* ============ domain ============ */
const KINDS = {
  book:      {label:'Book',          plural:'Books',       group:'read',   unit:'page'},
  sefer:     {label:'Sefer',         plural:'Seforim',     group:'torah',  unit:'daf'},
  shiur:     {label:'Shiur series',  plural:'Shiurim',     group:'torah',  unit:'episode'},
  audiobook: {label:'Audiobook',     plural:'Audiobooks',  group:'listen', unit:'minute'},
  podcast:   {label:'Podcast',       plural:'Podcasts',    group:'listen', unit:'episode'},
  course:    {label:'Course',        plural:'Courses',     group:'learn',  unit:'lesson'},
  other:     {label:'Other',         plural:'Other',       group:'learn',  unit:'custom'},
};
const GROUPS = {
  read:{label:'Reading', c:'var(--s-read)'},
  torah:{label:'Torah', c:'var(--s-torah)'},
  listen:{label:'Listening', c:'var(--s-listen)'},
  learn:{label:'Courses & other', c:'var(--s-learn)'},
};
const UNITS = {
  page:   {one:'page',    many:'pages',     pre:'Page',     quick:[10,25],   pace:30},
  daf:    {one:'daf',     many:'daf',       pre:'Daf',      quick:[1,2],     pace:1},
  amud:   {one:'amud',    many:'amudim',    pre:'Amud',     quick:[1,2],     pace:2},
  perek:  {one:'perek',   many:'perakim',   pre:'Perek',    quick:[1,3],     pace:3},
  mishnah:{one:'mishnah', many:'mishnayos', pre:'Mishnah',  quick:[1,5],     pace:10},
  siman:  {one:'siman',   many:'simanim',   pre:'Siman',    quick:[1,3],     pace:2},
  halacha:{one:'halacha', many:'halachos',  pre:'Halacha',  quick:[1,3],     pace:8},
  chapter:{one:'chapter', many:'chapters',  pre:'Chapter',  quick:[1,2],     pace:2},
  section:{one:'section', many:'sections',  pre:'Section',  quick:[1],       pace:2},
  lesson: {one:'lesson',  many:'lessons',   pre:'Lesson',   quick:[1],       pace:1},
  episode:{one:'episode', many:'episodes',  pre:'Episode',  quick:[1],       pace:1},
  minute: {one:'min',     many:'min',       pre:'',         quick:[15,30,60],pace:60, time:true},
  percent:{one:'%',       many:'%',         pre:'',         quick:[5,10],    pace:10, pct:true},
  custom: {one:'unit',    many:'units',     pre:'',         quick:[1],       pace:2},
};
const FORMATS = {paper:'Print', ebook:'E-book', audio:'Audio'};
const SHELVES = {
  want:{label:'Want to read', short:'Want'},
  reading:{label:'Currently reading', short:'Reading'},
  read:{label:'Read', short:'Read'},
  paused:{label:'Set aside', short:'Set aside'},
  dnf:{label:"Didn't finish", short:'DNF'},
};
const U = it => { const u = UNITS[it.unit] || UNITS.page; if (it.unit !== 'custom') return u; const n = (it.cu || 'unit').trim(); return {...u, one:n, many:n.endsWith('s') ? n : n + 's', pre:n[0].toUpperCase()+n.slice(1)}; };
const unitWord = (u, n) => u.time ? '' : u.pct ? '%' : (Math.abs(n) === 1 ? u.one : u.many);
const fmtAmt = (n, u) => { const s = n < 0 ? '−' : ''; const a = Math.abs(n); if (u.time) return s + fmtMin(a); if (u.pct) return `${s}${round1(a)}%`; return `${s}${round1(a).toLocaleString()} ${unitWord(u, a)}`; };
const parseAmount = (str, u) => { str = String(str).trim(); if (!str) return NaN; if (u.time && str.includes(':')) { const [h,m] = str.split(':').map(Number); return h*60 + (m||0); } return Number(str); };

const SEDARIM = [['Zeraim',['Berachos']],['Moed',['Shabbos','Eruvin','Pesachim','Shekalim','Yoma','Sukkah','Beitzah','Rosh Hashanah','Taanis','Megillah','Moed Katan','Chagigah']],['Nashim',['Yevamos','Kesubos','Nedarim','Nazir','Sotah','Gittin','Kiddushin']],['Nezikin',['Bava Kamma','Bava Metzia','Bava Basra','Sanhedrin','Makkos','Shevuos','Avodah Zarah','Horayos']],['Kodashim',['Zevachim','Menachos','Chullin','Bechoros','Arachin','Temurah','Kereisos','Meilah','Kinnim','Tamid','Middos']],['Taharos',['Niddah']]];
const BAVLI = [['Berachos',2,64],['Shabbos',2,157],['Eruvin',2,105],['Pesachim',2,121],['Shekalim',2,22],['Yoma',2,88],['Sukkah',2,56],['Beitzah',2,40],['Rosh Hashanah',2,35],['Taanis',2,31],['Megillah',2,32],['Moed Katan',2,29],['Chagigah',2,27],['Yevamos',2,122],['Kesubos',2,112],['Nedarim',2,91],['Nazir',2,66],['Sotah',2,49],['Gittin',2,90],['Kiddushin',2,82],['Bava Kamma',2,119],['Bava Metzia',2,119],['Bava Basra',2,176],['Sanhedrin',2,113],['Makkos',2,24],['Shevuos',2,49],['Avodah Zarah',2,76],['Horayos',2,14],['Zevachim',2,120],['Menachos',2,110],['Chullin',2,142],['Bechoros',2,61],['Arachin',2,34],['Temurah',2,34],['Kereisos',2,28],['Meilah',2,22],['Kinnim',22,25],['Tamid',25,33],['Middos',34,37],['Niddah',2,73]];
const TANACH = [['Bereishis',50],['Shemos',40],['Vayikra',27],['Bamidbar',36],['Devarim',34],['Yehoshua',24],['Shoftim',21],['Shmuel I',31],['Shmuel II',24],['Melachim I',22],['Melachim II',25],['Yeshayahu',66],['Yirmiyahu',52],['Yechezkel',48],['Hoshea',14],['Yoel',4],['Amos',9],['Ovadiah',1],['Yonah',4],['Michah',7],['Nachum',3],['Chavakuk',3],['Tzefaniah',3],['Chaggai',2],['Zechariah',14],['Malachi',3],['Tehillim',150],['Mishlei',31],['Iyov',42],['Shir Hashirim',8],['Rus',4],['Eichah',5],['Koheles',12],['Esther',10],['Daniel',12],['Ezra',10],['Nechemiah',13],['Divrei Hayamim I',29],['Divrei Hayamim II',36]];
const TANACH_PARTS = [['Torah',0,5],['Neviim',5,26],['Kesuvim',26,39]];
const PRESETS = [
  ...BAVLI.map(([n,s,e]) => ({name:`Gemara ${n}`, title:n, unit:'daf', start:s, end:e})),
  ...TANACH.map(([n,c]) => ({name:n, title:n, unit:'perek', start:1, end:c})),
  {name:'Mishnah Berurah (Orach Chaim)', title:'Mishnah Berurah', unit:'siman', start:1, end:697},
  {name:'Mishnah (all Shisha Sidrei)', title:'Mishnah', unit:'perek', start:1, end:525},
  {name:'Tanya (Likkutei Amarim)', title:'Tanya — Likkutei Amarim', unit:'perek', start:1, end:53},
];
const TEMPLATES = {
  shas:{name:'Shas Bavli', desc:'6 sedarim, 40 masechtos, each tracked by daf', build(){ const b = Object.fromEntries(BAVLI.map(x => [x[0], x])); return SEDARIM.map(([s, ms]) => ({folder:'Seder ' + s, items:ms.map(m => ({title:m, unit:'daf', start:b[m][1], end:b[m][2]}))})); }},
  tanach:{name:'Tanach', desc:'Torah, Neviim and Kesuvim, 929 perakim', build(){ return TANACH_PARTS.map(([p,a,z]) => ({folder:p, items:TANACH.slice(a,z).map(([n,c]) => ({title:n, unit:'perek', start:1, end:c}))})); }},
  chumash:{name:'Chumash', desc:'5 seforim, 187 perakim', build(){ return [{folder:null, items:TANACH.slice(0,5).map(([n,c]) => ({title:n, unit:'perek', start:1, end:c}))}]; }},
  mb:{name:'Mishnah Berurah', desc:'697 simanim of Orach Chaim', build(){ return [{folder:null, items:[{title:'Mishnah Berurah', unit:'siman', start:1, end:697}]}]; }},
};

const total = it => Math.max(1, it.end - it.start + 1);
const done = it => clamp(it.pos - it.start + 1, 0, total(it));
const pctOf = it => done(it) / total(it) * 100;
const isFinished = it => done(it) >= total(it);
const isStarted = it => done(it) > 0;
const isDnf = it => it.status === 'dnf' && !isFinished(it);
const isPaused = it => it.status === 'paused' || it.status === 'dnf'; // anything taken off the active list
const isOpen = it => !isFinished(it) && !isPaused(it) && (isStarted(it) || it.status === 'reading');
const shelfOf = it => isFinished(it) ? 'read' : it.status === 'dnf' ? 'dnf' : it.status === 'paused' ? 'paused' : (isStarted(it) || it.status === 'reading') ? 'reading' : 'want';
const groupOf = it => (KINDS[it.kind] || KINDS.other).group;
const colorOf = it => GROUPS[groupOf(it)].c;
const kindLabel = it => (KINDS[it.kind] || KINDS.other).label;
const isBookish = it => it.kind === 'book' || it.kind === 'audiobook';
const pagesOf = it => it.unit === 'page' ? total(it) : 0;
const posLabel = it => {
  const u = U(it), d = done(it), t = total(it);
  if (u.time) return `${fmtMin(d)} of ${fmtMin(t)}`;
  if (u.pct) return `${d}%`;
  if (!d) return `Not started · ${plural(t, u.one, u.many)}`;
  return `${u.pre} ${it.pos} of ${it.end}`;
};
const posAt = (it, p) => { const u = U(it); if (u.time) return fmtClock(p - it.start + 1); if (u.pct) return (p - it.start + 1) + '%'; return `${u.pre} ${p}`; };
const cleanIsbn = s => String(s||'').replace(/[^0-9Xx]/g, '').toUpperCase();
function coverSrc(it){
  if (it.cover) return it.cover;
  const i = cleanIsbn(it.isbn);
  if (isBookish(it) && (i.length === 10 || i.length === 13)) return `https://covers.openlibrary.org/b/isbn/${i}-M.jpg?default=false`;
  return null;
}

/* ============ state + index ============ */
let state = null;
const S = { tab:'today', path:null, libView:'shelves', shelf:'reading', kind:'all', q:'', tag:null, sort:'recent', layout:'list',
  range:30, statTab:'overview', statYear:null, progSel:null, planSel:null, mapOpen:null,
  jView:'calendar', jMonth:null, jDay:null, nType:'all', nItem:'', nq:'', monthMetric:'time' };
let IX = {byDay:{}, byItem:{}, lastByItem:{}};
function rebuildIndex(){
  const byDay = {}, byItem = {}, last = {};
  state.sessions.sort((a,b) => a.d.localeCompare(b.d) || (a.t||0) - (b.t||0));
  for (const s of state.sessions) {
    const day = (byDay[s.d] ||= {}); day[s.i] = (day[s.i] || 0) + s.a;
    (byItem[s.i] ||= []).push(s);
    if (!last[s.i] || s.d > last[s.i]) last[s.i] = s.d;
  }
  IX = {byDay, byItem, lastByItem:last};
}
const sessOf = id => IX.byItem[id] || [];
const lastTouched = id => IX.lastByItem[id] || '';
const activeDay = k => { const d = IX.byDay[k]; if (!d) return false; for (const id in d) if (d[id] > 0) return true; return false; };
const learnDay = k => !(state.settings.skipShabbos && parseD(k).getDay() === 6);
const countLearnDays = (a, b) => { let n = 0; for (let k = a; k <= b; k = addDays(k,1)) if (learnDay(k)) n++; return n; };
const nthLearnDay = (from, n) => { let k = from, c = 0; if (n <= 0) return from; for (let i = 0; i < 40000; i++) { if (learnDay(k)) { c++; if (c >= n) return k; } k = addDays(k, 1); } return k; };
const stalledDays = 30;
const isStalled = it => isStarted(it) && !isFinished(it) && !isPaused(it) && !!lastTouched(it.id) && diffDays(lastTouched(it.id), todayK()) >= stalledDays;
const startDate = it => it.startedAt || sessOf(it.id).find(s => s.a > 0)?.d || it.created;
function sessionMinutes(s){ const it = state.items[s.i]; if (s.m) return s.m; if (it && U(it).time && s.a > 0) return s.a; return 0; }

/* every completion, including earlier re-reads. d is '' when the finish date is unknown (e.g. Goodreads imports) */
function finishes(){
  const out = [];
  for (const it of Object.values(state.items)) {
    for (const r of it.reads || []) out.push({it, d:r.f || '', s:r.s || '', r:r.r ?? null, re:true});
    if (isFinished(it)) out.push({it, d:it.finishedAt || '', s:startDate(it), r:it.rating ?? null, re:false});
  }
  return out.sort((a,b) => (a.d || '0').localeCompare(b.d || '0'));
}
const inYear = (d, y) => y === 'all' ? true : !!d && d.slice(0,4) === String(y);
const challengeKinds = () => state.settings.challengeKinds || ['book','audiobook'];
function challengeFor(y){
  const goal = (state.settings.challenges || {})[y] || 0;
  const kinds = challengeKinds();
  const list = finishes().filter(f => kinds.includes(f.it.kind) && inYear(f.d, y));
  const t = todayK(); const yr = Number(y);
  const start = `${yr}-01-01`, end = `${yr}-12-31`;
  const daysIn = diffDays(start, end) + 1;
  const elapsed = t < start ? 0 : t > end ? daysIn : diffDays(start, t) + 1;
  const expected = goal * elapsed / daysIn;
  const ahead = Math.round(list.length - expected);
  const projected = elapsed ? Math.round(list.length / elapsed * daysIn) : 0;
  return {goal, list, n:list.length, expected, ahead, projected, elapsed, daysIn};
}

/* folders */
const kids = fid => Object.values(state.folders).filter(f => (f.parent || null) === fid).sort((a,b) => (a.order??0) - (b.order??0) || a.name.localeCompare(b.name));
function subtreeIds(fid){ const out = [fid]; for (let i = 0; i < out.length; i++) for (const c of kids(out[i])) out.push(c.id); return out; }
function subtreeItems(fid){ const ids = new Set(subtreeIds(fid)); return Object.values(state.items).filter(it => (it.folders||[]).some(f => ids.has(f))); }
const directItems = fid => Object.values(state.items).filter(it => (it.folders||[]).includes(fid)).sort((a,b) => (a.order??1e9) - (b.order??1e9) || a.created.localeCompare(b.created) || a.title.localeCompare(b.title));
const unfiled = () => Object.values(state.items).filter(it => !(it.folders||[]).some(f => state.folders[f]));
function pathOf(fid){ const p = []; let f = state.folders[fid]; let g = 0; while (f && g++ < 50) { p.unshift(f); f = state.folders[f.parent]; } return p; }
const pathName = fid => pathOf(fid).map(f => f.name).join(' › ');

/* ============ analytics ============ */
function aggregate(items){
  const units = new Set(items.map(i => i.unit === 'custom' ? 'custom:' + (i.cu||'') : i.unit));
  const uniform = units.size === 1 && items.length ? items[0] : null;
  let t = 0, d = 0;
  items.forEach(i => { t += total(i); d += done(i); });
  const pct = !items.length ? 0 : uniform ? d / t * 100 : items.reduce((s,i) => s + pctOf(i), 0) / items.length;
  return {uniform, u: uniform ? U(uniform) : null, total:t, done:d, pct};
}
function progressIn(items, from, to, uniform){
  let s = 0; const n = items.length;
  for (const it of items) for (const x of sessOf(it.id)) if (x.d >= from && x.d <= to) s += uniform ? x.a : x.a / total(it) * 100 / n;
  return s;
}
function paceOf(items){ // units per hour, learned from timed sessions
  let a = 0, m = 0; for (const it of items) for (const x of sessOf(it.id)) if (x.m > 0 && x.a > 0) { a += x.a; m += x.m; }
  return m >= 20 ? a / m * 60 : null;
}
function goalCalc(items, goal){
  const a = aggregate(items); const t = todayK();
  const out = {...a, goal, weather:null, whatIfs:[]};
  const uniform = !!a.uniform;
  out.remaining = uniform ? a.total - a.done : 100 - a.pct;
  let first = ''; for (const i of items) { const s = sessOf(i.id)[0]; if (s && (!first || s.d < first)) first = s.d; }
  const from = first ? (first > addDays(t,-27) ? first : addDays(t,-27)) : null;
  out.current = from ? Math.max(0, progressIn(items, from, t, uniform) / Math.max(1, countLearnDays(from, t))) : null;
  if (first && first <= addDays(t, -13)) {
    const rates = [0,1,2,3].map(w => { const e = addDays(t, -7*w), b = addDays(e, -6); return Math.max(0, progressIn(items, b, e, uniform)) / Math.max(1, countLearnDays(b, e)); }).sort((x,y) => x-y);
    out.lo = rates[1]; out.hi = rates[2];
  }
  const proj = rate => rate > 0 ? nthLearnDay(t, Math.ceil(out.remaining / rate - 1e-9)) : null;
  if (a.pct >= 100) { out.weather = 'done'; return out; }
  out.projected = proj(out.current);
  out.early = out.hi ? proj(out.hi) : null; out.late = out.lo ? proj(out.lo) : null;
  if (goal) {
    out.daysLeft = goal >= t ? countLearnDays(t, goal) : 0;
    out.calDaysLeft = diffDays(t, goal);
    out.required = out.remaining / Math.max(1, out.daysLeft);
    if (out.current !== null) out.buffer = out.current - out.required;
    if (goal < t) out.weather = 'overdue';
    else if (out.current === null) out.weather = 'unknown';
    else { const r = out.current / out.required; out.weather = r >= 1 ? 'on' : r >= .8 ? 'risk' : 'behind'; }
  }
  if (out.current) {
    const step = uniform ? (a.u.quick[0] || 1) : 1;
    const lbl = v => uniform ? fmtAmt(v, a.u) : `${v}%`;
    out.whatIfs.push([`+${lbl(step)} a day`, proj(out.current + step)]);
    if (out.current - step > 0) out.whatIfs.push([`−${lbl(step)} a day`, proj(out.current - step)]);
    const pace = uniform ? paceOf(items) : null;
    if (pace && !a.u.time) out.whatIfs.push(['+15 min a day', proj(out.current + pace / 4)]);
    if (out.projected) out.whatIfs.push(['Miss the next 3 days', nthLearnDay(addDays(out.projected, 1), 3)]);
  }
  return out;
}
const WEATHER = {
  done:{cls:'done', text:'Complete', icon:'<path d="M2 6.5l3 3 5-7" stroke="currentColor" stroke-width="2" fill="none"/>'},
  on:{cls:'good', text:'On pace', icon:'<circle cx="6" cy="6" r="3" fill="currentColor"/><path d="M6 0v2M6 10v2M0 6h2M10 6h2M1.8 1.8l1.4 1.4M8.8 8.8l1.4 1.4M1.8 10.2l1.4-1.4M8.8 3.2l1.4-1.4" stroke="currentColor" stroke-width="1.2"/>'},
  risk:{cls:'warn', text:'At risk', icon:'<path d="M3.5 9.5h6a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.6 1A2 2 0 0 0 3.5 9.5z" fill="currentColor"/>'},
  behind:{cls:'bad', text:'Behind', icon:'<path d="M3 7h6a2.2 2.2 0 0 0 0-4.4 3 3 0 0 0-5.7.9A1.8 1.8 0 0 0 3 7z" fill="currentColor"/><path d="M5 8l-1.2 3M8 8l-1.2 3" stroke="currentColor" stroke-width="1.3"/>'},
  overdue:{cls:'bad', text:'Past goal', icon:'<path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="2"/>'},
  unknown:{cls:'none', text:'No pace yet', icon:'<circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
};
const weatherPill = w => w && WEATHER[w] ? `<span class="pill ${WEATHER[w].cls}"><svg viewBox="0 0 12 12" aria-hidden="true">${WEATHER[w].icon}</svg>${WEATHER[w].text}</span>` : '';
const rateTxt = (v, g) => v == null ? '—' : g.uniform ? (g.u.time ? fmtMin(v) : `${round1(v)} ${unitWord(g.u, round1(v))}`) + '/day' : `${round1(v)}%/day`;
const remTxt = g => g.uniform ? fmtAmt(g.remaining, g.u) : `${round1(g.remaining)}%`;

function streaks(){
  const t = todayK();
  let cur = 0, k = t;
  if (!activeDay(k)) k = addDays(k, -1);
  for (let i = 0; i < 5000; i++) { if (!learnDay(k)) { k = addDays(k,-1); continue; } if (activeDay(k)) { cur++; k = addDays(k,-1); } else break; }
  const keys = Object.keys(IX.byDay).filter(activeDay).sort();
  let best = 0, run = 0, prev = null;
  for (const key of keys) {
    if (!learnDay(key)) continue;
    if (prev) { let g = addDays(prev, 1); while (g < key && !learnDay(g)) g = addDays(g, 1); run = g === key ? run + 1 : 1; } else run = 1;
    best = Math.max(best, run); prev = key;
  }
  return {cur, best: Math.max(best, cur)};
}
function momentum(){
  const t = todayK(); const pts = (a, b) => { let s = 0; for (const x of state.sessions) if (x.d >= a && x.d <= b && x.a > 0 && state.items[x.i]) s += x.a / total(state.items[x.i]) * 100; return s; };
  const now = pts(addDays(t,-13), t), prev = pts(addDays(t,-27), addDays(t,-14));
  if (!now && !prev) return {k:'quiet', label:'Quiet', d:null};
  if (!prev) return {k:'up', label:'Starting up', d:null};
  const r = now / prev, d = Math.round((r - 1) * 100);
  return r >= 1.15 ? {k:'up', label:'Accelerating', d} : r > .85 ? {k:'flat', label:'Steady', d} : {k:'down', label:'Slowing', d};
}
const MOMO = {up:'<path d="M2 12l5-5 3 3 5-6" stroke="var(--good)" stroke-width="2" fill="none"/><path d="M11 4h4v4" stroke="var(--good)" stroke-width="2" fill="none"/>', flat:'<path d="M2 8h12" stroke="var(--ink-2)" stroke-width="2"/><path d="M11 5l3 3-3 3" stroke="var(--ink-2)" stroke-width="2" fill="none"/>', down:'<path d="M2 4l5 5 3-3 5 6" stroke="var(--warn)" stroke-width="2" fill="none"/><path d="M11 12h4V8" stroke="var(--warn)" stroke-width="2" fill="none"/>', quiet:'<circle cx="8" cy="8" r="5" stroke="var(--ink-3)" stroke-width="2" fill="none"/>'};

/* pages actually turned (from logged sessions) per day, for page-tracked items */
function pagesByDay(from, to){
  const out = {};
  for (const s of state.sessions) { if (s.d < from || s.d > to || s.a <= 0) continue; const it = state.items[s.i]; if (!it || it.unit !== 'page') continue; out[s.d] = (out[s.d]||0) + s.a; }
  return out;
}
/* Goodreads-style summary of finished things for a year ('all' for every year) */
function bookYear(y, kinds){
  const all = finishes().filter(f => inYear(f.d, y) && (!kinds || kinds.includes(f.it.kind)));
  const books = all.filter(f => f.it.kind === 'book' || f.it.kind === 'audiobook');
  const withPages = all.filter(f => pagesOf(f.it) > 1);
  const pages = withPages.reduce((s,f) => s + pagesOf(f.it), 0);
  const rated = all.filter(f => f.r > 0);
  const dur = all.filter(f => f.d && f.s && f.s <= f.d).map(f => ({f, days:diffDays(f.s, f.d) + 1}));
  const byLen = withPages.slice().sort((a,b) => pagesOf(a.it) - pagesOf(b.it));
  const listenMin = all.filter(f => f.it.unit === 'minute').reduce((s,f) => s + total(f.it), 0);
  return {
    all, books, n:all.length, pages, listenMin,
    avgPages: withPages.length ? pages / withPages.length : null,
    avgRating: rated.length ? mean(rated.map(f => f.r)) : null, rated,
    shortest: byLen[0] || null, longest: byLen[byLen.length-1] || null,
    best: rated.slice().sort((a,b) => b.r - a.r || (b.d||'').localeCompare(a.d||''))[0] || null,
    medDays: median(dur.map(x => x.days)),
    fastest: dur.slice().sort((a,b) => a.days - b.days)[0] || null,
    slowest: dur.slice().sort((a,b) => b.days - a.days)[0] || null,
    rereads: all.filter(f => f.re).length,
  };
}

/* ============ Goodreads CSV import ============ */
function parseCSV(text){
  text = String(text).replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] || '').trim());
}
const grDate = s => { const m = String(s||'').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/); return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : ''; };
const grFormat = b => { b = String(b||'').toLowerCase(); if (/audio|audible|mp3|cd/.test(b)) return 'audio'; if (/kindle|ebook|e-book|nook|digital/.test(b)) return 'ebook'; return b ? 'paper' : ''; };
/* turns a Goodreads "library export" CSV into item drafts. Returns null if the file isn't one. */
function goodreadsItems(text){
  const rows = parseCSV(text); if (rows.length < 1) return null;
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  if (col('title') < 0 || col('exclusive shelf') < 0) return null;
  const g = (r, n) => { const i = col(n); return i < 0 ? '' : String(r[i] ?? '').trim(); };
  const out = [];
  for (const r of rows.slice(1)) {
    const title = g(r, 'title'); if (!title) continue;
    const shelf = g(r, 'exclusive shelf');
    const pages = parseInt(g(r, 'number of pages'), 10);
    const isbn = cleanIsbn(g(r, 'isbn13')) || cleanIsbn(g(r, 'isbn'));
    const rating = Number(g(r, 'my rating')) || null;
    const fmt = grFormat(g(r, 'binding'));
    const readCount = parseInt(g(r, 'read count'), 10) || 0;
    const tags = g(r, 'bookshelves').split(',').map(s => s.trim()).filter(s => s && !['read','to-read','currently-reading'].includes(s));
    const year = parseInt(g(r, 'original publication year'), 10) || parseInt(g(r, 'year published'), 10) || null;
    const added = grDate(g(r, 'date added'));
    const readOn = grDate(g(r, 'date read'));
    const hasPages = pages > 0;
    const it = {kind: fmt === 'audio' ? 'audiobook' : 'book', title, author:g(r, 'author'), isbn, unit: hasPages ? 'page' : 'percent', start:1, end: hasPages ? pages : 100,
      pos:0, folders:[], tags, created: added || todayK(), format: fmt || undefined, year: year || undefined, rating: rating || undefined, review: g(r, 'my review').replace(/<br\s*\/?>/gi, '\n') || undefined,
      source:'goodreads', grShelf:shelf};
    if (shelf === 'read') {
      it.pos = it.end; it.finishedAt = readOn || '';
      if (readCount > 1) it.reads = Array.from({length:readCount - 1}, () => ({s:'', f:''}));
    } else if (shelf === 'currently-reading') it.status = 'reading';
    out.push(it);
  }
  return out;
}

/* ============ storage format ============ */
function emptyState(){ return {v:3, items:{}, folders:{}, sessions:[], notes:[], settings:{skipShabbos:true, timer:null, plans:null, paceOverrides:{}, reminder:{on:false, time:'20:30'}, challenges:{}, challengeKinds:['book','audiobook'], dailyMinutes:0}}; }
/* brings a v2 (Shelfmark 1.0) or v3 store up to date, in place */
function migrate(d){
  if (!d || !d.items || typeof d.items !== 'object') return null;
  d.sessions = Array.isArray(d.sessions) ? d.sessions : [];
  d.folders ||= {}; d.notes = Array.isArray(d.notes) ? d.notes : [];
  const base = emptyState().settings;
  d.settings = {...base, ...(d.settings||{})};
  d.settings.reminder = {...base.reminder, ...(d.settings.reminder||{})};
  d.settings.challenges ||= {};
  for (const s of d.sessions) if (s.n) { d.notes.push({id:uid(), i:s.i, d:s.d, t:s.t || null, p:s.p ?? null, type:'note', text:s.n}); delete s.n; }
  for (const it of Object.values(d.items)) { it.folders ||= []; it.tags ||= []; if (!it.created) it.created = todayK(); }
  d.v = 3;
  return d;
}
