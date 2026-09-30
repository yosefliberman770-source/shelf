// Choosing sources for an actual question: this place, this year, this
// kind of information. Specialist datasets that cover the question come
// first; general and crowd-sourced ones follow and never silently override
// them. Sources Shelf can't reach are still listed, so the reader knows
// better data exists.
import type { HistYear } from '../atlas/time';
import { type DataType, QUALITY_RANK, regionAt, regionLabel, type Quality, type RegionId } from './axes';
import { sourceQuality } from './coverage';
import { type SourceEntry, SOURCES, TIER_LABEL } from './registry';

export interface Choice { source: SourceEntry; quality: Quality; usable: boolean; why: string }
export interface Selection { region?: RegionId; year: HistYear; type: DataType; choices: Choice[]; use: Choice[]; explanation: string }

const usable = (s: SourceEntry) => s.access === 'offline' || s.access === 'live';

export function selectSources(q: { lon: number; lat: number; year: HistYear; type: DataType }): Selection {
  const region = regionAt(q.lon, q.lat);
  const choices: Choice[] = [];
  for (const s of SOURCES) {
    const quality = sourceQuality(s, region, q.year - 25, q.year + 25, q.type);
    if (quality === 'none') continue;
    const why = `${TIER_LABEL[s.tier]} · ${quality} coverage for this area and period${usable(s) ? '' : s.access === 'excluded' ? ` · not used: ${s.note ?? s.license}` : ` · not in Shelf yet${s.note ? ` (${s.note})` : ''}`}`;
    choices.push({ source: s, quality, usable: usable(s), why });
  }
  // Specialist tiers first, then better coverage; ties keep registry order.
  choices.sort((a, b) => a.source.tier.localeCompare(b.source.tier) || QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality]);
  const use = choices.filter((c) => c.usable);
  const top = use[0];
  const better = choices.find((c) => !c.usable && c.source.tier <= (top?.source.tier ?? 'D') && QUALITY_RANK[c.quality] > QUALITY_RANK[top?.quality ?? 'none']);
  const explanation = !choices.length
    ? `No structured digital source Shelf knows of covers ${regionLabel(region)} around this date for this kind of information.`
    : `${top ? `Using ${use.map((c) => c.source.name).join(', ')} (in this order).` : 'None of the sources that cover this can be used in Shelf yet.'}${better ? ` Better data exists in ${better.source.name}, which Shelf can’t use yet.` : ''}`;
  return { region, year: q.year, type: q.type, choices, use, explanation };
}
