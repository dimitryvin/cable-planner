import { shortestPath } from './dijkstra';

describe('shortestPath', () => {
  it('prefers the cheaper detour', () => {
    // 0 -> 1 direct costs 10; 0 -> 2 -> 1 costs 3.
    const adj = [
      [{ to: 1, cost: 10 }, { to: 2, cost: 1 }],
      [],
      [{ to: 1, cost: 2 }],
    ];
    expect(shortestPath(adj, 0, 1)).toMatchObject({ nodes: [0, 2, 1], cost: 3 });
  });

  it('never passes through impassable nodes', () => {
    const adj = [
      [{ to: 1, cost: 1 }, { to: 2, cost: 5 }],
      [{ to: 3, cost: 1 }],
      [{ to: 3, cost: 5 }],
      [],
    ];
    expect(shortestPath(adj, 0, 3, (n) => n !== 1)?.nodes).toEqual([0, 2, 3]);
  });

  it('returns undefined when unreachable', () => {
    expect(shortestPath([[], []], 0, 1)).toBeUndefined();
  });
});
