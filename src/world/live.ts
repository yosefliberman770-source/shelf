// Live specialist sources, queried from the phone only when a question needs
// them, with answers cached locally (never the same request twice within the
// cache period). A source that can't be reached says "unavailable" — it is
// never read as "nothing existed".
import { db } from '../db/db';
import type { HistYear } from '../atlas/time';
import { fromIsoRange, fromTgaz, type HistDate } from './histdate';

const DAY = 86_400_000;

/** Fetch JSON through the local cache. Failures are not cached. */
export async function cachedJSON<T>(url: string, ttlDays = 30, signal?: AbortSignal): Promise<T> {
  const hit = await db.worldCache.get(url).catch(() => undefined);
  if (hit && Date.now() - hit.at < ttlDays * DAY) return hit.data as T;
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status}`);
  const text = await r.text();
  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new Error('The source answered with something other than data (it may be busy).'); }
  await db.worldCache.put({ id: url, data, at: Date.now() }).catch(() => {});
  return data;
}

// ── CHGIS / TGAZ (China, 222 BCE – 1911) ──────────────────────────────────

export interface ChgisPlace { id: string; name: string; transcription: string; when: HistDate; parent?: string; type?: string; lon?: number; lat?: number; uri: string }

/** CHGIS place names (optionally only those valid in a given year). */
export async function chgisSearch(name: string, year?: HistYear, signal?: AbortSignal): Promise<ChgisPlace[]> {
  const q = new URLSearchParams({ fmt: 'json', n: name });
  if (year !== undefined) q.set('yr', String(year));
  const d = await cachedJSON<{ placenames?: Record<string, string>[] }>(`https://chgis.hudci.org/tgaz/placename?${q}`, 90, signal);
  return (d.placenames ?? []).map((p) => {
    const xy = (p['xy coordinates'] ?? '').split(',').map((v) => Number(v.trim()));
    return {
      id: p.sys_id, name: p.name, transcription: p.transcription, when: fromTgaz(p.years), parent: p['parent name'], type: p['feature type'],
      lon: Number.isFinite(xy[0]) ? xy[0] : undefined, lat: Number.isFinite(xy[1]) ? xy[1] : undefined, uri: p.uri,
    };
  });
}

// ── HistoGIS (Europe, 1815–1919) ──────────────────────────────────────────

export interface HistogisUnit { name: string; altName?: string; unit?: string; when: HistDate; source: string; sourceUrl?: string; wikidata?: string; areaKm2?: number }

/** Which administrative and state units contained this point on a date (HistoGIS). */
export async function histogisWhereWas(lat: number, lon: number, year: HistYear, signal?: AbortSignal): Promise<HistogisUnit[]> {
  if (year < 1815 || year > 1920) return [];
  const url = `https://histogis.acdh.oeaw.ac.at/api/where-was/?lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}&when=${year}-07-01`;
  const d = await cachedJSON<{ features?: { properties: Record<string, string | number | null> }[] }>(url, 180, signal);
  return (d.features ?? []).map(({ properties: p }) => ({
    name: String(p.name ?? ''), altName: p.alt_name ? String(p.alt_name) : undefined, unit: p.adm_name ? String(p.adm_name) : undefined,
    when: fromIsoRange(p.start_date ? String(p.start_date) : undefined, p.end_date ? String(p.end_date) : undefined, p.date_accuracy ? String(p.date_accuracy) : undefined, 'HistoGIS'),
    source: String(p.source_name ?? 'HistoGIS'), sourceUrl: p.source ? String(p.source) : undefined, wikidata: p.wikidata_id ? String(p.wikidata_id) : undefined,
    areaKm2: typeof p.spatial_extent === 'number' ? p.spatial_extent : Number(p.spatial_extent) || undefined,
  })).sort((a, b) => (b.areaKm2 ?? 0) - (a.areaKm2 ?? 0));
}

// World Historical Gazetteer lookups live in ./whg.ts (one client, one cache, provenance kept).
