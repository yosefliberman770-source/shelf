# Recovery pass (2026-09-30/10-01): every candidate that was skipped, deferred or never downloaded, revisited with the
# question "is the data obtainable and historically useful for a private app?". Keyed by the candidate's row number (n).
#
# reason — why it had not been downloaded:
#   licence      licensing / redistribution concern          unclear     licence unclear
#   access       website or download difficulty              bot         anti-bot or network block
#   reference    API-only, search-only, maps, text or format — not a dataset
#   technical    technical incompatibility                   none        no suitable dataset exists
#   covered      duplicate of data already integrated        owner       owner's decision
# outcome — recovered (acquired and integrated), acquired (in the vault, not integrated), not recovered, not useful.
R = {}


def r(n, reason, outcome, datasets='', note=''):
    R[n] = dict(reason=reason, outcome=outcome, datasets=datasets, note=note)


r(3, 'reference', 'not useful', '', 'Pelagios is a network and a data format, not a dataset.')
r(6, 'access', 'not recovered', '', 'pastplace.org and visionofbritain.org.uk still do not respond; GB only and mostly 19th-c.')
r(13, 'reference', 'not useful', '', 'ARIADNE is an aggregator; the national registers it points to were pursued directly (RAN, Denmark, Norway, Sweden).')
r(16, 'bot', 'not useful', '', 'Museum objects, not places; behind an Anubis bot check.')
r(20, 'unclear', 'not recovered', '', 'Nomisma mints are overwhelmingly ancient; medieval economy came instead from dated coin hoards (Denmark, Carolingian hoards).')
r(22, 'access', 'not useful', '', 'Egypt-centred ancient places; server refuses requests (403).')
r(23, 'reference', 'not useful', '', 'Texts database, not geography.')
r(24, 'access', 'not useful', '', 'Roman sites without a bulk export; Pleiades and Itiner-e already cover them.')
r(26, 'reference', 'not useful', '', 'Epigraphic search interface; no geodata export.')
r(27, 'reference', 'not useful', '', 'Epigraphic database; no bulk geodata.')
r(28, 'reference', 'not useful', '', 'Network of epigraphic databases; no geodata of its own.')
r(29, 'reference', 'not useful', '', 'A modelled route network c. 200 CE, not attested routes.')
r(33, 'none', 'not useful', '', 'Maps and articles only; Roman Britain roads are in Itiner-e.')
r(34, 'covered', 'not useful', '', 'Roman roads of Britain are in Itiner-e (integrated).')
r(35, 'none', 'not useful', '', 'Per-segment web pages, no bulk data; attested Roman roads are in Itiner-e.')
r(36, 'reference', 'not useful', '', 'Route planner without a data endpoint.')
r(39, 'owner', 'not recovered', '', 'Skipped at the owner\'s request (1900 names).')
r(41, 'licence', 'not useful', '', 'PASE records people, not places; its terms forbid copying. Link-out only.')
r(46, 'bot', 'not recovered', '', 'ADS blocks automated downloads; the owner can download the 13 new towns of Edward I by hand. Town-plan detail only.')
r(47, 'none', 'not useful', '', 'A handful of Midland parishes — too local for the atlas.')
r(50, 'none', 'not recovered', '', 'The deserted-village gazetteers are publications and an archive, not open data.')
r(52, 'reference', 'not useful', '', 'PDF town maps, not GIS.')
r(62, 'none', 'recovered', 'dicotopo', 'No France-wide medieval town dataset exists, but DicoTopo now gives 22,366 French communes their first dated attestation (private data).')
r(66, 'licence', 'recovered', 'dicotopo', 'Patriarche is not public. DicoTopo (non-commercial, no derivatives — private use) adds 6,774 dated castles, churches and religious houses located by commune.')
r(67, 'reference', 'not useful', '', 'Georeferenced map tiles, not data.')
r(68, 'none', 'recovered', 'dicotopo', 'Regional datasets are PDFs or databases without export; DicoTopo covers 53 départements with dated name forms (private data).')
r(75, 'access', 'recovered', 'ebidat', 'EBIDAT has no bulk export, but each castle page is public: all castles were snapshotted (dating begin/end, type, function, condition, position) — private data.')
r(78, 'reference', 'not useful', '', 'Printed/online historical atlases: maps, not data.')
r(83, 'access', 'not recovered', '', 'Malanima\'s Italian urban population is published as PDF tables; Buringh already has 394 Italian towns. Transcribing would be a cross-check only.')
r(84, 'none', 'not recovered', '', 'No GIS of medieval communes exists as data.')
r(85, 'none', 'not recovered', '', 'No city-state territory polygons exist as data.')
r(88, 'none', 'not recovered', '', 'No medieval Italian road network exists as data (modern pilgrim trails are not history).')
r(89, 'access', 'not recovered', '', 'Regional castle atlases are not downloadable; EBIDAT and Wikidata cover what exists.')
r(90, 'none', 'not recovered', '', 'No digital Monasticon Italiae.')
r(91, 'none', 'not recovered', '', 'Only present-day diocese boundaries exist.')
r(94, 'reference', 'not recovered', '', 'Regional geoportals, mostly ancient, no bulk export.')
r(95, 'none', 'not recovered', '', 'No open data behind Italian historical atlases.')
for n in (97, 98, 99, 100, 101, 102, 103, 104, 107, 108, 109):
    r(n, 'none', 'not recovered', '', 'No GIS of medieval Iberian kingdoms, counties or marches exists as data; Cliopatria outlines remain the only polity source.')
