// Place names this book is known to use, and people's names (so a person
// called "Florence" isn't mistaken for a city). Sources, in order: your
// Knowledge Atlas, X-Ray, and the AI book analysis (names only — the AI never
// supplies coordinates or dates).
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useBookGraph } from '../components/bookworld';
import { db } from '../db/db';
import { atOrBefore } from '../lib/book/resolve';
import { useLibrary } from '../state/library';
import type { Detection } from './resolve';

export interface BookNames { known: { name: string; detection: Detection }[]; people: string[] }

export function useBookPlaceNames(itemId: string, spine?: number, para?: number): BookNames {
  const idx = useLibrary();
  const graph = useBookGraph(itemId);
  const rows = useLiveQuery(() => db.entityCache.where('itemId').equals(itemId).toArray(), [itemId]);
  return useMemo(() => {
    // Only what the reader has reached, so nothing ahead is given away.
    const seen = (graph?.entities ?? []).filter((e) => spine === undefined || (e.mentions[0] && atOrBefore(e.mentions[0], spine, para)));
    const known: BookNames['known'] = [
      ...idx.snap.concepts.filter((c) => c.kind === 'place' || c.kind === 'polity').flatMap((c) => [c.name, ...(c.aliases ?? [])]).map((name) => ({ name, detection: 'known' as const })),
      ...(rows ?? []).flatMap((r) => r.names).filter((n) => n.kind === 'place' || n.kind === 'polity').map((n) => ({ name: n.name, detection: 'known' as const })),
      ...seen.filter((e) => e.type === 'place' || e.type === 'region' || e.type === 'polity').flatMap((e) => [e.name, ...e.aliases]).map((name) => ({ name, detection: 'ai' as const })),
    ].filter((n) => n.name.length >= 3);
    const people = [
      ...idx.snap.concepts.filter((c) => c.kind === 'person').map((c) => c.name),
      ...(rows ?? []).flatMap((r) => r.names).filter((n) => n.kind === 'person').map((n) => n.name),
      ...seen.filter((e) => e.type === 'character').flatMap((e) => [e.name, ...e.aliases]),
    ];
    return { known, people };
  }, [idx.snap.concepts, graph, rows, spine, para]);
}
