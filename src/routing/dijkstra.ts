/** Minimal binary min-heap keyed by priority. */
class MinHeap {
  private items: { id: number; pri: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(id: number, pri: number): void {
    const a = this.items;
    a.push({ id, pri });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.pri <= a[i]!.pri) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }

  pop(): { id: number; pri: number } | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.pri < a[m]!.pri) m = l;
        if (r < a.length && a[r]!.pri < a[m]!.pri) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

export interface WeightedEdge {
  to: number;
  cost: number;
}

/**
 * Shortest path from `start` to `goal` over adjacency lists; returns node ids
 * including both ends. Nodes failing `passable` can be endpoints but are never
 * passed through.
 */
export function shortestPath<E extends WeightedEdge>(
  adjacency: readonly (readonly E[])[],
  start: number,
  goal: number,
  passable: (node: number) => boolean = () => true,
): { nodes: number[]; edges: E[]; cost: number } | undefined {
  const dist = new Array<number>(adjacency.length).fill(Infinity);
  const prev = new Array<{ node: number; edge: E } | undefined>(adjacency.length);
  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(start, 0);

  while (heap.size > 0) {
    const { id, pri } = heap.pop()!;
    if (pri > dist[id]!) continue;
    if (id === goal) break;
    if (id !== start && !passable(id)) continue;
    for (const e of adjacency[id] ?? []) {
      const nd = pri + e.cost;
      if (nd < dist[e.to]!) {
        dist[e.to] = nd;
        prev[e.to] = { node: id, edge: e };
        heap.push(e.to, nd);
      }
    }
  }

  if (!Number.isFinite(dist[goal]!)) return undefined;
  const nodes = [goal];
  const edges: E[] = [];
  for (let cur = goal; cur !== start; ) {
    const p = prev[cur]!;
    nodes.push(p.node);
    edges.push(p.edge);
    cur = p.node;
  }
  return { nodes: nodes.reverse(), edges: edges.reverse(), cost: dist[goal]! };
}