r(106, 'none', 'not recovered', '', 'No taifa boundary data exists.')
r(111, 'access', 'not recovered', '', 'Regional heritage registers (Catalonia, Aragón) not yet downloaded — next wave; Wikidata covers Iberian castles meanwhile.')
r(112, 'access', 'not recovered', '', 'As 111.')
r(113, 'none', 'not recovered', '', 'Villuga 1546 exists only as a web gazetteer; no data file could be located.')
r(115, 'none', 'not recovered', '', 'No Iberian monastery dataset exists.')
r(116, 'none', 'not recovered', '', 'No historical Iberian diocese GIS exists.')
r(117, 'none', 'not recovered', '', 'As 113.')
r(118, 'access', 'not recovered', '', 'Regional archaeological inventories without bulk export.')
r(119, 'access', 'not recovered', '', 'As 111.')
r(122, 'unclear', 'recovered', 'sweden-lamningar', 'Riksantikvarieämbetet publishes all ancient remains as one GeoPackage (pub.raa.se); downloaded and filtered to Iron Age / medieval remains (private data).')
r(124, 'licence', 'recovered', 'nordic-spatial-humanities', 'The Icelandic Saga Map places come with the Nordic Spatial Humanities release (CC BY 4.0) — public.')
r(125, 'covered', 'recovered', 'norway-kulturminner, dk-fund-og-fortidsminder, sweden-lamningar', 'Settlement remains from the Norwegian (public), Danish and Swedish (private) registers.')
r(126, 'none', 'not recovered', '', 'No medieval herred/härad boundaries exist as open GIS.')
r(127, 'covered', 'acquired', 'nordic-spatial-humanities', 'Norwegian place-name database comes inside the Nordic release (710,000 names, no coordinates) — not integrated.')
r(128, 'covered', 'recovered', 'nordic-spatial-humanities', 'Old Norse place forms from the sagas and chronicles (Nordic release).')
r(129, 'covered', 'recovered', 'nordic-spatial-humanities, norway-kulturminner, dk-fund-og-fortidsminder', 'Nordic parish churches with first attestation; Norwegian and Danish medieval churches and churchyards.')
r(131, 'none', 'not recovered', '', 'No royal-sites dataset exists.')
r(134, 'covered', 'recovered', 'norway-kulturminner, dk-fund-og-fortidsminder, sweden-lamningar, ran-romania', 'National registers.')
r(135, 'reference', 'not useful', '', 'Scanned maps, not data.')
r(138, 'technical', 'acquired', 'engel-hungary', 'Engel\'s atlas was downloaded (vault), but its database is encrypted inside a Windows GIS program whose only export is attribute tables without coordinates. Breaking the encryption is not an option.')
r(140, 'access', 'not recovered', '', 'The Croatian register has no bulk download; EBIDAT and Wikidata cover castles.')
r(142, 'none', 'not recovered', '', 'Only a 1953 printed list of Bosnian fortresses.')
r(145, 'access', 'recovered', 'ran-romania', 'RAN downloaded from the register\'s own site and map service (data.gov.ro still unreachable) — private data.')
r(146, 'access', 'recovered', 'ran-romania', 'As 145 (Romanian Moldavia; the Republic of Moldova is not covered).')
r(148, 'access', 'not recovered', '', 'The Greek Archaeological Cadastre is a single-page app with per-site data only; no bulk route found.')
r(149, 'none', 'not recovered', '', 'No open Rus\' archaeological or town dataset.')
r(150, 'none', 'not recovered', '', 'As 149.')
r(153, 'covered', 'recovered', 'ran-romania, atlas-fontium-poland', 'RAN (Romania) and Atlas Fontium (Poland) — private data; Engel (Hungary) remains locked.')
r(154, 'bot', 'not recovered', '', 'GOV is behind a bot check; TIB (private data) covers the Byzantine Balkans.')
r(155, 'technical', 'not recovered', '', 'Engel\'s 1490s landholding maps are locked in the encrypted program; Atlas Fontium districts (1580) are in the private pack as raw data.')
r(157, 'covered', 'recovered', 'ebidat, tib-maps-of-power', 'EBIDAT castles (incl. Hungary, Slovakia, Czechia, Latvia) and TIB fortifications — private data.')
r(158, 'covered', 'recovered', 'ebidat, tib-maps-of-power', 'As 157.')
r(159, 'covered', 'recovered', 'tib-maps-of-power', 'TIB monasteries of the Byzantine Balkans — private data.')
r(164, 'reference', 'not useful', '', 'Scanned maps, not data.')

# Candidates that had been tested but were left aside because of licensing (not among the 82):
r(58, 'licence', 'recovered', 'dicotopo', 'DicoTopo (CC BY-NC-ND): bulk XML from the project repository — 22,366 communes with dated first attestation and 6,774 dated castles, churches and religious houses; private use only.')
r(42, 'licence', 'not recovered', '', 'Open Domesday (non-commercial) would add per-manor detail, but Domesday England is already mapped (shires, hundreds); low marginal value.')
r(136, 'unclear', 'recovered', 'atlas-fontium-poland', 'All 11 layers acquired; settlements and parish seats integrated in the private pack (1550–1600). Districts, roads, rivers and forests are in the vault, not yet drawn.')
r(139, 'unclear', 'recovered', 'tib-maps-of-power, ebidat', 'TIB churches in Slovakia and EBIDAT Slovak castles — private data.')
r(143, 'unclear', 'recovered', 'tib-maps-of-power', 'TIB places of Bulgaria (Thrace, Macedonia volumes) — private data; only 23 by 1399, so Bulgaria stays weak.')
r(144, 'access', 'recovered', 'ran-romania', 'RAN: 2,865 migration-period and medieval sites with positions, from the register\'s own site and map service — private data.')
r(151, 'bot', 'not recovered', 'ebidat', 'Estonia\'s register refuses automated requests (403); Latvia is partly covered by EBIDAT castles (private data).')
