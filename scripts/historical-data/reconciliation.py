#!/usr/bin/env python3
"""Build the reconciliation of the original seed candidates (the 166 bullets of the
audit brief, data/historical/audit/seed-candidates.json) against the evidence recorded
for each (data/historical/audit/reconciliation_entries.py).

Writes data/historical/audit/reconciliation.json and the Markdown tables used in
docs/MEDIEVAL_EUROPE_DATA_AUDIT.md (between the RECONCILIATION markers).

  python3 scripts/historical-data/reconciliation.py
"""
import json
import os
import re
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
AUD = os.path.join(ROOT, 'data', 'historical', 'audit')
DOC = os.path.join(ROOT, 'docs', 'MEDIEVAL_EUROPE_DATA_AUDIT.md')

LEVELS = [('F', 'found'), ('O', 'official project located'), ('D', 'dataset verified to exist'), ('A', 'download/API tested'), ('M', 'metadata inspected'),
          ('L', 'licence checked'), ('Q', 'quality assessed'), ('G', 'geography assessed'), ('T', 'time assessed'), ('N', 'names assessed'),
          ('S', 'suitable for Shelf'), ('C', 'acquired'), ('I', 'integrated')]


def recovery_cell(rec):
    if not rec:
        return ''
    return f"{rec['outcome']} ({rec['reason']}){': ' + rec['datasets'] if rec['datasets'] else ''} — {rec['note']}"


def licence_state(text):
    """Class what was recorded about a licence. A licence read only through a search result, an earlier audit or a
    page that could not be reached is not verified; "no licence found" is never read as a restriction."""
    if re.search(r'owner decision', text):
        return 'n/a (owner decision)'
    if re.search(r'not a dataset', text):
        return 'n/a (not a dataset)'
    if re.search(r'individual use|non-commercial|\bNC\b|\bND\b|NC-|-NC|personal and business|no republishing|not open|\bcommercial', text):
        return 'explicit restriction'
    if re.search(r'not verified|not stated|unverified|not.specified|not shown|unspecified|via search|not re-read|not read|earlier audit|blocked|see project|see .* site|^\W*$', text, re.I):
        return 'not verified'
    if re.search(r'online only|no bulk', text, re.I):
        return 'access restriction'
    if re.search(r'\bper (source|dataset|contributing|collection)|per-record|^various|^see \d|^as \d', text, re.I):
        return 'per source (see the rows it points to)'
    return 'confirmed'


def accounting(seed, out, R, verified, refused, vault):
    """Every total the audit reports, derived here from the records — never typed into the document."""
    n = len(out)
    tested_before = [o['n'] for o in out if o['testedBeforeRecovery']]
    untested_before = [o['n'] for o in out if not o['testedBeforeRecovery']]
    in_recovery = sorted(R)
    rec_untested = [k for k in in_recovery if k in untested_before]
    rec_tested = [k for k in in_recovery if k not in untested_before]
    newly_tested = [k for k in rec_untested if R[k]['outcome'] in ('recovered', 'acquired')]
    tested_after = [o['n'] for o in out if o['levels']['download/API tested']]
    acquired = [o['n'] for o in out if o['levels']['acquired']]
    integrated = [o['n'] for o in out if o['levels']['integrated']]
    names = Counter(o['candidate'].strip().lower() for o in out)
    dup = {k: v for k, v in names.items() if v > 1}
    outcome = Counter(R[k]['outcome'] for k in in_recovery)
    # Neither acquired nor given a recovery outcome: tested, and left with a recorded next step.
    open_rows = [o['n'] for o in out if not o['levels']['acquired'] and o['n'] not in R]
    return {
        'candidates': n,
        'duplicateNames': {'names': len(dup), 'bullets': sum(dup.values()), 'repeatsBeyondFirst': sum(v - 1 for v in dup.values()), 'list': dup},
        'testedBeforeRecovery': len(tested_before), 'untestedBeforeRecovery': len(untested_before),
        'recoveryRows': len(in_recovery), 'recoveryRowsUntestedBefore': len(rec_untested), 'recoveryRowsTestedBefore': rec_tested,
        'newlyTestedInRecovery': len(newly_tested), 'testedAfterRecovery': len(tested_after), 'stillUntested': n - len(tested_after),
        'recoveryOutcomes': dict(outcome), 'recoveryReasons': dict(Counter(R[k]['reason'] for k in in_recovery)),
        'integratedLater': sorted(verified), 'integratedLaterRefused': refused,
        'acquired': len(acquired), 'integrated': len(integrated), 'acquiredNotIntegrated': sorted(set(acquired) - set(integrated)),
        'unavailable': outcome.get('not recovered', 0), 'notUseful': outcome.get('not useful', 0),
        'openAfterTesting': open_rows,
        'vaultDatasets': {k: v.get('status') for k, v in vault.items()},
        'explanation': ('82 = candidates never tested by download/API before the recovery pass; 89 = the rows of the recovery table: '
                        'those 82 plus the 7 already-tested candidates left aside over licensing; 64 = candidates still without a '
                        'download/API test after the recovery pass (166 − 102). They count different sets, not one set three ways.'),
    }


