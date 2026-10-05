"""Battles, sieges and other events from Wikidata and HCED, read as events (Stage 4 part 7, EV).

Shared by build.py (wikidata_events), sites.py (hced_battles) and patch_index.py (events), so the rules are the same
whether the data is rebuilt or the published files are patched:

  * the kind comes from what the item is called when Wikidata's class order says otherwise — "Siege of X" is a
    siege even when Wikidata also classes it as a battle (A8-005);
  * the historical layers end in 1945: later events are current affairs, not history (A8-007);
  * one event recorded as two Wikidata items (same name, same or next year, within 100 km) is drawn once, the other
    item kept as a duplicate id ('dq'), with the distance between them when they disagree ('dd') (A8-025);
  * an event dated outside its own war says so ('wo'), and a date whose era sign looks flipped says that (A8-012);
  * a label that does not read as an event name is marked ('nl') and never used to match (A8-006);
  * an HCED battle is the same as a Wikidata event only when the names agree and the years overlap — nearness alone
    never makes two events one (A8-001, A8-003). A match is drawn once, from Wikidata, with HCED's id, winner,
    loser and its own position when it lies elsewhere ('h', 'win', 'los', 'hp', 'hd').
"""
from __future__ import annotations

import math
import re
import unicodedata

EVENTS_UNTIL = 1945
SAME_EVENT_KM = 100
DISAGREE_KM = 25

ORDINAL = r'(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|\d+th)'
LEAD = re.compile(rf'^(?:the )?(?:{ORDINAL} )?(?:battle|battles|siege|sieges|sack|capture|fall|storming|relief|blockade|action|combat|skirmish|engagement|raid|massacre)s?(?: of| at| on| for| near)? (?:the )?')
PROFANE = re.compile(r'\b(?:fuck|fucking|shit|poop|penis|lol|lmao|xd|asdf)\b', re.I)  # whole words only: "Shiting" is a place


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', s)).strip()


def core(name: str) -> str:
    """The place or subject an event is named after: "Second Battle of Panipat" → "panipat"."""
    s = norm(name)
    return LEAD.sub('', s).strip() or s


def km(a, b) -> float:
    (x1, y1), (x2, y2) = a[:2], b[:2]
    p = math.pi / 180
    h = math.sin((y2 - y1) * p / 2) ** 2 + math.cos(y1 * p) * math.cos(y2 * p) * math.sin((x2 - x1) * p / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(h)))


def kind_from_name(name: str, kind: str) -> str:
    n = norm(name)
    if kind == 'battle' and re.search(r'\bsieges? of\b', n) and 'battle' not in n:  # "Assyrian siege of Jerusalem"
        return 'siege'
    if kind == 'siege' and re.match(rf'^(?:{ORDINAL} )?battles? of\b', n):
        return 'battle'
    return kind


def plausible_label(name: str) -> bool:
    """Reads as the name of an event: letters, a sensible length, nothing a vandal typed."""
    return bool(name) and 3 <= len(name) <= 120 and re.search(r'[A-Za-zÀ-ɏ]{3}', name) is not None \
        and not PROFANE.search(name) and not re.fullmatch(r'Q\d+', name.strip())


def clean_events(feats: list[dict], wars: list[dict]) -> dict:
    """Apply the rules above to Wikidata event features in place; returns the features kept and what changed."""
    stats = {'retyped': 0, 'afterCutoff': 0, 'duplicates': 0, 'outsideWar': 0, 'badLabel': 0}
    war = {w['q']: w for w in wars}
    kept = []
    for f in sorted(feats, key=lambda f: (f['properties']['y'], f['properties']['q'])):
        p = f['properties']
        for k in ('wo', 'nl'):  # recomputed; duplicates found earlier ('dq', 'dd') are kept — their items are gone
            p.pop(k, None)
        if p['y'] > EVENTS_UNTIL:
            stats['afterCutoff'] += 1
            continue
        k = kind_from_name(p['n'], p['k'])
        if k != p['k']:
            p['k'] = k
            stats['retyped'] += 1
        if not plausible_label(p['n']):
            p['nl'] = 1
            stats['badLabel'] += 1
        w = war.get(p.get('w') or '')
        if w and (w.get('f') is not None or w.get('t') is not None):
            # An open end is open: a war with no recorded end is not over after its first year (nor one with no start).
            lo = w['f'] if w.get('f') is not None else -math.inf
            hi = w['t'] if w.get('t') is not None else math.inf
            if p['y'] < lo - 1 or (p.get('y2') or p['y']) > hi + 1:
                p['wo'] = 'sign' if lo - 1 <= -p['y'] <= hi + 1 else 1
                stats['outsideWar'] += 1
        kept.append(f)
    # One event recorded as two items: the one with more recorded (a war, a range) is drawn, the other is its duplicate.
    by_core: dict[str, list[dict]] = {}
    for f in kept:
        if f['properties'].get('nl'):
            continue
        by_core.setdefault(core(f['properties']['n']) + '|' + f['properties']['k'], []).append(f)
    drop = set()
    for group in by_core.values():
        for i, a in enumerate(group):
            if id(a) in drop:
                continue
            for b in group[i + 1:]:
                if id(b) in drop:
                    continue
                pa, pb = a['properties'], b['properties']
                if norm(pa['n']) != norm(pb['n']) or abs(pa['y'] - pb['y']) > 1:
                    continue
                d = km(a['geometry']['coordinates'], b['geometry']['coordinates'])
                if d > SAME_EVENT_KM:
                    continue
                keep, other = (a, b) if len(pa) >= len(pb) else (b, a)
                kp = keep['properties']
                kp['dq'] = sorted(set(kp.get('dq', [])) | {other['properties']['q']})
                if d > DISAGREE_KM:
                    kp['dd'] = round(d)
                drop.add(id(other))
                stats['duplicates'] += 1
                if keep is b:
                    break
    out = [f for f in kept if id(f) not in drop]
    stats['kept'] = len(out)
    feats[:] = out
    return stats


def same_event(wd: dict, name: str, y: int, y2: int) -> bool:
    """A Wikidata event and an HCED battle are one event: the same named place or subject, overlapping years."""
    p = wd['properties']
    if p.get('nl') or p['k'] not in ('battle', 'siege'):
        return False
    if (p.get('y2') or p['y']) < y - 1 or p['y'] > y2 + 1:
        return False
    a, b = core(p['n']), core(name)
    if a.replace(' ', '') == b.replace(' ', ''):  # "Shijōnawate" and "Shijo Nawate"
        return True
    return a == b or (min(len(a), len(b)) >= 5 and (a.startswith(b + ' ') or b.startswith(a + ' ')))
