// Optional sample library so a new user can explore every screen. It is only
// loaded on explicit request, is clearly labelled, and "Erase Everything"
// removes it. Real statistics never mix with invented ones silently.
import { addDays, todayKey } from '../engine/dates';
import { addItem, createFolder, createShelf, link, logProgress, saveConcept, saveGoal, saveProject, setStatus, startReread, updateInstance, updateSettings, addNote } from './actions';
import { db } from './db';

type SeedBook = {
  title: string; authors: string[]; pages: number; year: number; genres: string[]; folders: string[]; status: 'want' | 'reading' | 'read' | 'paused' | 'dnf';
  rating?: number; hist?: [number, number]; isbn?: string; type?: 'audiobook' | 'course' | 'ebook'; readPct?: number; deadlineDays?: number;
};

const BOOKS: SeedBook[] = [
  { title: 'SPQR', authors: ['Mary Beard'], pages: 608, year: 2015, genres: ['History'], folders: ['Rome', 'Republic'], status: 'reading', readPct: 0.54, hist: [-753, 212], isbn: '9781631492228', deadlineDays: 20 },
  { title: 'Rubicon', authors: ['Tom Holland'], pages: 464, year: 2003, genres: ['History'], folders: ['Republic'], status: 'read', rating: 4.5, hist: [-133, -27], isbn: '9781400078974' },
  { title: 'The Storm Before the Storm', authors: ['Mike Duncan'], pages: 352, year: 2017, genres: ['History'], folders: ['Republic'], status: 'read', rating: 4, hist: [-146, -78], isbn: '9781610397216' },
  { title: 'Caesar: Life of a Colossus', authors: ['Adrian Goldsworthy'], pages: 583, year: 2006, genres: ['History', 'Biography'], folders: ['Republic'], status: 'want', hist: [-100, -44], isbn: '9780300126891' },
  { title: 'Dynasty', authors: ['Tom Holland'], pages: 512, year: 2015, genres: ['History'], folders: ['Empire'], status: 'want', hist: [-27, 68], isbn: '9780385537841' },
  { title: 'Meditations', authors: ['Marcus Aurelius'], pages: 254, year: 180, genres: ['Philosophy'], folders: ['Stoicism'], status: 'read', rating: 5, isbn: '9780812968255' },
  { title: 'The Histories', authors: ['Herodotus'], pages: 716, year: -430, genres: ['History', 'Primary source'], folders: ['Greece'], status: 'paused', readPct: 0.22, hist: [-550, -479] },
  { title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], pages: 662, year: 2007, genres: ['Fantasy'], folders: ['Fantasy'], status: 'read', rating: 4.5, isbn: '9780756404741' },
  { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'], pages: 183, year: 1968, genres: ['Fantasy'], folders: ['Fantasy'], status: 'reading', readPct: 0.86, isbn: '9780547773742' },
  { title: 'The Fellowship of the Ring', authors: ['J. R. R. Tolkien'], pages: 432, year: 1954, genres: ['Fantasy'], folders: ['Fantasy'], status: 'want', isbn: '9780547928210' },
  { title: 'Dune', authors: ['Frank Herbert'], pages: 617, year: 1965, genres: ['Science Fiction'], folders: ['Science Fiction'], status: 'read', rating: 4, isbn: '9780441172719' },
  { title: 'Cosmos', authors: ['Carl Sagan'], pages: 396, year: 1980, genres: ['Science'], folders: ['Astronomy'], status: 'dnf', readPct: 0.1, isbn: '9780345539434' },
  { title: 'The Selfish Gene', authors: ['Richard Dawkins'], pages: 360, year: 1976, genres: ['Science'], folders: ['Biology'], status: 'want', isbn: '9780198788607' },
  { title: 'Sapiens', authors: ['Yuval Noah Harari'], pages: 443, year: 2011, genres: ['History', 'Science'], folders: ['History'], status: 'read', rating: 3.5, isbn: '9780062316097' },
  { title: 'Crime and Punishment', authors: ['Fyodor Dostoevsky'], pages: 545, year: 1866, genres: ['Literature'], folders: ['Russian Literature'], status: 'want', isbn: '9780143058144' },
  { title: 'The Guns of August', authors: ['Barbara W. Tuchman'], pages: 511, year: 1962, genres: ['History'], folders: ['Modern History'], status: 'want', hist: [1914, 1914], isbn: '9780345476098' },
  { title: 'The Odyssey (audio)', authors: ['Homer'], pages: 0, year: -700, genres: ['Literature', 'Primary source'], folders: ['Greece'], status: 'reading', type: 'audiobook', readPct: 0.3 },
  { title: 'Roman Architecture — lecture course', authors: ['Open University'], pages: 0, year: 2019, genres: ['History'], folders: ['Rome'], status: 'reading', type: 'course', readPct: 0.4 },
];

