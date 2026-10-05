"""The build's date grammar: how a source's written date becomes (from, to, how). Standard library only.

The app reads dates with the same grammar (src/world/histdate.ts parseDate: map archive, cards, the year box); the shared
battery src/world/date-battery.json holds both to the same answers (test_dates.py here, date-parity.test.ts in the app).
Nothing is made more precise than the text: a century stays a century, "c." stays "about", "before"/"after" leave one end
open, alternatives ("1750 or 1751") stay a span, and a BC sign in any of the languages below is never dropped.

  how: 'year' (that year), 'circa' (about that year), 'years' (a span), 'century', 'from year' (end open), 'until year'
"""
from __future__ import annotations

import math
import re

ROMAN = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12, 'xiii': 13,
         'xiv': 14, 'xv': 15, 'xvi': 16, 'xvii': 17, 'xviii': 18, 'xix': 19, 'xx': 20, 'xxi': 21}
PART = {'early': (0, 33), 'first half': (0, 50), '1st half': (0, 50), 'mid': (33, 66), 'middle': (33, 66), 'second half': (50, 100),
        '2nd half': (50, 100), 'late': (66, 100), 'end': (75, 100), 'beginning': (0, 25), 'start': (0, 25)}
WORDS = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5, 'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
         'eleventh': 11, 'twelfth': 12, 'thirteenth': 13, 'fourteenth': 14, 'fifteenth': 15, 'sixteenth': 16, 'seventeenth': 17,
         'eighteenth': 18, 'nineteenth': 19, 'twentieth': 20, 'twenty-first': 21}
# Before Christ in English, German (v. Chr.), Latin (a. Chr.), Italian/Spanish (a.C.), French (av. J.-C.), Czech/Slovak (př. n. l.),
# Polish (p.n.e.), Scandinavian (f.Kr.), Russian (до н. э.), Hungarian (i. e.).
BCE = re.compile(r'(?<![a-z])(bc|bce|b\.\s?c\.?(?:\s?e\.?)?(?![a-z])|v\.\s?chr|a\.\s?chr|a\.\s?c\.?(?![a-z])|av\.?\s?j\.?-?\s?c|av\.\s?n\.\s?è|pr\.\s?n\.\s?l|př\.\s?n\.\s?l'
                 r'|p\.\s?n\.\s?e|f\.\s?kr|до н\.\s?э|i\.\s?e\.)', re.I)
CE = re.compile(r'(?<![a-z])(ad|ce|a\.\s?d\.?|c\.\s?e\.|n\.\s?chr|d\.\s?c\.|ap\.\s?j\.?-?\s?c|n\.\s?e\.|e\.\s?kr|n\.\s?l\.)(?![a-z])', re.I)
CIRCA = re.compile(r'(?<![a-z])(circa|about|around|approximately|approx\.?|um|gegen|vers|environ|około|ок\.?|cca\.?|~|probably|perhaps|possibly|prob\.|wohl|vermutlich|vielleicht|peut-être|probablement|forse|probabilmente|prawdopodobnie)(?![a-z])', re.I)
NOT_BEFORE = re.compile(r'\b(not before|nicht vor|non ante|pas avant)\b', re.I)
NOT_AFTER = re.compile(r'\b(not after|nicht nach|non post|pas après)\b', re.I)
AFTER = re.compile(r'\b(after|post|nach|après|apres|po|od|from|since|seit)\b', re.I)
BEFORE = re.compile(r'\b(before|ante|vor|avant|przed|do|until|bis)\b', re.I)
NO_DATE = {'nan', 'none', 'null', 'unknown', 'undetermined', 'neznámé', 'unbekannt', 'inconnu', '-', '?', 'n.d.', 'n. d.', 's.d.', 'o.j.', 'sine anno', 's.a.'}
CW = r'(?:c\b|c\.|cent|century|centuries|jh|jahrh|siècle|siecle|s\.|sec|secolo|siglo|sz|század|w\.|wiek|stol|století|stor|st\.|vek|век)'
HIJRI = re.compile(r'\bA\.?\s?H\.?\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:A\.?\s?H\.?|H\.)(?=\s|$|[,;)])')
ROMAN_YEAR = re.compile(r'M{1,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})')


def century_window(n, bce=False, part=None):
    a, b = (n - 1) * 100 + 1, n * 100
    if part:
        p0, p1 = PART[part]
        a, b = a + p0, a + p1 - 1 if p1 < 100 else b
    return (-b, -a) if bce else (a, b)


THIS_YEAR = __import__('datetime').date.today().year