def write_accounting(a):
    L = ['<!-- ACCOUNTING:START (generated by scripts/historical-data/reconciliation.py from data/historical/audit/*; do not edit) -->', '',
         f"- **Candidates:** {a['candidates']} bullets of the seed list. {a['duplicateNames']['names']} theme names occur more than once "
         f"({a['duplicateNames']['bullets']} bullets, {a['duplicateNames']['repeatsBeyondFirst']} repeats): they are separate bullets of the brief, kept as such.",
         f"- **Tested by download or API before the recovery pass:** {a['testedBeforeRecovery']}; not tested: {a['untestedBeforeRecovery']}.",
         f"- **Recovery pass:** {a['recoveryRows']} rows = the {a['recoveryRowsUntestedBefore']} untested candidates + {len(a['recoveryRowsTestedBefore'])} tested ones "
         f"left aside over licensing ({', '.join(map(str, a['recoveryRowsTestedBefore']))}). Outcomes: "
         + ', '.join(f'{k} {v}' for k, v in a['recoveryOutcomes'].items()) + '.',
         f"- **Newly tested in the recovery pass:** {a['newlyTestedInRecovery']}. Tested after it: {a['testedAfterRecovery']}; still untested: {a['stillUntested']}.",
         f"- **Integrated later under another row** (checked against the vault audit): {len(a['integratedLater'])} candidates "
         f"({', '.join(map(str, a['integratedLater']))})" + (f"; refused (dataset not integrated): {', '.join(map(str, a['integratedLaterRefused']))}" if a['integratedLaterRefused'] else '') + '.',
         f"- **Acquired:** {a['acquired']}. **Integrated:** {a['integrated']}"
         + (f" (acquired but not integrated: {', '.join(map(str, a['acquiredNotIntegrated']))})" if a['acquiredNotIntegrated'] else '') + '.',
         f"- **Unavailable** (recovery: no dataset, or not obtainable): {a['unavailable']}. **Not useful** (reference works, duplicates, out of scope): {a['notUseful']}.",
         f"- **Open** (tested, not acquired, with a recorded next step): {len(a['openAfterTesting'])} — {', '.join(map(str, a['openAfterTesting']))}.",
         f"- Why earlier reports gave 64, 82 and 89: {a['explanation']}", '',
         '<!-- ACCOUNTING:END -->']
    block = '\n'.join(L)
    doc = open(DOC, encoding='utf-8').read()
    if '<!-- ACCOUNTING:START' in doc:
        doc = re.sub(r'<!-- ACCOUNTING:START.*?<!-- ACCOUNTING:END -->', lambda m: block, doc, flags=re.S)
    else:
        doc = doc.replace('Totals, from the generated table (A.1):', 'Totals (generated):\n\n' + block + '\n\nTotals, from the generated table (A.1):', 1)
    open(DOC, 'w', encoding='utf-8').write(doc)


