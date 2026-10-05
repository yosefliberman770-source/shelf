// Gazetteers: offline lookup of historical place names, by period and region.
//
// Several specialist gazetteers are built into one tiled index
// (public/world/places): Pleiades for the ancient world, Viabundus for
// northern Europe 1350–1650, al-Ṯurayyā for the early Islamic world. Each row
// keeps its own source, identifier, dates and certainty. The app only ever
// loads the name shard or map cells a question needs — never the whole
// index. Names are linked to a place only when its dataset records that name
// for it; places from different datasets are treated as the same place only
// when they carry the name *and* lie within a few kilometres of each other.
import { SPEC_DATASETS, type SpecDatasetId } from './spec-datasets';
import { getJSON, km, type Pos } from './data';
import { loadPrivateData, privateJSON } from './privateData';
import { contextDistance, type GeoContext } from './geocontext';
import { placeCoverageAt } from '../world/measured';
import type { EntityKind } from './mention';
import { attestedAt, eligibleAt, type Envelope, type EnvelopeBasis, ENVELOPE_LABEL, type HistYear, type StartKind, timeFit, type TimeFit } from './time';

export interface GazName { name: string; from?: HistYear; to?: HistYear; lang?: string }
export type GazetteerId = 'pleiades' | 'viabundus' | 'althurayya' | 'wikidata' | 'germaniasacra' | 'buringh' | 'hre' | 'merimee' | 'finreg' | 'wbohemia' | 'bridges1250'
  | 'nsh' | 'nokm' | 'canmore' | 'irlsmr' | 'nid' | 'ivillaris' | 'ottomannfs' | 'generalkarte' | 'cassini' | 'lutsch' | 'sirkd' | 'lvmon' | 'hrreg' | 'r3verst' | 'rohgis' | 'transice' | 'dissiloc' | 'swegeo' | 'tyrolmine' | 'arkas' | 'wdextra'
  // From the owner's private data pack only (see privateData.ts):
  | 'tib' | 'mfairs' | 'afontium' | 'ran' | 'dicotopo' | 'raa' | 'ebidat' | 'darmc' | 'dkff' | 'ariadne' | 'latin1772' | 'amcr' | SpecDatasetId;
export interface Relation { title: string; key?: string; type: string; reverse?: boolean }
export interface GazPlace {
  /** "<gazetteer>:<id>", e.g. "pleiades:423025" */
  key: string;
  gazetteer: GazetteerId;
  id: number | string;
  title: string;
  lon: number;
  lat: number;
  precise: boolean;
  types: string[];
  from?: HistYear;
  to?: HistYear;
  /** The dates are the dataset's overall period (e.g. al-Ṯurayyā's 9th–10th c.), not this place's. */
  datasetPeriod?: boolean;
  /** No dates of its own, but a period its evidence allows (see time.ts). Absent = no temporal evidence. */
  envelope?: Envelope;
  /** 0 certain, 1 less certain, 2 uncertain (the source's own rating). */
  uncertain: number;
  names: GazName[];
  /** Places this one is recorded as part of (region, province…), by title. */
  partOf: string[];
  /** Other relationships the dataset records ("succeeds", "port of", "near"…), both directions. */
  related: Relation[];
  /** Dated roles (Viabundus: town 1250–, toll 1400–1500…). */
  roles?: [string, number | null, number | null][];
  /** What the start date means, as the source words it ("founded", "first mention", "Germania Sacra" tenure). */
  dateBasis?: string;
  /** Whether the start date is when it began ("founded") or only when evidence for it begins ("attested"). */
  startKind?: StartKind;
  /** Estimated inhabitants in thousands per sample year (Buringh), with how each was estimated. */
  population?: { year: number; thousands: number; estimate?: string }[];
  /** A correction the build made to the source, stated. */
  note?: string;
  /** The record's id in its source (differs from `id` only when several records share one source id). */
  sourceId?: number | string;
  url: string;
}

export interface GazetteerInfo {
  id: GazetteerId; name: string; license: string; url: string;
  coverage: [HistYear, HistYear];
  /** The period the dataset is really about; an undated record is only plausible inside it. */
  core: [HistYear, HistYear];
  /** Rough box [W, S, E, N] of where the dataset has records. */
  box: [number, number, number, number];
  describe: string;
  record: (id: number | string) => string;
  /** Only attests places mentioned in its documents (a register's index of names): it corroborates and dates a
   *  place, but is never the record shown for it, and its name forms never decide between places. */
  attests?: true;
}

