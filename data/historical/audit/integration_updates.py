# Candidates whose own entry (reconciliation_entries.py) still reads "not acquired" although the dataset the entry
# itself names was acquired and integrated later, under another row or in a later pass. Keyed by candidate number.
#
# Each claim is checked, not trusted: scripts/historical-data/reconciliation.py upgrades a candidate only when every
# vault dataset listed here has an "integrated…" status in data/historical/audit/vault-audit.json (derived from the
# built data by audit_vault.py). A claim that fails the check is reported, and the candidate keeps its recorded state.
U = {}


def u(n, vault, note):
    U[n] = dict(vault=vault, note=note)


u(5, ['darmc'], 'Its entry names the DARMC datasets on Harvard Dataverse: shipwrecks, Carolingian hoards and Anglo-Saxon settlements were acquired and integrated (private data).')
u(51, ['markets-fairs'], 'Its entry names Letters’ Gazetteer of Markets and Fairs to 1516: acquired and integrated (private data).')
u(64, ['merimee'], 'Its entry names Mérimée: acquired and integrated (castles, religious buildings, bridges, market halls).')
u(70, ['princes-townspeople'], 'Its entry names Princes and Townspeople: acquired and integrated (hre towns).')
u(72, ['princes-townspeople'], 'Its entry names P&T part 2 (territorial histories): integrated as each town’s ruling territory per year.')
u(74, ['princes-townspeople'], 'Its entry names P&T parts 1, 3 and 4: integrated (locations, charters, market grants).')
u(71, ['western-bohemia-toponyms'], 'Its entry names the Western Bohemia toponyms: acquired and integrated.')
u(81, ['western-bohemia-toponyms'], 'Its entry names the Western Bohemia place names to 1500: acquired and integrated.')
u(121, ['norway-kulturminner'], 'Its entry names Kulturminnesøk/Askeladden: the medieval subset was acquired and integrated.')
u(123, ['finland-heritage'], 'Its entry names the Finnish register of ancient monuments: acquired and integrated.')
u(147, ['tib-maps-of-power'], 'Its entry names TIB Maps of Power: acquired and integrated (private data).')
u(160, ['tib-maps-of-power'], 'Its entry names Maps of Power church attestations: integrated (private data).')
u(166, ['western-bohemia-toponyms', 'tib-maps-of-power'], 'Its entry names Western Bohemia toponyms and Maps of Power names: both integrated (Engel remains locked).')