def main():
    seed = json.load(open(os.path.join(AUD, 'seed-candidates.json')))
    ns = {}
    exec(open(os.path.join(AUD, 'reconciliation_entries.py'), encoding='utf-8').read(), ns)
    E = ns['E']
    rec_ns = {}
    rp = os.path.join(AUD, 'recovery_entries.py')
    if os.path.exists(rp):
        exec(open(rp, encoding='utf-8').read(), rec_ns)
    RECOVERY = rec_ns.get('R', {})
    missing = [i for i in range(len(seed)) if i not in E]
    if missing:
        raise SystemExit(f'Candidates without an entry: {missing}')
    upd_ns = {}
    up = os.path.join(AUD, 'integration_updates.py')
    if os.path.exists(up):
        exec(open(up, encoding='utf-8').read(), upd_ns)
    UPDATES = upd_ns.get('U', {})
    vault = json.load(open(os.path.join(AUD, 'vault-audit.json'), encoding='utf-8'))
    # An update counts only when the vault audit (derived from the built data) shows every dataset it names integrated.
    verified = {n: u for n, u in UPDATES.items() if all(str(vault.get(v, {}).get('status', '')).startswith('integrated') for v in u['vault'])}
    refused = sorted(set(UPDATES) - set(verified))
    out = []
    for i, s in enumerate(seed):
        e = E[i]
        lv = set(re.sub(r'\s', '', e['levels']))
        # The licence state is classed from what was recorded; the L level only says the licence was looked for.
        lic_state = licence_state(e['licence'])
        rec = RECOVERY.get(i + 1)
        before = set(lv)
        if rec and rec['outcome'] in ('recovered', 'acquired'):
            lv |= {'A', 'C'} | ({'I', 'S'} if rec['outcome'] == 'recovered' else set())
        if (i + 1) in verified:
            lv |= {'A', 'C', 'I', 'S'}
        out.append({'n': i + 1, 'section': s['section'] or 'Europe-wide / cross-period', 'candidate': s['candidate'],
                    'levels': {name: code in lv for code, name in LEVELS}, 'licence': e['licence'], 'licenceState': lic_state,
                    'useful': e['useful'], 'integrated': e['integrated'], 'why': e['why'], 'next': e['next'], 'evidence': e['evidence'],
                    'recovery': rec, 'integratedLater': verified.get(i + 1), 'testedBeforeRecovery': 'A' in before})
    json.dump(out, open(os.path.join(AUD, 'reconciliation.json'), 'w'), ensure_ascii=False, indent=1)
    acc = accounting(seed, out, RECOVERY, verified, refused, vault)
    json.dump(acc, open(os.path.join(AUD, 'accounting.json'), 'w'), ensure_ascii=False, indent=1)
    write_accounting(acc)

    yn = lambda b: '✓' if b else '·'  # noqa: E731
    tot = Counter()
    for o in out:
        for k, v in o['levels'].items():
            tot[k] += v
    lines = ['<!-- RECONCILIATION:START (generated by scripts/historical-data/reconciliation.py) -->', '',
             f"All {len(out)} bullets of the original seed list, in their original order. Evidence levels: "
             + ' · '.join(f'**{c}** {n}' for c, n in LEVELS) + '.', '',
             '| Totals | ' + ' | '.join(f'{c}: {tot[n]}' for c, n in LEVELS) + ' |', '| --- |' + ' --- |' * len(LEVELS), '',
             'Licence state: ' + ', '.join(f'{k} {v}' for k, v in Counter(o['licenceState'] for o in out).most_common()) + '.', '',
             'Recovery pass (' + str(len(RECOVERY)) + ' candidates revisited): ' + ', '.join(f'{k} {v}' for k, v in Counter(r['outcome'] for r in RECOVERY.values()).most_common())
             + '. Reasons they had been left: ' + ', '.join(f'{k} {v}' for k, v in Counter(r['reason'] for r in RECOVERY.values()).most_common()) + '.', '']
    sec = None
    for o in out:
        if o['section'] != sec:
            sec = o['section']
            lines += ['', f'#### {sec}', '', '| # | Candidate | Investigated | Verified | Downloadable | Licence | Useful? | Integrated? | Why / why not | Next action | Recovery pass |',
                      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
        L = o['levels']
        cell = lambda t: str(t).replace('|', '/').replace('\n', ' ')  # noqa: E731
        lines.append(f"| {o['n']} | {cell(o['candidate'])} | {yn(L['found'] and L['official project located'])} | {yn(L['dataset verified to exist'])} | "
                     f"{yn(L['download/API tested'])} | {o['licenceState']}: {cell(o['licence'])} | {cell(o['useful'])} | {cell(o['integrated'])} | {cell(o['why'])} | {cell(o['next'])} | {cell(recovery_cell(o['recovery']))} |")
    lines += ['', '<!-- RECONCILIATION:END -->']
    block = '\n'.join(lines)
    doc = open(DOC, encoding='utf-8').read() if os.path.exists(DOC) else ''
    if '<!-- RECONCILIATION:START' in doc:
        doc = re.sub(r'<!-- RECONCILIATION:START.*?<!-- RECONCILIATION:END -->', lambda m: block, doc, flags=re.S)
    else:
        doc += '\n' + block + '\n'
    open(DOC, 'w', encoding='utf-8').write(doc)
    print('candidates', len(out), dict(tot), Counter(o['licenceState'] for o in out))
    print('recovery', Counter(r['outcome'] for r in RECOVERY.values()), Counter(r['reason'] for r in RECOVERY.values()))


if __name__ == '__main__':
    main()
