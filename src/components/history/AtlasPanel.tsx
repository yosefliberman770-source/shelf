// The reader's historical atlas: the book and the map as one reading
// environment. Opens over the book (nothing about the book is reloaded or
// moved), follows the book's date, and links every place back to the
// passage it came from. Facts come from named datasets only; AI may find
// names in the text but never supplies coordinates, dates or borders.
import type { Map as MLMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtlasMap, type AtlasOverlay, type AtlasPin, type AtlasView } from '../../atlas/AtlasMap';
import { allEvents, allWars, type AtlasEvent, warsNear, type War } from '../../atlas/context';
import { gazetteerInfo, getPlace } from '../../atlas/gazetteer';
import { useBookPlaceNames } from '../../atlas/readerNames';
import { choosePlace, type Detection, fromGaz, type ReaderPlace, type Resolution, resolvePlace } from '../../atlas/resolve';
import { recordVisit, saveBookmark } from '../../atlas/store';
import { type HistYear, yearLabel } from '../../atlas/time';
import type { TimelineMark } from '../../atlas/Timeline';
import type { MapBookmarkRow } from '../../db/types';
import { unionBBox, zoomForBBox } from '../../lib/history/geometry';
import { type DateContext, dateContextFor, detectPlaces, saveBookDate, screenMentions } from '../../lib/history/placeDetect';
import type { MentionEvidence } from '../../atlas/mention';
import { CONFIDENCE_LABEL } from '../../lib/history/types';
import { Icon } from '../icons';
import { EventCard, LookingAtCard, NearbyPanel, PlaceHistory, SavedPanel, SearchPanel, WarEvents } from './atlasParts';
import { type ActiveOverlay, BookWorldPanel, CoveragePanel, EmptyNote, MapArchivePanel, PlaceWorldExtras, WhatChangedPanel } from './worldParts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { LAYERS } from '../../atlas/catalog';
import { bookPeriod, buildBookWorld, resolveBookWorld, type SectionText, type WorldProfile, worldProfile } from '../../world/bookWorld';
import { DateControls, type MapBook, type MapRequest } from './HistoricalMapPanel';

type Tab = 'place' | 'chapter' | 'world' | 'events' | 'nearby' | 'maps' | 'search' | 'saved' | 'data';
const TABS: { id: Tab; label: string }[] = [
  { id: 'place', label: 'Place' },
  { id: 'chapter', label: 'Chapter' },
  { id: 'world', label: 'World' },
  { id: 'events', label: 'Events' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'maps', label: 'Maps' },
  { id: 'search', label: 'Search' },
  { id: 'saved', label: 'Saved' },
  { id: 'data', label: 'Data' },
];
const FOLLOW_KEY = 'shelf.followBook';
const LOOK_KEY = 'shelf.atlas.lookingOpen';
type Mention = { cfi: string; snippet: string };

