// Pieces of the reader's atlas panel. Every fact shown names the dataset it
// came from; automatically matched records say so, and nothing is filled in
// by AI.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { AROUND_KINDS, type AtlasEvent, aroundKind, allEvents, eventDetails, type EventDetails, eventsNear, eventsOfWar, linesNear, type LookingAt, lookingAt, politiesAt, type Polity, polityDisplayName } from '../../atlas/context';
import { MILE_KM } from '../../atlas/data';
import { existedAround, type GazPlace, nearbyPlaces, namesAround, relationLabel } from '../../atlas/gazetteer';
import { CERTAINTY_LABEL, DETECTION_LABEL, type ReaderPlace, type Source } from '../../atlas/resolve';
import { searchAtlas, type SearchHit } from '../../atlas/search';
import { deleteBookmark, deleteNote, forgetVisit, saveNote } from '../../atlas/store';
import { type HistYear, shiftYear, yearLabel } from '../../atlas/time';
import { db } from '../../db/db';
import type { MapBookmarkRow, PlaceVisitRow } from '../../db/types';
import { formatCoords } from '../../lib/history/geometry';
import { parseHistoricalDate } from '../../lib/history/dates';
import { historicalPlaces } from '../../lib/history/placeService';
import { CONFIDENCE_LABEL } from '../../lib/history/types';
import { Icon } from '../icons';
import { EmptyNote } from './worldParts';

export const span = (f?: number, t?: number) => (f === undefined && t === undefined ? 'dates not recorded' : `${f !== undefined ? yearLabel(f) : '?'} – ${t !== undefined ? yearLabel(t) : '?'}`);
const polityType = (c?: string) => (c ? ` (${c})` : '');
export const polityName = (p: Polity) => `${p.edge ? 'at the edge of ' : ''}${polityDisplayName(p)}${polityType(p.c)}${p.partOf?.length ? `, part of ${p.partOf.join(' and ')}` : ''}${p.op ? ' (a detached piece of its outline in the source)' : ''}`;
/**
 * Polities at a spot as one phrase. More than one independent polity there means the source's
 * outlines overlap: explained by a recorded relationship when there is one, otherwise stated as
 * an overlap — never called a dispute, which the source doesn't record.
 */
export const politiesLine = (ps: Polity[]) => {
  const names = ps.map(polityName).join(' / ');
  if (ps.length < 2 || ps.some((p) => p.g)) return names;
  const rel = [...new Set(ps.flatMap((p) => (p.xr ? p.xr.split(';') : [])))];
  return rel.length ? `${names} (${rel.join('; ')})` : `${names} — the source’s outlines overlap here; it doesn’t say whether control was shared, changing or disputed`;
};
const kmLabel = (k: number) => `${Math.round(k / MILE_KM)} mi`;

// ── Sources ───────────────────────────────────────────────────────────────

export function SourcesBlock({ sources, auto = true }: { sources: Source[]; auto?: boolean }) {
  return (
    <details className="atlas-src">
      <summary>Sources · {sources.map((s) => s.name).join(' · ') || 'none'}</summary>
      <ul>
        {sources.map((s, i) => (
          <li key={i}>
            <b>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}</b>{s.license ? ` · ${s.license}` : ''}
            {s.record && <> · <a href={s.record} target="_blank" rel="noreferrer">view the record ↗</a></>}
            {s.note && <div className="tiny faint">{s.note}</div>}
          </li>
        ))}
      </ul>
      {auto && <div className="tiny faint">Matched to the book automatically. This is a gazetteer or database record, not primary-source scholarship — check the record for the evidence behind it.</div>}
    </details>
  );
}

// ── Why is this place here? ───────────────────────────────────────────────

const NAME_RULE: Record<NonNullable<ReaderPlace['nameRoles']>['rule'], string> = {
  'as-written': 'the book’s own wording, which the record lists',
  english: 'the English name the record gives',
  'record-title': 'the record’s title',
  'latin-name': 'a Latin-script form the record gives',
  'record-title-nonlatin': 'the record’s title (no Latin-script form recorded)',
};

