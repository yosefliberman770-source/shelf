"""Search terms for the source discovery harvest (discover/harvest.py).

Three families, so the search is not limited to what ranks well in English:
  TOPICS      — English topic searches (feature categories × periods)
  LOCAL       — the same concepts in the languages of the regions concerned
  REGIONAL    — region × category × period combinations
"""

TOPICS = [
    'medieval settlements GIS', 'historical gazetteer', 'historical gazetteer Europe', 'archaeological sites database Europe',
    'Roman roads GIS', 'Roman road network', 'medieval roads', 'medieval castles database', 'castles GIS', 'monasteries database medieval',
    'religious houses medieval', 'medieval churches database', 'parish churches GIS', 'dioceses medieval GIS', 'historical boundaries shapefile',
    'historical administrative boundaries', 'historical atlas GIS', 'medieval towns database', 'urban history GIS', 'town foundation charters',
    'shipwrecks database Mediterranean', 'shipwrecks database', 'harbours ancient Mediterranean', 'ports medieval', 'watermills historical',
    'mills medieval', 'mining medieval', 'ancient mines', 'quarries Roman', 'markets fairs medieval', 'pilgrimage routes', 'pilgrimage medieval',
    'early medieval cemeteries', 'hillforts database', 'Byzantine settlements', 'Byzantine fortifications', 'Ottoman gazetteer',
    'Ottoman tax registers defter', 'Ottoman settlements GIS', 'Viking age sites', 'Viking settlements', 'historical population GIS',
    'historical census GIS', 'parish boundaries historical', 'place names database', 'toponymy database', 'historical cadastre',
    'historical land use', 'historical road network GIS', 'canals historical GIS', 'inland waterways historical', 'historical railways GIS',
    'railway network historical Europe', 'bridges medieval', 'battles database geolocated', 'battlefields', 'fortifications database',
    'Roman villas database', 'Roman forts', 'limes frontier GIS', 'Late Antique settlements', 'late antiquity GIS', 'Migration period sites',
    'Slavic settlements early medieval', 'Avar cemeteries', 'Merovingian cemeteries', 'Carolingian', 'Anglo-Saxon settlements',
    'georeferenced historical maps', 'historical maps vectorized', 'historical map digitization place names', 'map OCR historical place names',
    'medieval charters places', 'charter places geocoded', 'prosopography places', 'medieval trade routes', 'Hanseatic', 'caravanserai',
    'Crusader castles', 'Islamic Iberia al-Andalus settlements', 'medieval Islamic geography', 'Holy Roman Empire territories GIS',
    'medieval Poland settlements', 'medieval Hungary settlements', 'medieval Bohemia', 'Kievan Rus settlements', 'medieval Serbia',
    'medieval Bulgaria', 'Byzantine Anatolia', 'Roman Britain', 'Roman Gaul', 'Roman Hispania', 'Roman Danube provinces',
    'early modern maps Europe', 'Napoleonic maps', 'Cassini map', 'Josephinian survey', 'Franziszeischer Kataster', 'military survey Habsburg',
    'historical urban population Europe', 'urbanization Europe historical cities', 'medieval villages deserted', 'deserted medieval villages',
    'historical forests', 'historical wetlands', 'historical coastline', 'historical river courses', 'palaeochannels',
    'archaeology spatial dataset', 'archaeological survey dataset', 'excavations database', 'radiocarbon dates database Europe',
    'coin hoards database', 'coin finds geolocated', 'inscriptions geolocated', 'epigraphy database geolocated', 'sarcophagi',
    'medieval hospitals', 'leper houses', 'universities medieval', 'printing places incunabula', 'scriptoria', 'manuscript production places',
    'church dedications', 'saints cults places', 'relics', 'synagogues historical', 'Jewish communities medieval', 'mosques historical',
    'monastic estates', 'granges', 'manors', 'estates medieval', 'tithe', 'tax records medieval geolocated', 'hearth tax',
    'poll tax 1377', 'Domesday', 'lay subsidy', 'feudal', 'lordships', 'seigneuries', 'counties medieval', 'duchies',
]

