"""The discovery universe's search terms: wide, systematic, multilingual.

Built from queries.py (topics, local-language concept terms, region × category) and extended with
  - every region in its own language(s) × feature/period concepts,
  - feature concepts × period words,
  - categories the coverage matrix shows thin (maritime, economic, transport, events, physical, population).
Each query is (text, language, family). The same list feeds every catalogue channel in universe.py.
"""
from queries import CATEGORIES, LOCAL, REGIONS, TOPICS

# Region names as the region's own catalogues write them (searching only in English misses most national portals).
REGION_LOCAL = {
    'France': ['France'], 'Germany': ['Deutschland', 'Bayern', 'Sachsen', 'Westfalen', 'Rheinland', 'Brandenburg', 'Thüringen', 'Hessen', 'Baden-Württemberg', 'Niedersachsen', 'Schleswig-Holstein', 'Mecklenburg'],
    'Italy': ['Italia', 'Toscana', 'Lombardia', 'Veneto', 'Piemonte', 'Lazio', 'Sicilia', 'Sardegna', 'Puglia', 'Campania', 'Emilia-Romagna'],
    'Spain': ['España', 'Castilla', 'Andalucía', 'Aragón', 'Catalunya', 'Galicia', 'Navarra', 'Valencia', 'Asturias'],
    'Portugal': ['Portugal'], 'Netherlands': ['Nederland', 'Holland', 'Friesland', 'Zeeland'], 'Belgium': ['België', 'Belgique', 'Vlaanderen', 'Wallonie'],
    'Denmark': ['Danmark'], 'Sweden': ['Sverige'], 'Norway': ['Norge'], 'Finland': ['Suomi'], 'Iceland': ['Ísland'],
    'Poland': ['Polska', 'Śląsk', 'Pomorze', 'Mazowsze', 'Małopolska', 'Wielkopolska'], 'Czechia': ['Čechy', 'Morava', 'Česko'], 'Slovakia': ['Slovensko'],
    'Hungary': ['Magyarország', 'Erdély', 'Dunántúl', 'Alföld'], 'Romania': ['România', 'Transilvania', 'Moldova', 'Țara Românească', 'Banat', 'Dobrogea'],
    'Bulgaria': ['България'], 'Serbia': ['Србија', 'Srbija', 'Vojvodina'], 'Croatia': ['Hrvatska', 'Dalmacija', 'Slavonija', 'Istra'], 'Slovenia': ['Slovenija'],
    'Bosnia': ['Bosna i Hercegovina'], 'Greece': ['Ελλάδα', 'Μακεδονία', 'Κρήτη'], 'Albania': ['Shqipëri'], 'North Macedonia': ['Македонија'],
    'Ukraine': ['Україна', 'Галичина', 'Волинь', 'Поділля', 'Крим'], 'Belarus': ['Беларусь', 'Белоруссия'], 'Lithuania': ['Lietuva'], 'Latvia': ['Latvija', 'Kurzeme', 'Vidzeme', 'Latgale'],
    'Estonia': ['Eesti'], 'Russia': ['Россия', 'Новгород', 'Псков', 'Москва'], 'Turkey': ['Türkiye', 'Anadolu', 'Trakya'], 'Cyprus': ['Κύπρος', 'Kıbrıs'],
    'Georgia': ['საქართველო'], 'Armenia': ['Հայաստան'], 'Austria': ['Österreich', 'Tirol', 'Kärnten', 'Steiermark', 'Niederösterreich'],
    'Switzerland': ['Schweiz', 'Suisse', 'Svizzera'], 'Ireland': ['Éire'], 'Wales': ['Cymru'], 'Scotland': ['Alba'],
    'Egypt': ['مصر'], 'Syria': ['سوريا'], 'Morocco': ['المغرب', 'Maroc'], 'Tunisia': ['Tunisie', 'تونس'], 'Algeria': ['Algérie'], 'Libya': ['ليبيا'],
    'Israel': ['ישראל'], 'Lebanon': ['لبنان', 'Liban'], 'Jordan': ['الأردن'],
}

