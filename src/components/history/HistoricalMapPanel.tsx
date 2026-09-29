// The historical map panel: the layered Historical Atlas (or, on phones
// without WebGL, OpenHistoricalMap) centred on a place from the book, at the
// year being read about. Full screen on phones, a side panel on
// larger screens. Everything here fails gently — if a lookup or the map is
// unavailable, the reader is untouched.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AtlasMap, type AtlasPin, webglAvailable } from '../../atlas/AtlasMap';
import type { Item } from '../../db/types';
import { addYears, formatHistoricalDate, parseHistoricalDate, toOhmYear } from '../../lib/history/dates';
import { formatCoords, mapViewFor, type MapView, unionBBox, zoomForBBox } from '../../lib/history/geometry';
import { openHistoricalMap } from '../../lib/history/mapProviders';
import { DATE_SOURCE_LABEL, type DateContext, dateContextFor, detectPlaces, saveBookDate } from '../../lib/history/placeDetect';
import { historicalPlaces } from '../../lib/history/placeService';
import { CONFIDENCE_LABEL, type HistoricalPlace, type PlaceCandidate, type PlaceQuery, type PlaceResolution } from '../../lib/history/types';
import { Icon } from '../icons';

export interface MapRequest {
  /** Name as written in the book (omit for "map this chapter"). */
  name?: string;
  passage?: string;
  mentionIndex?: number;
  mode?: 'place' | 'chapter';
}

export interface MapBook { bookId: string; title: string; chapter?: string; item?: Pick<Item, 'histStart' | 'histEnd'> }

const FOLLOW_KEY = 'shelf.followBook';
const PRECISION: Record<HistoricalPlace['locationPrecision'], string> = {
  exact: 'Location', approximate: 'Approximate location', extent: 'Historical extent (an area, centre shown)', uncertain: 'Uncertain location', unknown: 'Location not recorded',
};

