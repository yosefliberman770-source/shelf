// Unit tests for js/core.js. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(){
  const ctx = vm.createContext({console, Date, Math, JSON, Intl});
  vm.runInContext(fs.readFileSync(new URL('../js/core.js', import.meta.url), 'utf8') + '\n;globalThis.__ = {get state(){return state}, set state(v){state = v}, rebuildIndex, finishes, challengeFor, bookYear, goodreadsItems, parseCSV, migrate, emptyState, shelfOf, streaks, todayK, addDays, pagesByDay, coverSrc};', ctx);
  return ctx.__;
}
const book = (o) => ({id:o.id, kind:'book', title:o.title || o.id, author:'A', unit:'page', start:1, end:300, pos:0, folders:[], tags:[], created:'2025-01-01', ...o});

test('parseCSV handles quotes, commas and newlines inside cells', () => {
  const c = load();
  const rows = c.parseCSV('a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\n');
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [['a','b','c'], ['x, y', 'he said "hi"', 'line1\nline2']]);
});

test('goodreadsItems maps a Goodreads export', () => {
  const c = load();
  const csv = [
    'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
    '1,"Dune","Frank Herbert","Herbert, Frank",,"=""0441013597""","=""9780441013593""",5,4.25,Ace,Paperback,658,2005,1965,2024/03/10,2024/01/02,"scifi, favorites","scifi (#1)",read,"Loved it<br/>Great",,,2,0',
    '2,"Project Hail Mary","Andy Weir","Weir, Andy",,"=""""","=""""",0,4.5,Audible,Audible Audio,,2021,2021,,2024/05/01,,,currently-reading,,,,0,0',
    '3,"Middlemarch","George Eliot","Eliot, George",,,,0,4,,Kindle Edition,880,,1871,,2024/06/01,to-read,,to-read,,,,0,0',
  ].join('\n');
  const items = c.goodreadsItems(csv);
  assert.equal(items.length, 3);
  const [dune, phm, mm] = items;
  assert.equal(dune.isbn, '9780441013593');
  assert.equal(dune.rating, 5);
  assert.equal(dune.end, 658); assert.equal(dune.pos, 658);
  assert.equal(dune.finishedAt, '2024-03-10');
  assert.equal(dune.year, 1965);
  assert.equal(dune.reads.length, 1);
  assert.deepEqual([...dune.tags], ['scifi', 'favorites']);
  assert.equal(dune.review, 'Loved it\nGreat');
  assert.equal(dune.format, 'paper');
  assert.equal(phm.kind, 'audiobook'); assert.equal(phm.unit, 'percent'); assert.equal(phm.status, 'reading'); assert.equal(phm.rating, undefined);
  assert.equal(mm.format, 'ebook'); assert.equal(mm.pos, 0); assert.equal(mm.status, undefined);
  assert.equal(c.goodreadsItems('foo,bar\n1,2'), null);
});

test('migrate turns v2 session notes into journal notes', () => {
  const c = load();
  const v2 = {v:2, items:{a:book({id:'a'})}, folders:{}, sessions:[{id:'s1', i:'a', d:'2025-02-01', t:1, a:10, m:null, n:'nice line', p:10}], settings:{skipShabbos:false}};
  const d = c.migrate(v2);
  assert.equal(d.v, 3);
  assert.equal(d.notes.length, 1);
  assert.equal(d.notes[0].text, 'nice line');
  assert.equal(d.sessions[0].n, undefined);
  assert.equal(d.settings.skipShabbos, false);
  assert.ok(d.settings.challenges);
  assert.equal(c.migrate(null), null);
});

test('finishes, re-reads, shelves and year summaries', () => {
  const c = load();
  const s = c.emptyState();
  s.items = {
    a: book({id:'a', pos:300, finishedAt:'2025-03-01', startedAt:'2025-02-01', rating:4, reads:[{s:'2023-01-01', f:'2023-02-01', r:5}]}),
    b: book({id:'b', end:100, pos:100, finishedAt:'2025-06-10', startedAt:'2025-06-01', rating:3}),
    c: book({id:'c', pos:50}),
    d: book({id:'d'}),
    e: book({id:'e', pos:20, status:'dnf'}),
    f: book({id:'f', pos:300, finishedAt:''}),
  };
  c.state = s; c.rebuildIndex();
  assert.deepEqual(['a','b','c','d','e','f'].map(id => c.shelfOf(s.items[id])), ['read','read','reading','want','dnf','read']);
  assert.equal(c.finishes().length, 4);
  const y = c.bookYear('2025');
  assert.equal(y.n, 2);
  assert.equal(y.pages, 400);
  assert.equal(y.avgRating, 3.5);
  assert.equal(y.shortest.it.id, 'b');
  assert.equal(y.fastest.days, 10);
  assert.equal(c.bookYear('all').n, 4);
  assert.equal(c.bookYear('2023').rereads, 1);
});

test('challenge counts only chosen kinds in the year', () => {
  const c = load();
  const s = c.emptyState(); const yr = c.todayK().slice(0,4);
  s.settings.challenges = {[yr]: 12};
  s.items = {
    a: book({id:'a', pos:300, finishedAt:`${yr}-01-05`}),
    b: {...book({id:'b', pos:300, finishedAt:`${yr}-01-06`}), kind:'sefer'},
  };
  c.state = s; c.rebuildIndex();
  const ch = c.challengeFor(yr);
  assert.equal(ch.goal, 12); assert.equal(ch.n, 1);
});

test('streaks skip Shabbos when asked', () => {
  const c = load();
  const s = c.emptyState(); s.settings.skipShabbos = true;
  s.items = {a: book({id:'a'})};
  // find the most recent Friday before today, then log Thu, Fri, Sun around a Shabbos
  let k = c.addDays(c.todayK(), -7); while (new Date(k + 'T12:00').getDay() !== 5) k = c.addDays(k, -1);
  const days = [c.addDays(k, -1), k, c.addDays(k, 2)];
  s.sessions = days.map((d, i) => ({id:'s' + i, i:'a', d, t:0, a:5, m:null, p:0}));
  c.state = s; c.rebuildIndex();
  assert.equal(c.streaks().best, 3);
  s.settings.skipShabbos = false;
  assert.equal(c.streaks().best, 2);
});

test('pagesByDay only counts page-tracked progress', () => {
  const c = load();
  const s = c.emptyState();
  s.items = {a: book({id:'a'}), b: {...book({id:'b'}), unit:'daf'}};
  s.sessions = [{id:'1', i:'a', d:'2025-01-01', a:20}, {id:'2', i:'b', d:'2025-01-01', a:2}, {id:'3', i:'a', d:'2025-01-02', a:-5}];
  c.state = s; c.rebuildIndex();
  assert.deepEqual({...c.pagesByDay('2025-01-01', '2025-01-31')}, {'2025-01-01': 20});
});

test('coverSrc uses ISBN only for books', () => {
  const c = load();
  assert.match(c.coverSrc(book({id:'a', isbn:'978-0-441-01359-3'})), /isbn\/9780441013593-M\.jpg/);
  assert.equal(c.coverSrc({...book({id:'b', isbn:'9780441013593'}), kind:'sefer'}), null);
  assert.equal(c.coverSrc(book({id:'c', cover:'data:image/jpeg;base64,xx'})), 'data:image/jpeg;base64,xx');
});