# Concepts that thin coverage cells need (maritime, economic, transport, events, physical, population, names).
THIN = ['harbours', 'ports', 'shipwrecks', 'lighthouses', 'fisheries', 'salt works', 'saltpans', 'mills', 'watermills', 'mines', 'mining districts',
        'quarries', 'ironworks', 'glassworks', 'kilns', 'potteries', 'markets', 'fairs', 'mints', 'coin hoards', 'toll stations', 'customs',
        'roads', 'post roads', 'postal stations', 'bridges', 'fords', 'ferries', 'canals', 'river navigation', 'railways', 'caravanserais', 'inns',
        'battles', 'sieges', 'uprisings', 'treaties', 'plague', 'epidemics', 'earthquakes historical', 'floods historical',
        'historical rivers', 'historical coastline', 'historical lakes', 'wetlands drained', 'forests historical', 'land use historical',
        'population census', 'tax registers', 'hearth tax', 'urban population', 'parish registers', 'place names', 'toponyms', 'gazetteer',
        'parishes', 'dioceses', 'deaneries', 'monasteries', 'churches', 'synagogues', 'mosques', 'castles', 'fortresses', 'hillforts',
        'manors', 'estates', 'villages', 'towns', 'town charters', 'deserted villages', 'cemeteries', 'burial mounds', 'settlements']
PERIODS = ['medieval', 'early medieval', 'late medieval', 'Roman', 'late antique', 'Byzantine', 'Ottoman', 'early modern', '16th century',
           '17th century', '18th century', '19th century', 'Viking age', 'Iron Age']
