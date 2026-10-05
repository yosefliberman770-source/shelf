// The small card shown when a place name in the book is tapped: what the
// place was called, when, and whose territory it was in — from the datasets,
// with a way to see why the name was matched. "View on map" opens the atlas.
import { useEffect, useState } from 'react';
import { politiesAt, type Polity } from '../../atlas/context';
import { dateBasisNote, type GazPlace, GAZETTEERS, matchName, namesAround, normName, recordFit, rulerAt, TEMPORAL_LABEL, temporalSupport } from '../../atlas/gazetteer';
import { CERTAINTY_LABEL, type Detection, DETECTION_LABEL } from '../../atlas/resolve';
import { yearLabel } from '../../atlas/time';
import { DATE_SOURCE_LABEL, type DateContext } from '../../lib/history/placeDetect';
import { politiesLine, span } from './atlasParts';

export function PlacePopup({ written, place, date, detection, colors, onMap, onClose }: {
  written: string;
  detection: Detection;
  place: GazPlace;
  date: DateContext;
  colors: { bg: string; fg: string; muted: string; line: string };
  onMap: () => void;
  onClose: () => void;
}) {
  const [pol, setPol] = useState<Polity[] | null>(null);
  const [why, setWhy] = useState(false);
  const [reason, setReason] = useState('');
  const year = date.year;
  useEffect(() => {
    let dead = false;
    setPol(null);
    if (year !== undefined) politiesAt([place.lon, place.lat], year).then((p) => !dead && setPol(p)).catch(() => !dead && setPol([]));
    matchName(written, year).then((m) => !dead && setReason(m.reason)).catch(() => {});
    return () => { dead = true; };
  }, [place.key, year, written]);
  const names = (year !== undefined ? namesAround(place, year) : place.names).filter((n) => normName(n.name) !== normName(written)).slice(0, 5);
  const cert = place.uncertain >= 1 ? 'uncertain' : place.precise ? 'known' : 'approximate';
  const info = GAZETTEERS.find((g) => g.id === place.gazetteer)!;
  return (
    <div className="place-pop" role="dialog" aria-label={`Place: ${written}`} style={{ background: colors.bg, color: colors.fg, borderColor: colors.line }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="place-pop-title">{written}</div>
          {normName(place.title) !== normName(written) && <div className="small" style={{ color: colors.muted }}>Recorded as <bdi>{place.title}</bdi> <span className="tiny">({info.name})</span></div>}
        </div>
        <button className="btn sm ghost" style={{ color: colors.fg }} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <dl className="place-pop-facts">
        {names.length > 0 && <><dt>Historical names</dt><dd>{names.map((n, i) => <span key={i}>{i > 0 ? ' · ' : ''}<bdi dir="auto">{n.name}</bdi></span>)}</dd></>}
        <dt>Historical date</dt>
        <dd>{year !== undefined ? <>{yearLabel(year)}{date.approximate ? ' (approx.)' : ''} <span className="tiny" style={{ color: colors.muted }}>· {DATE_SOURCE_LABEL[date.source]}</span></> : <span style={{ color: colors.muted }}>Not given by the book — set it on the map</span>}</dd>
        <dt>Recorded</dt><dd>{span(place.from, place.to)} <span className="tiny" style={{ color: colors.muted }}>({dateBasisNote(place)})</span>
          {place.datesAsWritten && <div className="tiny" style={{ color: colors.muted }}>The source writes: {place.datesAsWritten.from ?? '…'} – {place.datesAsWritten.to ?? '…'}</div>}
          {place.meaningUnknown && <div className="tiny" style={{ color: colors.muted }}>{place.meaningUnknown}</div>}</dd>
        {place.note && <><dt>Correction</dt><dd className="tiny">{place.note}</dd></>}
        {place.qa && <><dt>Data check</dt><dd className="tiny">{place.qa}</dd></>}
        {place.sourceType && <><dt>In the source</dt><dd>{place.sourceType}{place.typeDoubt ? <span className="tiny" style={{ color: colors.muted }}> (the source is not sure of the type)</span> : null}</dd></>}
        {year !== undefined && <><dt>At this date</dt><dd>{TEMPORAL_LABEL[temporalSupport(recordFit(place, year))]}</dd></>}
        {(place.partOf.length > 0 || (pol && pol.length > 0)) && (
          <><dt>Region / political entity</dt><dd>{[pol?.length ? `${politiesLine(pol)} (${yearLabel(year!)})` : '', place.rulers?.length ? (rulerAt(place, year) ? `ruled by ${rulerAt(place, year)} (${info.name})` : '') : place.partOf.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</dd></>
        )}
      </dl>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm primary" onClick={onMap}>🗺 View on map</button>
        <button className="btn sm ghost" style={{ color: colors.fg }} onClick={() => setWhy(!why)} aria-expanded={why}>Why this place?</button>
      </div>
      {why && (
        <div className="tiny mt-8" style={{ color: colors.muted, lineHeight: 1.5 }}>
          <div>Matched from: “{written}” → <b><bdi>{place.title}</bdi></b> in {info.name}.</div>
          {reason && <div>{reason}</div>}
          <div>{DETECTION_LABEL[detection]}.</div>
          <div>{place.meaningUnknown ? 'Position as the source gives it; the source does not document its precision' : CERTAINTY_LABEL[cert]}. <a href={place.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View the {info.name} record ↗</a> ({info.license})</div>
          <div>Matched automatically; the dataset — not AI — supplies the location, names and dates.</div>
        </div>
      )}
    </div>
  );
}