/** The gazetteer registry (see also src/world/registry.ts). A new dataset is one entry plus its rows in the index. */
export const GAZETTEERS: GazetteerInfo[] = [
  { id: 'pleiades', name: 'Pleiades', license: 'CC BY 3.0', url: 'https://pleiades.stoa.org/', coverage: [-3000, 1500], core: [-750, 640], box: [-20, -25, 120, 65], describe: 'Ancient places, their names and dates.', record: (id) => `https://pleiades.stoa.org/places/${id}` },
  { id: 'viabundus', name: 'Viabundus', license: 'CC BY 4.0', url: 'https://www.viabundus.eu/', coverage: [1250, 1700], core: [1350, 1650], box: [-2, 45, 32, 66], describe: 'Towns, settlements, tolls, fairs and harbours of northern Europe, 1350–1650.', record: () => 'https://www.viabundus.eu/' },
  { id: 'althurayya', name: 'al-Ṯurayyā', license: 'Apache-2.0 (after G. Cornu)', url: 'https://althurayya.github.io/', coverage: [700, 1100], core: [800, 1000], box: [-10, 5, 85, 56], describe: 'Places of the early Islamic world (9th–10th c.), after Cornu’s atlas.', record: () => 'https://althurayya.github.io/' },
  { id: 'wikidata', name: 'Wikidata', license: 'CC0', url: 'https://www.wikidata.org/', coverage: [300, 1900], core: [500, 1650], box: [-32, 24, 62, 72], describe: 'Castles, monasteries, cathedrals, dioceses, fortifications, bridges and settlements with a recorded founding date or first mention, across Europe and the Mediterranean (snapshot).', record: (id) => `https://www.wikidata.org/wiki/${id}` },
  { id: 'germaniasacra', name: 'Germania Sacra', license: 'CC BY-SA 3.0', url: 'https://klosterdatenbank.germania-sacra.de/', coverage: [400, 1810], core: [700, 1803], box: [-4, 41, 28, 60], describe: 'Monasteries and canonries of the Holy Roman Empire with the dated tenure of each religious order.', record: (id) => `https://klosterdatenbank.germania-sacra.de/gsn/${id}` },
  { id: 'hre', name: 'Princes and Townspeople (Deutsches Städtebuch)', license: 'CC0', url: 'https://doi.org/10.7910/DVN/ZGSJED', coverage: [700, 1806], core: [1100, 1806], box: [4, 45, 24, 56], describe: 'Towns of the Holy Roman Empire: first written mention, town charter, market grants and the ruling territory each year from 1300.', record: () => 'https://doi.org/10.7910/DVN/TYAGVO' },
  { id: 'merimee', name: 'Mérimée (French protected monuments)', license: 'Licence Ouverte 2.0', url: 'https://www.pop.culture.gouv.fr/', coverage: [400, 1900], core: [1000, 1500], box: [-5, 41, 10, 51.5], describe: 'Castles, religious buildings, bridges and market halls protected in France, dated by the century of their main building campaign.', record: (id) => `https://www.pop.culture.gouv.fr/notice/merimee/${id}` },
  { id: 'finreg', name: 'Finnish register of archaeological sites', license: 'CC BY 4.0', url: 'https://www.museovirasto.fi/', coverage: [-500, 1900], core: [1150, 1550], box: [19, 59, 32, 70.5], describe: 'Sites the Finnish Heritage Agency classes as medieval (churches, strongholds, village sites…), dated only by period classes.', record: () => 'https://www.kyppi.fi/' },
  { id: 'wbohemia', name: 'Western Bohemia toponyms to 1500', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.21479034', coverage: [900, 1500], core: [1100, 1500], box: [12, 49, 14.5, 50.6], describe: 'Place names of West Bohemia with their first attested year and historical form.', record: () => 'https://doi.org/10.5281/zenodo.21479034' },
  { id: 'bridges1250', name: 'Bridges of Medieval England to c.1250', license: 'CC BY 4.0', url: 'https://doi.org/10.5284/1053676', coverage: [600, 1300], core: [700, 1250], box: [-6, 49.9, 2, 55.9], describe: 'Bridges and fords attested in documents and place-names before c. 1250.', record: () => 'https://doi.org/10.5284/1053676' },
  { id: 'nsh', name: 'Nordic Spatial Humanities (saints’ churches, sagas, chronicles)', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.14871254', coverage: [800, 1600], core: [1000, 1537], box: [-25, 54, 32, 71.5], describe: 'Medieval parish churches of the Nordic countries with medieval diocese and first attestation, and places named in the Icelandic sagas and Old Norse chronicles.', record: () => 'https://doi.org/10.5281/zenodo.14871254' },
  { id: 'nokm', name: 'Norwegian heritage register (Riksantikvaren)', license: 'NLOD', url: 'https://kulturminnesok.no/', coverage: [400, 1537], core: [800, 1537], box: [4, 57.9, 31.5, 71.5], describe: 'Norwegian monuments the register dates to the Migration period, Viking Age or Middle Ages: farms and settlements, churches and churchyards, forts, trade sites and burial mounds.', record: (id) => `https://kulturminnesok.no/ra/lokalitet/${String(id).split('-')[0]}` },
  { id: 'tib', name: 'Tabula Imperii Byzantini — Maps of Power (private data)', license: 'not stated (private use)', url: 'https://maps-of-power.oeaw.ac.at/', coverage: [300, 1500], core: [500, 1453], box: [12, 34, 32, 50], describe: 'Byzantine places of the Balkans and Greece with their first attestation.', record: () => 'https://maps-of-power.oeaw.ac.at/' },
  { id: 'mfairs', name: 'Markets and Fairs in England and Wales to 1516 (private data)', license: 'not stated (private use)', url: 'https://sas-space.sas.ac.uk/106/', coverage: [600, 1516], core: [1100, 1516], box: [-6, 49.9, 2, 55.9], describe: 'Market and fair grants of England and Wales.', record: () => 'https://sas-space.sas.ac.uk/106/' },
  { id: 'afontium', name: 'Atlas Fontium — Poland in the 16th century (private data)', license: 'not stated (private use)', url: 'https://atlasfontium.pl/', coverage: [1550, 1600], core: [1550, 1600], box: [14, 48.5, 27, 55], describe: 'Settlements and parishes of the Crown of Poland, second half of the 16th century.', record: () => 'https://atlasfontium.pl/' },
  { id: 'ran', name: 'Romanian national archaeological register (private data)', license: 'OGL (not verified; private use)', url: 'https://ran.cimec.ro/', coverage: [300, 1800], core: [500, 1600], box: [20, 43.5, 30, 48.5], describe: 'Romanian sites the register dates to the migration period or Middle Ages, with their periods and components.', record: (id) => `https://ran.cimec.ro/sel.asp?codran=${id}` },
  { id: 'dicotopo', name: 'Dictionnaire topographique de la France (private data)', license: 'CC BY-NC-ND (private use)', url: 'https://dicotopo.cths.fr/', coverage: [500, 1900], core: [800, 1600], box: [-5, 41, 10, 51.5], describe: 'French communes with their old name forms, each dated and sourced; the earliest is the first attestation.', record: (id) => `https://dicotopo.cths.fr/places/${id}` },
  { id: 'raa', name: 'Swedish register of ancient remains (private data)', license: 'not verified (private use)', url: 'https://app.raa.se/open/fornsok/', coverage: [400, 1600], core: [800, 1550], box: [10.5, 55, 24.5, 69.5], describe: 'Swedish remains the register dates to the Iron Age or Middle Ages.', record: () => 'https://app.raa.se/open/fornsok/' },
  { id: 'ebidat', name: 'EBIDAT castle database (private data)', license: 'not stated (private use)', url: 'https://www.ebidat.de/', coverage: [700, 1800], core: [900, 1600], box: [3, 45.5, 31, 63], describe: 'Castles of Germany and central Europe dated by the European Castle Institute (begin and end of use).', record: (id) => `https://www.ebidat.de/cgi-bin/ebidat.pl?id=${id}` },
  { id: 'darmc', name: 'DARMC scholarly datasets (private data)', license: 'not stated (private use)', url: 'https://darmc.harvard.edu/', coverage: [1, 1500], core: [400, 1500], box: [-12, 12, 45, 65], describe: 'Dated shipwrecks, Carolingian coin hoards and rural Anglo-Saxon settlements.', record: () => 'https://darmc.harvard.edu/' },
  { id: 'dkff', name: 'Danish register of ancient monuments (private data)', license: 'not verified (private use)', url: 'https://www.kulturarv.dk/fundogfortidsminder/', coverage: [400, 1600], core: [800, 1536], box: [8, 54.5, 15.5, 58], describe: 'Danish monuments the register dates to the Viking Age or Middle Ages.', record: () => 'https://www.kulturarv.dk/fundogfortidsminder/' },
  { id: 'ariadne', name: 'ARIADNE archaeology catalogue (private data)', license: 'varies by provider (private use)', url: 'https://portal.ariadne-infrastructure.eu/', coverage: [1, 1914], core: [400, 1800], box: [-25, 34, 45, 67], describe: 'Archaeological sites and fieldwork records from national providers (Iceland, Hungary, Finland, Austria, Germany, Bulgaria, Portugal and others), each phase dated by the periods its provider gives.', record: () => 'https://portal.ariadne-infrastructure.eu/' },
  { id: 'amcr', name: 'AMCR — Archaeological Map of the Czech Republic (private data)', license: 'CC BY-NC 4.0 (private use)', url: 'https://digiarchiv.aiscr.cz/', coverage: [-800, 2000], core: [500, 1800], box: [12.0, 48.5, 18.9, 51.1], describe: 'Archaeological sites and fieldwork in Czechia, each with the AMCR periods (years from its PeriodO-linked vocabulary) of what was found.', record: (id) => `https://digiarchiv.aiscr.cz/id/${String(id).split(':')[0]}` },
  { id: 'latin1772', name: 'Atlas of the Latin Church in Poland-Lithuania c. 1772 (private data)', license: 'CC BY-NC 4.0 (private use)', url: 'https://doi.org/10.5281/zenodo.10912495', coverage: [1772, 1772], core: [1772, 1772], box: [14, 46.5, 34, 58], describe: 'Parish and auxiliary churches and religious houses of the Latin Church across the Polish-Lithuanian Commonwealth around 1772.', record: () => 'https://doi.org/10.5281/zenodo.10912495' },
  { id: 'canmore', name: 'Canmore — National Record of the Historic Environment (Scotland)', license: 'OGL v3', url: 'https://www.trove.scot/', coverage: [79, 1914], core: [400, 1900], box: [-9, 54.5, -0.5, 61], describe: 'Scottish monuments, buildings and sites, each dated by the period its record names (Canmore period terms; broad periods converted with the ScAPA thesaurus years).', record: (id) => `https://www.trove.scot/place/${id}` },
  { id: 'irlsmr', name: 'Archaeological Survey of Ireland (Sites and Monuments Record)', license: 'CC BY 4.0', url: 'https://www.archaeology.ie/', coverage: [400, 1900], core: [400, 1700], box: [-11, 51.3, -5.3, 55.5], describe: 'Irish monuments; dated only where the monument class names a date (e.g. “House - 17th century”), otherwise undated.', record: () => 'https://maps.archaeology.ie/historicenvironment' },
  { id: 'nid', name: 'Polish register of immovable monuments (NID)', license: 'CC BY 4.0', url: 'https://dane.gov.pl/pl/dataset/1130', coverage: [1000, 1950], core: [1200, 1900], box: [14, 49, 24.2, 55], describe: 'Protected monuments of Poland, from the construction date or century the register records; placed at their village or town.', record: () => 'https://zabytek.pl/' },
  { id: 'ivillaris', name: 'Index Villaris, 1680', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.10660024', coverage: [1680, 1680], core: [1680, 1680], box: [-6, 49.8, 2, 56], describe: 'All 24,000 cities, market towns, parishes, villages and seats of England and Wales listed by John Adams in 1680.', record: () => 'https://docuracy.github.io/IndexVillaris1680/' },
  { id: 'ottomannfs', name: 'Ottoman NFS population-register gazetteer (1830–1849)', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.7351936', coverage: [1830, 1849], core: [1830, 1849], box: [19, 35, 45, 46], describe: 'Populated places listed in 764 Ottoman population registers of 1830–1849, each in its register’s year.', record: () => 'https://doi.org/10.5281/zenodo.7351936' },
  { id: 'generalkarte', name: 'Generalkarte von Mitteleuropa gazetteer (Balkans)', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.8409506', coverage: [1880, 1918], core: [1880, 1918], box: [19, 39, 30, 46], describe: 'Settlements, monasteries, inns, forts, mines and other named features on the Austro-Hungarian 1:200,000 maps of the Balkans (sheet editions c. 1880–1918).', record: () => 'https://doi.org/10.5281/zenodo.8409506' },
  { id: 'cassini', name: 'Cassini map — towns and villages (France, c. 1756–1815)', license: 'CC0', url: 'https://doi.org/10.7910/DVN/28674', coverage: [1756, 1815], core: [1756, 1815], box: [-5, 42, 8.5, 51.2], describe: 'Cities, towns and estates on the Cassini map of France (sheets surveyed 1756–1789).', record: () => 'https://doi.org/10.7910/DVN/28674' },
  { id: 'lutsch', name: 'Lutsch map of Transylvania (1751)', license: 'CC BY-NC-SA 4.0', url: 'https://doi.org/10.7910/DVN/ETORPU', coverage: [1751, 1751], core: [1751, 1751], box: [22.5, 45, 27, 47.5], describe: 'Settlements, mountains, rivers, post stations, mines, monasteries and fortifications on the 1751 Lutsch map (Saxon seats and Kronstadt district).', record: () => 'https://doi.org/10.7910/DVN/ETORPU' },
  { id: 'sirkd', name: 'Slovenian heritage register (RKD)', license: 'CC BY 4.0', url: 'https://podatki.gov.si/dataset/register-nepremicne-kulturne-dediscine', coverage: [-15, 1914], core: [1500, 1914], box: [13.3, 45.4, 16.7, 46.9], describe: 'Listed buildings, churches, castles, settlement cores and archaeological sites in Slovenia, each dated by the register itself (construction period for buildings, period of use for sites).', record: (id) => `https://eid.gov.si/S/${id}` },
  { id: 'lvmon', name: 'Latvian protected monuments list', license: 'CC0 1.0', url: 'https://data.gov.lv/dati/dataset/valsts-aizsargajamo-nekustamo-piemineklu-saraksts', coverage: [1, 1914], core: [1200, 1914], box: [20.8, 55.6, 28.3, 58.1], describe: 'State-protected buildings, churches, manors, hillforts and archaeological sites in Latvia, dated by the list itself; placed at their town, village or parish (the list has no coordinates).', record: () => 'https://data.gov.lv/dati/dataset/valsts-aizsargajamo-nekustamo-piemineklu-saraksts' },
  { id: 'hrreg', name: 'Croatian register of cultural goods', license: 'Open Licence (HR)', url: 'https://data.gov.hr/ckan/dataset/registar-kulturnih-dobara', coverage: [1, 1914], core: [1200, 1914], box: [13.4, 42.3, 19.5, 46.6], describe: 'Protected churches, monasteries, castles, town cores, buildings and archaeological sites in Croatia, dated by the register itself; placed at their settlement (the register has no coordinates).', record: () => 'https://registar.kulturnadobra.hr/' },
  { id: 'r3verst', name: 'Russian 3-verst map gazetteer (Balkans, 1877–1879)', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.8411078', coverage: [1877, 1879], core: [1877, 1879], box: [21.5, 40.5, 29.5, 44.5], describe: 'Settlements, monasteries, khans and other places on the Russian military 3-verst map of the Balkans, surveyed during and after the 1877–78 war, with their modern names.', record: () => 'https://doi.org/10.5281/zenodo.8411078' },
  { id: 'rohgis', name: 'RoHGIS settlements of Romania (1904–1913)', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.15613857', coverage: [1904, 1913], core: [1904, 1913], box: [22, 43.5, 30, 48.5], describe: 'Every settlement of the Kingdom of Romania existing between 1904 and 1913, with official name variants.', record: () => 'https://doi.org/10.5281/zenodo.15613857' },
  { id: 'transice', name: 'TransIce: Icelandic shielings and farms', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.17537206', coverage: [900, 1950], core: [1703, 1703], box: [-24.6, 63.2, -13.4, 66.6], describe: 'Farms listed in the Jarðabók of 1703 and shielings with their first mention and abandonment years, from the Institute of Archaeology, Iceland.', record: () => 'https://doi.org/10.5281/zenodo.17537206' },
  { id: 'dissiloc', name: 'DISSILOC: places in medieval inquisition registers', license: 'CC BY-SA 4.0', url: 'https://doi.org/10.5281/zenodo.21031406', coverage: [1241, 1522], core: [1241, 1399], box: [-5, 40, 20, 56], attests: true, describe: 'Settlements, churches, religious houses and castles named in inquisition registers of Languedoc, northern and central Italy, England and Bohemia, 1240s–1520s; each dated by its register.', record: () => 'https://doi.org/10.5281/zenodo.21031406' },
  { id: 'swegeo', name: 'Swedish geometrical maps (1630–1655)', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.15121019', coverage: [1630, 1655], core: [1630, 1655], box: [10.5, 55, 24.5, 69], describe: 'Villages, churches, water- and windmills drawn on the large-scale Swedish land-survey maps of 1630–1655.', record: () => 'https://doi.org/10.5281/zenodo.15121019' },
  { id: 'tyrolmine', name: 'Tyrolean mining documents (1460s–1510s)', license: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.6368451', coverage: [1460, 1525], core: [1460, 1525], box: [10.5, 46.8, 12.6, 47.8], attests: true, describe: 'Places around Schwaz and Kufstein named in the mining documents Hs. 37 (1460–1463) and Hs. 1587 (c. 1515), with their document forms.', record: () => 'https://doi.org/10.5281/zenodo.6368451' },
  { id: 'wdextra', name: 'Wikidata (dated churches, manors, later settlements)', license: 'CC0', url: 'https://www.wikidata.org/', coverage: [-400, 1914], core: [1600, 1914], box: [-32, 24, 62, 72], describe: 'Churches, mosques, synagogues, manor houses and caravanserais with a founding date or first written mention in Wikidata, and settlements first recorded 1600–1914; dates at the precision Wikidata records them.', record: (id) => `https://www.wikidata.org/wiki/${id}` },
  { id: 'arkas', name: 'Arkas 2.0 (Slovenian archaeological sites)', license: 'CC BY-SA 4.0', url: 'https://doi.org/10.5281/zenodo.7820725', coverage: [-800, 1914], core: [1, 1000], box: [13.3, 45.4, 16.7, 46.9], describe: 'Archaeological sites of Slovenia with their own dating in years (Roman, late antique and medieval).', record: () => 'https://iza2.zrc-sazu.si/en/zbirka/arkas' },
  { id: 'buringh', name: 'Buringh (European urban population)', license: 'CC0', url: 'https://doi.org/10.17026/dans-xzy-u62q', coverage: [700, 2000], core: [700, 1850], box: [-25, 27, 60, 71], describe: 'About 2,200 European towns with estimated population per century, 700–2000.', record: () => 'https://doi.org/10.17026/dans-xzy-u62q' },
  // Datasets read through spec files (data/historical/specs; generated registry).
  ...(Object.entries(SPEC_DATASETS) as [SpecDatasetId, (typeof SPEC_DATASETS)[SpecDatasetId]][]).map(([id, d]): GazetteerInfo => ({
    id, name: d.public ? d.name : `${d.name} (private data)`, license: d.license, url: d.url, coverage: [...d.coverage], core: [...d.core], box: [...d.box],
    describe: d.describe, record: () => d.url,
  })),
];
export const gazetteerInfo = (id: GazetteerId) => GAZETTEERS.find((g) => g.id === id)!;
/** Gazetteers whose period covers the year (all of them when the year is unknown). */
export const gazetteersFor = (year?: HistYear) => GAZETTEERS.filter((g) => year === undefined || (year >= g.coverage[0] && year <= g.coverage[1]));

/** Lower-case, without accents or a leading "the", so "Lutétia" = "lutetia". Must match norm() in scripts/atlas-build/names.py. */
export const normName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/^the\s+/, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
/** Name-index shard for a normalised name. Must match shard() in scripts/atlas-build/names.py. */
export function nameShard(n: string): string {
  let out = '';
  for (const ch of Array.from(n).slice(0, 2)) out += /[a-z0-9]/.test(ch) ? ch : `x${(ch.codePointAt(0)! % 16).toString(16)}`;
  return out || '_';
}

const PLEIADES_REL: Record<string, [string, string]> = {
  // Pleiades' own definitions (pleiades.stoa.org/vocabularies/relationship-types); reverse = seen from the other place.
  succeeds: ['succeeds', 'succeeded by'], same_as: ['possibly the same as', 'possibly the same as'], capital: ['capital of', 'has as capital'], port_of: ['port of', 'has port'],
  founded: ['founded by', 'founded'], near: ['near', 'near'], at: ['at', 'site of'], on: ['on', 'has on it'], crosses: ['crosses', 'crossed by'],
  flows_into: ['flows into', 'receives'], route_next: ['next on route to', 'next on route from'], abuts: ['borders', 'borders'], bounds: ['bounds', 'bounded by'],
  communicates: ['connected with', 'connected with'], related: ['related to', 'related to'],
};
export const relationLabel = (r: Relation) => (PLEIADES_REL[r.type] ?? [r.type.replace(/_/g, ' '), r.type.replace(/_/g, ' ')])[r.reverse ? 1 : 0];

/** Types that are not places one can put a pin on for a reader's name. */
const NOT_A_LOCATION = new Set(['people', 'ethnic-group', 'unknown', 'false', 'label']);

// ── The tiled index ───────────────────────────────────────────────────────

type Row = [GazetteerId, number | string, string, number, number, 0 | 1, string, number | null, number | null, number,
  [string, number | null, number | null, string][], string[], [number | string, string, string, 0 | 1][], RowExtra | null];
/** Per-dataset extras: Viabundus roles, dataset periods, envelopes; site kind, date basis, orders, population. */
interface RowExtra {
  roles?: [string, number | null, number | null][]; period?: [number, number]; env?: [number | null, number | null, EnvelopeBasis]; z?: number;
  k?: string; st?: string; fb?: string; nl?: string; o?: string[]; gs?: string; q?: string; fix?: string;
  pop?: Record<string, number>; est?: Record<string, string>;
  /** The source's own id when the record's key had to be made unique (one source id, several records). */
  sid?: number | string;
  /** Why the position is approximate although the source gives a point (too few decimals, shared by many records). */
  pq?: string;
}
type NameEntry = [string, GazetteerId, number | string, string, 0 | 1];

const CELL = 2;
const base = () => `${import.meta.env.BASE_URL}world/places/`;
export const cellOf = (lon: number, lat: number) => `${Math.floor((lon + 180) / CELL)}_${Math.floor((lat + 90) / CELL)}`;

/** A small bounded cache, so exploring the whole map never keeps everything in memory. */
class Lru<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k: string, v: V) { this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!); }
  delete(k: string) { this.m.delete(k); }
}
const cells = new Lru<Promise<GazPlace[]>>(120);
const shards = new Lru<Promise<NameEntry[]>>(40);
const idShards = new Lru<Promise<Record<string, string>>>(16);

function toPlace(r: Row): GazPlace {
  const [src, id, title, lon, lat, precise, types, from, to, unc, names, partOf, related, extra] = r;
  const info = gazetteerInfo(src);
  return {
    key: `${src}:${id}`, gazetteer: src, id, title, lon, lat, precise: precise === 1,
    types: types ? types.split(',') : [],
    from: from ?? undefined, to: to ?? undefined,
    // Records without dates carry the period their evidence allows: linked records, the source's
    // period, or the dataset's documented period (al-Ṯurayyā 9th–10th c., undated Viabundus nodes).
    envelope: from === null && to === null
      ? (extra?.env ? { from: extra.env[0] ?? undefined, to: extra.env[1] ?? undefined, basis: extra.env[2] } : extra?.period ? { from: extra.period[0], to: extra.period[1], basis: 'dataset' as const } : undefined)
      : undefined,
    datasetPeriod: from === null && to === null && (!!extra?.period || extra?.env?.[2] === 'dataset'),
    uncertain: unc, names: names.map(([name, a, b, lang]) => ({ name, from: a ?? undefined, to: b ?? undefined, lang: lang || undefined })),
    partOf, related: related.map(([rid, type, t, rev]) => ({ title: t, key: `${src}:${rid}`, type, reverse: rev === 1 })),
    roles: extra?.roles, sourceId: extra?.sid ?? id, url: extra?.q && src !== 'wikidata' ? `https://www.wikidata.org/wiki/${extra.q}` : info.record(extra?.sid ?? id),
    dateBasis: extra?.fb,
    // Only an explicit founding / construction date means "did not exist before". Attestation periods
    // (Pleiades), first recorded roles (Viabundus), first mentions and tenure dates mean evidence begins then.
    startKind: extra?.fb === 'founded' ? 'founded' : 'attested',
    population: extra?.pop ? Object.entries(extra.pop).map(([y, v]) => ({ year: Number(y), thousands: v, estimate: extra.est?.[y] })) : undefined,
    note: [extra?.fix, extra?.pq].filter(Boolean).join('; ') || undefined,
  };
}

/**
 * The place index could not be read (offline, a server error): different from a name that is not in it. A file that
 * does not exist (404) is an empty shard or cell — that is "not in the index"; anything else is a failure, reported as
 * such and never cached, so the next lookup tries again.
 */
export class IndexLoadError extends Error {
  constructor(file: string, cause: unknown) { super(`Shelf's place data could not be loaded (${file}: ${cause instanceof Error ? cause.message : String(cause)})`); this.name = 'IndexLoadError'; }
}
const missingIsEmpty = <T>(file: string) => (e: unknown): T[] => {
  if (e instanceof Error && e.message === '404') return [];
  throw new IndexLoadError(file, e);
};

/** A public index file joined with the same file from the private data pack, if one is loaded on this device. */
async function withPrivate<T>(file: string, pub: Promise<T[]>): Promise<T[]> {
  // Settled at once, so a failed load is never an unhandled rejection while the private pack is being opened.
  const settled = pub.then((v) => ({ v }), (e: unknown) => ({ e }));
  await loadPrivateData();
  const [r, b] = await Promise.all([settled, privateJSON<T[]>(`places/${file}`).catch(() => null)]);
  const a = 'v' in r ? r.v : missingIsEmpty<T>(file)(r.e);
  return b ? [...a, ...b] : a;
}

export function placesInCell(cell: string): Promise<GazPlace[]> {
  let p = cells.get(cell);
  if (!p) {
    p = withPrivate(`c/${cell}.json`, getJSON<Row[]>(`${base()}c/${cell}.json`)).then((rows) => rows.map(toPlace));
    p.catch(() => cells.delete(cell)); // a failure is not kept: the next lookup tries again
    cells.set(cell, p);
  }
  return p;
}
function nameEntries(norm: string): Promise<NameEntry[]> {
  const s = nameShard(norm);
  let p = shards.get(s);
  if (!p) {
    p = withPrivate(`n/${s}.json`, getJSON<NameEntry[]>(`${base()}n/${s}.json`));
    p.catch(() => shards.delete(s));
    shards.set(s, p);
  }
  return p;
}

// CRC-32, to find which id shard holds a place (matches zlib.crc32 in world.py).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(s: string): number {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(s)) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * One place by key ("pleiades:423025"). With `near` (a map click's position), a source id that several records share
 * (one institution with several seats, several finds at one locality) resolves to the record at that spot.
 */
export async function getPlace(key: string, near?: Pos): Promise<GazPlace | undefined> {
  const p = await placeByKey(key);
  if (!near || (p && km([p.lon, p.lat], near) < 1)) return p;
  const i = key.indexOf(':');
  const [src, id] = [key.slice(0, i), key.slice(i + 1)];
  const here = (await placesInCell(cellOf(near[0], near[1]))).filter((x) => x.gazetteer === src && String(x.sourceId ?? x.id) === id)
    .sort((a, b) => km([a.lon, a.lat], near) - km([b.lon, b.lat], near))[0];
  return here && km([here.lon, here.lat], near) < 1 ? here : p;
}
async function placeByKey(key: string): Promise<GazPlace | undefined> {
  const i = key.indexOf(':');
  const src = key.slice(0, i);
  const id = key.slice(i + 1);
  if (!GAZETTEERS.some((g) => g.id === src)) return undefined;
  const shard = `${src}-${crc32(id) % 16}`;
  let p = idShards.get(shard);
  if (!p) {
    p = loadPrivateData().then(async () => ({ ...(await getJSON<Record<string, string>>(`${base()}i/${shard}.json`).catch(() => ({}))), ...(await privateJSON<Record<string, string>>(`places/i/${shard}.json`).catch(() => null)) }));
    idShards.set(shard, p);
  }
  const cell = (await p)[id];
  if (!cell) return undefined;
  return (await placesInCell(cell)).find((x) => x.key === key);
}

/** Every place (in any gazetteer) with this exact name; isTitle = it's the record's main name. */
export async function placesByName(name: string): Promise<{ place: GazPlace; isTitle: boolean }[]> {
  const k = normName(name);
  if (k.length < 2) return [];
  const hits = (await nameEntries(k)).filter((e) => e[0] === k);
  const byCell = new Map<string, NameEntry[]>();
  for (const e of hits) byCell.set(e[3], [...(byCell.get(e[3]) ?? []), e]);
  const out: { place: GazPlace; isTitle: boolean }[] = [];
  await Promise.all([...byCell].map(async ([cell, es]) => {
    const ps = await placesInCell(cell);
    for (const e of es) { const p = ps.find((x) => x.gazetteer === e[1] && x.id === e[2]); if (p) out.push({ place: p, isTitle: e[4] === 1 }); }
  }));
  return out.filter((h) => !h.place.types.every((t) => NOT_A_LOCATION.has(t)));
}

/** Places whose names start with the text (search). Title matches first. */
export async function searchPlaces(q: string, limit = 20): Promise<{ place: GazPlace; matched: string }[]> {
  const k = normName(q);
  if (k.length < 2) return [];
  const es = (await nameEntries(k)).filter((e) => e[0].startsWith(k)).sort((a, b) => Number(b[0] === k) - Number(a[0] === k) || b[4] - a[4]).slice(0, limit * 2);
  const out: { place: GazPlace; matched: string }[] = [];
  const seen = new Set<string>();
  for (const e of es) {
    const key = `${e[1]}:${e[2]}`;
    if (seen.has(key)) continue;
    const p = (await placesInCell(e[3])).find((x) => x.key === key);
    if (!p) continue;
    seen.add(key);
    out.push({ place: p, matched: e[0] });
    if (out.length >= limit) break;
  }
  return out;
}

/** Places within `radiusKm`, nearest first; with a year, only those attested around then (undated ones only when asked for). Loads only the cells it needs. */
export async function nearbyPlaces(at: Pos, radiusKm: number, opts: { year?: HistYear; slack?: number; exclude?: string; filter?: (p: GazPlace) => boolean; undated?: boolean } = {}): Promise<{ place: GazPlace; km: number }[]> {
  const dLat = radiusKm / 110.57;
  const dLon = radiusKm / (111.32 * Math.max(0.1, Math.cos((at[1] * Math.PI) / 180)));
  const x0 = Math.floor((at[0] - dLon + 180) / CELL);
  const x1 = Math.floor((at[0] + dLon + 180) / CELL);
  const y0 = Math.floor((at[1] - dLat + 90) / CELL);
  const y1 = Math.floor((at[1] + dLat + 90) / CELL);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x}_${y}`);
  const all = (await Promise.all(keys.slice(0, 36).map(placesInCell))).flat();
  const out: { place: GazPlace; km: number }[] = [];
  for (const p of all) {
    if (p.key === opts.exclude || Math.abs(p.lat - at[1]) > dLat || Math.abs(p.lon - at[0]) > dLon) continue;
    if (opts.year !== undefined && !existedAround(p, opts.year, opts.slack ?? 0) && !(opts.undated && p.from === undefined && p.to === undefined && !p.envelope)) continue;
    if (opts.filter && !opts.filter(p)) continue;
    const d = km(at, [p.lon, p.lat]);
    if (d <= radiusKm) out.push({ place: p, km: d });
  }
  return out.sort((a, b) => a.km - b.km);
}

/**
 * Was the place attested around this year? Undated records are NOT counted as
 * existing (they are "undated", see timeFit). An open start or end is capped by
 * the gazetteer's own period.
 */
export function existedAround(p: { from?: HistYear; to?: HistYear; envelope?: Envelope; gazetteer?: GazetteerId }, year: HistYear, slack = 0): boolean {
  // Attested at the year, or inside the period its evidence allows (callers show that as approximate).
  return eligibleAt(p, year, { slack, window: p.gazetteer ? gazetteerInfo(p.gazetteer).coverage : undefined });
}

/** Names the place had around a year, according to the dataset's own name dates (undated names aren't tied to a period, so they're kept). */
export function namesAround(p: GazPlace, year?: HistYear): GazName[] {
  if (year === undefined) return p.names;
  return p.names.filter((n) => (n.from === undefined && n.to === undefined) || attestedAt(n, year, { slack: 50 }));
}

// ── Matching a name from the book ─────────────────────────────────────────

export type MatchStatus = 'unique' | 'ambiguous' | 'none';
/** Why one candidate was picked: it is the only place of that name; the book's geography; the only one attested at the date; the only main title. */
export type MatchBasis = 'only' | 'context' | 'attested-at-date' | 'main-title';

/**
 * How well a record's own dates support the year being read about — kept apart from *which* place is meant.
 * A place can be the only candidate of that name and still be temporally unsupported at the date.
 */
export type TemporalSupport = 'attested' | 'approximate' | 'evidence-period' | 'persisting' | 'not-yet-attested' | 'no-evidence' | 'no-date' | 'incompatible';
export const TEMPORAL_LABEL: Record<TemporalSupport, string> = {
  attested: 'Recorded at this date',
  approximate: 'Recorded close to this date (within about 50 years), not at it',
  'evidence-period': 'No exact date; the period its evidence allows includes this date',
  persisting: 'Recorded only before this date; places usually persist, but nothing records it then',
  'not-yet-attested': 'First recorded later; may have existed earlier',
  'no-evidence': 'The source gives no dates; nothing places it at this date',
  'no-date': 'The book’s date is not known, so the dates can’t be checked',
  incompatible: 'Founded or created after this date',
};
export function temporalSupport(fit: TimeFit | 'no-year'): TemporalSupport {
  return ({ within: 'attested', near: 'approximate', period: 'evidence-period', earlier: 'persisting', unattested: 'not-yet-attested', undated: 'no-evidence', 'no-year': 'no-date', later: 'incompatible' } as const)[fit];
}

/**
 * The one scale every part of the atlas uses for a place match:
 *   certain    — identity settled (the only place of that name, or the book's geography picks it with no rival
 *                attested at the date) AND its dates cover the year (or an evidence period does, and the book agrees)
 *   probable   — a good identification without one of those: recorded only close to the date or only earlier
 *                (places persist), an evidence period only, picked because its namesakes are first recorded later, or undated but in the book's area
 *   possible   — first recorded only after the date, or no temporal evidence at all: useful, never established
 *   ambiguous  — several places fit and nothing yet says which
 *   unresolved — no defensible candidate (none of that name, or every one began after the date)
 */
export type PlaceConfidence = 'certain' | 'probable' | 'possible' | 'ambiguous' | 'unresolved';
export function placeConfidence(a: { identity: MatchStatus; basis?: MatchBasis; liveRivals: number; support: TemporalSupport; fitsBook: boolean }): PlaceConfidence {
  if (a.identity === 'none' || a.support === 'incompatible') return 'unresolved';
  if (a.identity === 'ambiguous') return 'ambiguous';
  // Identity settled without leaning on dates: no rival attested at the date, and not chosen *because* rivals lack dates.
  const settled = a.liveRivals === 0 && (a.basis === 'only' || a.basis === 'context');
  switch (a.support) {
    case 'not-yet-attested': return 'possible';
    case 'no-evidence': return a.fitsBook ? 'probable' : 'possible';
    case 'persisting':
    case 'approximate': return 'probable';
    case 'evidence-period': return settled && a.fitsBook ? 'certain' : 'probable';
    default: return settled ? 'certain' : 'probable';
  }
}

export interface NameMatch {
  status: MatchStatus;
  /** Identity and dates weighed together (see placeConfidence). */
  confidence: PlaceConfidence;
  /** How the chosen record's dates relate to the year. */
  temporal?: TemporalSupport;
  basis?: MatchBasis;
  place?: GazPlace;
  candidates: GazPlace[];
  /** Records of the same place in other datasets (same name, within a few km). */
  corroborating: GazPlace[];
  /** How the chosen record's dates relate to the year. */
  fit?: TimeFit | 'no-year';
  /** Which recorded name matched ("Carthage" → recorded name of Carthago). */
  matchedName?: GazName & { isTitle: boolean };
  /** The place index could not be loaded: nothing is known about the name, and the answer must not be kept. */
  loadFailed?: boolean;
  reason: string;
}

/** A lone record this far from every place the book has already placed is probably a namesake, not the place meant. */
const FAR_NAMESAKE_KM = 2500;

/**
 * Why a name has no record, in words that do not suggest the place did not exist: which datasets cover the date, and
 * — when the book's places say where it is set — how much Shelf holds for that region at all.
 */
function absenceReason(written: string, year: HistYear | undefined, ctx: GeoContext | undefined): string {
  const covering = (year === undefined ? GAZETTEERS : gazetteersFor(year)).map((g) => g.name);
  const list = covering.length > 3 ? `${covering.slice(0, 3).join(', ')} and ${covering.length - 3} other datasets` : covering.join(' and ');
  const date = year === undefined ? '' : ` for ${year < 0 ? `${-year} BCE` : `${year} CE`}`;
  const tail = ' This does not mean no such place existed.';
  if (ctx?.points.length) {
    const [lon, lat] = ctx.points[0];
    const cov = placeCoverageAt(lon, lat, year ?? 1500);
    if (cov.region && cov.count === 0) return `Shelf has no dated place data for ${cov.label}${year === undefined ? '' : ` in ${cov.period}`}, where this book is set, so it cannot say whether “${written}” was there.${tail}`;
    if (cov.region && cov.count < 100) return `No place called “${written}” in Shelf’s data${date}; it holds only ${cov.count} dated place${cov.count === 1 ? '' : 's'} for ${cov.label} in ${cov.period}, where this book is set.${tail}`;
  }
  return covering.length
    ? `No place called “${written}” in the datasets Shelf holds${date} (${list}). They cover mainly Europe and the Mediterranean.${tail}`
    : `Shelf holds no place data${date}.${tail}`;
}

const SAME_PLACE_KM = 8;
const srcList = (ids: GazetteerId[]) => [...new Set(ids)].map((id) => gazetteerInfo(id).name).join(' and ');

/** What kind of entity a gazetteer record is, from its dataset's own type words. */
export function kindOf(p: GazPlace): EntityKind {
  const t = p.types.join(' ').toLowerCase();
  if (/\b(province|region|regions|people|ethnic|territory|area|district|diocese|kingdom|state)\b/.test(t)) return 'region';
  if (/\b(settlement|urban|polis|town|towns|city|capitals?|village|villages|vicus|waystations?|port|harbou?r)\b/.test(t)) return 'settlement';
  if (/\briver\b/.test(t)) return 'river';
  if (/\bisland\b/.test(t)) return 'island';
  if (/\b(mountain|hill|volcano|pass)\b/.test(t)) return 'mountain';
  if (/\b(lake|lagoon|marsh)\b/.test(t)) return 'lake';
  return p.types.length ? 'site' : 'unknown';
}
const COMPATIBLE: Record<EntityKind, EntityKind[]> = {
  settlement: ['settlement', 'site', 'unknown'], polity: ['region', 'polity'], region: ['region', 'polity'], continent: ['region'], sea: [],
  river: ['river'], island: ['island', 'region'], mountain: ['mountain'], lake: ['lake'], site: ['site', 'settlement', 'unknown'], unknown: [],
};

/** What a record's dates mean, in a few words, from its own dataset (a first mention is not a founding date). */
export function dateBasisNote(p: GazPlace): string {
  if (p.from === undefined && p.to === undefined) return p.envelope ? `no dates of its own — the period of ${ENVELOPE_LABEL[p.envelope.basis]}` : 'no dates in the source';
  if (p.gazetteer === 'pleiades') return 'Pleiades attestation periods, not founding dates';
  if (p.from === undefined) return 'only its end is recorded';
  const basis = p.dateBasis ? `${p.dateBasis}, ` : '';
  return p.startKind === 'founded' ? `${basis}when it was founded or built`.replace(/^founded, /, '') : `${basis}when the evidence begins — not a founding date`;
}

/** Inside the region the record's dataset is about (its documented box, with a 1° margin). */
export function inDatasetScope(p: { gazetteer: GazetteerId; lon: number; lat: number }): boolean {
  const [w, s, e, n] = gazetteerInfo(p.gazetteer).box;
  return p.lon >= w - 1 && p.lon <= e + 1 && p.lat >= s - 1 && p.lat <= n + 1;
}

/** How a record's own dates relate to the year being read about. */
export function recordFit(p: GazPlace, year?: HistYear): TimeFit | 'no-year' {
  if (year === undefined) return 'no-year';
  return timeFit(p, year, { slack: 50, window: gazetteerInfo(p.gazetteer).coverage });
}

export interface MatchOptions {
  /** Where the book is set, so far (points of already identified places). */
  context?: GeoContext;
  /** The entity type the wording implies ("the city of X" → settlement). */
  expected?: EntityKind;
}

/**
 * Match a name as written in the book against the offline gazetteers.
 *
 * Records are *scored*, not dropped for lack of dates: an undated record, or a
 * place a dataset records only for an earlier period (towns persist), can still
 * be the place meant — only records attested exclusively *after* the year are
 * excluded, as are records of the wrong kind of entity for the wording. Records
 * from different datasets within a few km are one place. A place is chosen only
 * when one candidate remains, or when the book's own geography clearly favours
 * one; otherwise the result is ambiguous and the reader decides.
 */
export async function matchName(written: string, year?: HistYear, opts: MatchOptions = {}): Promise<NameMatch> {
  let all: { place: GazPlace; isTitle: boolean }[];
  try {
    all = await placesByName(written);
  } catch (e) {
    if (!(e instanceof IndexLoadError)) throw e;
    return { status: 'none', confidence: 'unresolved', candidates: [], corroborating: [], loadFailed: true,
      reason: `Shelf couldn’t load its place data just now (offline, or a network problem), so it can’t say whether “${written}” is recorded. Try again when the connection is back.` };
  }
  if (!all.length) return { status: 'none', confidence: 'unresolved', candidates: [], corroborating: [], reason: absenceReason(written, year, opts.context) };
  const notLater = all.filter((h) => recordFit(h.place, year) !== 'later');
  if (!notLater.length) return { status: 'none', confidence: 'unresolved', temporal: 'incompatible', candidates: [], corroborating: [], reason: `The places called “${written}” in ${srcList(all.map((h) => h.place.gazetteer))} are only recorded after ${year !== undefined ? (year < 0 ? `${-year} BCE` : `${year} CE`) : 'this date'}.` };
  const typed = opts.expected ? notLater.filter((h) => COMPATIBLE[opts.expected!].includes(kindOf(h.place))) : notLater;
  const pool = typed.length ? typed : notLater;
  // Group records that are the same place: different datasets within a few km.
  const groups: { place: GazPlace; isTitle: boolean }[][] = [];
  for (const h of pool) {
    const g = groups.find((gr) => gr.some((x) => x.place.gazetteer !== h.place.gazetteer && km([x.place.lon, x.place.lat], [h.place.lon, h.place.lat]) <= SAME_PLACE_KM));
    if (g) g.push(h); else groups.push([h]);
  }
  // The record to show from a group: attested at the year first, titled first.
  const fitRank = (p: GazPlace) => ({ within: 0, near: 1, period: 2, 'no-year': 3, undated: 4, earlier: 5, unattested: 6, later: 7 })[recordFit(p, year)];
  // Then a record with dates of its own over one dated only by its dataset's period (a Buringh town).
  const ownDates = (p: GazPlace) => (p.from !== undefined || p.to !== undefined ? 0 : p.datasetPeriod ? 2 : 1);
  // A record inside the region its dataset is about comes before an incidental one elsewhere (a Nordic dataset's
  // record of Lübeck never stands in for the Hanseatic gazetteer's), for every dataset by its documented box.
  const scope = (p: GazPlace) => (inDatasetScope(p) ? 0 : 1);
  // Wikidata aggregates: it corroborates a specialist record of the same place, never replaces it as the record shown.
  // Its dates still count — the place's temporal support is the best any of its records gives (see `dated` below).
  // Datasets that only attest places mentioned in their documents rank with it.
  const attestsOnly = (p: GazPlace) => !!GAZETTEERS.find((x) => x.id === p.gazetteer)?.attests;
  const aggregator = (p: GazPlace) => (p.gazetteer === 'wikidata' || attestsOnly(p) ? 1 : 0);
  const lead = (gr: { place: GazPlace; isTitle: boolean }[]) => [...gr].sort((a, b) => scope(a.place) - scope(b.place) || aggregator(a.place) - aggregator(b.place) || fitRank(a.place) - fitRank(b.place) || Number(b.isTitle) - Number(a.isTitle) || ownDates(a.place) - ownDates(b.place))[0];
  const k = normName(written);
  let chosen: { place: GazPlace; isTitle: boolean }[] | undefined;
  let why = '';
  let basis: MatchBasis | undefined;
  if (groups.length === 1) {
    // The only record of the name, but on the other side of the world from every place the book has already placed:
    // most likely a namesake of a place Shelf doesn't hold (Santiago de Chile → Santiago in Spain). Offered, not pinned.
    const d = Math.min(...groups[0].map((x) => contextDistance(opts.context, [x.place.lon, x.place.lat])));
    if (d !== Infinity && d > FAR_NAMESAKE_KM) {
      const p = lead(groups[0]).place;
      return { status: 'ambiguous', confidence: 'ambiguous', candidates: [p], corroborating: [],
        reason: `The only place called “${written}” in Shelf’s data is ${p.title} (${gazetteerInfo(p.gazetteer).name}), ${Math.round(d).toLocaleString('en')} km from the other places in this book — probably a different place with the same name, which Shelf may not hold.` };
    }
    chosen = groups[0]; basis = 'only';
  }
  else {
    // The book's geography: one candidate clearly nearer the places already identified.
    const ctx = opts.context;
    if (ctx?.points.length) {
      const dist = groups.map((g) => Math.min(...g.map((x) => contextDistance(ctx, [x.place.lon, x.place.lat]))));
      const order = dist.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d);
      if (order[0].d < 1500 && order[1].d > 3 * order[0].d + 300) { chosen = groups[order[0].i]; basis = 'context'; why = `It is the one near the other places in this book (${Math.round(order[0].d)} km from one of them; the next is ${Math.round(order[1].d)} km away).`; }
    }
    if (!chosen) {
      // Evidence at the date beats absence of evidence: when only one place of that name is attested around
      // the year and every other one is first recorded later, the attested one is meant.
      const attestedNow = (g: { place: GazPlace }[]) => g.some((x) => ['within', 'near', 'period'].includes(recordFit(x.place, year)));
      const live = groups.filter(attestedNow);
      if (year !== undefined && live.length === 1 && groups.every((g) => g === live[0] || g.every((x) => recordFit(x.place, year) === 'unattested'))) {
        chosen = live[0];
        basis = 'attested-at-date';
        why = `The only place called “${written}” attested around ${year < 0 ? `${-year} BCE` : `${year} CE`}; the other${groups.length > 2 ? 's are' : ' is'} first recorded later.`;
      }
    }
    if (!chosen) {
      // A single group where the name is the main title, against at most one other place listing it as an alternative.
      const titled = groups.filter((gr) => gr.some((x) => x.isTitle && !attestsOnly(x.place)));
      if (titled.length === 1 && groups.length - 1 <= 1 && lead(titled[0]).place.precise) { chosen = titled[0]; basis = 'main-title'; why = `The only place in ${srcList(pool.map((h) => h.place.gazetteer))} whose main name is “${written}”.`; }
    }
  }
  const where = srcList(pool.map((h) => h.place.gazetteer));
  if (!chosen) return { status: 'ambiguous', confidence: 'ambiguous', candidates: groups.map((g) => lead(g).place).slice(0, 12), corroborating: [], reason: `${groups.length} different places in ${where} are recorded with the name “${written}”, and nothing in the book yet says which is meant.` };
  const main = lead(chosen);
  const nm = main.isTitle ? { name: main.place.title, isTitle: true } : { ...(main.place.names.find((n) => normName(n.name) === k) ?? { name: written }), isTitle: false };
  const others = chosen.filter((x) => x !== main).map((x) => x.place);
  // The records of one place are weighed together: its dates are the best-supported ones any of its datasets gives.
  const dated = [main, ...chosen.filter((x) => x !== main)].sort((a, b) => fitRank(a.place) - fitRank(b.place))[0].place;
  const fit = recordFit(dated, year);
  // The name itself may be later (or earlier) than the date: say so, with the names attested then.
  const yl = (y: number) => (y < 0 ? `${-y} BCE` : `${y} CE`);
  const nameWhen = year !== undefined && !nm.isTitle && ((nm.from !== undefined && year < nm.from - 50) || (nm.to !== undefined && year > nm.to + 50))
    ? ` ${nm.from !== undefined && nm.from >= 1700 && year < 1650
      // Gazetteers date present-day exonyms to the modern period; that is a label, not a first attestation.
      ? `“${nm.name}” is a modern name for this place`
      : `The name “${nm.name}” is recorded ${nm.from !== undefined && year < nm.from ? `only from ${yl(nm.from)}` : `only until ${yl(nm.to!)}`}`}${((then) => (then.length ? `; around ${yl(year)} it is recorded as ${then.join(', ')}` : `; the record’s own name is “${main.place.title}”`))(namesAround(main.place, year).filter((n) => (n.from !== undefined || n.to !== undefined) && normName(n.name) !== k).map((n) => `“${n.name}”`).slice(0, 3))}.`
    : '';
  const when = nameWhen + (fit === 'earlier' ? ` ${gazetteerInfo(dated.gazetteer).name} records it for an earlier period only (to ${dated.to !== undefined ? (dated.to < 0 ? `${-dated.to} BCE` : `${dated.to} CE`) : 'the end of its coverage'}); places usually persist, but its later history is outside that dataset.` : fit === 'undated' ? ' The record has no dates, and nothing linked to it gives a period.' : fit === 'unattested' ? (dated.from === undefined && dated.to === undefined ? ` It has no dates of its own; the period of ${dated.envelope ? ENVELOPE_LABEL[dated.envelope.basis] : 'its evidence'} begins ${dated.envelope?.from !== undefined ? `in ${yl(dated.envelope.from)}` : 'later'} — it may be older, but nothing places it at this date.` : dated.from === undefined ? ` ${gazetteerInfo(dated.gazetteer).name} records only its end (${yl(dated.to!)}), not when it began — nothing places it at this date.` : ` ${gazetteerInfo(dated.gazetteer).name} first records it in ${yl(dated.from)}${dated.dateBasis ? ` (${dated.dateBasis})` : ''} — it may be older, but nothing places it at this date.`) : fit === 'period' && dated.envelope ? ` The record has no dates of its own; ${dated.envelope.from !== undefined ? yl(dated.envelope.from) : '…'}–${dated.envelope.to !== undefined ? yl(dated.envelope.to) : '…'} is the period of ${ENVELOPE_LABEL[dated.envelope.basis]}.` : '');
  const temporal = temporalSupport(fit);
  // Other places of the name that are not ruled out at the date (namesakes first recorded later don't count as rivals).
  const liveRivals = groups.filter((g) => g !== chosen && g.some((x) => recordFit(x.place, year) !== 'unattested')).length;
  const fitsBook = !!opts.context?.points.length && contextDistance(opts.context, [main.place.lon, main.place.lat]) < 1500;
  const confidence = placeConfidence({ identity: 'unique', basis, liveRivals, support: temporal, fitsBook });
  const caveat = confidence === 'probable' && basis === 'attested-at-date' ? ' The others may still have existed then, so this is probable, not certain.' : '';
  return {
    status: 'unique', confidence, temporal, basis, place: main.place, candidates: groups.map((g) => lead(g).place).slice(0, 12), corroborating: others, matchedName: nm, fit,
    reason: `${why || `The only place in ${where} recorded with the name “${written}”.`}${others.length ? ` ${srcList(others.map((o) => o.gazetteer))} records it at the same spot.` : ''}${when}${caveat}`,
  };
}
