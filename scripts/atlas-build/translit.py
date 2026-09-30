"""
Romanization of place names by published standard schemes — used only when a
place has no English name and no name in a Latin-script language.

Only scripts with a standard, deterministic romanization are handled; each result
says which scheme produced it, so it is never presented as an established name:

  uk  Ukrainian   national system (Cabinet of Ministers resolution No. 55, 2010)
  be  Belarusian  BGN/PCGN (simplified: no diacritics)
  bg  Bulgarian   Streamlined System (Transliteration Act, 2009)
  sr  Serbian     the official Serbian Latin alphabet (Gaj)
  mk  Macedonian  official romanization (2008)
  ru  Russian     BGN/PCGN (simplified: no diacritics or separators)
  el  Greek       ELOT 743 / ISO 843 (transcription rules for αυ, ευ, ου, μπ, γγ…)
  ka  Georgian    national system (2002)

Arabic, Hebrew and Armenian names are not romanized here: the first two are
written without most vowels, so any romanization would be a guess; Armenian
has competing systems. Those names are kept in their own script.
"""
from __future__ import annotations

import re
import unicodedata

SCHEMES = {
    'uk': 'Ukrainian national romanization (2010)', 'be': 'BGN/PCGN Belarusian (simplified)', 'bg': 'Bulgarian Streamlined System (2009)',
    'sr': 'Serbian Latin alphabet', 'mk': 'Macedonian official romanization', 'ru': 'BGN/PCGN Russian (simplified)',
    'el': 'ELOT 743 / ISO 843', 'ka': 'Georgian national system (2002)',
}
# Which label to romanize when several exist: the more local-specific languages first; Russian
# labels exist for many non-Russian places, so Russian comes last among Cyrillic.
ORDER = ['uk', 'be', 'bg', 'sr', 'mk', 'ru', 'el', 'ka']