# Local concept words to cross with local region names (one per broad category, in that region's language).
LOCAL_CONCEPTS = {
    'de': ['Burgen', 'Klöster', 'Wüstungen', 'Ortsnamen', 'Mühlen', 'Altstraßen', 'Bodendenkmäler', 'historische Karte'],
    'it': ['castelli', 'monasteri', 'insediamenti', 'toponimi', 'mulini', 'strade', 'siti archeologici', 'carta storica'],
    'es': ['castillos', 'monasterios', 'despoblados', 'topónimos', 'molinos', 'caminos', 'yacimientos', 'mapa histórico'],
    'pl': ['zamki', 'klasztory', 'osady', 'nazwy miejscowe', 'młyny', 'drogi', 'stanowiska archeologiczne', 'mapa historyczna'],
    'cs': ['hrady', 'kláštery', 'zaniklé vsi', 'místní jména', 'mlýny', 'cesty', 'archeologické lokality', 'historická mapa'],
    'sk': ['hrady', 'kláštory', 'zaniknuté obce', 'mlyny', 'archeologické lokality'],
    'hu': ['várak', 'kolostorok', 'falvak', 'helynevek', 'malmok', 'utak', 'régészeti lelőhelyek', 'történeti térkép'],
    'ro': ['cetăți', 'mănăstiri', 'sate', 'toponime', 'mori', 'drumuri', 'situri arheologice', 'hartă istorică'],
    'bg': ['крепости', 'манастири', 'селища', 'топоними', 'пътища', 'археологически обекти'],
    'sh': ['gradovi', 'manastiri', 'naselja', 'toponimi', 'putevi', 'arheološka nalazišta'],
    'uk': ['замки', 'монастирі', 'поселення', 'топоніми', 'дороги', 'археологічні пам\'ятки'],
    'ru': ['крепости', 'монастыри', 'поселения', 'топонимы', 'дороги', 'археологические памятники'],
    'el': ['κάστρα', 'μονές', 'οικισμοί', 'τοπωνύμια', 'δρόμοι', 'αρχαιολογικοί χώροι'],
    'tr': ['kaleler', 'manastırlar', 'köyler', 'yer adları', 'yollar', 'arkeolojik alanlar'],
    'fr': ['châteaux', 'abbayes', 'villages', 'toponymes', 'moulins', 'chemins', 'sites archéologiques', 'carte ancienne'],
    'nl': ['kastelen', 'kloosters', 'dorpen', 'plaatsnamen', 'molens', 'wegen', 'vindplaatsen', 'historische kaart'],
    'sv': ['borgar', 'kloster', 'byar', 'ortnamn', 'kvarnar', 'vägar', 'fornlämningar', 'historisk karta'],
    'da': ['borge', 'klostre', 'landsbyer', 'stednavne', 'møller', 'veje', 'fortidsminder', 'historisk kort'],
    'no': ['borger', 'klostre', 'gårder', 'stedsnavn', 'kverner', 'veier', 'kulturminner', 'historisk kart'],
    'fi': ['linnat', 'luostarit', 'kylät', 'paikannimet', 'myllyt', 'tiet', 'muinaisjäännökset'],
    'lt': ['pilys', 'vienuolynai', 'kaimai', 'vietovardžiai', 'keliai', 'piliakalniai'],
    'lv': ['pilis', 'klosteri', 'ciemi', 'vietvārdi', 'ceļi', 'pilskalni'],
    'et': ['linnused', 'kloostrid', 'külad', 'kohanimed', 'teed', 'muistised'],
    'pt': ['castelos', 'mosteiros', 'povoados', 'topónimos', 'moinhos', 'caminhos', 'sítios arqueológicos'],
    'ca': ['castells', 'monestirs', 'despoblats', 'topònims', 'molins', 'camins'],
    # added in cycle 2 for the weakest regions, which had no local-language queries at all
    'is': ['fornleifar', 'örnefni', 'bæir', 'kirkjur', 'eyðibýli', 'þingstaðir', 'sögulegt kort'],
    'ar': ['قلاع', 'أديرة', 'قرى', 'أسماء الأماكن', 'طرق', 'مواقع أثرية', 'خريطة تاريخية', 'خانات'],
    'he': ['מבצרים', 'מנזרים', 'יישובים', 'שמות מקומות', 'דרכים', 'אתרים ארכאולוגיים'],
    'sq': ['kalatë', 'manastiret', 'fshatrat', 'toponimet', 'rrugët', 'sitet arkeologjike'],
    'mk': ['тврдини', 'манастири', 'населби', 'топоними', 'патишта', 'археолошки локалитети'],
    'ka': ['ციხეები', 'მონასტრები', 'სოფლები', 'ტოპონიმები', 'არქეოლოგიური ძეგლები'],
    'hy': ['ամրոցներ', 'վանքեր', 'գյուղեր', 'տեղանուններ', 'հնավայրեր'],
    'be': ['замкі', 'манастыры', 'паселішчы', 'тапонімы', 'дарогі', 'археалагічныя помнікі'],
    'ga': ['caisleáin', 'mainistreacha', 'logainmneacha', 'bóithre'],
    'cy': ['cestyll', 'abatai', 'enwau lleoedd', 'ffyrdd', 'safleoedd archeolegol'],
}
REGION_LANG = {
    'Deutschland': 'de', 'Bayern': 'de', 'Sachsen': 'de', 'Westfalen': 'de', 'Rheinland': 'de', 'Brandenburg': 'de', 'Thüringen': 'de', 'Hessen': 'de',
    'Baden-Württemberg': 'de', 'Niedersachsen': 'de', 'Schleswig-Holstein': 'de', 'Mecklenburg': 'de', 'Österreich': 'de', 'Tirol': 'de', 'Kärnten': 'de',
    'Steiermark': 'de', 'Niederösterreich': 'de', 'Schweiz': 'de', 'Italia': 'it', 'Toscana': 'it', 'Lombardia': 'it', 'Veneto': 'it', 'Piemonte': 'it',
    'Lazio': 'it', 'Sicilia': 'it', 'Sardegna': 'it', 'Puglia': 'it', 'Campania': 'it', 'Emilia-Romagna': 'it', 'Svizzera': 'it', 'España': 'es', 'Castilla': 'es',
    'Andalucía': 'es', 'Aragón': 'es', 'Galicia': 'es', 'Navarra': 'es', 'Asturias': 'es', 'Valencia': 'es', 'Catalunya': 'ca', 'Portugal': 'pt',
    'Polska': 'pl', 'Śląsk': 'pl', 'Pomorze': 'pl', 'Mazowsze': 'pl', 'Małopolska': 'pl', 'Wielkopolska': 'pl', 'Čechy': 'cs', 'Morava': 'cs', 'Česko': 'cs',
    'Slovensko': 'sk', 'Magyarország': 'hu', 'Erdély': 'hu', 'Dunántúl': 'hu', 'Alföld': 'hu', 'România': 'ro', 'Transilvania': 'ro', 'Moldova': 'ro',
    'Țara Românească': 'ro', 'Banat': 'ro', 'Dobrogea': 'ro', 'България': 'bg', 'Србија': 'sh', 'Srbija': 'sh', 'Vojvodina': 'sh', 'Hrvatska': 'sh',
    'Dalmacija': 'sh', 'Slavonija': 'sh', 'Istra': 'sh', 'Slovenija': 'sh', 'Bosna i Hercegovina': 'sh', 'Ελλάδα': 'el', 'Μακεδονία': 'el', 'Κρήτη': 'el',
    'Κύπρος': 'el', 'Україна': 'uk', 'Галичина': 'uk', 'Волинь': 'uk', 'Поділля': 'uk', 'Крим': 'uk', 'Беларусь': 'be', 'Белоруссия': 'ru', 'Россия': 'ru', 'Новгород': 'ru',
    'Псков': 'ru', 'Москва': 'ru', 'Lietuva': 'lt', 'Latvija': 'lv', 'Kurzeme': 'lv', 'Vidzeme': 'lv', 'Latgale': 'lv', 'Eesti': 'et', 'Türkiye': 'tr',
    'Anadolu': 'tr', 'Trakya': 'tr', 'Kıbrıs': 'tr', 'France': 'fr', 'Suisse': 'fr', 'Belgique': 'fr', 'Wallonie': 'fr', 'Nederland': 'nl', 'Holland': 'nl',
    'Friesland': 'nl', 'Zeeland': 'nl', 'België': 'nl', 'Vlaanderen': 'nl', 'Sverige': 'sv', 'Danmark': 'da', 'Norge': 'no', 'Suomi': 'fi',
    'Ísland': 'is', 'مصر': 'ar', 'سوريا': 'ar', 'المغرب': 'ar', 'تونس': 'ar', 'ليبيا': 'ar', 'لبنان': 'ar', 'الأردن': 'ar', 'Maroc': 'fr', 'Tunisie': 'fr',
    'Algérie': 'fr', 'Liban': 'fr', 'ישראל': 'he', 'Shqipëri': 'sq', 'Македонија': 'mk', 'საქართველო': 'ka', 'Հայաստան': 'hy', 'Éire': 'ga', 'Cymru': 'cy',
}


def universe_queries():
    out = [(q, 'en', 'topic') for q in TOPICS]
    out += [(q, lang, 'local') for lang, qs in LOCAL.items() for q in qs]
    out += [(f'{r} {c}', 'en', 'regional') for r in REGIONS for c in CATEGORIES]
    out += [(f'{r} {t}', 'en', 'regional-thin') for r in REGIONS for t in THIN[:40]]
    out += [(f'{p} {t}', 'en', 'period') for p in PERIODS for t in THIN]
    for names in REGION_LOCAL.values():
        for n in names:
            lang = REGION_LANG.get(n)
            for c in LOCAL_CONCEPTS.get(lang, []):
                out.append((f'{n} {c}', lang, 'region-local'))
    seen, uniq = set(), []
    for q in out:
        k = q[0].lower()
        if k not in seen:
            seen.add(k)
            uniq.append(q)
    return uniq


if __name__ == '__main__':
    from collections import Counter
    qs = universe_queries()
    print(len(qs), Counter(f for _, _, f in qs))