export function HistoricalMapPanel({ request, book, chapterText, pagePlaces, date, setDate, wide, onClose }: {
  request: MapRequest;
  book: MapBook;
  chapterText: () => string;
  /** Places on the current page (for "Follow the book"). */
  pagePlaces: { name: string; passage: string }[];
  /** The year shown — kept by the reader so it survives moving between places. */
  date: DateContext | null;
  setDate: (d: DateContext) => void;
  wide: boolean;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<MapRequest>(request);
  useEffect(() => setTarget(request), [request]);
  const nearby = useMemo(() => pagePlaces.map((p) => p.name), [pagePlaces]);

  // The year: keep the reader's current one; otherwise work it out from context.
  useEffect(() => {
    if (date) return;
    setDate(dateContextFor({ bookId: book.bookId, item: book.item, passage: target.passage, mentionIndex: target.mentionIndex, chapterText: chapterText() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const year = date?.year;

  // ── Resolve the place ──
  const [res, setRes] = useState<PlaceResolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const query: PlaceQuery | undefined = target.name ? { name: target.name, date: year, surroundingText: target.passage?.slice(0, 1200), chapterTitle: book.chapter, bookTitle: book.title, nearbyPlaceNames: nearby.slice(0, 10), language: 'en', bookId: book.bookId } : undefined;
  useEffect(() => {
    if (!query || target.mode === 'chapter') return;
    const c = new AbortController();
    setLoading(true);
    setRes(null);
    historicalPlaces.resolvePlaceName(query, { signal: c.signal, refresh: retry > 0 })
      .then((r) => !c.signal.aborted && setRes(r))
      .catch((e) => { if (!c.signal.aborted && (e as Error).name !== 'AbortError') setRes({ status: 'UNRESOLVED', candidates: [], provider: '', error: 'Historical place lookup unavailable. Try again.' }); })
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
    // Re-resolve for a new name, or when the century changes (dates help disambiguate).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.name, target.mode, retry, year === undefined ? 'none' : Math.ceil(year / 100)]);

  const place = res?.place;

  // ── Follow the book (only when the reader turns it on) ──
  const [follow, setFollow] = useState(() => { try { return localStorage.getItem(FOLLOW_KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0'); } catch { /* ignore */ } }, [follow]);
  useEffect(() => {
    if (!follow || !pagePlaces.length || target.mode === 'chapter') return;
    const next = pagePlaces.find((p) => p.name.toLowerCase() !== target.name?.toLowerCase());
    if (!next || pagePlaces.some((p) => p.name.toLowerCase() === target.name?.toLowerCase())) return;
    const t = setTimeout(() => setTarget({ name: next.name, passage: next.passage, mode: 'place' }), 700);
    return () => clearTimeout(t);
  }, [follow, pagePlaces, target.name, target.mode]);

  // ── Map ──
  const [chapterView, setChapterView] = useState<MapView | undefined>();
  const view = target.mode === 'chapter' ? chapterView : place ? mapViewFor(place) : undefined;
  const [animate, setAnimate] = useState<{ to: number; step: number } | null>(null);
  const [layer, setLayer] = useState('O');
  const fullSrc = view ? openHistoricalMap.embedUrl(view, year, { layer, ...(animate && year !== undefined ? { animateTo: animate.to, stepYears: animate.step, framerate: 2 } : {}) }) : undefined;
  // A new place loads a fresh map there. Changing only the year or style
  // updates the map in place — without map= so wherever you've panned or zoomed
  // to is kept, and with location.replace() so it never adds entries to the
  // phone's back history.
  const viewKey = view ? `${view.lat},${view.lon},${view.zoom}` : 'none';
  const frameRef = useRef<HTMLIFrameElement>(null);
  const initial = useRef<{ key: string; src?: string }>({ key: '' });
  if (initial.current.key !== viewKey) initial.current = { key: viewKey, src: fullSrc };
  const src = initial.current.src;
  useEffect(() => {
    if (!fullSrc || fullSrc === initial.current.src) return;
    const next = fullSrc.replace(/map=[^&]*&?/, '').replace(/bbox=[^&]*&?/, '');
    try { frameRef.current?.contentWindow?.location.replace(next); } catch { /* map not loaded yet */ }
  }, [fullSrc]);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  // The layered atlas needs WebGL; without it the OpenHistoricalMap view is used.
  const [atlas] = useState(webglAvailable);
  const [pins, setPins] = useState<AtlasPin[]>([]);
  const focus = place?.latitude !== undefined && target.mode !== 'chapter'
    ? { name: place.canonicalName, lat: place.latitude, lon: place.longitude!, approximate: place.locationPrecision !== 'exact' }
    : undefined;
  const marks = useMemo(() => [
    ...(book.item?.histStart !== undefined ? [{ year: book.item.histStart, label: 'Book’s period begins' }] : []),
    ...(book.item?.histEnd !== undefined ? [{ year: book.item.histEnd, label: 'Book’s period ends' }] : []),
  ], [book.item?.histStart, book.item?.histEnd]);

  const setYear = (y: number | undefined, approximate?: boolean) => {
    setAnimate(null);
    if (y === undefined || y === 0) return;
    setDate({ year: y, approximate, source: 'yours' });
  };

  return (
    <div className={`hmap ${wide ? 'side' : 'full'}`} role="dialog" aria-label="Historical map">
      <div className="hmap-head">
        <button className="btn sm ghost" onClick={onClose}><Icon name="chevronLeft" />Back to book</button>
        <span className="eyebrow" style={{ margin: 0 }}>Historical map</span>
        <span style={{ width: 60 }} />
      </div>
      <div className="hmap-body">
        {/* The map */}
        {online && atlas && (
          <AtlasMap view={view} year={year ?? book.item?.histStart ?? 1} onYearChange={(y) => setYear(y)} focus={focus} pins={target.mode === 'chapter' ? pins : undefined} marks={marks} />
        )}
        {!(online && atlas) && <div className="hmap-frame">
          {!online ? <div className="hmap-empty">You’re offline, so the historical map can’t load. The book still works normally.</div>
            : atlas ? null
            : src ? <iframe ref={frameRef} key={viewKey} src={src} title={`OpenHistoricalMap: ${place?.canonicalName ?? 'map'}${year ? `, ${formatHistoricalDate(year)}` : ''}`} referrerPolicy="no-referrer-when-downgrade" allow="fullscreen" />
            : <div className="hmap-empty">{loading ? 'Finding the place…' : target.mode === 'chapter' ? 'Mapping this chapter…' : res?.status === 'AMBIGUOUS' ? 'Choose a location below.' : res ? 'No map location for this place.' : ''}</div>}
        </div>}

        {/* Date controls */}
        <DateControls compact={online && atlas} year={year} approximate={date?.approximate} source={date?.source ?? 'none'} onChange={setYear} item={book.item}
          animate={animate} onAnimate={(a) => setAnimate(a)} onClearMine={() => { saveBookDate(book.bookId, undefined); setDate(dateContextFor({ bookId: book.bookId, item: book.item, passage: target.passage, chapterText: chapterText() })); }}
          onRemember={() => { if (year !== undefined) saveBookDate(book.bookId, year); }} />

        {target.mode === 'chapter'
          ? <ChapterPlaces book={book} chapterText={chapterText} year={year} pinned={online && atlas} onView={setChapterView} onPins={setPins} onPick={(name) => setTarget({ name, mode: 'place', passage: undefined })} />
          : <PlaceInfo name={target.name ?? ''} res={res} loading={loading} year={year} query={query} onRetry={() => setRetry((n) => n + 1)} onResolved={setRes} />}

        {(src || (atlas && view)) && (
          <div className="row wrap gap-8">
            {view && <a className="btn sm" href={openHistoricalMap.fullMapUrl(view, year)} target="_blank" rel="noreferrer"><Icon name="map" />{atlas ? 'OpenHistoricalMap ↗' : 'Open full map ↗'}</a>}
            {!atlas && <select className="select sm" style={{ width: 'auto' }} value={layer} onChange={(e) => setLayer(e.target.value)} aria-label="Map style">
              {openHistoricalMap.layers.map((l) => <option key={l.id} value={l.id}>{l.label} style</option>)}
            </select>}
            {target.mode !== 'chapter' && <button className="btn sm" onClick={() => setTarget({ mode: 'chapter' })}>🗺 Map places in this chapter</button>}
          </div>
        )}
        <label className="row between small" style={{ padding: '4px 0' }}>
          <span><b>Follow the book</b><br /><span className="tiny faint">Move the map to places on each new page as you read.</span></span>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        </label>
        <Sources place={place} atlas={online && atlas} />
      </div>
    </div>
  );
}

// ── Date controls ─────────────────────────────────────────────────────

function DateControls({ compact, year, approximate, source, onChange, item, animate, onAnimate, onRemember, onClearMine }: {
  /** The atlas has its own timeline, so only the date's source and "go to a year" are shown. */
  compact?: boolean;
  year?: number; approximate?: boolean; source: DateContext['source']; onChange: (y: number | undefined, approx?: boolean) => void; item?: MapBook['item'];
  animate: { to: number; step: number } | null; onAnimate: (a: { to: number; step: number } | null) => void; onRemember: () => void; onClearMine: () => void;
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    const d = parseHistoricalDate(text);
    if (!d) { setErr('Try a year like “218 BC”, “AD 43” or “1453”.'); return; }
    setErr('');
    setText('');
    onChange(d.year, d.approximate);
  };
  // Slider works in ISO years (with a year 0) so it can move smoothly across 1 BCE → 1 CE.
  const iso = year !== undefined ? toOhmYear(year) : 0;
  const lo = Math.max(-3000, iso - 500);
  const hi = Math.min(new Date().getFullYear(), iso + 500);
  const fromIso = (v: number) => (v <= 0 ? v - 1 : v);
  if (year === undefined) {
    return (
      <div className="card tight">
        <b>Historical date unknown</b>
        <div className="small muted mt-8">Select a historical date to see the map for a specific point in time.</div>
        <form className="row mt-8" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input className="input sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 218 BC" aria-label="Historical date" />
          <button className="btn sm primary" disabled={!text.trim()}>Set</button>
        </form>
        {err && <div className="tiny" style={{ color: 'var(--bad)' }}>{err}</div>}
        {item?.histStart !== undefined && <button className="btn xs mt-8" onClick={() => onChange(item.histStart!)}>Use this book’s period ({formatHistoricalDate(item.histStart)})</button>}
      </div>
    );
  }
  if (compact) return (
    <div className="card tight hmap-date">
      <div className="tiny faint">{formatHistoricalDate(year, { approximate })} · {DATE_SOURCE_LABEL[source]}{source === 'yours' ? <> · <button className="why-link" onClick={onClearMine}>use the book’s dates</button></> : <> · <button className="why-link" onClick={onRemember}>keep for this book</button></>}</div>
      <form className="row mt-8" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="input sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Go to a year, e.g. 216 BC" aria-label="Go to year" />
        <button className="btn sm" disabled={!text.trim()}>Go</button>
      </form>
      {err && <div className="tiny" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  );
  return (
    <div className="card tight hmap-date">
      <div className="row between">
        <div>
          <div className="hmap-year">{formatHistoricalDate(year, { approximate })}</div>
          <div className="tiny faint">{DATE_SOURCE_LABEL[source]}{source === 'yours' ? <> · <button className="why-link" onClick={onClearMine}>use the book’s dates</button></> : <> · <button className="why-link" onClick={onRemember}>keep for this book</button></>}</div>
        </div>
        <button className={`btn sm ${animate ? 'accent' : ''}`} onClick={() => onAnimate(animate ? null : { to: addYears(year, 100), step: 1 })} title="Animate year by year">{animate ? '■ Stop' : '▶ Play'}</button>
      </div>
      <div className="row mt-8" style={{ gap: 4 }}>
        <button className="btn xs" onClick={() => onChange(addYears(year, -10))} aria-label="10 years earlier">«</button>
        <button className="btn xs" onClick={() => onChange(addYears(year, -1))} aria-label="1 year earlier">‹</button>
        <input type="range" min={lo} max={hi} step={1} value={iso} onChange={(e) => onChange(fromIso(Number(e.target.value)))} aria-label="Move through time" style={{ flex: 1, minWidth: 0, accentColor: 'var(--accent)' }} />
        <button className="btn xs" onClick={() => onChange(addYears(year, 1))} aria-label="1 year later">›</button>
        <button className="btn xs" onClick={() => onChange(addYears(year, 10))} aria-label="10 years later">»</button>
      </div>
      {animate && <div className="tiny faint mt-8">Playing {formatHistoricalDate(year)} → {formatHistoricalDate(animate.to)}, one year per step.</div>}
      <form className="row mt-8" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="input sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Go to a year, e.g. 216 BC" aria-label="Go to year" />
        <button className="btn sm" disabled={!text.trim()}>Go</button>
      </form>
      {err && <div className="tiny" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  );
}

// ── Place details, ambiguity and search ──────────────────────────────

function PlaceInfo({ name, res, loading, year, query, onRetry, onResolved }: { name: string; res: PlaceResolution | null; loading: boolean; year?: number; query?: PlaceQuery; onRetry: () => void; onResolved: (r: PlaceResolution) => void }) {
  const [context, setContext] = useState<{ polities: string[]; source?: string } | null>(null);
  const [searching, setSearching] = useState<PlaceCandidate[] | null>(null);
  const [q, setQ] = useState(name);
  const place = res?.place;
  useEffect(() => {
    setContext(null);
    if (!place || year === undefined) return;
    const c = new AbortController();
    historicalPlaces.getHistoricalContext(place, year, c.signal).then((x) => !c.signal.aborted && setContext(x));
    return () => c.abort();
  }, [place?.id, year]);

  const choose = async (p: HistoricalPlace) => { if (query) onResolved(await historicalPlaces.choosePlace(query, p)); setSearching(null); };

  if (loading) return <div className="small muted">Looking up “{name}”…</div>;
  if (!res) return null;
  if (res.error) return (
    <div className="card tight">
      <b>{name}</b>
      <div className="small muted mt-8">{res.error}</div>
      <button className="btn sm mt-8" onClick={onRetry}><Icon name="refresh" />Try again</button>
    </div>
  );

  const candidateList = (list: PlaceCandidate[]) => (
    <div className="col" style={{ gap: 6 }}>
      {list.map((c, i) => (
        <button key={c.place.id} className="rabbit-node" onClick={() => choose(c.place)}>
          <span style={{ minWidth: 0 }}>
            <b>{i + 1}. {c.place.canonicalName}</b>
            <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>{[c.place.description, c.place.countryCodes.filter((cc) => !(c.place.description ?? '').includes(cc)).join(', '), c.place.latitude !== undefined ? formatCoords(c.place.latitude, c.place.longitude!) : 'no location'].filter(Boolean).join(' · ')}</span>
            <span className="tiny faint" style={{ display: 'block', fontWeight: 400 }}>{c.place.attribution.map((a) => a.source).join(' · ')}</span>
          </span>
          <Icon name="chevronRight" className="faint" />
        </button>
      ))}
    </div>
  );

  if (res.status === 'AMBIGUOUS' && !place) return (
    <div className="card tight">
      <b>Which {name}?</b>
      <div className="small muted mb-8">{CONFIDENCE_LABEL.AMBIGUOUS}. Choose a location — your choice is remembered for this book.</div>
      {candidateList(res.candidates)}
    </div>
  );

  if (!place) return (
    <div className="card tight">
      <b>{name}</b>
      <div className="small muted mt-8">{CONFIDENCE_LABEL.UNRESOLVED}. {res.reason ?? ''}</div>
      {res.candidates.length > 0 && <><div className="small mt-8">Did you mean one of these?</div>{candidateList(res.candidates)}</>}
      <SearchBox q={q} setQ={setQ} onResults={setSearching} />
      {searching && candidateList(searching)}
    </div>
  );

  const alts = place.alternativeNames.filter((a) => a.toLowerCase() !== place.canonicalName.toLowerCase()).slice(0, 8);
  const lived = place.historicalStartYear !== undefined || place.historicalEndYear !== undefined;
  return (
    <div className="card tight hmap-info">
      <div className="book-title" style={{ fontSize: 22 }}>{place.canonicalName}</div>
      {name && name.toLowerCase() !== place.canonicalName.toLowerCase() && <div className="small muted">“{name}” in the book</div>}
      {year !== undefined && <div className="small" style={{ fontWeight: 800 }}>{formatHistoricalDate(year)}{context?.polities.length ? ` · ${context.polities.join(' / ')}` : ''}</div>}
      <div className="row wrap gap-4 mt-8">
        <span className={`chip ${res.status === 'HIGH' ? 'good' : res.status === 'LOW' ? 'warn' : ''}`} style={{ minHeight: 22, fontSize: 11 }}>{res.userChosen ? 'Your choice' : CONFIDENCE_LABEL[res.status]}</span>
        {place.placeType && <span className="chip" style={{ minHeight: 22, fontSize: 11 }}>{place.placeType}</span>}
      </div>
      {res.reason && !res.userChosen && <div className="tiny faint mt-8">{res.reason}</div>}
      <dl className="hmap-facts">
        {alts.length > 0 && <><dt>Also known as</dt><dd>{alts.join(' · ')}</dd></>}
        {place.latitude !== undefined && <><dt>{PRECISION[place.locationPrecision]}</dt><dd>{formatCoords(place.latitude, place.longitude!)}</dd></>}
        {lived && <><dt>Recorded dates</dt><dd>{place.historicalStartYear !== undefined ? `from ${formatHistoricalDate(place.historicalStartYear)}` : ''}{place.historicalEndYear !== undefined ? ` until ${formatHistoricalDate(place.historicalEndYear)}` : ''}</dd></>}
        {context?.polities.length ? <><dt>Historical context</dt><dd>{context.polities.join(' / ')} <span className="tiny faint">({context.source})</span></dd></> : null}
        <dt>Source</dt><dd>{place.url ? <a href={place.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{place.source}</a> : place.source}</dd>
      </dl>
      {place.locationPrecision !== 'exact' && <div className="tiny faint">Ancient locations and borders are often approximate or disputed; the map shows the best available record, not a certainty.</div>}
      <details className="mt-8">
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Not the right place?</summary>
        {res.candidates.filter((c) => c.place.id !== place.id).length > 0 && <div className="mt-8">{candidateList(res.candidates.filter((c) => c.place.id !== place.id))}</div>}
        <SearchBox q={q} setQ={setQ} onResults={setSearching} />
        {searching && candidateList(searching)}
      </details>
    </div>
  );
}

function SearchBox({ q, setQ, onResults }: { q: string; setQ: (s: string) => void; onResults: (c: PlaceCandidate[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form className="row mt-8" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { onResults(await historicalPlaces.searchPlaces(q.trim())); } catch { setErr('Historical place lookup unavailable. Try again.'); } finally { setBusy(false); } }}>
      <input className="input sm" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search for a place" />
      <button className="btn sm" disabled={busy || !q.trim()}>{busy ? '…' : 'Search'}</button>
      {err && <span className="tiny faint">{err}</span>}
    </form>
  );
}

// ── Map this chapter ──────────────────────────────────────────────────

function ChapterPlaces({ book, chapterText, year, pinned, onView, onPins, onPick }: { book: MapBook; chapterText: () => string; year?: number; pinned: boolean; onView: (v: MapView | undefined) => void; onPins: (p: AtlasPin[]) => void; onPick: (name: string) => void }) {
  const [rows, setRows] = useState<{ name: string; res?: PlaceResolution }[] | null>(null);
  const [err, setErr] = useState('');
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const text = chapterText();
    const names = detectPlaces(text).slice(0, 40).map((p) => p.name);
    setRows(names.map((name) => ({ name })));
    if (!names.length) return;
    const c = new AbortController();
    historicalPlaces.resolveMany(names.map((name) => ({ name, date: year, bookId: book.bookId, bookTitle: book.title, chapterTitle: book.chapter, nearbyPlaceNames: names.slice(0, 10) })), c.signal)
      .then((rs) => {
        const out = names.map((name, i) => ({ name, res: rs[i] }));
        setRows(out);
        if (rs.every((r) => r.error)) setErr('Historical place lookup unavailable. Try again.');
        const boxes = out.flatMap((r) => (r.res?.place && (r.res.status === 'HIGH' || r.res.status === 'MEDIUM') && r.res.place.latitude !== undefined ? [[r.res.place.longitude!, r.res.place.latitude!, r.res.place.longitude!, r.res.place.latitude!] as [number, number, number, number]] : []));
        onPins(out.flatMap((r) => (r.res?.place && (r.res.status === 'HIGH' || r.res.status === 'MEDIUM') && r.res.place.latitude !== undefined ? [{ name: r.res.place.canonicalName, lat: r.res.place.latitude, lon: r.res.place.longitude! }] : [])));
        const box = unionBBox(boxes);
        if (box) onView({ lat: (box[1] + box[3]) / 2, lon: (box[0] + box[2]) / 2, zoom: Math.min(zoomForBBox([box[0] - 0.5, box[1] - 0.5, box[2] + 0.5, box[3] + 0.5]), 9), bbox: [box[0] - 0.5, box[1] - 0.5, box[2] + 0.5, box[3] + 0.5] });
        else onView(undefined);
      })
      .catch(() => setErr('Historical place lookup unavailable. Try again.'));
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!rows) return null;
  if (!rows.length) return <div className="small muted">No place names found in this chapter.</div>;
  const good = rows.filter((r) => r.res?.place && (r.res.status === 'HIGH' || r.res.status === 'MEDIUM'));
  const unclear = rows.filter((r) => r.res && !good.includes(r));
  return (
    <div className="card tight">
      <b>Places in this chapter</b>
      <div className="tiny faint mb-8">{pinned ? 'Each place below is pinned on the map where its source locates it. Tap one to look at it closely.' : 'The map above is framed around every place below. The historical map can’t show pins, so tap a place to go to it.'}</div>
      {err && <div className="small muted">{err}</div>}
      <div className="col" style={{ gap: 4 }}>
        {good.map((r, i) => (
          <button key={r.name} className="rabbit-node" onClick={() => onPick(r.name)}>
            <span><b>{i + 1}. {r.res!.place!.canonicalName}</b>{r.res!.place!.canonicalName.toLowerCase() !== r.name.toLowerCase() ? <span className="small muted"> · “{r.name}”</span> : null}<span className="tiny faint" style={{ display: 'block' }}>{CONFIDENCE_LABEL[r.res!.status]}{r.res!.place!.description ? ` · ${r.res!.place!.description}` : ''}</span></span>
            <Icon name="chevronRight" className="faint" />
          </button>
        ))}
        {!rows.some((r) => r.res) && <div className="small muted">Looking up {rows.length} place names…</div>}
      </div>
      {unclear.length > 0 && (
        <details className="mt-8">
          <summary className="small" style={{ cursor: 'pointer' }}>Not placed on the map ({unclear.length})</summary>
          <div className="col mt-8" style={{ gap: 4 }}>
            {unclear.map((r) => <button key={r.name} className="rabbit-node small" onClick={() => onPick(r.name)}><span>{r.name}<span className="tiny faint" style={{ display: 'block' }}>{r.res!.error ?? CONFIDENCE_LABEL[r.res!.status]}</span></span><Icon name="chevronRight" className="faint" /></button>)}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Sources & attribution ─────────────────────────────────────────────

function Sources({ place, atlas }: { place?: HistoricalPlace; atlas: boolean }) {
  return (
    <details className="hmap-sources">
      <summary>{atlas ? 'Place-name sources' : 'Sources & attribution'}</summary>
      <ul>
        {!atlas && <li>Map: <a href="https://www.openhistoricalmap.org/" target="_blank" rel="noreferrer">OpenHistoricalMap</a> — © <a href="https://www.openhistoricalmap.org/copyright" target="_blank" rel="noreferrer">OpenHistoricalMap contributors</a>. Historical borders are approximate.</li>}
        <li>Place names: <a href="https://whgazetteer.org/" target="_blank" rel="noreferrer">World Historical Gazetteer</a> (when available on your Shelf server), otherwise <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata</a> (CC0).</li>
        {place?.attribution.map((a, i) => (
          <li key={i}>{place.canonicalName}: {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.source}</a> : a.source}{a.dataset ? ` — ${a.dataset}` : ''}{a.license ? ` · ${a.licenseUrl ? '' : 'licence: '}` : ''}{a.license ? (a.licenseUrl ? <a href={a.licenseUrl} target="_blank" rel="noreferrer">{a.license}</a> : a.license) : ''}{a.redistributable === false ? ' · not redistributable — shown by reference only' : ''}</li>
        ))}
        <li>WHG gathers many sources under different licences; each place shows its own source above.</li>
      </ul>
    </details>
  );
}
