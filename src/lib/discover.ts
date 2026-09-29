// Discovery pathways from real catalogue data. Each direction is a plain
// Open Library search, and every book shown carries the reason it appeared
// (which catalogue subject or publisher matched) — nothing is ranked "best".
export interface Direction {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  /** Open Library subject facet, or a publisher filter. */
  subject?: string;
  publisher?: string;
  sort?: 'editions' | 'new' | 'old';
  reason: (topic: string) => string;
}

export const DIRECTIONS: Direction[] = [
  { id: 'overview', label: 'Start here', icon: '🧭', blurb: 'The most widely published books — often the classic overviews.', sort: 'editions', reason: (t) => `Among the most-published books about “${t}” in Open Library` },
  { id: 'academic', label: 'Academic', icon: '🎓', blurb: 'Scholarly work from university presses.', publisher: 'university press', reason: (t) => `About “${t}”, published by a university press` },
  { id: 'primary', label: 'Primary sources', icon: '📜', blurb: 'Writing from the time itself, in translation.', subject: 'Sources', reason: (t) => `Catalogued as “Sources” for “${t}”` },
  { id: 'early', label: 'Ancient & early texts', icon: '🏺', blurb: 'Works written before 1800.', subject: 'Early works to 1800', reason: (t) => `Catalogued as “Early works to 1800” on “${t}”` },
  { id: 'biography', label: 'Biography', icon: '👤', blurb: 'Lives of the people involved.', subject: 'Biography', reason: (t) => `Catalogued as “Biography” and about “${t}”` },
  { id: 'military', label: 'Military', icon: '⚔️', blurb: 'Armies, wars and campaigns.', subject: 'Military history', reason: (t) => `Catalogued as “Military history” on “${t}”` },
  { id: 'political', label: 'Political', icon: '🏛', blurb: 'Power, government and institutions.', subject: 'Politics and government', reason: (t) => `Catalogued as “Politics and government” on “${t}”` },
  { id: 'social', label: 'Social', icon: '👥', blurb: 'Everyday life, customs and ordinary people.', subject: 'Social life and customs', reason: (t) => `Catalogued as “Social life and customs” on “${t}”` },
  { id: 'economic', label: 'Economic', icon: '🪙', blurb: 'Trade, money and work.', subject: 'Economic conditions', reason: (t) => `Catalogued as “Economic conditions” on “${t}”` },
  { id: 'cultural', label: 'Culture & ideas', icon: '🎭', blurb: 'Art, religion, literature and thought.', subject: 'Intellectual life', reason: (t) => `Catalogued as “Intellectual life” on “${t}”` },
  { id: 'archaeology', label: 'Archaeology', icon: '⛏', blurb: 'What the ground and objects tell us.', subject: 'Antiquities', reason: (t) => `Catalogued as “Antiquities” on “${t}”` },
  { id: 'historiography', label: 'How historians argue', icon: '🗣', blurb: 'Historiography: how the story has been told and disputed.', subject: 'Historiography', reason: (t) => `Catalogued as “Historiography” on “${t}”` },
  { id: 'fiction', label: 'Historical fiction', icon: '📖', blurb: 'Novels set in the world you’re exploring.', subject: 'Fiction', reason: (t) => `Fiction catalogued under “${t}”` },
  { id: 'recent', label: 'Newest', icon: '✨', blurb: 'Recently published books.', sort: 'new', reason: (t) => `Recently published, about “${t}”` },
];

export interface CatalogBook {
  key: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: number;
  subjects: string[];
  why: string;
}

const cache = new Map<string, Promise<CatalogBook[]>>();