const TREE: [string, string | null][] = [
  ['History', null], ['Ancient History', 'History'], ['Greece', 'Ancient History'], ['Rome', 'Ancient History'], ['Republic', 'Rome'], ['Empire', 'Rome'],
  ['Modern History', 'History'], ['Fiction', null], ['Fantasy', 'Fiction'], ['Science Fiction', 'Fiction'], ['Science', null], ['Biology', 'Science'], ['Astronomy', 'Science'],
  ['Philosophy', null], ['Stoicism', 'Philosophy'], ['Literature', null], ['Russian Literature', 'Literature'],
];

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export async function loadSampleLibrary(): Promise<void> {
  const r = rand(42);
  const today = todayKey();
  const folderIds = new Map<string, string>();
  for (const [name, parent] of TREE) folderIds.set(name, await createFolder({ name, parentId: parent ? folderIds.get(parent) : undefined, icon: name === 'History' ? '🏛️' : name === 'Fiction' ? '🐉' : name === 'Science' ? '🔭' : undefined }));
  await db.folders.update(folderIds.get('Republic')!, { goalPace: 25, description: 'The Roman Republic from the Gracchi to Augustus.' });
  const favShelf = await createShelf('Favorites', '♥');

  const ids: Record<string, string> = {};
  let dayOffset = 150;
  for (const b of BOOKS) {
    const isAudio = b.type === 'audiobook';
    const isCourse = b.type === 'course';
    const id = await addItem({
      title: b.title, authors: b.authors, contentType: b.type ?? 'book', unit: isAudio ? 'hours' : isCourse ? 'lessons' : 'pages',
      total: isAudio ? 12 * 60 : isCourse ? 24 : b.pages, pageCount: b.pages || undefined, publishedYear: b.year, genres: b.genres,
      folderIds: b.folders.map((f) => folderIds.get(f)!).filter(Boolean), status: 'want', isbn: b.isbn,
      coverUrl: b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg?default=false` : undefined,
      histStart: b.hist?.[0], histEnd: b.hist?.[1], deadline: b.deadlineDays ? addDays(today, b.deadlineDays) : undefined,
      shelfIds: b.rating === 5 ? [favShelf] : [], favorite: b.rating === 5, source: 'user',
    });
    ids[b.title] = id;
    if (b.status === 'want') continue;
    const total = isAudio ? 12 * 60 : isCourse ? 24 : b.pages;
    const target = b.status === 'read' ? total : Math.round(total * (b.readPct ?? 0.3));
    let pos = 0;
    let day = b.status === 'read' ? dayOffset : Math.min(40, dayOffset);
    dayOffset = Math.max(20, dayOffset - 14);
    while (pos < target && day >= 0) {
      if (r() < 0.78) {
        const hour = r() < 0.6 ? 21 : r() < 0.5 ? 7 : 13;
        const weekend = [0, 6].includes(new Date(`${addDays(today, -day)}T12:00`).getDay());
        const amt = isCourse ? 1 : isAudio ? Math.round(25 + r() * 40) : Math.round((weekend ? 30 : 18) + r() * 22);
        const a = Math.min(amt, target - pos);
        const minutes = isAudio ? a : isCourse ? 35 : Math.round(a * (1.6 + r() * 0.8));
        const date = addDays(today, -day);
        const started = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(Math.floor(r() * 50)).padStart(2, '0')}:00`).getTime();
        await logProgress({ itemId: id, amount: a, date, durationSec: r() < 0.85 ? minutes * 60 : undefined, startedAt: started });
        pos += a;
      }
      day -= 1;
    }
    const inst = (await db.instances.where('itemId').equals(id).toArray())[0];
    if (b.status === 'read') await updateInstance(inst.id, { rating: b.rating });
    else if (b.status !== 'reading') await setStatus(id, b.status);
  }
  // A reread of Meditations keeps both reading histories.
  const medId = ids['Meditations'];
  await startReread(medId);
  for (let d = 12; d >= 1; d -= 2) await logProgress({ itemId: medId, amount: 12, date: addDays(today, -d), durationSec: 20 * 60 });

  const quotes: [string, string, number, 'note' | 'quote'][] = [
    ['SPQR', 'Rome was not built in a day — and its history cannot be told as a single story of rise and fall.', 40, 'note'],
    ['SPQR', 'The Senate and People of Rome.', 12, 'quote'],
    ['Rubicon', 'The Republic’s institutions assumed competition within limits; the late Republic is the story of those limits dissolving.', 210, 'note'],
    ['Meditations', 'You have power over your mind — not outside events. Realize this, and you will find strength.', 42, 'quote'],
    ['Meditations', 'The impediment to action advances action. What stands in the way becomes the way.', 67, 'quote'],
    ['The Name of the Wind', 'Words are pale shadows of forgotten names.', 158, 'quote'],
    ['The Storm Before the Storm', 'Marius’s reforms made armies loyal to generals rather than the state — a key precondition for civil war.', 120, 'note'],
  ];
  for (const [t, text, page, kind] of quotes) await addNote({ itemId: ids[t], kind, text, page, tags: kind === 'note' ? ['argument'] : [] });

  const senate = await saveConcept({ name: 'Roman Senate', kind: 'concept', description: 'Governing council of the Roman Republic.' });
  const caesar = await saveConcept({ name: 'Julius Caesar', kind: 'person', start: -100, end: -44 });
  const marius = await saveConcept({ name: 'Gaius Marius', kind: 'person', start: -157, end: -86 });
  const rubicon = await saveConcept({ name: 'Caesar crosses the Rubicon', kind: 'event', start: -49 });
  const republic = await saveConcept({ name: 'Roman Republic', kind: 'period', start: -509, end: -27 });
  const stoicism = await saveConcept({ name: 'Stoicism', kind: 'subject' });
  for (const [c, t] of [[senate, 'SPQR'], [caesar, 'Rubicon'], [marius, 'The Storm Before the Storm'], [republic, 'SPQR'], [republic, 'Rubicon'], [caesar, 'Caesar: Life of a Colossus'], [stoicism, 'Meditations'], [rubicon, 'Rubicon']] as const)
    await link('concept', c, 'item', ids[t]);
  await link('concept', caesar, 'concept', rubicon, 'took part in');
  await link('concept', marius, 'concept', republic, 'figure of');
  await link('concept', senate, 'concept', republic, 'institution of');

  await saveProject({ name: 'Roman Republic Project', description: 'From the Gracchi to Augustus.', itemIds: [ids['SPQR'], ids['Rubicon'], ids['The Storm Before the Storm'], ids['Caesar: Life of a Colossus'], ids['Dynasty']], deadline: addDays(today, 75), pace: 30 });
  await saveGoal({ period: 'daily', metric: 'pages', target: 30 });
  await saveGoal({ period: 'annual', metric: 'books', target: 24, year: Number(today.slice(0, 4)) });
  await updateSettings({ onboarded: true, sampleData: true });
}
