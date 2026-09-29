// Image providers for the Visual Explorer. Only open-access collections with
// public APIs that allow browser access. Every result carries provenance, and
// an evidence label that is never guessed beyond what the source says.
import type { EvidenceType } from '../db/types';

export interface ImageResult {
  provider: 'wikimedia' | 'met';
  objectId: string;
  title: string;
  creator?: string;
  date?: string;
  /** Latest year the object was made, when the source says. */
  madeYear?: number;
  description?: string;
  institution?: string;
  license?: string;
  rights?: string;
  sourceUrl: string;
  imageUrl: string;
  thumbUrl?: string;
  evidence: EvidenceType;
  /** Plain-language reason for the evidence label. */
  evidenceWhy: string;
}

export interface ImageProvider {
  id: 'wikimedia' | 'met';
  name: string;
  search(query: string, ctx: { periodEnd?: number }, signal?: AbortSignal): Promise<ImageResult[]>;
}

const strip = (html?: string) => (html ? new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '' : '');

export const wikimediaCommons: ImageProvider = {
  id: 'wikimedia',
  name: 'Wikimedia Commons',
  async search(query, _ctx, signal) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=16&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=420&format=json&origin=*`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(r.status === 429 ? 'Wikimedia is busy — try again in a moment.' : 'Wikimedia Commons is unavailable right now.');
    const j = (await r.json()) as { query?: { pages?: Record<string, { pageid: number; title: string; imageinfo?: { url: string; thumburl?: string; descriptionurl: string; mime?: string; extmetadata?: Record<string, { value: string }> }[] }> } };
    return Object.values(j.query?.pages ?? {})
      .filter((p) => p.imageinfo?.[0] && /^image\/(jpeg|png|webp|gif)/.test(p.imageinfo[0].mime ?? 'image/jpeg'))
      .map((p) => {
        const ii = p.imageinfo![0];
        const m = ii.extmetadata ?? {};
        return {
          provider: 'wikimedia' as const,
          objectId: `commons:${p.pageid}`,
          title: strip(m.ObjectName?.value) || p.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
          creator: strip(m.Artist?.value) || undefined,
          date: strip(m.DateTimeOriginal?.value) || undefined,
          description: strip(m.ImageDescription?.value).slice(0, 400) || undefined,
          institution: strip(m.Credit?.value).slice(0, 160) || 'Wikimedia Commons',
          license: m.LicenseShortName?.value,
          rights: strip(m.UsageTerms?.value) || undefined,
          sourceUrl: ii.descriptionurl,
          imageUrl: ii.url,
          thumbUrl: ii.thumburl,
          evidence: 'unclassified' as EvidenceType,
          evidenceWhy: 'Wikimedia Commons doesn’t say whether this is an original, a photo of an artifact or a later artwork. Check the source before relying on it.',
        };
      });
  },
};

export const metMuseum: ImageProvider = {
  id: 'met',
  name: 'The Metropolitan Museum of Art',
  async search(query, ctx, signal) {
    const s = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`, { signal });
    if (!s.ok) throw new Error('The Met collection is unavailable right now.');
    const ids = ((await s.json()) as { objectIDs?: number[] | null }).objectIDs ?? [];
    const objs = await Promise.all(ids.slice(0, 14).map(async (id) => {
      try {
        const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, { signal });
        return r.ok ? ((await r.json()) as MetObject) : undefined;
      } catch { return undefined; }
    }));
    return objs.filter((o): o is MetObject => !!o && !!o.primaryImageSmall).map((o) => {
      const { evidence, why } = classifyMet(o, ctx.periodEnd);
      return {
        provider: 'met' as const,
        objectId: `met:${o.objectID}`,
        title: o.title || 'Untitled object',
        creator: o.artistDisplayName || o.culture || undefined,
        date: o.objectDate || undefined,
        madeYear: o.objectEndDate,
        description: [o.classification, o.medium, o.period, o.culture].filter(Boolean).join(' · ') || undefined,
        institution: `The Metropolitan Museum of Art${o.department ? ` — ${o.department}` : ''}`,
        license: o.isPublicDomain ? 'Public domain (Open Access)' : 'See source for rights',
        rights: o.creditLine || undefined,
        sourceUrl: o.objectURL,
        imageUrl: o.primaryImage || o.primaryImageSmall!,
        thumbUrl: o.primaryImageSmall,
        evidence,
        evidenceWhy: why,
      };
    });
  },
};

interface MetObject {
  objectID: number; title: string; objectDate: string; objectEndDate?: number; classification?: string; medium?: string; period?: string; culture?: string;
  artistDisplayName?: string; department?: string; creditLine?: string; isPublicDomain?: boolean; objectURL: string; primaryImage?: string; primaryImageSmall?: string;
}

/** Museum objects are real objects; whether they're *from the period* depends on their date. */
function classifyMet(o: MetObject, periodEnd?: number): { evidence: EvidenceType; why: string } {
  const made = o.objectEndDate;
  const kind = (o.classification ?? '').toLowerCase();
  if (periodEnd !== undefined && made !== undefined) {
    if (made <= periodEnd + 100) {
      return /paint|draw|print|mosaic|fresco/.test(kind)
        ? { evidence: 'contemporary', why: `Made ${o.objectDate} — within about a century of the subject.` }
        : { evidence: 'artifact', why: `A surviving object made ${o.objectDate}, from the period.` };
    }
    return { evidence: 'modern', why: `A real museum object, but made ${o.objectDate} — long after the subject, so it’s a later depiction.` };
  }
  return { evidence: 'artifact', why: `A real object in The Met’s collection, made ${o.objectDate || 'at an unknown date'}. Compare that with the period you’re reading about.` };
}

export const IMAGE_PROVIDERS: ImageProvider[] = [metMuseum, wikimediaCommons];
