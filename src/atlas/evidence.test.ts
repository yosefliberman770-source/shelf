// Resolving a name read in a book with every source weighed together:
// the real offline packs, plus a stand-in for the World Historical Gazetteer.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { resetWhgCooldown } from '../world/whg';
import { resolvePlace } from './resolve';

const PUB = join(__dirname, '../../public');
let whg: ((name: string) => Response) | undefined;
const whgCalls: string[] = [];
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (url.startsWith('https://whgazetteer.org/api/index/')) {
    const name = decodeURIComponent(url.split('name=')[1]);
    whgCalls.push(name);
    if (!whg) throw new TypeError('offline');
    return whg(name);
  }
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel), 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } }); } catch { return new Response('not found', { status: 404 }); }
});

const ROME_INDEX = {
  attribution: { datasets: { tgn_filtered_01: { name: 'Getty TGN (partial)', source_url: 'http://www.getty.edu/research/tools/vocabularies/tgn/' }, black: { name: 'DK Atlas of World History' } } },
  features: [
    { geometry: { type: 'Point', coordinates: [12.4833, 41.9] }, properties: { title: 'Rome', place_id: 1, index_role: 'parent', child_place_ids: [2], dataset: 'tgn_filtered_01', variants: ['Roma'], timespans: [], ccodes: ['IT'], links: [{ identifier: 'tgn:7000874', type: 'closeMatch' }] } },
    { geometry: { type: 'Point', coordinates: [12.49, 41.89] }, properties: { title: 'Rome', place_id: 2, index_role: 'child', dataset: 'black' } },
    { geometry: { type: 'Point', coordinates: [-85.16, 34.26] }, properties: { title: 'Rome', place_id: 3, index_role: 'parent', dataset: 'tgn_filtered_01', timespans: [], ccodes: ['US'] } },
  ],
};

beforeEach(async () => { whg = undefined; whgCalls.length = 0; resetWhgCooldown(); await db.worldCache.clear(); await db.placeCache.clear(); });

describe('place resolution with combined evidence', () => {
  it('keeps working offline: WHG unreachable leaves the offline answer intact', async () => {
    const r = await resolvePlace('Carthage', { year: -218, detection: 'cue' });
    // Shown by the book's own word; the dataset's title is kept as the record title.
    expect(r.place?.title).toBe('Carthage');
    expect(r.place?.recordTitle).toBe('Carthago');
    expect(r.status).toBe('HIGH');
    // A clear offline match doesn't wait for WHG.
    expect(whgCalls).toHaveLength(0);
    // An ambiguous name stays ambiguous when WHG can't be reached — never guessed.
    const rome = await resolvePlace('Rome', { detection: 'cue' });
    expect(rome.status).toBe('AMBIGUOUS');
    expect(rome.evidence?.whg?.status).toBe('unavailable');
    expect(rome.evidence?.statements.join(' ')).toMatch(/offline gazetteers only/);
  });

  it('lets independent WHG attestations favour one offline candidate — as "likely", with the reasons', async () => {
    whg = () => new Response(JSON.stringify(ROME_INDEX), { status: 200 });
    const r = await resolvePlace('Rome', { detection: 'cue' });
    expect(r.status).toBe('MEDIUM');
    expect(r.place?.title).toBe('Rome');
    expect(r.place?.recordTitle).toBe('Roma');
    expect(r.place?.gaz?.gazetteer).toBe('pleiades');
    // The other reading is kept, not discarded.
    expect(r.candidates.map((c) => c.gaz?.gazetteer)).toContain('viabundus');
    expect(r.place?.why.reason).toMatch(/independent sources agree/);
    // WHG's sources are listed with the place, with provenance.
    expect(r.place?.sources.some((s) => s.name === 'World Historical Gazetteer — Getty TGN (partial)' && s.accessed)).toBe(true);
    expect(r.place?.assessment?.statements.join(' ')).toMatch(/different identification/);
  });
});
