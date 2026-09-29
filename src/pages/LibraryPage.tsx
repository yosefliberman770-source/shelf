import { useMemo, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { folderDigest, libraryDigest } from '../ai/context';
import { useConcierge } from '../ai/ui';
import { Empty, FolderPicker, Modal, Segmented, TagInput } from '../components/common';
import { Icon } from '../components/icons';
import { activeFilterCount, FilterPanel, FolderTree, ForecastSummary, ItemViews, LibraryMap, type ViewMode } from '../components/library';
import { addItemsToFolder, createFolder, createShelf, deleteCollection, deleteFolder, deleteShelf, renameShelf, saveCollection, saveProject, setStatus, updateFolder, updateItem } from '../db/actions';
import { commitImport, type ImportRow, previewGoodreads } from '../db/portability';
import type { Folder, Rule, RuleField, RuleOp, SmartCollection, Status } from '../db/types';
import { folderForecast } from '../engine/forecast';
import type { LibraryIndex } from '../engine/model';
import { evalCollection, type LibraryQuery, PRESET_COLLECTIONS, runQuery, type SortKey, sortItems } from '../engine/query';
import { useEbookIds, useLibrary } from '../state/library';
import { useUI } from '../state/ui';
import { STATUS_LABEL } from '../components/common';

export default function LibraryPage() {
  const idx = useLibrary();
  useConcierge('Library', ['Find gaps in my library.', 'What subjects am I most interested in?', 'Which unread books should I prioritise?'], () => `${folderDigest(idx)}\n\n${libraryDigest(idx, idx.settings.ai.share)}`, [idx]);
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 250px) minmax(0, 1fr)', gap: 24 }} className="lib-layout">
        <style>{`@media (max-width: 860px) { .lib-layout { grid-template-columns: 1fr !important; } .lib-side { display: none; } } @media (min-width: 861px) { .lib-browse { display: none !important; } }`}</style>
        <LibrarySidebar idx={idx} />
        <div style={{ minWidth: 0 }}>
          <Routes>
            <Route index element={<ItemsView title="Library" />} />
            <Route path="ebooks" element={<EbookItemsView />} />
            <Route path="status/:status" element={<StatusView />} />
            <Route path="shelf/:id" element={<ShelfView />} />
            <Route path="folder/:id" element={<FolderView />} />
            <Route path="collection/:id" element={<CollectionView />} />
            <Route path="map" element={<MapView />} />
            <Route path="import" element={<ImportView />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function LibrarySidebar({ idx }: { idx: LibraryIndex }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { toast } = useUI();
  const [newFolder, setNewFolder] = useState(false);
  const [filter, setFilter] = useState('');
  const [editCollection, setEditCollection] = useState<Partial<SmartCollection> | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of idx.itemList()) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [idx]);
  const selFolder = loc.pathname.match(/folder\/([^/]+)/)?.[1];
  const is = (p: string) => (loc.pathname === p ? 'on' : '');
  return (
    <aside className="lib-side col" style={{ gap: 2, position: 'sticky', top: 70, alignSelf: 'start', maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' }}>
      <Link to="/library" className={`tree-row ${is('/library')}`}><span>📚</span>All items<span className="count">{idx.itemList().length}</span></Link>
      <Link to="/library/map" className={`tree-row ${is('/library/map')}`}><span>🗺</span>Library map</Link>
      <Link to="/library/import" className={`tree-row ${is('/library/import')}`}><span>⤓</span>Import</Link>
      <div className="section-title" style={{ margin: '16px 8px 4px' }}>Shelves</div>
      {(['want', 'reading', 'read', 'paused', 'dnf'] as Status[]).map((s) => (
        <Link key={s} to={`/library/status/${s}`} className={`tree-row ${is(`/library/status/${s}`)}`}>{STATUS_LABEL[s]}<span className="count">{counts[s] ?? 0}</span></Link>
      ))}
      {idx.snap.shelves.map((s) => (
        <Link key={s.id} to={`/library/shelf/${s.id}`} className={`tree-row ${is(`/library/shelf/${s.id}`)}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            const raw = e.dataTransfer.getData('application/x-items');
            if (!raw) return;
            for (const id of JSON.parse(raw) as string[]) { const it = idx.items.get(id); if (it && !it.shelfIds.includes(s.id)) await updateItem(id, { shelfIds: [...it.shelfIds, s.id] }); }
            toast(`Added to ${s.name}`);
          }}>
          <span>{s.icon ?? '🏷'}</span><span className="ellipsis">{s.name}</span><span className="count">{idx.itemList().filter((i) => i.shelfIds.includes(s.id)).length}</span>
        </Link>
      ))}
      <button className="btn xs ghost" style={{ justifyContent: 'flex-start' }} onClick={async () => { const n = prompt('New shelf name'); if (n?.trim()) { const id = await createShelf(n.trim()); nav(`/library/shelf/${id}`); } }}>＋ New shelf</button>
      <div className="row between" style={{ margin: '16px 8px 4px' }}><span className="section-title" style={{ margin: 0 }}>Folders</span><button className="btn xs ghost" onClick={() => setNewFolder(true)}>＋</button></div>
      {idx.snap.folders.length > 8 && <input className="input sm" placeholder="Filter folders" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => { const f = e.dataTransfer.getData('application/x-folder'); if (f && e.target === e.currentTarget) { await updateFolder(f, { parentId: undefined }); toast('Moved to top level'); } }}
        style={{ paddingBottom: 8 }}
      >
        {idx.snap.folders.length === 0 ? <div className="small faint" style={{ padding: '4px 8px' }}>Create folders for any subject hierarchy you like.</div> : <FolderTree idx={idx} selected={selFolder} onSelect={(f) => nav(`/library/folder/${f.id}`)} filter={filter} />}
      </div>
      <div className="row between" style={{ margin: '16px 8px 4px' }}><span className="section-title" style={{ margin: 0 }}>Smart collections</span><button className="btn xs ghost" onClick={() => setEditCollection({ name: '', rules: [], match: 'all' })}>＋</button></div>
      {idx.snap.collections.map((c) => (
        <Link key={c.id} to={`/library/collection/${c.id}`} className={`tree-row ${is(`/library/collection/${c.id}`)}`}><span>{c.icon ?? '✦'}</span><span className="ellipsis">{c.name}</span><span className="count">{evalCollection(idx, c).length}</span></Link>
      ))}
      {idx.snap.collections.length === 0 && <div className="small faint" style={{ padding: '4px 8px' }}>Rule-based lists that update themselves.</div>}
      {newFolder && <FolderEditor idx={idx} onClose={() => setNewFolder(false)} parentId={selFolder} />}
      {editCollection && <CollectionEditor idx={idx} initial={editCollection} onClose={() => setEditCollection(null)} />}
    </aside>
  );
}

// ── Items view with search, filter, sort, view modes, bulk actions ─────

function ItemsView({ title, base, header, emptyText }: { title: string; base?: ReturnType<LibraryIndex['itemList']>; header?: React.ReactNode; emptyText?: string }) {
  const idx = useLibrary();
  const { open } = useUI();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<ViewMode>(() => (localStorageGet('shelf.view') as ViewMode) ?? 'grid');
  const [text, setText] = useState('');
  const [q, setQ] = useState<LibraryQuery>(() => (params.get('tag') ? { tagIds: [params.get('tag')!] } : {}));
  const [showFilters, setShowFilters] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [sort, setSort] = useState<SortKey>('added');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const items = useMemo(() => sortItems(idx, runQuery(idx, { ...q, text: text || undefined }, base ?? idx.itemList()), sort, dir), [idx, q, text, base, sort, dir]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setView = (m: ViewMode) => { setMode(m); localStorageSet('shelf.view', m); };
  const fc = activeFilterCount(q);
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };
  return (
    <>
      <div className="page-head">
        <div><h1>{title}</h1><div className="sub">{items.length} book{items.length === 1 ? '' : 's'}{fc ? ` · ${fc} filter${fc === 1 ? '' : 's'} on` : ''}</div></div>
        <div className="row wrap">
          <button className="btn lib-browse" onClick={() => setBrowse(true)}><Icon name="folder" />Folders & shelves</button>
          <button className="btn primary" onClick={() => open({ kind: 'add' })}><Icon name="plus" />Add</button>
        </div>
      </div>
      <LibraryChips />
      {header}
      <div className="row wrap mb-16 mt-16">
        <div className="row" style={{ flex: '1 1 260px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, color: 'var(--text-3)', display: 'grid' }}><Icon name="search" /></span>
          <input className="input" style={{ paddingLeft: 42 }} placeholder="Search title, author, notes, tags…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search this list" />
        </div>
        <button className={`btn ${fc ? 'accent' : ''}`} onClick={() => setShowFilters(true)}><Icon name="filter" />Filter{fc ? ` · ${fc}` : ''}</button>
        <select className="select" style={{ width: 'auto', minWidth: 150 }} value={`${sort}:${dir}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSort(k as SortKey); setDir(d as 'asc' | 'desc'); }} aria-label="Sort by">
          {([['added:desc', 'Newest first'], ['recent:desc', 'Recently read'], ['title:asc', 'Title A–Z'], ['author:asc', 'Author A–Z'], ['progress:desc', 'Most progress'], ['rating:desc', 'Highest rated'], ['pages:asc', 'Shortest'], ['pages:desc', 'Longest'], ['finished:desc', 'Recently finished'], ['deadline:asc', 'Deadline soonest'], ['estimate:asc', 'Finishing soonest']] as [string, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Segmented value={mode} onChange={setView} options={[{ value: 'grid', label: <Icon name="grid" title="Covers" /> }, { value: 'compact', label: <Icon name="library" title="Compact" /> }, { value: 'list', label: <Icon name="list" title="List" /> }]} />
        <button className={`btn ${selecting ? 'primary' : 'ghost'}`} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Done' : 'Select'}</button>
      </div>
      {fc > 0 && <div className="row wrap mb-16"><span className="small muted">Filtered</span><button className="chip" onClick={() => setQ({})}>Clear filters ✕</button></div>}
      {selecting && <BulkBar idx={idx} ids={[...selected]} onDone={stopSelecting} onAll={() => setSelected(new Set(items.map((i) => i.id)))} />}
      {items.length === 0 ? (
        <div className="card"><Empty illustration={idx.itemList().length ? 'search' : 'shelf'} title={idx.itemList().length ? 'Nothing matches' : 'Your shelves are empty'} action={idx.itemList().length ? (fc || text ? <button className="btn" onClick={() => { setQ({}); setText(''); }}>Clear search & filters</button> : undefined) : <button className="btn primary" onClick={() => open({ kind: 'add' })}>Add your first book</button>}>{emptyText ?? (idx.itemList().length ? 'Try a different search or remove a filter.' : 'Add books, ebooks, audiobooks, courses, articles — anything you read.')}</Empty></div>
      ) : (
        <ItemViews idx={idx} items={items} mode={mode} selected={selected} onToggle={selecting ? toggle : undefined} />
      )}
      {items.length > 0 && !selecting && <div className="small faint mt-24">A book can be in many folders and shelves at once — it’s always the same book. Open a book and tap <b>Organize</b>.</div>}
      {showFilters && (
        <Modal title="Filter your library" size="wide" onClose={() => setShowFilters(false)} footer={<><button className="btn ghost" onClick={() => setQ({})}>Clear all</button><span className="grow" /><button className="btn primary" onClick={() => setShowFilters(false)}>Show {items.length} book{items.length === 1 ? '' : 's'}</button></>}>
          <FilterPanel idx={idx} q={q} onChange={setQ} />
        </Modal>
      )}
      {browse && <BrowseSheet idx={idx} onClose={() => setBrowse(false)} />}
    </>
  );
}

/** Quick shelves as chips — the fastest way around the library on a phone. */
function LibraryChips() {
  const idx = useLibrary();
  const loc = useLocation();
  const ebookIds = useEbookIds();
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of idx.itemList()) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [idx]);
  const chips: { to: string; label: string; n?: number }[] = [
    { to: '/library', label: 'All', n: idx.itemList().length },
    { to: '/library/status/reading', label: 'Reading', n: counts.reading },
    { to: '/library/status/want', label: 'Want to read', n: counts.want },
    { to: '/library/status/read', label: 'Read', n: counts.read },
    ...(ebookIds.size ? [{ to: '/library/ebooks', label: 'Ebooks', n: ebookIds.size }] : []),
    ...(counts.paused ? [{ to: '/library/status/paused', label: 'Set aside', n: counts.paused }] : []),
    ...(counts.dnf ? [{ to: '/library/status/dnf', label: 'Didn’t finish', n: counts.dnf }] : []),
  ];
  return (
    <div className="chips-scroll" role="navigation" aria-label="Shelves">
      {chips.map((c) => <Link key={c.to} to={c.to} className={`chip ${loc.pathname === c.to ? 'on' : ''}`} style={{ minHeight: 36, padding: '0 14px' }}>{c.label}{c.n !== undefined ? <span style={{ opacity: 0.7 }}>{c.n}</span> : null}</Link>)}
    </div>
  );
}

function EbookItemsView() {
  const idx = useLibrary();
  const ids = useEbookIds();
  const base = useMemo(() => idx.itemList().filter((i) => ids.has(i.id)), [idx, ids]);
  return <ItemsView title="Ebooks" base={base} emptyText="Open an ePub file or pick a free classic and it will appear here." />;
}

/** Folders, shelves and smart collections — the sidebar, as a sheet on phones. */
function BrowseSheet({ idx, onClose }: { idx: LibraryIndex; onClose: () => void }) {
  const nav = useNavigate();
  const go = (to: string) => { onClose(); nav(to); };
  const [newFolder, setNewFolder] = useState(false);
  return (
    <Modal title="Folders & shelves" onClose={onClose}>
      <div className="col gap-16">
        <div>
          <div className="row between mb-8"><div className="eyebrow">Folders · by subject</div><button className="btn xs" onClick={() => setNewFolder(true)}>＋ New</button></div>
          {idx.snap.folders.length === 0 ? <div className="small muted">Folders group books by subject, like History → Rome. A book can be in many.</div> : <FolderTree idx={idx} onSelect={(f) => go(`/library/folder/${f.id}`)} />}
        </div>
        <div>
          <div className="eyebrow mb-8">Your shelves</div>
          {idx.snap.shelves.length === 0 ? <div className="small muted">Shelves are your own lists, like “Favorites”. Create one from a book’s Organize button.</div> : idx.snap.shelves.map((sh) => (
            <button key={sh.id} className="tree-row" style={{ width: '100%', border: 0, background: 'transparent' }} onClick={() => go(`/library/shelf/${sh.id}`)}><span>{sh.icon ?? '🏷'}</span><span className="ellipsis">{sh.name}</span><span className="count">{idx.itemList().filter((i) => i.shelfIds.includes(sh.id)).length}</span></button>
          ))}
        </div>
        <div>
          <div className="eyebrow mb-8">Smart collections · fill themselves</div>
          {idx.snap.collections.length === 0 ? <div className="small muted">Lists that update automatically from rules, like “unread books under 300 pages”. Create them on a computer or tablet from the library sidebar.</div> : idx.snap.collections.map((c) => (
            <button key={c.id} className="tree-row" style={{ width: '100%', border: 0, background: 'transparent' }} onClick={() => go(`/library/collection/${c.id}`)}><span>{c.icon ?? '✦'}</span><span className="ellipsis">{c.name}</span><span className="count">{evalCollection(idx, c).length}</span></button>
          ))}
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => go('/library/map')}><Icon name="map" />Library map</button>
          <button className="btn" onClick={() => go('/library/import')}><Icon name="download" />Import</button>
        </div>
      </div>
      {newFolder && <FolderEditor idx={idx} onClose={() => { setNewFolder(false); onClose(); }} />}
    </Modal>
  );
}

function localStorageGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

function BulkBar({ idx, ids, onDone, onAll }: { idx: LibraryIndex; ids: string[]; onDone: () => void; onAll: () => void }) {
  const { toast } = useUI();
  const [folderPick, setFolderPick] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  return (
    <div className="notice row wrap mb-16" style={{ position: 'sticky', top: 70, zIndex: 5, boxShadow: 'var(--shadow)' }}>
      <b>{ids.length ? `${ids.length} selected` : 'Tap books to select them'}</b>
      <button className="btn xs ghost" onClick={onAll}>Select all</button>
      <select className="select sm" style={{ width: 160 }} value="" onChange={async (e) => { const s = e.target.value as Status; if (!s) return; for (const id of ids) await setStatus(id, s); toast(`Moved to ${STATUS_LABEL[s]}`); onDone(); }}>
        <option value="">Set status…</option>{(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <button className="btn sm" onClick={() => setFolderPick(true)}>Add to folder…</button>
      <select className="select sm" style={{ width: 160 }} value="" onChange={async (e) => { const sid = e.target.value; if (!sid) return; for (const id of ids) { const it = idx.items.get(id); if (it && !it.shelfIds.includes(sid)) await updateItem(id, { shelfIds: [...it.shelfIds, sid] }); } toast('Added to shelf'); onDone(); }}>
        <option value="">Add to shelf…</option>{idx.snap.shelves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className="select sm" style={{ width: 170 }} value="" onChange={async (e) => { const pid = e.target.value; if (!pid) return; const p = idx.projects.get(pid); if (pid === 'new') { const n = prompt('Project name'); if (!n) return; await saveProject({ name: n, itemIds: ids }); } else if (p) await saveProject({ ...p, itemIds: [...new Set([...p.itemIds, ...ids])] }); toast('Added to project'); onDone(); }}>
        <option value="">Add to project…</option><option value="new">＋ New project</option>{idx.snap.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button className="btn sm" onClick={async () => { for (const id of ids) await updateItem(id, { favorite: true }); toast('Marked as favorites'); onDone(); }}>♥ Favorite</button>
      <span className="grow" />
      <button className="btn sm ghost" onClick={onDone}>Cancel</button>
      {folderPick && (
        <Modal title="Add to folders" onClose={() => setFolderPick(false)} footer={<button className="btn primary" onClick={async () => { for (const f of folders) await addItemsToFolder(ids, f); toast('Added to folders'); setFolderPick(false); onDone(); }}>Add</button>}>
          <FolderPicker idx={idx} value={folders} onChange={setFolders} />
        </Modal>
      )}
    </div>
  );
}

function StatusView() {
  const idx = useLibrary();
  const { status } = useParams();
  const base = useMemo(() => idx.itemList().filter((i) => i.status === status), [idx, status]);
  return <ItemsView key={status} title={STATUS_LABEL[status as Status] ?? 'Shelf'} base={base} />;
}

function ShelfView() {
  const idx = useLibrary();
  const { id } = useParams();
  const nav = useNavigate();
  const shelf = idx.shelves.get(id!);
  const base = useMemo(() => idx.itemList().filter((i) => i.shelfIds.includes(id!)), [idx, id]);
  if (!shelf) return <Empty title="Shelf not found" />;
  return (
    <ItemsView key={id} title={`${shelf.icon ?? '🏷'} ${shelf.name}`} base={base} emptyText="Drag books here or use “Add to shelf” after selecting them."
      header={<div className="row"><button className="btn sm" onClick={async () => { const n = prompt('Rename shelf', shelf.name); if (n?.trim()) await renameShelf(shelf.id, n.trim()); }}>Rename</button><button className="btn sm danger" onClick={async () => { if (confirm(`Delete shelf “${shelf.name}”? Books stay in your library.`)) { await deleteShelf(shelf.id); nav('/library'); } }}>Delete shelf</button></div>} />
  );
}

function CollectionView() {
  const idx = useLibrary();
  const { id } = useParams();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const c = idx.snap.collections.find((x) => x.id === id);
  const base = useMemo(() => (c ? evalCollection(idx, c) : []), [idx, c]);
  if (!c) return <Empty title="Collection not found" />;
  return (
    <>
      <ItemsView key={id} title={`${c.icon ?? '✦'} ${c.name}`} base={base} emptyText="No items match these rules right now. The collection updates automatically."
        header={<div className="row wrap">
          <span className="small muted">Match {c.match === 'all' ? 'all' : 'any'}: {c.rules.map(ruleText).join(c.match === 'all' ? ' + ' : ' or ')}</span>
          <button className="btn sm" onClick={() => setEdit(true)}>Edit rules</button>
          <button className="btn sm danger" onClick={async () => { if (confirm('Delete this collection?')) { await deleteCollection(c.id); nav('/library'); } }}>Delete</button>
        </div>} />
      {edit && <CollectionEditor idx={idx} initial={c} onClose={() => setEdit(false)} />}
    </>
  );
}

function FolderView() {
  const idx = useLibrary();
  const { id } = useParams();
  const nav = useNavigate();
  const { open, toast } = useUI();
  const [edit, setEdit] = useState<'edit' | 'sub' | null>(null);
  const [recursive, setRecursive] = useState(true);
  const folder = idx.folders.get(id!);
  const base = useMemo(() => (folder ? idx.itemsInFolder(folder.id, recursive) : []), [idx, folder, recursive]);
  const f = useMemo(() => (folder ? folderForecast(idx, folder.id) : null), [idx, folder]);
  useConcierge(`Folder: ${folder?.name}`, ['What should I read next in this folder?', `Help me finish this folder in 90 days.`, 'What gaps are there in this subject?'], () => (folder ? `FOLDER "${idx.folderPath(folder.id).map((x) => x.name).join(' / ')}"\n${f ? `Forecast: ${Math.round(f.remaining)} pages remaining, pace ${f.pace?.toFixed(1) ?? 'n/a'}/day, est. finish ${f.estimatedFinish ?? 'n/a'}, deadline ${folder.deadline ?? 'none'}` : ''}\n\n${libraryDigest(idx, idx.settings.ai.share, base)}` : ''), [idx, folder?.id]);
  if (!folder || !f) return <Empty title="Folder not found" />;
  const path = idx.folderPath(folder.id);
  const children = idx.childFolders.get(folder.id) ?? [];
  return (
    <>
      <div className="small muted mb-8">{path.map((p, i) => <span key={p.id}>{i > 0 && ' / '}<Link to={`/library/folder/${p.id}`}>{p.name}</Link></span>)}</div>
      <ItemsView
        key={id}
        title={`${folder.icon ?? '📁'} ${folder.name}`}
        base={base}
        emptyText="Drag books onto this folder in the sidebar, or add a new one here."
        header={
          <div className="col gap-12">
            {folder.description && <p className="muted">{folder.description}</p>}
            <div className="row wrap">
              <button className="btn sm" onClick={() => open({ kind: 'add', preset: { folderId: folder.id } })}>＋ Add item here</button>
              <button className="btn sm" onClick={() => setEdit('sub')}>＋ Subfolder</button>
              <button className="btn sm" onClick={() => setEdit('edit')}>Edit folder</button>
              <button className="btn sm" onClick={async () => { const pid = await saveProject({ name: `${folder.name} project`, itemIds: base.filter((i) => i.status !== 'read').map((i) => i.id), deadline: folder.deadline, pace: folder.goalPace }); nav(`/plan/project/${pid}`); }}>Make a project</button>
              <Link className="btn sm" to={`/plan/whatif?folder=${folder.id}`}>What-if…</Link>
              <label className="check small"><input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} /> Include subfolders</label>
              <span className="grow" />
              <button className="btn sm danger" onClick={async () => { if (confirm(`Delete folder “${folder.name}”? Subfolders move up one level; books are not deleted.`)) { await deleteFolder(folder.id); toast('Folder deleted'); nav('/library'); } }}>Delete</button>
            </div>
            {children.length > 0 && (
              <div className="row wrap gap-4">{children.map((c) => <Link key={c.id} to={`/library/folder/${c.id}`} className="chip">{c.icon ?? '📁'} {c.name} · {idx.itemsInFolder(c.id).length}</Link>)}</div>
            )}
            <ForecastSummary f={f} onSetDeadline={() => setEdit('edit')} />
            {(folder.tags.length > 0 || folder.notes) && (
              <div className="small muted">{folder.tags.map((t) => <span key={t} className="chip" style={{ marginRight: 4 }}>{t}</span>)} {folder.notes}</div>
            )}
          </div>
        }
      />
      {edit === 'edit' && <FolderEditor idx={idx} folder={folder} onClose={() => setEdit(null)} />}
      {edit === 'sub' && <FolderEditor idx={idx} parentId={folder.id} onClose={() => setEdit(null)} />}
    </>
  );
}

const ICONS = ['📁', '🏛️', '⚔️', '👑', '🌍', '🐉', '🚀', '🔭', '🧬', '⚛️', '🧠', '📜', '✝️', '☸️', '🎨', '🎵', '💼', '💻', '📐', '🌿', '🍳', '❤️'];

function FolderEditor({ idx, folder, parentId, onClose }: { idx: LibraryIndex; folder?: Folder; parentId?: string; onClose: () => void }) {
  const nav = useNavigate();
  const { toast } = useUI();
  const [f, setF] = useState({
    name: folder?.name ?? '', parentId: folder?.parentId ?? parentId ?? '', icon: folder?.icon ?? '', color: folder?.color ?? '', description: folder?.description ?? '',
    tags: folder?.tags ?? [], notes: folder?.notes ?? '', goalPace: folder?.goalPace ? String(folder.goalPace) : '', deadline: folder?.deadline ?? '',
  });
  const save = async () => {
    if (!f.name.trim()) return toast('Give the folder a name.', { error: true });
    const data = { name: f.name.trim(), parentId: f.parentId || undefined, icon: f.icon || undefined, color: f.color || undefined, description: f.description || undefined, tags: f.tags, notes: f.notes || undefined, goalPace: f.goalPace ? Number(f.goalPace) : undefined, deadline: f.deadline || undefined };
    try {
      if (folder) await updateFolder(folder.id, data);
      else { const id = await createFolder(data); nav(`/library/folder/${id}`); }
      onClose();
    } catch (e) { toast((e as Error).message, { error: true }); }
  };
  const options = idx.snap.folders.filter((x) => !folder || !idx.folderTree(folder.id).includes(x.id));
  return (
    <Modal title={folder ? 'Edit folder' : 'New folder'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="col gap-12">
        <label className="field">Name<input autoFocus className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
        <label className="field">Inside
          <select className="select" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
            <option value="">— Top level —</option>
            {options.map((o) => <option key={o.id} value={o.id}>{idx.folderPath(o.id).map((p) => p.name).join(' / ')}</option>)}
          </select>
        </label>
        <div className="field">Icon<div className="row wrap gap-4">{ICONS.map((i) => <button key={i} className={`chip ${f.icon === i ? 'on' : ''}`} onClick={() => setF({ ...f, icon: i })}>{i}</button>)}</div></div>
        <div className="fields">
          <label className="field">Color<input className="input" type="color" value={f.color || '#2a78d6'} onChange={(e) => setF({ ...f, color: e.target.value })} /></label>
          <label className="field">Daily goal (pages)<input className="input" type="number" min={0} value={f.goalPace} onChange={(e) => setF({ ...f, goalPace: e.target.value })} placeholder="Optional" /></label>
          <label className="field">Deadline<input className="input" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /><span className="tiny faint">{f.deadline ? '' : 'No deadline yet — you can add one any time.'}</span></label>
        </div>
        <label className="field">Description<input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field">Tags<TagInput value={f.tags} onChange={(v) => setF({ ...f, tags: v })} /></label>
        <label className="field">Notes<textarea className="textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
    </Modal>
  );
}

// ── Smart collections ──────────────────────────────────────────────────

const FIELDS: { field: RuleField; label: string; ops: RuleOp[]; kind: 'number' | 'text' | 'bool' | 'status' | 'type' | 'folder' }[] = [
  { field: 'pages', label: 'Page count', ops: ['gte', 'lte'], kind: 'number' },
  { field: 'rating', label: 'Rating', ops: ['gte', 'lte', 'eq'], kind: 'number' },
  { field: 'status', label: 'Status', ops: ['is', 'neq'], kind: 'status' },
  { field: 'contentType', label: 'Content type', ops: ['is', 'neq'], kind: 'type' },
  { field: 'genre', label: 'Genre contains', ops: ['contains'], kind: 'text' },
  { field: 'tag', label: 'Tag is', ops: ['is'], kind: 'text' },
  { field: 'folder', label: 'In folder', ops: ['is'], kind: 'folder' },
  { field: 'author', label: 'Author contains', ops: ['contains'], kind: 'text' },
  { field: 'text', label: 'About (subject text)', ops: ['contains'], kind: 'text' },
  { field: 'publishedYear', label: 'Published year', ops: ['lt', 'gt'], kind: 'number' },
  { field: 'progress', label: 'Progress %', ops: ['gte', 'lte'], kind: 'number' },
  { field: 'untouchedDays', label: 'Untouched for days', ops: ['gte'], kind: 'number' },
  { field: 'behindSchedule', label: 'Behind schedule', ops: ['is'], kind: 'bool' },
  { field: 'durationHours', label: 'Audio length ≤ hours', ops: ['lte'], kind: 'number' },
  { field: 'favorite', label: 'Favorite', ops: ['is'], kind: 'bool' },
];
const OP_LABEL: Record<RuleOp, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: 'is not', contains: 'contains', is: 'is' };

function ruleText(r: Rule) {
  return `${FIELDS.find((f) => f.field === r.field)?.label ?? r.field} ${OP_LABEL[r.op]} ${r.value}`;
}

function CollectionEditor({ idx, initial, onClose }: { idx: LibraryIndex; initial: Partial<SmartCollection>; onClose: () => void }) {
  const nav = useNavigate();
  const [c, setC] = useState<Partial<SmartCollection>>({ match: 'all', rules: [], ...initial });
  const preview = c.rules?.length ? evalCollection(idx, { id: 'x', name: '', createdAt: 0, match: c.match ?? 'all', rules: c.rules }) : [];
  const setRule = (i: number, p: Partial<Rule>) => setC({ ...c, rules: c.rules!.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const save = async () => {
    if (!c.name?.trim() || !c.rules?.length) return;
    const id = await saveCollection({ ...c, name: c.name.trim(), rules: c.rules });
    onClose();
    nav(`/library/collection/${id}`);
  };
  return (
    <Modal title={initial.id ? 'Edit smart collection' : 'New smart collection'} onClose={onClose} size="wide" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!c.name?.trim() || !c.rules?.length} onClick={save}>Save</button></>}>
      {!initial.id && (
        <>
          <div className="small muted mb-8">Start from a preset</div>
          <div className="row wrap gap-4 mb-16">
            {PRESET_COLLECTIONS.map((p) => <button key={p.name} className="chip" onClick={() => setC({ ...c, name: p.name, icon: p.icon, rules: p.rules })}>{p.icon} {p.name}</button>)}
          </div>
        </>
      )}
      <div className="fields">
        <label className="field">Name<input className="input" value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
        <label className="field">Match<select className="select" value={c.match} onChange={(e) => setC({ ...c, match: e.target.value as 'all' | 'any' })}><option value="all">All rules</option><option value="any">Any rule</option></select></label>
      </div>
      <div className="col mt-16">
        {c.rules!.map((r, i) => {
          const def = FIELDS.find((f) => f.field === r.field)!;
          return (
            <div key={i} className="row wrap">
              <select className="select sm" style={{ width: 190 }} value={r.field} onChange={(e) => { const d = FIELDS.find((f) => f.field === e.target.value)!; setRule(i, { field: d.field, op: d.ops[0], value: d.kind === 'bool' ? true : d.kind === 'number' ? 0 : '' }); }}>
                {FIELDS.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
              </select>
              <select className="select sm" style={{ width: 90 }} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as RuleOp })}>{def.ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select>
              {def.kind === 'number' && <input className="input sm" style={{ width: 110 }} type="number" value={String(r.value)} onChange={(e) => setRule(i, { value: Number(e.target.value) })} />}
              {def.kind === 'text' && <input className="input sm" style={{ width: 180 }} value={String(r.value)} onChange={(e) => setRule(i, { value: e.target.value })} />}
              {def.kind === 'bool' && <select className="select sm" style={{ width: 90 }} value={String(r.value)} onChange={(e) => setRule(i, { value: e.target.value === 'true' })}><option value="true">yes</option><option value="false">no</option></select>}
              {def.kind === 'status' && <select className="select sm" style={{ width: 150 }} value={String(r.value)} onChange={(e) => setRule(i, { value: e.target.value })}>{(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>}
              {def.kind === 'type' && <select className="select sm" style={{ width: 150 }} value={String(r.value)} onChange={(e) => setRule(i, { value: e.target.value })}>{['book', 'ebook', 'audiobook', 'textbook', 'academic', 'comic', 'article', 'podcast', 'course', 'research', 'other', 'custom'].map((t) => <option key={t}>{t}</option>)}</select>}
              {def.kind === 'folder' && <select className="select sm" style={{ width: 200 }} value={String(r.value)} onChange={(e) => setRule(i, { value: e.target.value })}><option value="">Choose…</option>{idx.snap.folders.map((f) => <option key={f.id} value={f.id}>{idx.folderPath(f.id).map((p) => p.name).join(' / ')}</option>)}</select>}
              <button className="btn sm ghost icon" onClick={() => setC({ ...c, rules: c.rules!.filter((_, j) => j !== i) })}>✕</button>
            </div>
          );
        })}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setC({ ...c, rules: [...c.rules!, { field: 'pages', op: 'gte', value: 300 }] })}>＋ Add rule</button>
      </div>
      <div className="small muted mt-16">{preview.length} item{preview.length === 1 ? '' : 's'} match right now{preview.length ? `: ${preview.slice(0, 6).map((i) => i.title).join(', ')}${preview.length > 6 ? '…' : ''}` : ''}</div>
    </Modal>
  );
}

// ── Map & import ───────────────────────────────────────────────────────

function MapView() {
  const idx = useLibrary();
  const nav = useNavigate();
  return (
    <>
      <div className="page-head"><div><h1>Library map</h1><div className="sub">Your whole folder hierarchy. Scroll to zoom, drag to pan, click a folder to open it.</div></div></div>
      <LibraryMap idx={idx} onOpen={(id) => nav(`/library/folder/${id}`)} />
    </>
  );
}

function ImportView() {
  const { toast } = useUI();
  const nav = useNavigate();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = async (file?: File) => {
    if (!file) return;
    try {
      setRows(await previewGoodreads(await file.text()));
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };
  const counts = rows ? { add: rows.filter((r) => r.action === 'add').length, merge: rows.filter((r) => r.action === 'merge').length, skip: rows.filter((r) => r.action === 'skip').length } : null;
  return (
    <>
      <div className="page-head"><div><h1>Import</h1><div className="sub">Bring your reading history from Goodreads. Nothing is saved until you confirm the preview.</div></div></div>
      {!rows ? (
        <div className="card">
          <ol className="small muted" style={{ marginTop: 0 }}>
            <li>On Goodreads, open <b>My Books → Import and export → Export Library</b>.</li>
            <li>Download the CSV file and drop it below.</li>
          </ol>
          <label className={`drop-zone ${over ? 'over' : ''}`} style={{ display: 'block', cursor: 'pointer' }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
            Drop goodreads_library_export.csv here, or click to choose a file
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => load(e.target.files?.[0])} />
          </label>
          <p className="small faint mt-16">Imported: title, authors, ISBN, cover, page count, rating, review, status, shelves and dates. Existing books are matched by ISBN or title + author and only have <i>empty</i> fields filled in — your data is never overwritten. For a full Shelf backup, use Settings → Data.</p>
        </div>
      ) : (
        <div className="card">
          <div className="row wrap between mb-16">
            <div className="row wrap"><span className="chip good">{counts!.add} new</span><span className="chip accent">{counts!.merge} merge into existing</span><span className="chip">{counts!.skip} skip</span></div>
            <div className="row"><button className="btn" onClick={() => setRows(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); const r = await commitImport(rows); toast(`Imported ${r.added} new, merged ${r.merged}, skipped ${r.skipped}`); nav('/library'); }}>{busy ? 'Importing…' : 'Import'}</button></div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 520 }}>
            <table className="table">
              <thead><tr><th>Action</th><th>Title</th><th>Author</th><th>Status</th><th className="r">Pages</th><th>Rating</th><th>Shelves</th><th>Notes</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td>
                      <select className="select sm" style={{ width: 100 }} value={r.action} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, action: e.target.value as ImportRow['action'] } : x)))}>
                        <option value="add">Add</option>{r.duplicateOf && <option value="merge">Merge</option>}<option value="skip">Skip</option>
                      </select>
                    </td>
                    <td className="ellipsis" style={{ maxWidth: 260 }}>{r.draft.title}</td>
                    <td className="small ellipsis" style={{ maxWidth: 160 }}>{r.draft.authors?.join(', ')}</td>
                    <td className="small">{STATUS_LABEL[r.draft.status!]}</td>
                    <td className="r num small">{r.draft.total ?? '—'}</td>
                    <td className="small">{r.draft.rating ? `${r.draft.rating}★` : ''}</td>
                    <td className="small ellipsis" style={{ maxWidth: 140 }}>{r.shelves.join(', ')}</td>
                    <td className="small faint">{r.duplicateOf ? `Matches “${r.duplicateOf.title}”. ` : ''}{r.warnings.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