def cap_future(a, b):
    """A period table's span as evidence: its end is never later than this year ("modern" 1901–2050, "21st century"
    2000–2099 end now, PA-009). None when the whole span lies in the future."""
    if a is not None and a > THIS_YEAR:
        return None
    return a, (min(b, THIS_YEAR) if b is not None else b)


def hijri_to_ce(ah: int) -> int:
    """The Common Era year in which most of Hijri year ah falls (the same rounding as the app)."""
    return math.floor(ah * 0.970229 + 621.5643 + 0.5)


def roman_value(s: str) -> int:
    v = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    n = 0
    for i, c in enumerate(s):
        n += -v[c] if i + 1 < len(s) and v[s[i + 1]] > v[c] else v[c]
    return n


def normalise(text: str) -> str:
    """Typographic minus signs before a year become '-', catalogue brackets around the whole date go, '1,200' and
    '1200.0' become 1200."""
    t = re.sub(r'(^|[\s(\[:;,])[−‒–—](?=\d)', r'\1-', str(text).strip())
    m = re.fullmatch(r'\[(.*)\]', t)
    if m:
        t = m.group(1).strip()
    m = re.fullmatch(r'(\d{1,2}),(\d{3})', t)
    if m:
        t = m.group(1) + m.group(2)
    m = re.fullmatch(r'(-?\d{1,4})\.0+', t)
    if m:
        t = m.group(1)
    return t


def wd_year(v: str | None):
    """A Wikidata/XSD time value ('-0217-01-01T00:00:00Z', with or without quotes) as a historical year: XSD and the
    query service count a year 0, so -0217 is 218 BCE. One reader for every Wikidata input, so BCE dates agree."""
    m = re.match(r'^"?([+-]?)(\d+)-', v or '')
    if not m:
        return None
    y = int(m.group(2)) * (-1 if m.group(1) == '-' else 1)
    return y - 1 if y <= 0 else y