export function AtlasPanel({ request, book, chapterText, pagePlaces, date, setDate, wide, onClose, findMentions, onJump, position, loadSection, sectionCount }: {
  request: MapRequest;
  book: MapBook;
  chapterText: () => string;
  pagePlaces: { name: string; passage: string }[];
  date: DateContext | null;
  setDate: (d: DateContext) => void;
  wide: boolean;
  onClose: () => void;
  /** Where a name appears in the loaded chapter (for "Jump to passage"). */
  findMentions: (name: string) => Mention[];
  /** Close the map and go to that spot in the book (the reader can jump back). */
  onJump: (cfi: string) => void;
  position?: { spine?: number; para?: number; cfi?: string };
  /** Read one section of the book off-screen (for "The world of this book"). */
  loadSection?: (i: number) => Promise<SectionText | undefined>;
  sectionCount?: number;
}) {
  const names = useBookPlaceNames(book.bookId, position?.spine, position?.para);
  const allNames = useBookPlaceNames(book.bookId);
  const [tab, setTab] = useState<Tab>(request.mode === 'chapter' || request.mode === 'section' ? 'chapter' : request.mode === 'search' || request.mode === 'saved' || request.mode === 'world' || request.mode === 'maps' ? request.mode : 'place');

  // ── The year: the book's date, or the reader's own ──
  useEffect(() => {
    if (date) return;
    setDate(dateContextFor({ bookId: book.bookId, item: book.item, passage: request.passage, mentionIndex: request.mentionIndex, chapterText: chapterText() }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const known = date?.year;
  const year: HistYear = known ?? book.item?.histStart ?? 1;
  const setYear = useCallback((y: HistYear, approximate?: boolean) => { if (y) setDate({ year: y, approximate, source: 'yours' }); }, [setDate]);

  // ── The selected place ──
  const [target, setTarget] = useState<{ written: string; passage?: string; detection: Detection; key?: string } | null>(
    request.name || request.placeKey ? { written: request.name ?? '', passage: request.passage, detection: request.detection ?? 'selection', key: request.placeKey } : null,
  );
  useEffect(() => { if (request.name || request.placeKey) { setTarget({ written: request.name ?? '', passage: request.passage, detection: request.detection ?? 'selection', key: request.placeKey }); setTab('place'); } }, [request]);
  const [res, setRes] = useState<Resolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const century = known === undefined ? 'none' : Math.ceil(known / 100);
  useEffect(() => {
    if (!target) return;
    let dead = false;
    const c = new AbortController();
    setLoading(true);
    setRes(null);
    (async () => {
      // Already identified (from the text popup, the map, a list): use that record.
      if (target.key) {
        const p = await getPlace(target.key).catch(() => undefined);
        const name = p ? gazetteerInfo(p.gazetteer).name : '';
        if (p) return { place: fromGaz(p, target.written || p.title, { detection: target.detection, reason: `Chosen directly from the ${name} record.`, method: `${name} record` }), status: 'HIGH', candidates: [], reason: '' } as Resolution;
      }
      return resolvePlace(target.written, { year: known, bookId: book.bookId, detection: target.detection, passage: target.passage, nearby: pagePlaces.map((p) => p.name), chapter: book.chapter, bookTitle: book.title, signal: c.signal });
    })()
      .then((r) => { if (!dead) setRes(r); })
      .catch((e) => { if (!dead && (e as Error).name !== 'AbortError') setRes({ status: 'UNRESOLVED', candidates: [], reason: '', error: 'Historical place lookup unavailable. Try again.' }); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; c.abort(); };
  }, [target, retry, century]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = res?.place;
  const mentions = useMemo(() => (place ? findMentions(place.written) : []), [place?.key, place?.written]); // eslint-disable-line react-hooks/exhaustive-deps

  // Places met while reading are remembered for this book.
  useEffect(() => {
    if (!place || !['cue', 'known', 'ai', 'selection'].includes(place.why.detection)) return;
    recordVisit({ bookId: book.bookId, placeKey: place.key, name: place.title, written: place.written, lat: place.lat, lon: place.lon, chapter: book.chapter, cfi: mentions[0]?.cfi }).catch(() => {});
  }, [place?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const openKey = (key: string, name: string, detection: Detection = 'map') => { setTarget({ written: name, detection, key }); setTab('place'); setEventQ(undefined); };
  const openPlace = (p: ReaderPlace) => { setRes({ place: p, status: p.status, candidates: [], reason: p.why.reason }); setTarget(null); setTab('place'); setView({ lat: p.lat, lon: p.lon, zoom: 8 }); };

  // ── Follow the book (off unless the reader turns it on) ──
  const [follow, setFollow] = useState(() => { try { return localStorage.getItem(FOLLOW_KEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0'); } catch { /* ignore */ } }, [follow]);
  useEffect(() => {
    if (!follow || !pagePlaces.length) return;
    const cur = (place?.written ?? target?.written ?? '').toLowerCase();
    if (pagePlaces.some((p) => p.name.toLowerCase() === cur)) return;
    const t = setTimeout(() => { setTarget({ written: pagePlaces[0].name, passage: pagePlaces[0].passage, detection: 'cue' }); setTab('place'); }, 700);
    return () => clearTimeout(t);
  }, [follow, pagePlaces]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map state ──
  const mapRef = useRef<MLMap | null>(null);
  const [view, setView] = useState<AtlasView | undefined>();
  useEffect(() => { if (place) setView({ lat: place.lat, lon: place.lon, zoom: place.certainty === 'known' ? 8 : 7 }); }, [place?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [layers, setLayers] = useState<string[]>([]);
  const [layersRequest, setLayersRequest] = useState<{ layers: string[]; n: number } | undefined>();
  const ensureLayers = (ids: string[]) => { const missing = ids.filter((id) => !layers.includes(id)); if (missing.length) setLayersRequest({ layers: [...layers, ...missing], n: Date.now() }); };
  const [chapterPins, setChapterPins] = useState<{ pins: AtlasPin[]; route: boolean; line: boolean }>({ pins: [], route: false, line: false });
  const [nearbyPins, setNearbyPins] = useState<AtlasPin[]>([]);
  const [radiusMi, setRadiusMi] = useState(25);
  const [war, setWar] = useState<{ q: string; name: string } | undefined>();
  const [eventQ, setEventQ] = useState<string | undefined>();
  const [eventAt, setEventAt] = useState<AtlasEvent | undefined>();
  const [warMarks, setWarMarks] = useState<TimelineMark[]>([]);
  useEffect(() => {
    if (!war) { setWarMarks([]); return; }
    allEvents().then((ev) => setWarMarks(ev.filter((e) => e.w === war.q).map((e) => ({ year: e.y, label: e.n, kind: 'event' as const })))).catch(() => {});
  }, [war]);
  const marks = useMemo<TimelineMark[]>(() => [
    ...(book.item?.histStart !== undefined ? [{ year: book.item.histStart, label: 'Book’s period begins', kind: 'book' as const }] : []),
    ...(book.item?.histEnd !== undefined ? [{ year: book.item.histEnd, label: 'Book’s period ends', kind: 'book' as const }] : []),
    ...warMarks,
  ], [book.item?.histStart, book.item?.histEnd, warMarks]);
  // ── Original maps laid over the reconstruction ──
  const [mapOverlays, setMapOverlays] = useState<ActiveOverlay[]>([]);
  const overlayImages = useMemo(() => mapOverlays.map((o) => ({ id: o.id, url: o.overlay.url, coordinates: o.overlay.coordinates, opacity: o.opacity })), [mapOverlays]);
  // A newly added original map: bring it into view.
  const overlayCount = useRef(0);
  useEffect(() => {
    if (mapOverlays.length > overlayCount.current) {
      const c = mapOverlays[mapOverlays.length - 1].overlay.coordinates;
      const b: [number, number, number, number] = [Math.min(...c.map((x) => x[0])), Math.min(...c.map((x) => x[1])), Math.max(...c.map((x) => x[0])), Math.max(...c.map((x) => x[1]))];
      setView({ lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2, zoom: Math.min(zoomForBBox(b), 16), bbox: b });
    }
    overlayCount.current = mapOverlays.length;
  }, [mapOverlays]);
  const viewBox = (): [number, number, number, number] | undefined => { const b = mapRef.current?.getBounds(); return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : undefined; };

  // ── The world of this book (built once, on request) ──
  const worldRow = useLiveQuery(() => db.bookWorld.get(book.bookId), [book.bookId]);
  const [profile, setProfile] = useState<WorldProfile | null>(null);
  const [building, setBuilding] = useState<{ stage: string; done: number; total: number } | null>(null);
  const [worldPins, setWorldPins] = useState<AtlasPin[]>([]);
  useEffect(() => {
    if (!worldRow?.done) { setProfile(null); return; }
    let dead = false;
    worldProfile(worldRow, book.item).then((p) => !dead && setProfile(p)).catch(() => {});
    return () => { dead = true; };
  }, [worldRow?.updatedAt, worldRow?.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const buildWorld = async () => {
    if (!loadSection || !sectionCount || building) return;
    setBuilding({ stage: 'Reading the book', done: 0, total: sectionCount });
    try {
      const row = await buildBookWorld(book.bookId, sectionCount, loadSection, allNames, (d, t) => setBuilding({ stage: 'Reading the book', done: d, total: t }));
      const period = bookPeriod(row, book.item);
      await resolveBookWorld(row, period.preferred ?? known, book.bookId, (d, t) => setBuilding({ stage: 'Identifying places', done: d, total: t }));
    } finally { setBuilding(null); }
  };
  const showWorld = () => {
    if (!profile) return;
    const y = profile.period.preferred ?? profile.period.earliest;
    if (y !== undefined) setDate({ year: y, approximate: true, source: 'book' });
    setWorldPins(profile.places.slice(0, 150).map((p) => ({ key: p.key, name: p.title, lat: p.lat, lon: p.lon })));
    if (profile.bbox) { const b = profile.bbox; const pad: [number, number, number, number] = [b[0] - 0.7, b[1] - 0.7, b[2] + 0.7, b[3] + 0.7]; setView({ lat: (pad[1] + pad[3]) / 2, lon: (pad[0] + pad[2]) / 2, zoom: Math.min(zoomForBBox(pad), 9), bbox: pad }); }
    // Layers suited to the book's period: datasets whose coverage includes it, plus borders and wars.
    if (y !== undefined) ensureLayers([...LAYERS.filter((l) => l.coverage && y >= l.coverage[0] && y <= l.coverage[1] && ['places', 'infrastructure'].includes(l.group) && l.defaultOn).map((l) => l.id), 'borders', 'empires', 'kingdoms', 'republics', 'other-states', 'battles', 'sieges']);
  };

  const overlay = useMemo<AtlasOverlay>(() => ({
    route: tab === 'chapter' && chapterPins.route ? chapterPins.pins : undefined,
    routeLine: chapterPins.line,
    markers: tab === 'chapter' && !chapterPins.route ? chapterPins.pins : tab === 'nearby' ? nearbyPins : tab === 'world' ? worldPins : undefined,
    circle: tab === 'nearby' && place ? { lat: place.lat, lon: place.lon, km: radiusMi * 1.609344 } : undefined,
  }), [tab, chapterPins, nearbyPins, place, radiusMi, worldPins]);
  const focus = place ? { name: place.title, lat: place.lat, lon: place.lon, certainty: place.certainty } : eventAt ? { name: eventAt.n, lat: eventAt.pos[1], lon: eventAt.pos[0], certainty: 'known' as const } : undefined;

  const pickWar = (q: string, name: string) => { setWar({ q, name }); ensureLayers(['wars', 'battles', 'sieges']); setTab('events'); };
  const showEvent = (e: AtlasEvent) => { setEventAt(e); setYear(e.y); setView({ lat: e.pos[1], lon: e.pos[0], zoom: 7 }); ensureLayers([e.k === 'siege' ? 'sieges' : e.k === 'campaign' ? 'campaigns' : 'battles']); };

  // ── "What am I looking at?" ──
  const [lookOpen, setLookOpen] = useState(() => { try { return localStorage.getItem(LOOK_KEY) !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(LOOK_KEY, lookOpen ? '1' : '0'); } catch { /* ignore */ } }, [lookOpen]);
  const [centre, setCentre] = useState<{ name: string; lat: number; lon: number } | undefined>();
  const at = place ? { name: place.title, lat: place.lat, lon: place.lon, key: place.key, partOf: place.partOf } : eventAt ? { name: eventAt.n, lat: eventAt.pos[1], lon: eventAt.pos[0] } : centre;
  const describeCentre = () => { const m = mapRef.current; if (!m) return; const c = m.getCenter(); setCentre({ name: 'Map centre', lat: c.lat, lon: c.lng }); };

  // ── Bookmarks ──
  const [saving, setSaving] = useState<string | null>(null);
  const saveView = async (title: string) => {
    const m = mapRef.current;
    const c = m?.getCenter();
    await saveBookmark({
      title: title.trim() || `${place?.title ?? 'Map'} — ${yearLabel(year)}`,
      lat: c?.lat ?? place?.lat ?? 0, lon: c?.lng ?? place?.lon ?? 0, zoom: m?.getZoom() ?? 6, year, layers,
      selected: place ? { key: place.key, name: place.written || place.title, kind: 'place' } : eventQ ? { key: `wd:${eventQ}`, name: eventAt?.n ?? eventQ, kind: 'event' } : undefined,
      bookId: book.bookId, chapter: book.chapter, cfi: position?.cfi,
    });
    setSaving(null);
  };
  const openBookmark = (b: MapBookmarkRow) => {
    setYear(b.year);
    setLayersRequest({ layers: b.layers, n: Date.now() });
    if (b.selected?.kind === 'place') openKey(b.selected.key, b.selected.name, 'map');
    else if (b.selected?.kind === 'event') { setEventQ(b.selected.key.replace(/^wd:/, '')); setTab('events'); }
    setTimeout(() => setView({ lat: b.lat, lon: b.lon, zoom: b.zoom }), 50);
  };

  return (
    <div className={`hmap ${wide ? 'side' : 'full'}`} role="dialog" aria-label="Historical atlas">
      <div className="hmap-head">
        <button className="btn sm ghost" onClick={onClose}><Icon name="chevronLeft" />Back to book</button>
        <span className="eyebrow" style={{ margin: 0 }}>Historical atlas</span>
        <span className="row" style={{ gap: 2 }}>
          <button className="btn icon sm ghost" onClick={() => setSaving(saving === null ? `${place?.title ?? 'Map'} — ${yearLabel(year)}` : null)} aria-label="Save this map view" title="Save this map view">🔖</button>
          <button className="btn icon sm ghost" onClick={() => setTab('search')} aria-label="Open search" title="Search"><Icon name="search" /></button>
        </span>
      </div>
      <div className="hmap-body">
        {saving !== null && (
          <form className="card tight row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); saveView(saving); }}>
            <input className="input sm" value={saving} onChange={(e) => setSaving(e.target.value)} aria-label="Bookmark name" autoFocus />
            <button className="btn sm primary">Save view</button>
            <button type="button" className="btn sm ghost" onClick={() => setSaving(null)}>Cancel</button>
          </form>
        )}
        <AtlasMap view={view} year={year} onYearChange={setYear} focus={focus} marks={marks} overlay={overlay} mapOverlays={overlayImages}
          war={war?.q} onWarChange={(q) => setWar(q ? { q, name: war?.q === q ? war.name : '' } : undefined)}
          onReady={(m) => { mapRef.current = m; }} onLayersChange={setLayers} layersRequest={layersRequest}
          onPickPlace={(p) => openKey(p.key, p.name, 'map')}
          onPickEvent={(q) => { setEventQ(q); setTab('events'); }}
          onPickMarker={(key) => { const pin = [...chapterPins.pins, ...nearbyPins, ...worldPins].find((p) => p.key === key); if (pin) openKey(key, pin.name, tab === 'chapter' || tab === 'world' ? 'cue' : 'map'); }} />

        <LookingAtCard at={at} year={year} open={lookOpen} setOpen={setLookOpen} />
        {!place && !eventAt && lookOpen && <button className="btn xs" style={{ alignSelf: 'flex-start' }} onClick={describeCentre}>Describe the map centre</button>}

        <DateControls compact year={known} approximate={date?.approximate} source={date?.source ?? 'none'} onChange={(y, a) => { if (y !== undefined) setYear(y, a); }} item={book.item}
          animate={null} onAnimate={() => {}} onClearMine={() => { saveBookDate(book.bookId, undefined); setDate(dateContextFor({ bookId: book.bookId, item: book.item, passage: target?.passage, chapterText: chapterText() })); }}
          onRemember={() => { if (known !== undefined) saveBookDate(book.bookId, known); }} />
        {date?.source !== 'yours' && date?.approximate && known !== undefined && <div className="tiny faint">The book gives this date only approximately — set the year yourself if you know it.</div>}

        <div className="tool-tabs atlas-tabs" role="tablist">
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {tab === 'place' && (
          <div className="col gap-8">
            {!target && !place && <div className="small muted">Tap a dotted place name in the book, a place on the map, or search. You can also select any word in the book and tap 🗺 Map.</div>}
            {loading && <div className="small muted">Looking up “{target?.written}”…</div>}
            {res && !place && !loading && <Unresolved written={target?.written ?? ''} res={res} onRetry={() => setRetry((n) => n + 1)} onChoose={async (p) => openPlace(await choosePlace(book.bookId, target?.written ?? p.written, p))} onSearch={() => setTab('search')} />}
            {place && (
              <>
                <PlaceHistory place={place} year={year} bookId={book.bookId} mentions={mentions} onJump={onJump}
                  onOpenPlace={(k, n) => openKey(k, n)} onEvent={(q) => { setEventQ(q); setTab('events'); }} onNearby={() => setTab('nearby')}
                  onBookmark={() => setSaving(`${place.title} — ${yearLabel(year)}`)}
                  onNotRight={res && res.candidates.length ? () => setRes({ ...res, place: undefined, status: 'AMBIGUOUS' }) : undefined} />
                <PlaceWorldExtras place={place} year={year} onOpenMaps={() => setTab('maps')} onOpenPlace={(k, n) => openKey(k, n)} />
                <details className="card tight">
                  <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>What changed here? Compare two dates</summary>
                  <div className="mt-8"><WhatChangedPanel at={{ name: place.title, lat: place.lat, lon: place.lon }} year={year} onShow={(y) => setYear(y)} /></div>
                </details>
              </>
            )}
            <label className="row between small" style={{ padding: '4px 0' }}>
              <span><b>Follow the book</b><br /><span className="tiny faint">Move the map to places on each new page as you read. Off unless you turn it on.</span></span>
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            </label>
          </div>
        )}

        {tab === 'chapter' && (
          <ChapterPanel key={request.mode === 'section' ? `s:${request.text?.slice(0, 40)}` : 'chapter'} text={request.mode === 'section' && request.text ? request.text : chapterText()}
            section={request.mode === 'section'} year={known} bookId={book.bookId} bookTitle={book.title} chapter={book.chapter} names={names}
            findMentions={findMentions} onJump={onJump} onOpen={(p) => openPlace(p)}
            onPins={(pins) => {
              setChapterPins((c) => ({ ...c, pins }));
              const box = unionBBox(pins.map((p) => [p.lon, p.lat, p.lon, p.lat] as [number, number, number, number]));
              if (box) { const b: [number, number, number, number] = [box[0] - 0.5, box[1] - 0.5, box[2] + 0.5, box[3] + 0.5]; setView({ lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2, zoom: Math.min(zoomForBBox(b), 9), bbox: b }); }
            }}
            route={chapterPins.route} line={chapterPins.line} setRoute={(route, line) => setChapterPins((c) => ({ ...c, route, line }))} />
        )}

        {tab === 'events' && (
          <EventsPanel at={at} year={year} chapterText={chapterText} war={war} eventQ={eventQ} findMentions={findMentions} onJump={onJump}
            onEvent={(q) => setEventQ(q)} onCloseEvent={() => setEventQ(undefined)} onWar={pickWar} onShow={showEvent} />
        )}

        {tab === 'nearby' && (
          <NearbyPanel at={place ? { name: place.title, lat: place.lat, lon: place.lon, key: place.key } : at} year={year} radiusMi={radiusMi} setRadiusMi={setRadiusMi}
            onResults={setNearbyPins} onOpenPlace={(k, n) => openKey(k, n)} onEvent={(q) => { setEventQ(q); setTab('events'); }} />
        )}

        {tab === 'search' && (
          <SearchPanel onPlace={(p) => openKey(p.key, p.title, 'search')} onEvent={(q) => { setEventQ(q); setTab('events'); }} onWar={pickWar}
            onPolity={(h) => { if (year < h.f || year > h.t) setYear(h.f); setView({ lat: h.pos[1], lon: h.pos[0], zoom: 4 }); setCentre({ name: h.title, lat: h.pos[1], lon: h.pos[0] }); setRes(null); setTarget(null); setEventAt(undefined); ensureLayers(['empires', 'kingdoms', 'republics', 'other-states']); }}
            onOnline={(name) => { setTarget({ written: name, detection: 'search' }); setTab('place'); }} />
        )}

        {tab === 'saved' && (
          <SavedPanel bookId={book.bookId} onOpenBookmark={openBookmark} onJump={onJump}
            onOpenVisit={(key, name, written) => openKey(/^(pleiades|viabundus|althurayya):/.test(key) ? key : '', written || name, 'selection')}
            onOpenPlace={(k, n) => openKey(k, n)} />
        )}

        {tab === 'world' && (
          loadSection && sectionCount
            ? <BookWorldPanel row={worldRow} profile={profile} building={!!building} progress={building ?? undefined} onBuild={buildWorld} onShow={showWorld} year={year}
                onOpenPlace={(k, n) => openKey(/^(pleiades|viabundus|althurayya):/.test(k) ? k : '', n, 'cue')} onJumpChapter={onJump} onWar={pickWar} />
            : <div className="small muted">The world of a book can be built while reading an ebook.</div>
        )}

        {tab === 'maps' && <MapArchivePanel at={at} year={year} bbox={viewBox} overlays={mapOverlays} setOverlays={setMapOverlays} />}

        {tab === 'data' && <CoveragePanel at={at} year={year} />}

        <details className="hmap-sources">
          <summary>About this atlas</summary>
          <ul>
            <li>Places and names: <a href="https://pleiades.stoa.org/" target="_blank" rel="noreferrer">Pleiades</a> (CC BY 3.0) offline; for other periods <a href="https://whgazetteer.org/" target="_blank" rel="noreferrer">World Historical Gazetteer</a> (when your Shelf server offers it) or <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata</a> (CC0).</li>
            <li>Borders: Cliopatria (Seshat, CC BY 4.0). Battles, sieges and wars: Wikidata (CC0). Roads and coasts: Ancient World Mapping Center (ODbL). Full list under the map’s Sources.</li>
            <li>AI is only used to find names in the book (when you ran a book analysis). Coordinates, names, dates, borders and events come from the datasets above.</li>
            <li>Your notes, saved views and places you’ve met stay on this device.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}

// ── A name that couldn't be settled ───────────────────────────────────────

function Unresolved({ written, res, onRetry, onChoose, onSearch }: { written: string; res: Resolution; onRetry: () => void; onChoose: (p: ReaderPlace) => void; onSearch: () => void }) {
  if (res.error && !res.candidates.length) return (
    <div className="card tight">
      <b>{written}</b>
      <div className="small muted mt-4">{res.error}</div>
      <button className="btn sm mt-8" onClick={onRetry}><Icon name="refresh" />Try again</button>
    </div>
  );
  return (
    <div className="card tight">
      <b>{res.candidates.length > 1 ? `Which ${written}?` : written}</b>
      <div className="small muted mb-8">{CONFIDENCE_LABEL[res.status]}. {res.reason}</div>
      {res.candidates.length > 0 && <div className="small mb-4">Choose one — your choice is remembered for this book:</div>}
      <div className="col" style={{ gap: 4 }}>
        {res.candidates.map((c, i) => (
          <button key={c.key} className="rabbit-node" onClick={() => onChoose(c)}>
            <span style={{ minWidth: 0 }}>
              <b>{i + 1}. {c.title}</b>
              <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>{[c.types.slice(0, 2).join(', '), c.partOf.slice(0, 2).join(', '), c.description, `${c.lat.toFixed(1)}°, ${c.lon.toFixed(1)}°`].filter(Boolean).join(' · ')}</span>
              <span className="tiny faint" style={{ display: 'block', fontWeight: 400 }}>{c.sources.map((s) => s.name).join(' · ')}</span>
            </span>
            <Icon name="chevronRight" className="faint" />
          </button>
        ))}
      </div>
      <button className="btn sm mt-8" onClick={onSearch}>Search by another name</button>
    </div>
  );
}

// ── Places in this chapter / this section ─────────────────────────────────

interface Row { written: string; index: number; detection: Detection; res?: Resolution; mention?: MentionEvidence }

function ChapterPanel({ text, section, year, bookId, bookTitle, chapter, names, findMentions, onJump, onOpen, onPins, route, line, setRoute }: {
  text: string; section: boolean; year?: HistYear; bookId: string; bookTitle: string; chapter?: string;
  names: { known: { name: string; detection: Detection }[]; people: string[] };
  findMentions: (name: string) => Mention[]; onJump: (cfi: string) => void; onOpen: (p: ReaderPlace) => void;
  onPins: (pins: AtlasPin[]) => void; route: boolean; line: boolean; setRoute: (route: boolean, line: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const how = new Map(names.known.map((k) => [k.name.toLowerCase(), k.detection]));
    const detected = detectPlaces(text, names.known.map((k) => k.name), names.people).slice(0, 40);
    let dead = false;
    (async () => {
      // Only names the text gives reason to treat as places (not ordinary words after "of"/"at").
      const found = await screenMentions(detected, year);
      const base: Row[] = found.map((m) => ({ written: m.name, index: m.index, detection: how.get(m.name.toLowerCase()) ?? 'cue', mention: m.evidence }));
      if (dead) return;
      setRows(base);
      const out = [...base];
      // Offline first for every name, then the online service for the rest.
      for (const [i, r] of out.entries()) {
        const res = await resolvePlace(r.written, { year, bookId, detection: r.detection, online: false, mention: r.mention, nearby: base.map((b) => b.written) }).catch(() => undefined);
        out[i] = { ...r, res };
      }
      if (dead) return;
      setRows([...out]);
      for (const [i, r] of out.entries()) {
        if (r.res?.place) continue;
        const res = await resolvePlace(r.written, { year, bookId, detection: r.detection, mention: r.mention, nearby: base.map((b) => b.written), chapter, bookTitle, passage: text.slice(Math.max(0, r.index - 500), r.index + 500) }).catch(() => undefined);
        if (dead) return;
        out[i] = { ...r, res };
        setRows([...out]);
      }
    })();
    return () => { dead = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const good = (rows ?? []).filter((r) => r.res?.place && (r.res.status === 'HIGH' || r.res.status === 'MEDIUM')).sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const ordered = good.filter((r) => (seen.has(r.res!.place!.key) ? false : (seen.add(r.res!.place!.key), true)));
  const unclear = (rows ?? []).filter((r) => r.res && !good.includes(r));
  const pinKey = ordered.map((r) => r.res!.place!.key).join('|');
  useEffect(() => { onPins(ordered.map((r) => ({ key: r.res!.place!.key, name: r.res!.place!.title, lat: r.res!.place!.lat, lon: r.res!.place!.lon }))); }, [pinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return null;
  if (!rows.length) return <div className="small muted">No place names found in this {section ? 'passage' : 'chapter'}.</div>;
  const pending = rows.some((r) => !r.res);
  return (
    <div className="col gap-8">
      <div>
        <b>Places in this {section ? 'passage' : 'chapter'}</b>
        <div className="tiny faint">Only places identified with reasonable confidence are pinned. In reading order.</div>
      </div>
      <div className="col" style={{ gap: 4 }}>
        {ordered.map((r, i) => {
          const p = r.res!.place!;
          const ms = findMentions(r.written);
          return (
            <div key={p.key} className="atlas-row">
              <span className="atlas-num">{i + 1}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <b>{p.title}</b>{p.title.toLowerCase() !== r.written.toLowerCase() ? <span className="small muted"> · “{r.written}”</span> : null}
                <span className="tiny faint" style={{ display: 'block' }}>{CONFIDENCE_LABEL[r.res!.status]} · {p.sources[0]?.name}{p.certainty !== 'known' ? ` · ${p.certainty} location` : ''}</span>
              </span>
              <button className="btn xs" onClick={() => onOpen(p)} aria-label={`Show ${p.title} on the map`}>Map</button>
              {ms[0] && <button className="btn xs ghost" onClick={() => onJump(ms[0].cfi)} aria-label={`Jump to where ${r.written} is mentioned`}>↩</button>}
            </div>
          );
        })}
        {!ordered.length && !pending && <div className="small muted">No places here could be identified with confidence.</div>}
        {pending && <div className="small muted">Looking up {rows.filter((r) => !r.res).length} names…</div>}
      </div>
      {ordered.length > 1 && (
        <div className="card tight">
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={route} onChange={(e) => setRoute(e.target.checked, e.target.checked && line)} /> Show as a sequence (the order the text mentions them)</label>
          {route && <label className="row small mt-4" style={{ gap: 6 }}><input type="checkbox" checked={line} onChange={(e) => setRoute(true, e.target.checked)} /> Draw a connecting line</label>}
          {route && <div className="tiny faint mt-4"><b>Route reconstructed from the text.</b> This is only the order in which the {section ? 'passage' : 'chapter'} names these places — not a recorded road, voyage or march.</div>}
        </div>
      )}
      {unclear.length > 0 && (
        <div>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={showUnresolved} onChange={(e) => setShowUnresolved(e.target.checked)} /> Show names that couldn’t be identified ({unclear.length})</label>
          {showUnresolved && (
            <div className="col mt-4" style={{ gap: 2 }}>
              {unclear.map((r) => <div key={r.written} className="small">{r.written} <span className="tiny faint">— {r.res?.error ?? CONFIDENCE_LABEL[r.res!.status]}</span></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Events ────────────────────────────────────────────────────────────────

function EventsPanel({ at, year, chapterText, war, eventQ, findMentions, onJump, onEvent, onCloseEvent, onWar, onShow }: {
  at?: { name: string; lat: number; lon: number };
  year: HistYear; chapterText: () => string; war?: { q: string; name: string }; eventQ?: string;
  findMentions: (name: string) => Mention[]; onJump: (cfi: string) => void;
  onEvent: (q: string) => void; onCloseEvent: () => void; onWar: (q: string, name: string) => void; onShow: (e: AtlasEvent) => void;
}) {
  const [near, setNear] = useState<(War & { events: number })[] | null>(null);
  const [inText, setInText] = useState<{ wars: War[]; events: AtlasEvent[] } | null>(null);
  const [evName, setEvName] = useState('');
  useEffect(() => {
    setNear(null);
    if (!at) return;
    warsNear([at.lon, at.lat], year, 500).then(setNear).catch(() => setNear([]));
  }, [at?.lat, at?.lon, year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Wars and events the chapter names outright (exact name in the text).
    const text = chapterText().toLowerCase();
    Promise.all([allWars(), allEvents()]).then(([ws, es]) => setInText({
      wars: ws.filter((w) => w.n.length > 8 && text.includes(w.n.toLowerCase())).slice(0, 10),
      events: es.filter((e) => e.n.length > 8 && text.includes(e.n.toLowerCase())).slice(0, 15),
    })).catch(() => setInText({ wars: [], events: [] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (eventQ) allEvents().then((es) => setEvName(es.find((e) => e.q === eventQ)?.n ?? '')); }, [eventQ]);
  const warName = war?.name || (inText?.wars.find((w) => w.q === war?.q)?.n ?? near?.find((w) => w.q === war?.q)?.n ?? 'Selected war');
  return (
    <div className="col gap-12">
      {eventQ && <EventCard q={eventQ} onShow={onShow} mentions={evName ? findMentions(evName) : []} onJump={onJump} onWar={(q) => onWar(q, '')} onClose={onCloseEvent} />}
      {war && <WarEvents q={war.q} name={warName} onEvent={onEvent} />}
      {inText && (inText.wars.length > 0 || inText.events.length > 0) && (
        <div>
          <div className="eyebrow">Named in this chapter</div>
          {inText.wars.map((w) => <button key={w.q} className={`atlas-war ${war?.q === w.q ? 'on' : ''}`} onClick={() => onWar(w.q, w.n)}>⚔ {w.n} <span className="faint">{w.f !== null ? yearLabel(w.f) : '?'}–{w.t !== null ? yearLabel(w.t) : '?'}</span></button>)}
          {inText.events.map((e) => <button key={e.q} className="atlas-war" onClick={() => onEvent(e.q)}>{e.n} <span className="faint">{yearLabel(e.y)}</span></button>)}
        </div>
      )}
      <div>
        <div className="eyebrow">Wars in {yearLabel(year)}{at ? ` with battles near ${at.name}` : ''}</div>
        {!at ? <div className="small muted">Choose a place to see conflicts around it.</div> : !near ? <div className="small muted">Loading…</div> : near.length ? near.map((w) => (
          <button key={w.q} className={`atlas-war ${war?.q === w.q ? 'on' : ''}`} onClick={() => onWar(w.q, w.n)}>⚔ {w.n} <span className="faint">{w.events} recorded within 300 mi</span></button>
        )) : <><div className="small muted">None recorded by Wikidata for this year and area.</div><EmptyNote type="battles" at={at} year={year} /></>}
      </div>
      <div className="tiny faint">Events come from Wikidata items with a place and a date. Choosing a war adds its battles and sieges to the map as optional layers (turn them off under Layers).</div>
    </div>
  );
}
