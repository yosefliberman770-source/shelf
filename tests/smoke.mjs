// Browser smoke test: loads the app with a year of sample data, visits every screen and
// the main sheets, fails on any JS error, and saves phone-size screenshots to tests/shots/.
// Run with: npm run smoke   (needs Playwright + Chromium installed)
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); } catch { ({chromium} = require(path.join(process.execPath, '../../lib/node_modules/playwright'))); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tests', 'shots');
fs.mkdirSync(shots, {recursive: true});
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json', '.json':'application/json'};
const server = createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

/* ---- sample data: deterministic pseudo-random year of reading ---- */
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = new Date(); const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return dk(d); };
function sample(){
  const items = {}, sessions = [], notes = [];
  const books = [
    ['Dune','Frank Herbert','9780441013593',658,1965,'paper',['scifi']], ['Middlemarch','George Eliot','9780141439549',880,1871,'ebook',['classics']],
    ['The Hobbit','J.R.R. Tolkien','9780547928227',300,1937,'paper',['fantasy']], ['Sapiens','Yuval Noah Harari','9780062316097',464,2011,'paper',['history']],
    ['Educated','Tara Westover','9780399590504',352,2018,'paper',['memoir']], ['The Remains of the Day','Kazuo Ishiguro','9780679731726',245,1989,'paper',['classics']],
    ['Thinking, Fast and Slow','Daniel Kahneman','9780374533557',499,2011,'ebook',['psychology']], ['Pachinko','Min Jin Lee','9781455563937',496,2017,'paper',['fiction']],
  ];
  books.forEach(([title, author, isbn, pages, year, format, tags], i) => {
    const id = 'b' + i; const fin = i < 5;
    items[id] = {id, kind:'book', title, author, isbn, unit:'page', start:1, end:pages, pos:0, folders:[], tags, created:daysAgo(360 - i*20), year, format};
    if (fin) { items[id].rating = [5, 4, 4.5, 3, 4][i]; if (i === 0) items[id].review = 'Sand, politics and ecology. Loved it.'; }
  });
  items.a1 = {id:'a1', kind:'audiobook', title:'Project Hail Mary', author:'Andy Weir', isbn:'9780593135204', unit:'minute', start:1, end:970, pos:0, folders:[], tags:['scifi'], created:daysAgo(100), format:'audio'};
  items.f1 = {id:'f1', name:'Kodesh'};
  const folders = {k:{id:'k', name:'Kodesh', parent:null, created:daysAgo(300), start:daysAgo(300), goal:daysAgo(-200), order:0}};
  delete items.f1;
  items.s1 = {id:'s1', kind:'sefer', title:'Berachos', author:'', unit:'daf', start:2, end:64, pos:1, folders:['k'], tags:[], created:daysAgo(300), goal:daysAgo(-60)};
  items.s2 = {id:'s2', kind:'sefer', title:'בראשית', author:'', unit:'perek', start:1, end:50, pos:0, folders:['k'], tags:[], created:daysAgo(200)};
  items.p1 = {id:'p1', kind:'podcast', title:'History of Rome', author:'Mike Duncan', unit:'episode', start:1, end:179, pos:0, folders:[], tags:[], created:daysAgo(250)};
  items.w1 = {id:'w1', kind:'book', title:'War and Peace', author:'Leo Tolstoy', isbn:'9780199232765', unit:'page', start:1, end:1296, pos:0, folders:[], tags:['classics'], created:daysAgo(30)};
  // walk each book forward through the year
  const order = ['b0','b1','b2','b3','b4','b5','b6'];
  let cur = 0; let sid = 0;
  for (let n = 330; n >= 0; n--) {
    const d = daysAgo(n); if (rnd() < .22) continue;
    const at = new Date(d + 'T00:00'); at.setHours([7, 13, 20, 21, 22][Math.floor(rnd()*5)], Math.floor(rnd()*60));
    const it = items[order[cur]];
    if (it) { const a = Math.min(it.end - it.pos, 10 + Math.floor(rnd() * 40)); const m = rnd() < .7 ? Math.round(a * (1.4 + rnd())) : null;
      it.pos += a; if (!it.startedAt) it.startedAt = d; sessions.push({id:'x' + sid++, i:it.id, d, t:at.getTime(), a, m, p:it.pos});
      if (rnd() < .08) notes.push({id:'n' + sid, i:it.id, d, t:at.getTime(), p:it.pos, type: rnd() < .5 ? 'quote' : 'note', text: rnd() < .5 ? 'The mystery of life isn’t a problem to solve, but a reality to experience.' : 'Remember to look up the history behind this chapter.'});
      if (it.pos >= it.end) { if (cur < 5) it.finishedAt = d; else it.pos = it.end - 1; cur = Math.min(cur + 1, order.length - 1); } }
    if (rnd() < .5 && items.s1.pos < 40) { items.s1.pos += 1; sessions.push({id:'x' + sid++, i:'s1', d, t:at.getTime() + 3.6e6, a:1, m:30 + Math.floor(rnd()*20), p:items.s1.pos}); }
    if (n < 120 && rnd() < .5 && items.a1.pos < 700) { items.a1.pos += 30; sessions.push({id:'x' + sid++, i:'a1', d, t:at.getTime() - 3.6e6, a:30, m:null, p:items.a1.pos}); }
    if (n > 150 && n < 200 && rnd() < .3) { items.p1.pos += 1; sessions.push({id:'x' + sid++, i:'p1', d, t:at.getTime(), a:1, m:45, p:items.p1.pos}); }
  }
  return {v:3, items, folders, sessions, notes, settings:{skipShabbos:true, timer:null, plans:null, paceOverrides:{}, reminder:{on:false, time:'20:30'}, challenges:{[String(today.getFullYear())]: 12}, challengeKinds:['book','audiobook'], dailyMinutes:30}};
}

