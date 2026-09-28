// Open Library metadata lookup (public, CORS-enabled, no key required).
export interface MetaResult {
  key: string;
  title: string;
  subtitle?: string;
  authors: string[];
  isbn?: string;
  pages?: number;
  year?: number;
  publisher?: string;
  coverUrl?: string;
  subjects: string[];
}

const FIELDS = 'key,title,subtitle,author_name,isbn,number_of_pages_median,cover_i,first_publish_year,publisher,subject';

export async function searchBooks(q: string, opts: { subject?: string; limit?: number; signal?: AbortSignal } = {}): Promise<MetaResult[]> {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(opts.limit ?? 12) });
  const isbn = q.replace(/[-\s]/g, '');
  if (/^\d{9}[\dX]$|^\d{13}$/i.test(isbn)) params.set('isbn', isbn);
  else if (q.trim()) params.set('q', q.trim());
  if (opts.subject) params.set('subject', opts.subject);
  const res = await fetch(`https://openlibrary.org/search.json?${params}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`Open Library returned ${res.status}`);
  const data = (await res.json()) as { docs: Record<string, unknown>[] };
  return data.docs.map((d) => ({
    key: String(d.key),
    title: String(d.title ?? 'Untitled'),
    subtitle: d.subtitle as string | undefined,
    authors: (d.author_name as string[] | undefined) ?? [],
    isbn: (d.isbn as string[] | undefined)?.find((x) => x.length === 13) ?? (d.isbn as string[] | undefined)?.[0],
    pages: d.number_of_pages_median as number | undefined,
    year: d.first_publish_year as number | undefined,
    publisher: (d.publisher as string[] | undefined)?.[0],
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
    subjects: ((d.subject as string[] | undefined) ?? []).slice(0, 8),
  }));
}

export async function fetchDescription(workKey: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://openlibrary.org${workKey}.json`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { description?: string | { value: string } };
    const d = typeof data.description === 'string' ? data.description : data.description?.value;
    return d?.replace(/\r/g, '').split(/\n-{3,}|\n\(\[source\]/)[0].trim();
  } catch {
    return undefined;
  }
}