export function WhyBlock({ place }: { place: ReaderPlace }) {
  const w = place.why;
  return (
    <details className="atlas-why">
      <summary>Why is this place here?</summary>
      <dl className="hmap-facts">
        <dt>Matched from</dt><dd>“{place.written}”</dd>
        <dt>Name shown</dt><dd><bdi>{place.title}</bdi>{place.nameRoles ? <span className="tiny faint"> — {NAME_RULE[place.nameRoles.rule]}</span> : null}</dd>
        {place.recordTitle && place.recordTitle !== place.title && <><dt>Dataset record</dt><dd><bdi>{place.recordTitle}</bdi>{w.matchedName && !w.matchedIsTitle ? <span className="tiny faint"> — “<bdi>{w.matchedName}</bdi>” is recorded as one of its names</span> : null}</dd></>}
        <dt>Found by</dt><dd>{DETECTION_LABEL[w.detection]}</dd>
        <dt>Match source</dt><dd>{w.method}</dd>
        <dt>Decision</dt><dd>{w.userChosen ? 'Your choice' : CONFIDENCE_LABEL[place.status]}{w.reason ? ` — ${w.reason}` : ''}</dd>
        <dt>Historical period</dt><dd>Recorded {span(place.from, place.to)}</dd>
      </dl>
    </details>
  );
}

// ── "What am I looking at?" ───────────────────────────────────────────────

export function LookingAtCard({ at, year, open, setOpen }: { at?: { name: string; lat: number; lon: number; key?: string; partOf?: string[] }; year: HistYear; open: boolean; setOpen: (b: boolean) => void }) {
  const [la, setLa] = useState<LookingAt | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setLa(null);
    if (!at || !open) return;
    let dead = false;
    setBusy(true);
    lookingAt([at.lon, at.lat], year, { exclude: at.key, partOf: at.partOf }).then((r) => !dead && setLa(r)).finally(() => !dead && setBusy(false));
    return () => { dead = true; };
  }, [at?.lat, at?.lon, at?.key, year, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card tight atlas-looking">
      <button className="row between atlas-looking-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><b>What am I looking at?</b>{at ? <span className="small"> · {at.name} — {yearLabel(year)}</span> : null}</span>
        <Icon name="chevronDown" className={open ? 'flip' : ''} />
      </button>
      {open && !at && <div className="small muted mt-4">Tap a place in the book, on the map, or search, and this explains what the map shows there.</div>}
      {open && at && (
        busy && !la ? <div className="small muted mt-4">Reading the datasets…</div> : la && (
          <ul className="atlas-facts">
            <li><span>Political entity</span>{la.polities.length ? politiesLine(la.polities) : <><i className="faint">none recorded for this spot and year</i><EmptyNote type="political" at={at} year={year} /></>}<small>Cliopatria</small></li>
            {la.regions.length > 0 && <li><span>Region</span>{la.regions.slice(0, 3).join(' · ')}<small>Pleiades</small></li>}
            <li><span>Nearest recorded settlements</span>{la.nearest.length ? la.nearest.map((n) => `${n.place.title} (${kmLabel(n.km)})`).join(', ') : <i className="faint">none dated to this period within 40 mi</i>}<small>Pleiades</small></li>
            {la.wars.length > 0 && <li><span>Conflict nearby in this year</span>{la.wars.map((w) => w.n).join(', ')}<small>Wikidata</small></li>}
          </ul>
        )
      )}
      {open && at && <div className="tiny faint mt-4">Only what these datasets record. Pleiades gives no city sizes, so places are listed by distance, not importance. “At the edge of” means the point lies just outside a simplified border line.</div>}
    </div>
  );
}

// ── Compare two dates ─────────────────────────────────────────────────────

