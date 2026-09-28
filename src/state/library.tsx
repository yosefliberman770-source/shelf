// Live snapshot of the whole database, turned into a LibraryIndex that every
// screen reads from. Any write anywhere re-renders dependent views.
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { getSettings } from '../db/actions';
import { db } from '../db/db';
import type { ActiveTimer } from '../db/types';
import { todayKey } from '../engine/dates';
import { LibraryIndex, type Snapshot } from '../engine/model';

interface LibraryState {
  idx: LibraryIndex;
  timer?: ActiveTimer;
}

const Ctx = createContext<LibraryState | null>(null);

async function loadSnapshot(): Promise<Snapshot> {
  const [items, instances, sessions, notes, folders, shelves, tags, authors, goals, projects, plans, collections, concepts, links, ai, settings] = await Promise.all([
    db.items.toArray(), db.instances.toArray(), db.sessions.toArray(), db.notes.toArray(), db.folders.toArray(), db.shelves.toArray(),
    db.tags.toArray(), db.authors.toArray(), db.goals.toArray(), db.projects.toArray(), db.plans.toArray(), db.collections.toArray(),
    db.concepts.toArray(), db.links.toArray(), db.ai.toArray(), getSettings(),
  ]);
  return { items, instances, sessions, notes, folders, shelves, tags, authors, goals, projects, plans, collections, concepts, links, ai, settings };
}

export function LibraryProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const snap = useLiveQuery(loadSnapshot, []);
  const timer = useLiveQuery(() => db.timer.get('timer'), []);
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const t = setInterval(() => setToday(todayKey()), 60_000);
    return () => clearInterval(t);
  }, []);
  const idx = useMemo(() => (snap ? new LibraryIndex(snap, today) : null), [snap, today]);
  if (!idx) return <>{fallback}</>;
  return <Ctx.Provider value={{ idx, timer }}>{children}</Ctx.Provider>;
}

export function useLibrary(): LibraryIndex {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibrary outside provider');
  return v.idx;
}

export function useTimer(): ActiveTimer | undefined {
  return useContext(Ctx)?.timer;
}
