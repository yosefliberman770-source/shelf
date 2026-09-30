// Saying what kind of "don't know" it is. A missing record is never shown as
// historical absence: the app separates what historians are unsure about,
// where sources disagree, and where Shelf simply has no structured data.
import type { HistYear } from '../atlas/time';
import { type DataType, DATA_TYPES, periodLabel, QUALITY_LABEL, QUALITY_MARK, QUALITY_RANK, regionLabel } from './axes';
import { cellAt } from './coverage';

export type EvidenceKind = 'confirmed' | 'single-source' | 'historical-uncertainty' | 'source-disagreement' | 'database-limitation' | 'no-structured-data' | 'maps-only';

export const EVIDENCE: Record<EvidenceKind, { label: string; text: string }> = {
  confirmed: { label: 'Confirmed', text: 'Several independent or high-quality sources agree.' },
  'single-source': { label: 'One source', text: 'Recorded by one dataset; not cross-checked.' },
  'historical-uncertainty': { label: 'Historical uncertainty', text: 'Historians disagree or the evidence is incomplete — the source itself marks this as uncertain.' },
  'source-disagreement': { label: 'Sources disagree', text: 'Different sources give different answers. Both are shown.' },
  'database-limitation': { label: 'Database limitation', text: 'Relevant historical evidence may exist, but Shelf doesn’t have structured data for it here.' },
  'no-structured-data': { label: 'No structured data', text: 'No open, structured digital dataset Shelf knows of covers this. That is a gap in digital data, not in history.' },
  'maps-only': { label: 'Maps only', text: 'Original historical maps exist for this, but no GIS reconstruction.' },
};

/**
 * Why a list or layer is empty here: a limitation of Shelf's data, a gap in
 * digital data generally, or genuinely nothing recorded in good coverage.
 */
/** A catalogued source with the registry's reason it isn't used here (licence, not integrated yet, …). */
const withReason = (s: { name: string; note?: string }) => `${s.name} (${s.note ? s.note.replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase()) : 'not integrated into Shelf yet'})`;

export function explainEmpty(type: DataType, lon: number, lat: number, year: HistYear): { kind: EvidenceKind | 'none-recorded'; mark: string; text: string } {
  const c = cellAt(lon, lat, year, type);
  const what = DATA_TYPES.find((t) => t.id === type)!.label.toLowerCase();
  const where = `${regionLabel(c.region)}, ${periodLabel(c.period)}`;
  const tail = ' This does not mean nothing existed.';
  if (c.inShelf === 'none' && c.exists !== 'none') {
    const better = c.sources.filter((s) => s.access === 'catalogued').slice(0, 2).map(withReason).join('; ');
    return { kind: 'database-limitation', mark: QUALITY_MARK.none, text: `Shelf has no structured ${what} for ${where}. ${better ? `Data exists in ${better}.` : ''}${tail}` };
  }
  if (c.exists === 'none') {
    const maps = type !== 'maps' && cellAt(lon, lat, year, 'maps').exists !== 'none';
    return maps
      ? { kind: 'maps-only', mark: QUALITY_MARK.none, text: `No GIS reconstruction of ${what} for ${where}, though original historical maps exist (see Maps).${tail}` }
      : { kind: 'no-structured-data', mark: QUALITY_MARK.none, text: `No open, structured digital data for ${what} in ${where}.${tail}` };
  }
  if (QUALITY_RANK[c.exists] > QUALITY_RANK[c.inShelf]) {
    const better = c.sources.filter((s) => s.access === 'catalogued' && QUALITY_RANK[s.quality] > QUALITY_RANK[c.inShelf]).slice(0, 2).map(withReason).join('; ');
    return { kind: 'database-limitation', mark: QUALITY_MARK[c.inShelf], text: `Shelf’s data for ${what} in ${where} is ${QUALITY_LABEL[c.inShelf].toLowerCase()}; better data exists in ${better}.${tail}` };
  }
  if (c.inShelf === 'limited') return { kind: 'database-limitation', mark: QUALITY_MARK.limited, text: `Shelf’s coverage of ${what} for ${where} is limited (${QUALITY_LABEL.limited.toLowerCase()}).${tail}` };
  return { kind: 'none-recorded', mark: QUALITY_MARK[c.inShelf], text: `None recorded here in ${c.sources.filter((s) => s.access === 'offline' || s.access === 'live').map((s) => s.name).slice(0, 2).join(', ')} (coverage for ${where}: ${QUALITY_LABEL[c.inShelf].toLowerCase()}). Records can still be incomplete.` };
}