const GR = `Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies
1,"Beloved","Toni Morrison","Morrison, Toni",,"=""1400033411""","=""9781400033416""",5,3.9,Vintage,Paperback,324,2004,1987,2022/08/14,2022/07/01,favorites,,read,,,,1,0
2,"Dune","Frank Herbert","Herbert, Frank",,"=""0441013597""","=""9780441013593""",5,4.25,Ace,Paperback,658,2005,1965,2019/01/10,2019/01/01,,,read,,,,1,0
3,"Circe","Madeline Miller","Miller, Madeline",,"=""""","=""""",0,4.3,,Hardcover,393,2018,2018,,2023/01/01,to-read,,to-read,,,,0,0`;

const errors = [];
const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? {} : {});
async function run(scheme){
  const ctx = await browser.newContext({viewport:{width:390, height:844}, deviceScaleFactor:2, colorScheme:scheme, hasTouch:true});
  await ctx.route(/openlibrary\.org|archive\.org/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${scheme}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) errors.push(`[${scheme}] console: ${m.text()}`); });
  await page.addInitScript(d => { if (!localStorage.getItem('shelfmark-data')) localStorage.setItem('shelfmark-data', d); }, JSON.stringify(sample()));
  await page.goto(base);
  await page.waitForSelector('.strip');
  const shot = async name => { await page.waitForTimeout(150); await page.screenshot({path:path.join(shots, `${scheme}-${name}.png`), fullPage:true}); };
  const tab = async t => { await page.click(`nav.tabs button[data-tab=${t}]`); };
  await shot('today');
  await tab('library'); await shot('library-reading');
  await page.click('[data-a=shelf][data-k=read]'); await shot('library-read');
  await page.click('[data-a=layout][data-k=grid]'); await shot('library-grid');
  await page.click('[data-a=lib-view][data-k=folders]'); await page.click('.fcard'); await shot('library-folder');
  await page.click('[data-a=lib-view][data-k=map]'); await shot('library-map');
  await tab('journal'); await page.click('.cday:not(.pad):not(.future)'); await shot('journal-calendar');
  await page.click('[data-a=j-view][data-k=notes]'); await shot('journal-notes');
  await tab('stats'); await shot('stats-overview');
  await page.selectOption('#month-metric', 'pages'); await page.click('[data-a=range][data-n=all]');
  await page.click('[data-a=stat-tab][data-k=books]'); await shot('stats-books');
  await page.selectOption('#stat-year', 'all'); await shot('stats-books-all');
  await page.click('[data-a=stat-tab][data-k=habits]'); await shot('stats-habits');
  await page.click('[data-a=stat-tab][data-k=progress]'); await shot('stats-progress');
  await tab('plan'); await shot('plan');
  // sheets
  await tab('today'); await page.click('.row [data-a=detail]'); await page.waitForSelector('.sheet'); await shot('detail');
  await page.click('.sheet [data-a=rate][data-n="4"]');
  await page.click('.sheet [data-a=close]');
  await page.click('.row [data-a=log]'); await page.fill('#l-note', 'A test quote'); await page.check('input[name=ntype][value=quote]', {force:true}); await shot('log');
  await page.click('#log-form button[type=submit]');
  await page.click('.row [data-a=timer-start]'); await page.waitForSelector('.timerbar'); await page.click('.timerbar [data-a=timer-stop]'); await page.click('#log-form button[type=submit]');
  await tab('library'); await page.click('[data-a=lib-view][data-k=shelves]'); await page.click('[data-a=add]'); await page.fill('#f-title', 'Test Book'); await page.fill('#f-end', '200'); await shot('add');
  await page.click('#item-form button[type=submit]');
  await page.click('[data-a=settings]'); await shot('settings');
  await page.click('.sheet [data-a=challenge]'); await page.fill('#ch-n', '20'); await page.click('#ch-form button[type=submit]');
  await page.setInputFiles('#gr-file', {name:'goodreads_library_export.csv', mimeType:'text/csv', buffer:Buffer.from(GR)});
  await page.waitForSelector('[data-a=do-import-gr]'); await shot('goodreads');
  const btn = await page.textContent('[data-a=do-import-gr]');
  if (!/Import 2 books/.test(btn)) errors.push(`[${scheme}] expected 2 new Goodreads books (Dune is a duplicate), got "${btn}"`);
  await page.click('[data-a=do-import-gr]');
  await tab('journal'); await page.click('[data-a=j-view][data-k=notes]'); await page.click('.note-card'); await shot('note-edit'); await page.click('.sheet [data-a=close]');
  await tab('stats'); await page.click('[data-a=stat-tab][data-k=books]'); await page.selectOption('#stat-year', 'all');
  const n = await page.textContent('.hero-num b');
  if (Number(n) < 7) errors.push(`[${scheme}] all-time finished count looks wrong: ${n}`);
  // data survives a reload
  await page.waitForTimeout(600); await page.reload(); await page.waitForSelector('.strip');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shelfmark-data')));
  if (!Object.values(saved.items).some(i => i.title === 'Test Book')) errors.push(`[${scheme}] added book was not saved`);
  if (!saved.notes.some(x => x.text === 'A test quote' && x.type === 'quote')) errors.push(`[${scheme}] quote from log sheet was not saved`);
  if (saved.settings.challenges[String(today.getFullYear())] !== 20) errors.push(`[${scheme}] challenge goal was not saved`);
  // empty state
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('.empty'); await shot('empty');
  await ctx.close();
}
try { await run('light'); await run('dark'); }
finally { await browser.close(); server.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Smoke test passed. Screenshots in ${path.relative(process.cwd(), shots)}/`);
