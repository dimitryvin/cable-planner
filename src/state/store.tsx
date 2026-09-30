import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { exampleLayout } from '../model/seed';
import type { Layout } from '../model/types';
import { historyReducer, initHistory } from './history';
import { loadFromStorage, saveToStorage } from './persistence';

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
}

const LayoutContext = createContext<LayoutStore | null>(null);

const SAVE_DEBOUNCE_MS = 300;

export function LayoutProvider({ children, initial }: { children: ReactNode; initial?: Layout }) {
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    initHistory(initial ?? loadFromStorage() ?? exampleLayout()),
  );

  useEffect(() => {
    const t = setTimeout(() => saveToStorage(history.present), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [history.present]);

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
    }),
    [history],
  );

  return <LayoutContext.Provider value={store}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutStore {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside <LayoutProvider>');
  return ctx;
}