def parse_dating(text) -> tuple[int | None, int | None, str] | None:
    """(from, to, how) from a written dating, or None if it holds no date. Never more precise than the text."""
    if text is None:
        return None
    if isinstance(text, (int, float)) and not (isinstance(text, float) and math.isnan(text)):
        if isinstance(text, float) and text != int(text):
            return None
        y = int(text)
        return (y, y, 'year') if -3000 <= y <= 2100 and y != 0 else None
    t = normalise(text)
    if not t or t.lower() in NO_DATE:
        return None
    # a full date (ISO or with slashes): its year
    m = re.fullmatch(r'(-?\d{1,4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?', t)
    if m and 1 <= int(m.group(2)) <= 12:
        y = int(m.group(1))
        return (y, y, 'year') if y else None
    # signed years ("-500", "-500 – -300", "-27:13"): a leading minus is BCE
    m = re.fullmatch(r'(-?\d{1,4})\s*(?:(?:[–—:]|\s-\s|\bto\b)\s*(-?\d{1,4}))?', t)
    if m and (t.startswith('-') or (m.group(2) or '').startswith('-')):
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        if a == 0 or b == 0 or a > b:
            return None
        return a, b, 'years' if a != b else 'year'
    if ROMAN_YEAR.fullmatch(t):
        y = roman_value(t)
        return y, y, 'year'
    m = HIJRI.search(t)
    if m:
        ce = hijri_to_ce(int(m.group(1) or m.group(2)))
        return ce, ce, 'circa'
    # library-catalogue forms: "18--" a century, "176-?" a decade, "c1760" and "1760?" about that year
    m = re.fullmatch(r'(\d{2})--\??', t)
    if m:
        return int(m.group(1)) * 100, int(m.group(1)) * 100 + 99, 'years'
    m = re.fullmatch(r'(\d{3})-\??', t)
    if m:
        return int(m.group(1)) * 10, int(m.group(1)) * 10 + 9, 'years'
    m = re.fullmatch(r'c(\d{3,4})\??', t, re.I) or re.fullmatch(r'(\d{3,4})\s*\?', t)
    if m:
        return int(m.group(1)), int(m.group(1)), 'circa'
    low = t.lower()
    bce = bool(BCE.search(low))
    era = bce or bool(CE.search(low))
    t = re.sub(r'(?<![A-Za-z])(?:ca|c)\.?\s*(?=\d)', 'circa ', t, flags=re.I)  # "c.1250", "ca. 1250", "c 1250"
    low = t.lower()
    cents = []
    # century ranges: "5th-7th c.", "14-15 c.", "XII-XIII w."
    for m in re.finditer(r'\b(\d{1,2})(?:st|nd|rd|th|\.)?\s*[-–/]\s*(\d{1,2})(?:st|nd|rd|th|\.|e|er|ème)?\s*' + CW, low):
        a_, b_ = int(m.group(1)), int(m.group(2))
        if 1 <= a_ <= b_ <= 21:
            cents.append((century_window(a_, bce)[0] if not bce else -b_ * 100, century_window(b_, bce)[1] if not bce else -(a_ - 1) * 100 - 1))
    for m in re.finditer(r'\b([ivxl]{1,6})\.?\s*[-–/]\s*([ivxl]{1,6})\.?\s*' + CW, low):
        a_, b_ = ROMAN.get(m.group(1)), ROMAN.get(m.group(2))
        if a_ and b_ and a_ <= b_:
            cents.append((century_window(a_, bce)[0], century_window(b_, bce)[1]))
    for m in re.finditer(r'(?:(early|late|mid|middle|first half|1st half|second half|2nd half|end|beginning)(?:\s+of)?\s+(?:the\s+)?)?'
                         r'\b(\d{1,2})(?:st|nd|rd|th|\.|e|er|ème)?\s*' + CW, low):
        part = (m.group(1) or '').strip() or None
        cents.append(century_window(int(m.group(2)), bce, part if part in PART else None))
    for m in re.finditer(r'\b(' + '|'.join(WORDS) + r')\s+century', low):
        cents.append(century_window(WORDS[m.group(1)], bce))
    for m in re.finditer(r'\b([ivxl]{1,6})\.?\s*(?:c\b|c\.|cent|century|jh|siècle|s\.|sec|secolo|siglo|sz|század|w\.|wiek|stol|st\.|vek|век|e\b|ème)', low):
        n = ROMAN.get(m.group(1))
        if n:
            cents.append(century_window(n, bce))
    years = [int(y) for y in re.findall(r'(?<![\d.,])(\d{3,4})(?![\d.,])', t) if 100 <= int(y) <= 2100]
    if era:  # with an era a short year is a year ("44 BC", "AD 43"), never a century number or an ordinal
        years += [int(y) for y in re.findall(r'(?<![\d.,\w])(\d{1,2})(?![\d.,]|\s*(?:st|nd|rd|th|e|er|ème)\b|[^\W\d])', t) if int(y) > 0]
    # an abbreviated end year ("1852-62", "1863-4", "1720/1") belongs to the same century as its start
    for m in re.finditer(r'(?<![\d.,/-])(\d{4})\s*[-–/]\s*(\d{1,2})(?![\d.,])(?!\s*[-–/.]\s*\d)', t):  # not a full date (1801-12-05)
        a_, b_ = int(m.group(1)), m.group(2)
        end = int(str(a_)[:4 - len(b_)] + b_)
        if end <= a_:
            end += 10 ** len(b_)
        if a_ < end <= 2100:
            years.append(end)
    # a decade ("1850s", "the 1850's"): its ten years; a round hundred ("the 1200s") is that hundred years (A8-046)
    for m in re.finditer(r'(?<![\d.,])(\d{3})0\'?s\b', t):
        start = int(m.group(1) + '0')
        years += [start, start + 99] if start % 100 == 0 else [start, start + 9]
    if bce:
        years = [-y for y in years]
    if cents and not years:
        return min(a for a, _ in cents), max(b for _, b in cents), 'century'
    if not years:
        return None
    lo, hi = min(years), max(years)
    if cents:
        lo, hi = min(lo, min(a for a, _ in cents)), max(hi, max(b for _, b in cents))
    single = len(set(years)) == 1 and not cents
    if single:
        if NOT_BEFORE.search(low):
            return lo, None, 'from year'
        if NOT_AFTER.search(low):
            return None, hi, 'until year'
        if AFTER.search(low):
            return lo, None, 'from year'
        if BEFORE.search(low) and not re.search(r'\bod\b', low):
            return None, hi, 'until year'
        if CIRCA.search(low) or re.search(r'\d\s*\?', low):
            return lo, hi, 'circa'
    return lo, hi, 'years' if lo != hi else 'year'


def kind(r) -> tuple:
    """(from, to, kind) in the battery's terms: year, circa, span, from, until, none."""
    if r is None:
        return None, None, 'none'
    how = {'year': 'year', 'circa': 'circa', 'from year': 'from', 'until year': 'until'}.get(r[2], 'span')
    return r[0], r[1], how


if __name__ == '__main__':
    import json
    import sys
    print(json.dumps([list(kind(parse_dating(x))) for x in json.load(sys.stdin)], ensure_ascii=False))
