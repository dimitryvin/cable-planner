import type { Layout } from '../model/types';

export interface History {
  past: readonly Layout[];
  present: Layout;
  future: readonly Layout[];
  /** Consecutive edits with the same key (a drag, typing in one field) collapse into one undo step. */
  lastKey?: string;
}

export type HistoryAction =
  | { type: 'apply'; fn: (l: Layout) => Layout; coalesceKey?: string }
  | { type: 'endGesture' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; layout: Layout };

export const HISTORY_LIMIT = 200;

export const initHistory = (present: Layout): History => ({ past: [], present, future: [] });

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case 'apply': {
      const next = action.fn(state.present);
      if (next === state.present) return state;
      const coalesce = action.coalesceKey !== undefined && action.coalesceKey === state.lastKey;
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: action.coalesceKey,
      };
    }
    case 'endGesture':
      return state.lastKey === undefined ? state : { ...state, lastKey: undefined };
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case 'replace':
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: action.layout, future: [] };
  }
}
