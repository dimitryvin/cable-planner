import { emptyLayout } from '../model/seed';
import { historyReducer, initHistory, type HistoryAction } from './history';
import type { Layout } from '../model/types';

const rename = (name: string, coalesceKey?: string): HistoryAction => ({
  type: 'apply',
  fn: (l: Layout) => ({ ...l, name }),
  coalesceKey,
});

describe('history', () => {
  it('undoes and redoes', () => {
    let h = initHistory(emptyLayout('a'));
    h = historyReducer(h, rename('b'));
    h = historyReducer(h, rename('c'));
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.name).toBe('b');
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.name).toBe('c');
  });

  it('coalesces a gesture into one undo step', () => {
    let h = initHistory(emptyLayout('a'));
    h = historyReducer(h, rename('x1', 'drag'));
    h = historyReducer(h, rename('x2', 'drag'));
    h = historyReducer(h, { type: 'endGesture' });
    h = historyReducer(h, rename('y', 'drag'));
    expect(h.past.map((l) => l.name)).toEqual(['a', 'x2']);
  });

  it('clears redo on a new edit and ignores no-op edits', () => {
    let h = initHistory(emptyLayout('a'));
    h = historyReducer(h, rename('b'));
    h = historyReducer(h, { type: 'undo' });
    h = historyReducer(h, rename('c'));
    expect(h.future).toHaveLength(0);
    const same = historyReducer(h, { type: 'apply', fn: (l) => l });
    expect(same).toBe(h);
  });
});