export function searchDirection(topic: string, d: Direction, limit = 10, signal?: AbortSignal): Promise<CatalogBook[]> {
  const k = `${topic}|${d.id}|${limit}`;
  if (!cache.has(k)) {
    const q = d.publisher ? `${topic} publisher:"${d.publisher}"` : topic;
    const params = new URLSearchParams({ q, fields: 'key,title,author_name,first_publish_year,cover_i,subject', limit: String(limit) });
    if (d.subject) params.set('subject', d.subject);
    if (d.sort) params.set('sort', d.sort);
    const p = fetch(`https://openlibrary.org/search.json?${params}`, { signal })
      .then((r) => { if (!r.ok) throw new Error('Open Library is unavailable'); return r.json(); })
      .then((j: { docs: { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; subject?: string[] }[] }) =>
        j.docs.filter((x) => x.title).map((x) => ({ key: x.key, title: x.title, authors: x.author_name?.slice(0, 2) ?? [], year: x.first_publish_year, cover: x.cover_i, subjects: (x.subject ?? []).slice(0, 12), why: d.reason(topic) })))
      .catch((e) => { cache.delete(k); throw e; });
    cache.set(k, p);
  }
  return cache.get(k)!;
}

/** Check an AI-suggested title exists in the catalogue (returns the match). */
export async function verifyBook(title: string, author?: string, signal?: AbortSignal): Promise<CatalogBook | undefined> {
  const params = new URLSearchParams({ title, fields: 'key,title,author_name,first_publish_year,cover_i,subject', limit: '3' });
  if (author) params.set('author', author);
  const r = await fetch(`https://openlibrary.org/search.json?${params}`, { signal });
  if (!r.ok) return undefined;
  const j = (await r.json()) as { docs: { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; subject?: string[] }[] };
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit = j.docs.find((x) => norm(x.title).startsWith(norm(title).slice(0, 18))) ?? j.docs[0];
  return hit ? { key: hit.key, title: hit.title, authors: hit.author_name ?? [], year: hit.first_publish_year, cover: hit.cover_i, subjects: hit.subject?.slice(0, 12) ?? [], why: 'Found in Open Library' } : undefined;
}

export const coverUrl = (id?: number, size: 'S' | 'M' = 'M') => (id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : undefined);

/** Starting points for people who don't know where to begin. */
export const PERIODS: { label: string; topic: string; years: string }[] = [
  { label: 'Ancient Egypt', topic: 'Ancient Egypt', years: 'c. 3100–30 BC' },
  { label: 'Classical Greece', topic: 'Greece history', years: 'c. 500–323 BC' },
  { label: 'Roman Republic', topic: 'Roman Republic', years: '509–27 BC' },
  { label: 'Roman Empire', topic: 'Roman Empire', years: '27 BC–AD 476' },
  { label: 'Byzantium', topic: 'Byzantine Empire', years: 'AD 330–1453' },
  { label: 'Early Islamic world', topic: 'Islamic Empire', years: 'c. AD 610–1258' },
  { label: 'Vikings', topic: 'Vikings', years: 'c. AD 793–1066' },
  { label: 'Medieval Europe', topic: 'Middle Ages', years: 'c. AD 500–1500' },
  { label: 'Mongol Empire', topic: 'Mongols', years: 'AD 1206–1368' },
  { label: 'Renaissance', topic: 'Renaissance', years: 'c. 1400–1600' },
  { label: 'Age of Exploration', topic: 'Discoveries in geography', years: 'c. 1400–1600' },
  { label: 'Reformation', topic: 'Reformation', years: '1517–1648' },
  { label: 'Enlightenment', topic: 'Enlightenment', years: 'c. 1680–1800' },
  { label: 'French Revolution', topic: 'French Revolution', years: '1789–1799' },
  { label: 'American Civil War', topic: 'American Civil War', years: '1861–1865' },
  { label: 'World War I', topic: 'World War, 1914-1918', years: '1914–1918' },
  { label: 'World War II', topic: 'World War, 1939-1945', years: '1939–1945' },
  { label: 'Cold War', topic: 'Cold War', years: '1947–1991' },
];

export const QUESTIONS = [
  'Why did the Roman Republic fall?',
  'How did ordinary people live in medieval Europe?',
  'What caused the First World War?',
  'How did the printing press change the world?',
  'Why did the Bronze Age collapse?',
  'How did empires feed their cities?',
];