_COMMON = {'а': 'a', 'б': 'b', 'в': 'v', 'д': 'd', 'з': 'z', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
           'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'ж': 'zh', 'ь': '', 'ъ': ''}
_TABLES = {
    'ru': {**_COMMON, 'г': 'g', 'е': 'e', 'ё': 'yo', 'и': 'i', 'й': 'y', 'х': 'kh', 'щ': 'shch', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya'},
    'be': {**_COMMON, 'г': 'h', 'е': 'e', 'ё': 'yo', 'і': 'i', 'й': 'y', 'х': 'kh', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ў': 'w', "'": '', '’': ''},
    'uk': {**_COMMON, 'г': 'h', 'ґ': 'g', 'е': 'e', 'є': 'ie', 'и': 'y', 'і': 'i', 'ї': 'i', 'й': 'i', 'х': 'kh', 'щ': 'shch', 'ю': 'iu', 'я': 'ia', "'": '', '’': ''},
    'bg': {**_COMMON, 'г': 'g', 'е': 'e', 'и': 'i', 'й': 'y', 'х': 'h', 'щ': 'sht', 'ъ': 'a', 'ь': 'y', 'ю': 'yu', 'я': 'ya'},
    'sr': {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e', 'ж': 'ž', 'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj',
           'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'ć', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č', 'џ': 'dž', 'ш': 'š'},
    'mk': {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ѓ': 'gj', 'е': 'e', 'ж': 'zh', 'з': 'z', 'ѕ': 'dz', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l',
           'љ': 'lj', 'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ќ': 'kj', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
           'ч': 'ch', 'џ': 'dj', 'ш': 'sh'},
    'ka': {'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z', 'თ': 't', 'ი': 'i', 'კ': 'k’', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o',
           'პ': 'p’', 'ჟ': 'zh', 'რ': 'r', 'ს': 's', 'ტ': 't’', 'უ': 'u', 'ფ': 'p', 'ქ': 'k', 'ღ': 'gh', 'ყ': 'q’', 'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts',
           'ძ': 'dz', 'წ': 'ts’', 'ჭ': 'ch’', 'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h'},
}
# Word-initial forms (and after a vowel, apostrophe or soft/hard sign) where the scheme prescribes them.
_INITIAL = {'uk': {'є': 'ye', 'ї': 'yi', 'й': 'y', 'ю': 'yu', 'я': 'ya'},
            'ru': {'е': 'ye'},
            'be': {'е': 'ye'}}
# Ukrainian writes the initial forms only at the start of a word; BGN/PCGN Russian and Belarusian also after
# a vowel, й, ь or ъ.
_WORD_INITIAL_ONLY = {'uk'}
_VOWELS = set('аеёиіїоуыэюяєaeiouy')


def _cyrillic(s: str, lang: str) -> str:
    table, initial = _TABLES[lang], _INITIAL.get(lang, {})
    out, prev = [], ''
    low = s.lower()
    i = 0
    while i < len(s):
        ch, lc = s[i], low[i]
        if lang == 'uk' and low[i:i + 2] == 'зг':
            rep = 'zgh'; i += 2
        elif lang == 'bg' and low[i:i + 2] == 'ия' and (i + 2 == len(s) or not low[i + 2].isalpha()):
            rep = 'ia'; i += 2  # word-final -ия → -ia (Streamlined System)
        else:
            word_start = not prev or (not prev.isalpha() and prev not in '\'’ʼ')
            at_start = word_start or (lang not in _WORD_INITIAL_ONLY and (prev in _VOWELS or prev in 'йьъ\'’ʼ'))
            rep = initial.get(lc) if at_start and lc in initial else table.get(lc)
            if rep is None:
                rep = ch
            i += 1
        if ch.isupper() and rep:
            rep = rep[0].upper() + rep[1:]
        out.append(rep)
        prev = lc
    return ''.join(out)


def _greek(s: str) -> str:
    base = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')  # drop accents
    low = base.lower()
    single = {'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n',
              'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o'}
    voiced = set('βγδζλμνραεηιουω')
    out, i = [], 0
    while i < len(low):
        two, nxt = low[i:i + 2], low[i + 2:i + 3]
        start = i == 0 or not low[i - 1].isalpha()
        if two == 'ου':
            rep, n = 'ou', 2
        elif two in ('αυ', 'ευ', 'ηυ'):
            rep, n = two[0].replace('α', 'a').replace('ε', 'e').replace('η', 'i') + ('v' if nxt and nxt in voiced else 'f'), 2
        elif two == 'μπ':
            rep, n = ('b' if start or not nxt.isalpha() else 'mp'), 2
        elif two == 'ντ':
            rep, n = ('d' if start else 'nt'), 2
        elif two in ('γγ', 'γξ', 'γχ'):
            rep, n = {'γγ': 'ng', 'γξ': 'nx', 'γχ': 'nch'}[two], 2
        elif two == 'γκ':
            rep, n = ('g' if start else 'ng'), 2
        else:
            rep, n = single.get(low[i], base[i]), 1
        if base[i].isupper() and rep:
            rep = rep[0].upper() + rep[1:]
        out.append(rep)
        i += n
    return ''.join(out)


def script_of(s: str) -> str | None:
    for c in s:
        if c.isalpha():
            n = unicodedata.name(c, '')
            for sc in ('LATIN', 'CYRILLIC', 'GREEK', 'GEORGIAN', 'ARMENIAN', 'ARABIC', 'HEBREW'):
                if sc in n:
                    return sc
    return None


def romanize(names: dict[str, str]) -> tuple[str, str, str] | None:
    """(romanized name, source language, scheme) from the first label a standard scheme covers."""
    for lang in ORDER:
        v = names.get(lang)
        if not v:
            continue
        sc = script_of(v)
        if lang == 'el' and sc == 'GREEK':
            return _greek(v), lang, SCHEMES[lang]
        if lang == 'ka' and sc == 'GEORGIAN':
            # Georgian has no capitals; romanized names are capitalized word by word, as the national system's examples do.
            return ' '.join(w[:1].upper() + w[1:] for w in _cyrillic(v, 'ka').split(' ')), lang, SCHEMES[lang]
        if lang in _TABLES and sc == 'CYRILLIC':
            return _cyrillic(v, lang), lang, SCHEMES[lang]
    return None


if __name__ == '__main__':
    for n in ({'uk': 'Чернігів'}, {'uk': 'Згурівка'}, {'ru': 'Великий Новгород'}, {'ru': 'Ярославль'}, {'bg': 'Рилски манастир'}, {'bg': 'София'},
              {'sr': 'Студеница'}, {'sr': 'Ђурђеви ступови'}, {'mk': 'Охрид'}, {'el': 'Θεσσαλονίκη'}, {'el': 'Μυστράς'}, {'el': 'Ευρυτανία'},
              {'el': 'Μπενάκη'}, {'ka': 'მცხეთა'}, {'be': 'Полацк'}, {'ar': 'دمشق'}):
        print(n, '→', romanize(n))
