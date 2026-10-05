// Stage 5 part 2 (RM-09): place names found in book text — towns that end like adjectives, any alphabet's capitals,
// lists, "St"/"The" names; people and ordinary words left alone; events matched however the book writes them.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolvePlace } from '../../atlas/resolve';
import { eventForms, foldForMatch } from '../../world/bookWorld';
import { detectPlaces, screenMentions } from './placeDetect';

const PUB = join(__dirname, '../../../public');
vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input);
  if (!/\/(atlas|world)\//.test(url)) throw new TypeError('offline');
  const rel = url.replace(/^.*?\/(atlas|world)\//, '$1/');
  try { return new Response(readFileSync(join(PUB, rel)), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
});
const found = async (t: string) => (await screenMentions(detectPlaces(t), 1300)).map((m) => m.name);

describe('towns are not adjectives (A12-001, A17-004)', () => {
  it('Norwich, Munich, Helsinki, Nagasaki after a place cue are places', async () => {
    expect(await found('He rode to Norwich in 1200 and then to Munich.')).toEqual(['Norwich', 'Munich']);
    expect(await found('They sailed to Helsinki and Nagasaki.')).toEqual(['Helsinki', 'Nagasaki']);
  });
  it('a real adjective before a noun is still an adjective', () => {
    expect(detectPlaces('the Venetian fleet sailed').find((m) => m.name === 'Venetian')?.evidence.demonym).toBe(true);
  });
});

describe('names the scan used to miss (A12-011, A17-005, A17-008, A20-005)', () => {
  it('lists after one cue', async () => {
    expect(await found('The army marched to Lyon, Dijon and Troyes.')).toEqual(['Lyon', 'Dijon', 'Troyes']);
  });
  it('the same list in another order gives the same places', async () => {
    expect((await found('The army marched to Troyes, Lyon and Dijon.')).sort()).toEqual(['Dijon', 'Lyon', 'Troyes']);
  });
  it('“and” running on into a sentence is not a list', () => {
    expect(detectPlaces('He went to Paris and John followed him.').map((m) => m.name)).toEqual(['Paris']);
  });
  it('capitals beyond A–Z', async () => {
    expect(await found('Merchants came from Łódź, Örebro and Žilina.')).toEqual(['Łódź', 'Örebro', 'Žilina']);
  });
  it('“St” and “The” names', async () => {
    expect(await found('He went to St Albans and then to The Hague.')).toEqual(['St Albans', 'The Hague']);
  });
});

describe('people and ordinary words are not places (A20-007, A12-015)', () => {
  it('“wrote to Henry”, “a portrait of Matilda”, “Edward’s camp”', async () => {
    expect(await found('He wrote to Henry about the war.')).toEqual([]);
    expect(await found('a portrait of Matilda hung there')).toEqual([]);
    expect(await found('They reached Edward’s camp at dawn.')).toEqual([]);
  });
  it('“the Church” and “Franciscans” are not polities', async () => {
    expect((await resolvePlace('Church', { year: 1300, detection: 'cue', online: false })).place?.title ?? '').not.toMatch(/Papal/);
    expect((await resolvePlace('Franciscans', { year: 1300, detection: 'cue', online: false })).place?.title ?? '').not.toMatch(/France/);
  });
});

describe('events named in a book (A8-031, A8-042)', () => {
  it('accents and typographic apostrophes don’t hide a name', () => {
    expect(foldForMatch('The Siege of Orléans — Joan’s march')).toBe("the siege of orleans - joan's march");
  });
  it('a battle written another way than its label', () => {
    const re = eventForms('Battle of Hastings')!;
    expect(re.test(foldForMatch('the battle at Hastings'))).toBe(true);
    expect(re.test(foldForMatch('after the Hastings battle'))).toBe(true);
    expect(re.test(foldForMatch('the road to Hastings'))).toBe(false);
    expect(eventForms('Thirty Years’ War')).toBeUndefined();
  });
});