# Concept terms in local languages (settlements, castles, monasteries, archaeology, place names, roads, maps, atlas, GIS).
LOCAL = {
    'fr': ['SIG historique', 'habitats médiévaux', 'châteaux médiévaux', 'sites archéologiques base de données', 'toponymie', 'dictionnaire topographique',
           'routes anciennes', 'voies romaines', 'paroisses Ancien Régime', 'cartes anciennes géoréférencées', 'monastères', 'prieurés', 'atlas historique',
           'mottes castrales', 'villages désertés', 'commanderies', 'abbayes'],
    'de': ['historisches GIS', 'mittelalterliche Siedlungen', 'Burgen Datenbank', 'Klöster Datenbank', 'Ortsnamen', 'Altstraßen', 'Wüstungen',
           'historische Karten georeferenziert', 'Bodendenkmal', 'Hügelgräber', 'Burgställe', 'Pfarreien', 'Städtegründungen', 'historischer Atlas',
           'Römerstraßen', 'Limes', 'Mühlen', 'Bergbau mittelalterlich'],
    'it': ['GIS storico', 'insediamenti medievali', 'castelli medievali', 'siti archeologici', 'toponomastica', 'viabilità antica', 'pievi',
           'cartografia storica', 'incastellamento', 'monasteri', 'strade romane', 'atlante storico'],
    'es': ['SIG histórico', 'poblamiento medieval', 'castillos', 'yacimientos arqueológicos', 'toponimia', 'vías romanas', 'despoblados',
           'cartografía histórica', 'monasterios', 'atalayas', 'alquerías', 'al-Andalus poblamiento'],
    'pt': ['SIG histórico', 'povoamento medieval', 'sítios arqueológicos', 'toponímia', 'castelos medievais', 'cartografia histórica', 'vias romanas'],
    'ca': ['poblament medieval', 'jaciments arqueològics', 'toponímia', 'castells'],
    'nl': ['historische GIS', 'middeleeuwse nederzettingen', 'archeologische vindplaatsen', 'historische kaarten', 'toponiemen', 'kastelen', 'kloosters'],
    'da': ['historisk GIS', 'middelalder bebyggelse', 'fortidsminder', 'stednavne', 'landsbyer middelalder'],
    'sv': ['historisk GIS', 'medeltida bebyggelse', 'fornlämningar', 'ortnamn', 'medeltida kyrkor'],
    'no': ['historisk GIS', 'middelalder gårder', 'kulturminner', 'stedsnavn'],
    'fi': ['historiallinen paikkatieto', 'muinaisjäännökset', 'paikannimet', 'keskiaika'],
    'is': ['fornleifar', 'örnefni'],
    'pl': ['historyczny GIS', 'osadnictwo średniowieczne', 'grodziska', 'stanowiska archeologiczne', 'nazwy miejscowe', 'atlas historyczny',
           'parafie średniowieczne', 'zamki', 'klasztory', 'słownik historyczno-geograficzny'],
    'cs': ['historický GIS', 'středověké osídlení', 'hrady', 'archeologické lokality', 'místní jména', 'zaniklé vesnice'],
    'sk': ['historický GIS', 'stredoveké osídlenie', 'hradiská', 'archeologické lokality'],
    'hu': ['történeti GIS', 'középkori települések', 'várak', 'régészeti lelőhelyek', 'helynevek', 'középkori templomok', 'kolostorok'],
    'ro': ['GIS istoric', 'așezări medievale', 'situri arheologice', 'toponimie', 'cetăți medievale', 'mănăstiri'],
    'bg': ['исторически ГИС', 'средновековни селища', 'археологически обекти', 'топоними', 'крепости'],
    'sh': ['srednjovjekovna naselja', 'arheološka nalazišta', 'srednjovekovni gradovi', 'arheološka najdišča', 'toponimi', 'utvrde'],
    'uk': ['середньовічні поселення', 'археологічні пам\'ятки', 'городища', 'топоніми'],
    'ru': ['средневековые поселения', 'археологические памятники', 'городища', 'исторический ГИС', 'топонимы', 'писцовые книги'],
    'lt': ['piliakalniai', 'archeologijos paminklai'],
    'lv': ['pilskalni', 'arheoloģiskie pieminekļi'],
    'et': ['linnamäed', 'muinsuskaitse', 'kohanimed'],
    'el': ['αρχαιολογικοί χώροι', 'βυζαντινοί οικισμοί', 'κάστρα', 'τοπωνύμια'],
    'tr': ['Osmanlı yer adları', 'tarihi coğrafya', 'arkeolojik alanlar', 'kervansaray', 'tahrir defterleri'],
    'he': ['אתרים ארכאולוגיים'],
    'ar': ['المواقع الأثرية', 'الجغرافيا التاريخية'],
    'ga': ['logainmneacha'],
    'cy': ['enwau lleoedd'],
}

REGIONS = ['France', 'Germany', 'Italy', 'Spain', 'Portugal', 'England', 'Scotland', 'Ireland', 'Wales', 'Netherlands', 'Belgium', 'Denmark',
           'Sweden', 'Norway', 'Finland', 'Iceland', 'Poland', 'Czech', 'Bohemia', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Serbia',
           'Croatia', 'Slovenia', 'Bosnia', 'Greece', 'Albania', 'Ukraine', 'Belarus', 'Lithuania', 'Latvia', 'Estonia', 'Turkey', 'Anatolia',
           'Cyprus', 'Georgia', 'Austria', 'Switzerland', 'Sicily', 'Sardinia', 'Balkans', 'Baltic', 'Scandinavia', 'Iberia', 'Russia', 'Moldova',
           'North Africa', 'Levant', 'Egypt', 'Maghreb', 'Caucasus', 'Crimea']
CATEGORIES = ['medieval settlements', 'castles', 'roads', 'churches', 'monasteries', 'archaeological sites', 'place names', 'historical boundaries',
              'towns', 'historical GIS', 'historical maps', 'Roman sites', 'early medieval', 'Ottoman']


def all_queries():
    out = [(q, 'en', 'topic') for q in TOPICS]
    out += [(q, lang, 'local') for lang, qs in LOCAL.items() for q in qs]
    out += [(f'{r} {c}', 'en', 'regional') for r in REGIONS for c in CATEGORIES]
    seen, uniq = set(), []
    for q in out:
        if q[0].lower() not in seen:
            seen.add(q[0].lower())
            uniq.append(q)
    return uniq


if __name__ == '__main__':
    print(len(all_queries()))