export function CompareDates({ at, year, onShow }: { at?: { name: string; lat: number; lon: number }; year: HistYear; onShow: (y: HistYear) => void }) {
  const [a, setA] = useState(year);
  const [b, setB] = useState(shiftYear(year, 2));
  const [text, setText] = useState('');
  const [res, setRes] = useState<{ pa: Polity[]; pb: Polity[]; between: (AtlasEvent & { km: number })[] } | null>(null);
  useEffect(() => { setA(year); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setRes(null);
    if (!at) return;
    let dead = false;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    Promise.all([politiesAt([at.lon, at.lat], a), politiesAt([at.lon, at.lat], b), eventsNear([at.lon, at.lat], 300)]).then(([pa, pb, ev]) => {
      if (!dead) setRes({ pa, pb, between: ev.filter((e) => e.y >= lo && e.y <= hi).sort((x, y) => x.y - y.y).slice(0, 12) });
    }).catch(() => {});
    return () => { dead = true; };
  }, [at?.lat, at?.lon, a, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const setBText = () => { const d = parseHistoricalDate(text); if (d) { setB(d.year); setText(''); } };
  const names = (ps: Polity[]) => politiesLine(ps) || 'none recorded';
  return (
    <div className="col gap-8">
      <div className="row wrap gap-4 small">
        <button className="btn sm" onClick={() => onShow(a)}>Show {yearLabel(a)}</button>
        <span className="faint">vs</span>
        <button className="btn sm" onClick={() => onShow(b)}>Show {yearLabel(b)}</button>
        <button className="btn xs ghost" onClick={() => setA(year)}>Use map year as first</button>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setBText(); }}>
        <input className="input sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Second date, e.g. 216 BC" aria-label="Second date" />
        <button className="btn sm" disabled={!text.trim()}>Set</button>
      </form>
      {!at && <div className="small muted">Choose a place first — the comparison is for that spot.</div>}
      {at && res && (
        <ul className="atlas-facts">
          <li><span>{at.name}, {yearLabel(a)}</span>{names(res.pa)}<small>Cliopatria</small></li>
          <li><span>{at.name}, {yearLabel(b)}</span>{names(res.pb)}<small>Cliopatria</small></li>
          <li><span>Recorded events within 190 mi in between</span>{res.between.length ? res.between.map((e) => `${e.n} (${yearLabel(e.y)})`).join('; ') : 'none recorded'}<small>Wikidata</small></li>
        </ul>
      )}
      <div className="tiny faint">Borders are reconstructions with approximate dates: a change between two years shows the datasets differ, not the exact moment it happened.</div>
    </div>
  );
}

// ── Place history ─────────────────────────────────────────────────────────

