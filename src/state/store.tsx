import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { emptyLayout } from '../model/seed';
import type { Layout } from '../model/types';
import { historyReducer, initHistory } from './history';
import {
  browserStorage,
  createLayout,
  deleteLayout,
  INDEX_KEY,
  MemoryStorage,
  openLibrarySafely,
  readIndex,
  saveLayout,
  switchLayout,
  type LayoutEntry,
  type LibraryIndex,
  type LibraryStorage,
} from './library';

export interface LayoutLibrary {
  entries: LayoutEntry[];
  currentId: string;
  /** The last save was refused by the browser (quota, private mode). */
  saveFailed: boolean;
  /** Storage refused writes at startup: everything lives in memory until the tab closes. */
  memoryOnly: boolean;
  /** Why the last layout operation was refused, if it was. */
  error?: string;
  clearError: () => void;
  open: (id: string) => void;
  /** Adds a layout as a new entry and opens it. */
  add: (layout: Layout) => void;
  duplicate: () => void;
  remove: (id: string) => void;
}

export interface LayoutStore {
  layout: Layout;
  /** Apply an immutable update. Edits sharing `coalesceKey` merge into one undo step until `endGesture`. */
  apply: (fn: (l: Layout) => Layout, coalesceKey?: string) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  replace: (layout: Layout) => void;
  canUndo: boolean;
  canRedo: boolean;
  library: LayoutLibrary;
}

const LayoutContext = createContext<LayoutStore | null>(null);

const SAVE_DEBOUNCE_MS = 300;

const shortName = (name: string) => (name.length > 40 ? `${name.slice(0, 39)}…` : name);

export function LayoutProvider({ children, initial }: { children: ReactNode; initial?: Layout }) {
  const [opened] = useState(() => {
    const r = openLibrarySafely(initial ? new MemoryStorage() : browserStorage());
    return initial ? { ...r, layout: initial } : r;
  });
  const storage: LibraryStorage = opened.storage;
  const [index, setIndex] = useState<LibraryIndex>(opened.index);
  const [saveFailed, setSaveFailed] = useState(opened.degraded);
  const [error, setError] = useState<string>();
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initHistory(opened.layout));

  // The layout object last loaded or saved; saving is skipped while nothing changed,
  // so merely opening a layout doesn't bump its "last edited" time.
  const persisted = useRef<Layout>(opened.layout);
  const indexRef = useRef(index);
  indexRef.current = index;
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(history.present);
  latest.current = history.present;

  /** Saves pending edits now. Returns false if the browser refused the save. */
  const flush = useCallback((): boolean => {
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    const layout = latest.current;
    if (layout === persisted.current) return true;
    const r = saveLayout(storage, indexRef.current, indexRef.current.currentId, layout);
    setSaveFailed(!r.ok);
    if (r.ok) {
      persisted.current = layout;
      indexRef.current = r.index;
      setIndex(r.index);
    }
    return r.ok;
  }, [storage]);

  /**
   * Runs a layout operation only after the open layout's edits are safely
   * saved, so a refused save never leads to silently discarded work.
   */
  const guarded = useCallback(
    (what: string, op: () => void, requireSaved = true) => {
      if (requireSaved && !flush()) {
        setError(`Couldn't save "${shortName(latest.current.name)}", so I didn't ${what}. Export it or free up browser storage first.`);
        return;
      }
      try {
        op();
        setError(undefined);
      } catch {
        setError(`Couldn't ${what}: the browser refused to save. Export your rooms or free up browser storage.`);
      }
    },
    [flush],
  );

  useEffect(() => {
    if (history.present === persisted.current) return;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [history.present, flush]);

  // Don't lose the last edits when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  // Another tab changed the list: refresh it (the open layout is left alone).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== INDEX_KEY) return;
      const next = readIndex(storage);
      if (next) setIndex((cur) => ({ ...next, currentId: cur.currentId }));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storage]);

  const openLayout = useCallback(
    (next: LibraryIndex, layout: Layout) => {
      persisted.current = layout;
      indexRef.current = next;
      setIndex(next);
      dispatch({ type: 'reset', layout });
    },
    [],
  );

  const library = useMemo<LayoutLibrary>(
    () => ({
      entries: index.layouts,
      currentId: index.currentId,
      // In memory-only mode saves "succeed" against the in-memory copy, so the warning must not clear.
      saveFailed: saveFailed || opened.degraded,
      memoryOnly: opened.degraded,
      error,
      clearError: () => setError(undefined),
      open: (id) => {
        if (id === indexRef.current.currentId) return;
        guarded('switch rooms', () => {
          const r = switchLayout(storage, indexRef.current, id);
          if (r) openLayout(r.index, r.layout);
        });
      },
      add: (layout) =>
        guarded('add a room', () => {
          const r = createLayout(storage, indexRef.current, layout);
          openLayout(r.index, layout);
        }),
      duplicate: () =>
        guarded('duplicate the room', () => {
          const copy = { ...latest.current, name: `${latest.current.name} copy` };
          const r = createLayout(storage, indexRef.current, copy);
          openLayout(r.index, copy);
        }),
      remove: (id) =>
        // Deleting the open room discards its edits anyway, so it needn't save first.
        guarded(
          'delete the room',
          () => {
            const r = deleteLayout(storage, indexRef.current, id, () => emptyLayout());
            if (r.layout) openLayout(r.index, r.layout);
            else {
              indexRef.current = r.index;
              setIndex(r.index);
            }
          },
          id !== indexRef.current.currentId,
        ),
    }),
    [index, saveFailed, error, storage, guarded, openLayout, opened.degraded],
  );

  const store = useMemo<LayoutStore>(
    () => ({
      layout: history.present,
      apply: (fn, coalesceKey) => dispatch({ type: 'apply', fn, coalesceKey }),
      endGesture: () => dispatch({ type: 'endGesture' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      replace: (layout) => dispatch({ type: 'replace', layout }),
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      library,
    }),
    [history, library],
  );

  return <LayoutContext.Provider value={store}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutStore {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside <LayoutProvider>');
  return ctx;
}
