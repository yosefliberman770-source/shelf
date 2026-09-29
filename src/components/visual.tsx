// Visual Explorer: real images from open-access collections, each with its
// source, date, rights and an honest evidence label. Images are looked up
// through the collections' public APIs — never scraped — and nothing
// AI-generated is ever shown here as evidence.
import { useEffect, useRef, useState } from 'react';
import { link, saveMedia } from '../db/actions';
import type { Concept, EvidenceType } from '../db/types';
import { evidenceLabel } from '../lib/entities';
import { IMAGE_PROVIDERS, type ImageResult } from '../lib/images';
import { useUI } from '../state/ui';
import { Icon } from './icons';

const EVIDENCE: EvidenceType[] = ['artifact', 'contemporary', 'archaeological', 'photograph', 'reconstruction', 'modern', 'unclassified'];
const EVIDENCE_TONE: Record<EvidenceType, string> = { artifact: 'good', contemporary: 'good', archaeological: 'good', photograph: 'good', reconstruction: 'warn', modern: 'warn', ai: 'bad', unclassified: '' };

export function EvidenceChip({ e }: { e: EvidenceType }) {
  return <span className={`chip ${EVIDENCE_TONE[e]}`} style={{ minHeight: 22, fontSize: 11 }}>{evidenceLabel(e)}</span>;
}

export function VisualExplorer({ query: initial, concept, itemId }: { query: string; concept?: Concept; itemId?: string }) {
  const { toast } = useUI();
  const [q, setQ] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [provider, setProvider] = useState<'all' | 'met' | 'wikimedia'>('all');
  const [results, setResults] = useState<ImageResult[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState<ImageResult | null>(null);
  const [evidence, setEvidence] = useState<EvidenceType>('unclassified');
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => { setQ(initial); setDraft(initial); }, [initial]);

  useEffect(() => {
    if (!q.trim()) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setResults(null);
    setErrors([]);
    const periodEnd = concept?.end ?? concept?.start;
    const provs = IMAGE_PROVIDERS.filter((p) => provider === 'all' || p.id === provider);
    Promise.allSettled(provs.map((p) => p.search(q, { periodEnd }, c.signal))).then((rs) => {
      if (c.signal.aborted) return;
      const ok = rs.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      // Interleave providers so one collection doesn't bury the other.
      const byP = provs.map((_, i) => (rs[i].status === 'fulfilled' ? (rs[i] as PromiseFulfilledResult<ImageResult[]>).value : []));
      const mixed: ImageResult[] = [];
      for (let i = 0; mixed.length < ok.length; i++) for (const arr of byP) if (arr[i]) mixed.push(arr[i]);
      setResults(mixed);
      setErrors(rs.flatMap((r, i) => (r.status === 'rejected' ? [`${provs[i].name}: ${(r.reason as Error)?.message ?? 'unavailable'}`] : [])));
    });
    return () => c.abort();
  }, [q, provider, concept?.id]);

  const save = async (r: ImageResult) => {
    const id = await saveMedia({ provider: r.provider, objectId: r.objectId, title: r.title, creator: r.creator, date: r.date, description: r.description, institution: r.institution, license: r.license, rights: r.rights, sourceUrl: r.sourceUrl, imageUrl: r.imageUrl, thumbUrl: r.thumbUrl, evidence, conceptIds: concept ? [concept.id] : [], itemIds: itemId ? [itemId] : [] });
    if (concept) await link('media', id, 'concept', concept.id, 'depicts');
    if (itemId) await link('media', id, 'item', itemId, 'illustrates');
    toast('Image saved with its source');
    setOpen(null);
  };

  if (open) {
    const rows: [string, string | undefined][] = [['Creator / culture', open.creator], ['Date', open.date], ['Details', open.description], ['Collection', open.institution], ['License', open.license], ['Rights', open.rights]];
    return (
      <div className="col gap-12">
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setOpen(null)}><Icon name="chevronLeft" />All images</button>
        <img src={open.imageUrl} alt={open.title} style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 12, background: 'var(--surface-2)' }} onError={(e) => { if (open.thumbUrl) (e.target as HTMLImageElement).src = open.thumbUrl; }} />
        <div>
          <div className="book-title" style={{ fontSize: 18 }}>{open.title}</div>
          <div className="row wrap gap-4 mt-8"><EvidenceChip e={open.evidence} /></div>
          <p className="small muted mt-8">{open.evidenceWhy}</p>
        </div>
        <dl className="col" style={{ gap: 6, margin: 0 }}>
          {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="small"><dt className="tiny faint" style={{ fontWeight: 800 }}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
        </dl>
        <a className="btn sm" href={open.sourceUrl} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>View at source ↗</a>
        <div className="card" style={{ padding: 12 }}>
          <label className="small" style={{ fontWeight: 800 }}>What kind of image is this?</label>
          <select className="select sm mt-8" value={evidence} onChange={(e) => setEvidence(e.target.value as EvidenceType)}>
            {EVIDENCE.map((x) => <option key={x} value={x}>{evidenceLabel(x)}</option>)}
          </select>
          <div className="tiny faint mt-8">Suggested from the source’s own data. Change it if you know better.</div>
          <button className="btn primary sm mt-8" onClick={() => save(open)}><Icon name="bookmark" />Save{concept ? ` to ${concept.name}` : ''}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="col gap-12">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); }}>
        <input className="input" style={{ borderRadius: 999 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search museum collections…" aria-label="Search images" />
        <button className="btn icon round primary" aria-label="Search"><Icon name="search" /></button>
      </form>
      <div className="chips-scroll">
        {([['all', 'All collections'], ['met', 'The Met'], ['wikimedia', 'Wikimedia Commons']] as const).map(([id, l]) => <button key={id} className={`chip ${provider === id ? 'on' : ''}`} onClick={() => setProvider(id)}>{l}</button>)}
      </div>
      {!results && <div className="small muted">Searching open collections…</div>}
      {errors.map((e) => <div key={e} className="tiny faint">{e}</div>)}
      {results && !results.length && <div className="small muted">No open-access images found for “{q}”. Try a simpler word, like a place or object name.</div>}
      {results && results.length > 0 && (
        <div className="visual-grid">
          {results.map((r) => (
            <button key={r.objectId} className="visual-cell" onClick={() => { setOpen(r); setEvidence(r.evidence); }}>
              <img src={r.thumbUrl ?? r.imageUrl} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
              <span className="tiny ellipsis" style={{ fontWeight: 700 }}>{r.title}</span>
              <span className="tiny faint ellipsis">{[r.date, r.provider === 'met' ? 'The Met' : 'Commons'].filter(Boolean).join(' · ')}</span>
              <EvidenceChip e={r.evidence} />
            </button>
          ))}
        </div>
      )}
      <div className="tiny faint">Images from The Metropolitan Museum of Art Open Access and Wikimedia Commons, with their original sources. Check each image’s rights before reusing it.</div>
    </div>
  );
}