export function PlaceHistory({ place, year, bookId, mentions, onJump, onOpenPlace, onEvent, onNearby, onBookmark, onNotRight }: {
  place: ReaderPlace; year: HistYear; bookId?: string;
  mentions: { cfi: string; snippet: string }[];
  onJump: (cfi: string) => void;
  onOpenPlace: (key: string, name: string) => void;
  onEvent: (q: string) => void;
  onNearby: () => void;
  onBookmark: () => void;
  onNotRight?: () => void;
}) {
  const [pol, setPol] = useState<Polity[] | null>(null);
  const [events, setEvents] = useState<(AtlasEvent & { km: number })[] | null>(null);
  useEffect(() => {
    let dead = false;
    setPol(null);
    setEvents(null);
    politiesAt([place.lon, place.lat], year).then((p) => !dead && setPol(p)).catch(() => !dead && setPol([]));
    eventsNear([place.lon, place.lat], 30, year, 300).then((e) => !dead && setEvents(e.slice(0, 10))).catch(() => !dead && setEvents([]));
    return () => { dead = true; };
  }, [place.key, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const nowNames = place.gaz ? namesAround(place.gaz, year) : place.names;
  const otherNames = place.names.filter((n) => !nowNames.includes(n));
  const nameLine = (n: { name: string; from?: number; to?: number; lang?: string }, i: number) => <span key={i}>{i > 0 ? ' · ' : ''}<bdi dir="auto">{n.name}</bdi>{n.from !== undefined || n.to !== undefined ? ` (${span(n.from, n.to)})` : ''}</span>;
  return (
    <div className="card tight hmap-info">
      <div className="book-title" style={{ fontSize: 22 }}><bdi>{place.title}</bdi></div>
      {place.recordTitle && place.recordTitle !== place.title && <div className="small muted">Recorded as <bdi>{place.recordTitle}</bdi></div>}
      {place.written.toLowerCase() !== place.title.toLowerCase() && <div className="small muted">“{place.written}” in the book</div>}
      <div className="row wrap gap-4 mt-4">
        <span className={`chip cert-${place.certainty}`} style={{ minHeight: 22, fontSize: 11 }}>{CERTAINTY_LABEL[place.certainty].split(' — ')[0]}</span>
        {place.why.userChosen ? <span className="chip" style={{ minHeight: 22, fontSize: 11 }}>Your choice</span> : <span className="chip" style={{ minHeight: 22, fontSize: 11 }}>{CONFIDENCE_LABEL[place.status]}</span>}
        {place.types.slice(0, 2).map((t) => <span key={t} className="chip" style={{ minHeight: 22, fontSize: 11 }}>{t.replace(/-\d$/, '').replace(/-/g, ' ')}</span>)}
      </div>
      <dl className="hmap-facts">
        {nowNames.length > 0 && <><dt>Names{place.gaz ? ` around ${yearLabel(year)}` : ''}</dt><dd>{nowNames.slice(0, 8).map(nameLine)}</dd></>}
        {otherNames.length > 0 && <><dt>Names at other times</dt><dd>{otherNames.slice(0, 8).map(nameLine)}</dd></>}
        <dt>Date range</dt><dd>{span(place.from, place.to)}{place.gaz ? <span className="tiny faint"> (Pleiades periods, not founding dates)</span> : null}</dd>
        <dt>Coordinates</dt><dd>{formatCoords(place.lat, place.lon)} · <span className="faint">{CERTAINTY_LABEL[place.certainty]}</span></dd>
        {(place.partOf.length > 0 || (pol && pol.length > 0)) && <><dt>Historical region</dt><dd>
          {pol && pol.length > 0 && <div>{politiesLine(pol)} in {yearLabel(year)} <span className="tiny faint">(Cliopatria)</span></div>}
          {place.partOf.length > 0 && <div>Part of {place.partOf.join(', ')} <span className="tiny faint">(Pleiades)</span></div>}
        </dd></>}
        {place.description && <><dt>Today</dt><dd>{place.description} <span className="tiny faint">(present-day description)</span></dd></>}
      </dl>
      {events && events.length > 0 && (
        <div className="mt-8">
          <div className="eyebrow">Recorded events within 20 miles</div>
          <div className="col" style={{ gap: 2 }}>
            {events.map((e) => <button key={e.q} className="atlas-war" onClick={() => onEvent(e.q)}>{e.n} <span className="faint">{yearLabel(e.y)}{e.wn ? ` · ${e.wn}` : ''}</span></button>)}
          </div>
          <div className="tiny faint">Wikidata items with a location and date near here.</div>
        </div>
      )}
      {place.related.length > 0 && (
        <div className="mt-8">
          <div className="eyebrow">Related places</div>
          <div className="row wrap gap-4">
            {place.related.slice(0, 10).map((r, i) => r.key
              ? <button key={i} className="chip" onClick={() => onOpenPlace(r.key!, r.title)}>{relationLabel(r)} {r.title}</button>
              : <span key={i} className="chip">{relationLabel(r)} {r.title}</span>)}
          </div>
          <div className="tiny faint">Relationships recorded in Pleiades.</div>
        </div>
      )}
      <div className="row wrap gap-4 mt-8">
        {mentions.length > 0 && <button className="btn sm primary" onClick={() => onJump(mentions[0].cfi)}>↩ Jump to passage</button>}
        <button className="btn sm" onClick={onNearby}>What’s around here?</button>
        <button className="btn sm" onClick={onBookmark}>🔖 Save view</button>
        {onNotRight && <button className="btn sm ghost" onClick={onNotRight}>Not the right place?</button>}
      </div>
      {mentions.length > 1 && (
        <details className="mt-4">
          <summary className="small" style={{ cursor: 'pointer' }}>All mentions in this chapter ({mentions.length})</summary>
          <div className="col mt-4" style={{ gap: 2 }}>{mentions.slice(0, 20).map((m, i) => <button key={i} className="atlas-war small" onClick={() => onJump(m.cfi)}>…{m.snippet}…</button>)}</div>
        </details>
      )}
      <PlaceNotes place={place} bookId={bookId} />
      <WhyBlock place={place} />
      <SourcesBlock sources={[...place.sources, ...(pol?.length ? [{ name: 'Cliopatria (Seshat)', license: 'CC BY 4.0', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', note: 'Political entity for this year' }] : []), ...(events?.length ? [{ name: 'Wikidata', license: 'CC0', url: 'https://www.wikidata.org/', note: 'Events nearby' }] : [])]} />
    </div>
  );
}

// ── Private notes ─────────────────────────────────────────────────────────

export function PlaceNotes({ place, bookId }: { place: { key: string; title: string; lat: number; lon: number }; bookId?: string }) {
  const notes = useLiveQuery(() => db.mapNotes.where('placeKey').equals(place.key).toArray(), [place.key]);
  const [draft, setDraft] = useState<{ id?: string; text: string } | null>(null);
  return (
    <div className="mt-8">
      <div className="row between">
        <span className="eyebrow" style={{ margin: 0 }}>Your notes</span>
        {!draft && <button className="btn xs" onClick={() => setDraft({ text: '' })}>✎ Add note</button>}
      </div>
      {(notes ?? []).map((n) => (
        <div key={n.id} className="atlas-note">
          <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
          <div className="row gap-4"><button className="why-link tiny" onClick={() => setDraft({ id: n.id, text: n.text })}>edit</button><button className="why-link tiny" onClick={() => deleteNote(n.id)}>delete</button></div>
        </div>
      ))}
      {draft && (
        <form className="col gap-4 mt-4" onSubmit={async (e) => { e.preventDefault(); await saveNote({ id: draft.id, placeKey: place.key, placeName: place.title, lat: place.lat, lon: place.lon, text: draft.text, bookId }); setDraft(null); }}>
          <textarea className="input" rows={3} autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder={`e.g. “${place.title} — important in my current book.”`} aria-label="Note" />
          <div className="row gap-4" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn sm ghost" onClick={() => setDraft(null)}>Cancel</button><button className="btn sm primary">Save note</button></div>
        </form>
      )}
      <div className="tiny faint">Private: kept on this device with your reading data, never sent to any map or history service.</div>
    </div>
  );
}

// ── Events ────────────────────────────────────────────────────────────────

export function EventCard({ q, onShow, mentions, onJump, onWar, onClose }: { q: string; onShow: (e: AtlasEvent) => void; mentions: { cfi: string }[]; onJump: (cfi: string) => void; onWar: (q: string) => void; onClose: () => void }) {
  const [ev, setEv] = useState<AtlasEvent | null | undefined>();
  const [det, setDet] = useState<EventDetails | null | 'failed'>(null);
  useEffect(() => {
    let dead = false;
    setEv(undefined);
    setDet(null);
    allEvents().then((all) => !dead && setEv(all.find((e) => e.q === q) ?? null));
    const c = new AbortController();
    eventDetails(q, c.signal).then((d) => !dead && setDet(d)).catch(() => !dead && setDet('failed'));
    return () => { dead = true; c.abort(); };
  }, [q]);
  if (ev === undefined) return <div className="small muted">Loading event…</div>;
  if (ev === null) return <div className="small muted">This event isn’t in the atlas data.</div>;
  return (
    <div className="card tight">
      <div className="row between"><b>{ev.n}</b><button className="btn xs ghost" onClick={onClose} aria-label="Close">✕</button></div>
      <dl className="hmap-facts">
        <dt>Date</dt><dd>{yearLabel(ev.y)}{ev.y2 ? ` – ${yearLabel(ev.y2)}` : ''}{ev.yp ? ` (known to the ${ev.yp})` : ''}{ev.u ? ' · approximate' : ''}</dd>
        <dt>Location</dt><dd>{det && det !== 'failed' && det.locationName ? `${det.locationName} · ` : ''}{formatCoords(ev.pos[1], ev.pos[0])}</dd>
        <dt>Type</dt><dd>{ev.k}</dd>
        {ev.wn && <><dt>Part of</dt><dd><button className="why-link" onClick={() => onWar(ev.w!)}>{ev.wn}</button></dd></>}
        <dt>Participants</dt><dd>{det === null ? <span className="faint">Loading from Wikidata…</span> : det === 'failed' ? <span className="faint">Couldn’t reach Wikidata (offline?)</span> : det.participants.length ? det.participants.join(', ') : <span className="faint">none recorded in Wikidata</span>}</dd>
        {det && det !== 'failed' && det.description && <><dt>Wikidata says</dt><dd>{det.description}</dd></>}
      </dl>
      <div className="row wrap gap-4">
        <button className="btn sm primary" onClick={() => onShow(ev)}>Show on map</button>
        {mentions.length > 0 && <button className="btn sm" onClick={() => onJump(mentions[0].cfi)}>↩ Jump to passage</button>}
      </div>
      <SourcesBlock auto={false} sources={[{ name: 'Wikidata', license: 'CC0', url: 'https://www.wikidata.org/', record: `https://www.wikidata.org/wiki/${ev.q}`, note: 'Name, date, place and war from the atlas data; participants, location name and description read live from the same item.' }]} />
    </div>
  );
}

export function WarEvents({ q, name, onEvent }: { q: string; name: string; onEvent: (q: string) => void }) {
  const [list, setList] = useState<AtlasEvent[] | null>(null);
  useEffect(() => { eventsOfWar(q).then(setList).catch(() => setList([])); }, [q]);
  if (!list) return <div className="small muted">Loading…</div>;
  return (
    <div>
      <div className="eyebrow">{name} · {list.length} recorded battles & sieges</div>
      <ol className="atlas-seq">
        {list.map((e) => <li key={e.q}><button className="atlas-war" onClick={() => onEvent(e.q)}>{e.n} <span className="faint">{yearLabel(e.y)}</span></button></li>)}
      </ol>
      <div className="tiny faint">Numbered by date on the map. The numbers are not the route armies took.</div>
    </div>
  );
}

// ── Nearby / what's around here ───────────────────────────────────────────

export const RADII = [10, 25, 50, 100];

export function NearbyPanel({ at, year, radiusMi, setRadiusMi, onResults, onOpenPlace, onEvent }: {
  at?: { name: string; lat: number; lon: number; key?: string };
  year: HistYear; radiusMi: number; setRadiusMi: (n: number) => void;
  onResults: (pins: { key: string; name: string; lat: number; lon: number }[]) => void;
  onOpenPlace: (key: string, name: string) => void;
  onEvent: (q: string) => void;
}) {
  const [inTime, setInTime] = useState(true);
  const [kinds, setKinds] = useState<string[]>(['settlement', 'port', 'fort', 'religious', 'water']);
  const [places, setPlaces] = useState<{ place: GazPlace; km: number }[] | null>(null);
  const [lines, setLines] = useState<{ n: string; k: string; km: number; source: string }[]>([]);
  const [events, setEvents] = useState<(AtlasEvent & { km: number })[]>([]);
  const radiusKm = radiusMi * MILE_KM;
  useEffect(() => {
    setPlaces(null);
    if (!at) return;
    let dead = false;
    (async () => {
      const found = await nearbyPlaces([at.lon, at.lat], radiusKm, { year: inTime ? year : undefined, slack: 50, exclude: at.key }).catch(() => []);
      const [ls, ev] = await Promise.all([linesNear([at.lon, at.lat], radiusKm, inTime ? year : undefined).catch(() => []), eventsNear([at.lon, at.lat], radiusKm, inTime ? year : undefined, 50).catch(() => [])]);
      if (dead) return;
      setPlaces(found);
      setLines(ls.slice(0, 20));
      setEvents(ev.slice(0, 15));
    })();
    return () => { dead = true; };
  }, [at?.lat, at?.lon, at?.key, radiusKm, inTime, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const unnamed = (places ?? []).filter((p) => p.place.title === 'Untitled').length;
  const shown = useMemo(() => (places ?? []).filter((p) => p.place.title !== 'Untitled' && kinds.includes(aroundKind(p.place))), [places, kinds]);
  useEffect(() => { onResults(shown.slice(0, 150).map((p) => ({ key: p.place.key, name: p.place.title, lat: p.place.lat, lon: p.place.lon }))); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!at) return <div className="small muted">Choose a place first — tap one in the book, on the map, or search.</div>;
  const toggleKind = (id: string) => setKinds((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));
  return (
    <div className="col gap-8">
      <div className="small"><b>Around {at.name}</b></div>
      <div className="row wrap gap-4">
        <span className="tiny faint">Within</span>
        {RADII.map((r) => <button key={r} className={`chip ${radiusMi === r ? 'on' : ''}`} style={{ minHeight: 26, fontSize: 12 }} onClick={() => setRadiusMi(r)}>{r} miles</button>)}
      </div>
      <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={inTime} onChange={(e) => setInTime(e.target.checked)} /> Only places recorded around {yearLabel(year)} (undated ones included)</label>
      <div className="row wrap gap-4">
        {AROUND_KINDS.map((k) => {
          const n = (places ?? []).filter((p) => aroundKind(p.place) === k.id).length;
          return <button key={k.id} className={`chip ${kinds.includes(k.id) ? 'on' : ''}`} style={{ minHeight: 26, fontSize: 12 }} onClick={() => toggleKind(k.id)}>{k.label} ({n})</button>;
        })}
      </div>
      {!places ? <div className="small muted">Searching the gazetteer…</div> : (
        <div className="col" style={{ gap: 2 }}>
          {shown.slice(0, 60).map(({ place: p, km }) => (
            <button key={p.key} className="atlas-war" onClick={() => onOpenPlace(p.key, p.title)}>
              <span style={{ opacity: p.precise ? 1 : 0.75 }}>{p.precise ? '●' : '○'} {p.title}</span> <span className="faint">{kmLabel(km)} · {p.types.slice(0, 2).join(', ') || 'type not recorded'} · {span(p.from, p.to)}{existedAround(p, year) ? '' : ''}</span>
            </button>
          ))}
          {shown.length > 60 && <div className="tiny faint">…and {shown.length - 60} more on the map.</div>}
          {!shown.length && <><div className="small muted">None recorded in this radius.</div><EmptyNote type="settlements" at={at} year={year} /></>}
          {unnamed > 0 && <div className="tiny faint">{unnamed} unnamed site{unnamed === 1 ? '' : 's'} (recorded by Pleiades as “Untitled”) not listed.</div>}
        </div>
      )}
      {lines.length > 0 && (
        <div>
          <div className="eyebrow">Roads, rivers & aqueducts</div>
          <div className="small">{lines.map((l) => `${l.n} (${l.k}, ${kmLabel(l.km)})`).join(' · ')}</div>
        </div>
      )}
      {events.length > 0 && (
        <div>
          <div className="eyebrow">Battles & sieges</div>
          <div className="col" style={{ gap: 2 }}>{events.map((e) => <button key={e.q} className="atlas-war" onClick={() => onEvent(e.q)}>{e.n} <span className="faint">{yearLabel(e.y)} · {kmLabel(e.km)}</span></button>)}</div>
        </div>
      )}
      <div className="tiny faint">From Pleiades (places, including ones that no longer exist; roads and rivers), AWMC (roads) and Wikidata (battles). ● precise location · ○ rough location.</div>
    </div>
  );
}

// ── Historical search ─────────────────────────────────────────────────────

export function SearchPanel({ onPlace, onEvent, onWar, onPolity, onOnline }: {
  onPlace: (p: GazPlace) => void; onEvent: (q: string) => void; onWar: (q: string, name: string) => void;
  onPolity: (h: Extract<SearchHit, { kind: 'polity' }>) => void;
  onOnline: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [online, setOnline] = useState<{ name: string; desc: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const s = q.trim();
    if (s.length < 2) return;
    setBusy(true);
    setOnline(null);
    try { setHits(await searchAtlas(s, 10)); } finally { setBusy(false); }
    historicalPlaces.searchPlaces(s).then((c) => setOnline(c.slice(0, 6).map((x) => ({ name: x.place.canonicalName, desc: [x.place.description, x.place.source].filter(Boolean).join(' · ') })))).catch(() => setOnline([]));
  };
  const group = (kind: SearchHit['kind']) => (hits ?? []).filter((h) => h.kind === kind);
  return (
    <div className="col gap-8">
      <form className="row" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <input className="input sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Constantinople, Cannae, Second Punic War…" aria-label="Search the historical map" autoFocus />
        <button className="btn sm primary" disabled={busy || q.trim().length < 2}>{busy ? '…' : 'Search'}</button>
      </form>
      {hits && !hits.length && online && !online.length && <div className="small muted">Nothing found.</div>}
      {group('place').length > 0 && (
        <div>
          <div className="eyebrow">Places (any recorded name)</div>
          {group('place').map((h) => h.kind === 'place' && (
            <button key={h.key} className="atlas-war" onClick={() => onPlace(h.place)}>
              {h.title}{h.matched ? <span className="faint"> — also “{h.matched}”</span> : null}
              <span className="faint"> · {h.place.types.slice(0, 2).join(', ')} · {span(h.place.from, h.place.to)}</span>
            </button>
          ))}
          <div className="tiny faint">Pleiades — names are only linked where Pleiades records them for the same place (e.g. Constantinopolis also recorded as “Istanbul”; Byzantium is its own record that it succeeds).</div>
        </div>
      )}
      {group('war').length > 0 && <div><div className="eyebrow">Wars</div>{group('war').map((h) => h.kind === 'war' && <button key={h.key} className="atlas-war" onClick={() => onWar(h.q, h.title)}>{h.title} <span className="faint">{h.f !== null ? yearLabel(h.f) : '?'}–{h.t !== null ? yearLabel(h.t) : '?'}</span></button>)}</div>}
      {group('event').length > 0 && <div><div className="eyebrow">Battles, sieges & campaigns</div>{group('event').map((h) => h.kind === 'event' && <button key={h.key} className="atlas-war" onClick={() => onEvent(h.q)}>{h.title} <span className="faint">{yearLabel(h.y)}{h.war ? ` · ${h.war}` : ''}</span></button>)}</div>}
      {group('polity').length > 0 && <div><div className="eyebrow">Kingdoms, empires & states</div>{group('polity').map((h) => h.kind === 'polity' && <button key={h.key} className="atlas-war" onClick={() => onPolity(h)}>{h.title} <span className="faint">{yearLabel(h.f)}–{yearLabel(h.t)}{h.c ? ` · ${h.c}` : ''}</span></button>)}<div className="tiny faint">Cliopatria</div></div>}
      {online && online.length > 0 && (
        <div>
          <div className="eyebrow">Modern & other names (online)</div>
          {online.map((o, i) => <button key={i} className="atlas-war" onClick={() => onOnline(o.name)}>{o.name} <span className="faint">{o.desc}</span></button>)}
        </div>
      )}
    </div>
  );
}

// ── Saved: bookmarks, places met, notes ───────────────────────────────────

export function SavedPanel({ bookId, onOpenBookmark, onOpenVisit, onJump, onOpenPlace }: {
  bookId?: string;
  onOpenBookmark: (b: MapBookmarkRow) => void;
  onOpenVisit: (key: string, name: string, written: string) => void;
  onJump: (cfi: string) => void;
  onOpenPlace: (key: string, name: string) => void;
}) {
  const marks = useLiveQuery(() => db.mapBookmarks.orderBy('createdAt').reverse().toArray(), []);
  const visits = useLiveQuery(async (): Promise<PlaceVisitRow[]> => (bookId ? db.placeVisits.where('bookId').equals(bookId).toArray() : []), [bookId]);
  const notes = useLiveQuery(() => db.mapNotes.orderBy('updatedAt').reverse().toArray(), []);
  const mine = (marks ?? []).filter((m) => !bookId || m.bookId === bookId);
  const other = (marks ?? []).filter((m) => bookId && m.bookId !== bookId);
  const row = (b: MapBookmarkRow) => (
    <div key={b.id} className="row between atlas-war" style={{ gap: 6 }}>
      <button className="grow" style={{ textAlign: 'left', background: 'none', border: 0, font: 'inherit', color: 'inherit', padding: 0, cursor: 'pointer' }} onClick={() => onOpenBookmark(b)}>
        🔖 {b.title} <span className="faint">{b.chapter ? `· ${b.chapter}` : ''}</span>
      </button>
      <button className="why-link tiny" onClick={() => deleteBookmark(b.id)} aria-label={`Delete ${b.title}`}>delete</button>
    </div>
  );
  return (
    <div className="col gap-12">
      <div>
        <div className="eyebrow">Saved map views</div>
        {mine.length ? mine.map(row) : <div className="small muted">None yet. Use 🔖 to save where you are, the year, the layers and the selected place.</div>}
        {other.length > 0 && <details className="mt-4"><summary className="small">From other books ({other.length})</summary>{other.map(row)}</details>}
      </div>
      {bookId && (
        <div>
          <div className="eyebrow">Places you’ve met in this book</div>
          {(visits ?? []).length ? (visits ?? []).sort((a, b) => a.firstAt - b.firstAt).map((v) => (
            <div key={v.id} className="row between atlas-war" style={{ gap: 6 }}>
              <button className="grow" style={{ textAlign: 'left', background: 'none', border: 0, font: 'inherit', color: 'inherit', padding: 0, cursor: 'pointer' }} onClick={() => onOpenVisit(v.placeKey, v.name, v.written)}>
                📍 {v.name}{v.written.toLowerCase() !== v.name.toLowerCase() ? <span className="faint"> · “{v.written}”</span> : null}{v.chapter ? <span className="faint"> · {v.chapter}</span> : null}
              </button>
              {v.cfi && <button className="why-link tiny" onClick={() => onJump(v.cfi!)}>passage</button>}
              <button className="why-link tiny" onClick={() => forgetVisit(v.id)} aria-label={`Forget ${v.name}`}>✕</button>
            </div>
          )) : <div className="small muted">Places you tap or map while reading this book collect here.</div>}
        </div>
      )}
      <div>
        <div className="eyebrow">Your place notes</div>
        {(notes ?? []).length ? (notes ?? []).map((n) => (
          <button key={n.id} className="atlas-war" onClick={() => onOpenPlace(n.placeKey, n.placeName)}><b>{n.placeName}</b> <span className="faint">{n.text.slice(0, 80)}</span></button>
        )) : <div className="small muted">No notes yet.</div>}
        <div className="tiny faint">Private — stored only on this device and in your backups.</div>
      </div>
    </div>
  );
}
