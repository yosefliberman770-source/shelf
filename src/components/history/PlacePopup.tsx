// The small card shown when a place name in the book is tapped: what the
// place was called, when, and whose territory it was in — from the datasets,
// with a way to see why the name was matched. "View on map" opens the atlas.
import { useEffect, useState } from 'react';
import { politiesAt, type Polity } from '../../atlas/context';
import { type GazPlace, GAZETTEERS, loadGazetteer, matchName, namesAround, normName } from '../../atlas/gazetteer';
import { CERTAINTY_LABEL, type Detection, DETECTION_LABEL } from '../../atlas/resolve';
import { yearLabel } from '../../atlas/time';
import { DATE_SOURCE_LABEL, type DateContext } from '../../lib/history/placeDetect';
import { span } from './atlasParts';

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
    loadGazetteer().then((g) => !dead && setReason(matchName(g, written, year).reason)).catch(() => {});
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
          {normName(place.title) !== normName(written) && <div className="small" style={{ color: colors.muted }}>{place.title} <span className="tiny">({info.name})</span></div>}
        </div>
        <button className="btn sm ghost" style={{ color: colors.fg }} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <dl className="place-pop-facts">
        {names.length > 0 && <><dt>Historical names</dt><dd>{names.map((n) => n.name).join(' · ')}</dd></>}
        <dt>Historical date</dt>
        <dd>{year !== undefined ? <>{yearLabel(year)}{date.approximate ? ' (approx.)' : ''} <span className="tiny" style={{ color: colors.muted }}>· {DATE_SOURCE_LABEL[date.source]}</span></> : <span style={{ color: colors.muted }}>Not given by the book — set it on the map</span>}</dd>
        <dt>Recorded</dt><dd>{span(place.from, place.to)}</dd>
        {(place.partOf.length > 0 || (pol && pol.length > 0)) && (
          <><dt>Region / political entity</dt><dd>{[pol?.length ? `${pol.map((p) => `${p.edge ? 'at the edge of ' : ''}${p.n}`).join(' / ')} (${yearLabel(year!)})` : '', place.partOf.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</dd></>
        )}
      </dl>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm primary" onClick={onMap}>🗺 View on map</button>
        <button className="btn sm ghost" style={{ color: colors.fg }} onClick={() => setWhy(!why)} aria-expanded={why}>Why this place?</button>
      </div>
      {why && (
        <div className="tiny mt-8" style={{ color: colors.muted, lineHeight: 1.5 }}>
          <div>Matched from: “{written}” → <b>{place.title}</b> in {info.name}.</div>
          {reason && <div>{reason}</div>}
          <div>{DETECTION_LABEL[detection]}.</div>
          <div>{CERTAINTY_LABEL[cert]}. <a href={place.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View the {info.name} record ↗</a> ({info.license})</div>
          <div>Matched automatically; the dataset — not AI — supplies the location, names and dates.</div>
        </div>
      )}
    </div>
  );
}
