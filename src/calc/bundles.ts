import { dist3, lerp3 } from '../geometry/vec';
import { SPECS } from '../model/defaults';
import type { Cable, Id, Layout } from '../model/types';
import type { Route } from '../routing/route';
import type { Issue } from './issues';

/** Cells this size (inches) are treated as "the same place". */
export const BUNDLE_CELL = 1.5;
const SAMPLE_STEP = 1;
/** Cables must share at least this much path to count as bundled. */
export const MIN_SHARED = 6;
/** Random-lay packing efficiency used to size bundles. */
const PACKING = 0.6;

export const cableDiameter = (c: Cable): number => c.diameter ?? SPECS[c.spec].diameter;

/**
 * Estimated outer diameter of a bundle. Two cables sit side by side; beyond
 * that, total copper area divided by a packing factor.
 */
export function bundleDiameter(diameters: readonly number[]): number {
  if (diameters.length === 0) return 0;
  if (diameters.length === 1) return diameters[0]!;
  const sorted = [...diameters].sort((a, b) => b - a);
  const byArea = Math.sqrt(sorted.reduce((s, d) => s + d * d, 0) / PACKING);
  const sideBySide = sorted.length >= 2 ? sorted[0]! + sorted[1]! : sorted[0]!;
  return Math.max(sorted[0]!, sorted.length === 2 ? sideBySide : byArea);
}

export interface Bundle {
  id: string;
  cableIds: Id[];
  /** Longest stretch any member spends running alongside another member. */
  sharedLength: number;
  /** Most cables together at any point. */
  maxCount: number;
  /** Diameter where the bundle is thickest. */
  maxDiameter: number;
}

export interface PairOverlap {
  a: Id;
  b: Id;
  length: number;
}

export interface BundleReport {
  bundles: Bundle[];
  /** Cable id → bundle id. */
  bundleOf: Map<Id, string>;
  pairs: PairOverlap[];
}

const cellKey = (p: { x: number; y: number; z: number }) =>
  `${Math.floor(p.x / BUNDLE_CELL)},${Math.floor(p.y / BUNDLE_CELL)},${Math.floor(p.z / BUNDLE_CELL)}`;

/** Sample points roughly every inch along a route, each carrying the length it represents. */
function samples(route: Route): { key: string; w: number }[] {
  const out: { key: string; w: number }[] = [];
  for (const s of route.segments) {
    const len = dist3(s.a, s.b);
    const n = Math.max(1, Math.round(len / SAMPLE_STEP));
    for (let i = 0; i < n; i++) out.push({ key: cellKey(lerp3(s.a, s.b, (i + 0.5) / n)), w: len / n });
  }
  return out;
}

/**
 * Groups cables whose paths run through the same space. Uses a coarse voxel
 * grid: two cables overlap where their samples land in the same cell.
 */
export function detectBundles(layout: Layout, routes: ReadonlyMap<Id, Route>): BundleReport {
  const cells = new Map<string, Set<Id>>();
  const perCable = new Map<Id, { key: string; w: number }[]>();
  for (const [id, r] of routes) {
    if (!r.ok) continue;
    const ss = samples(r);
    perCable.set(id, ss);
    for (const s of ss) {
      const set = cells.get(s.key) ?? new Set<Id>();
      set.add(id);
      cells.set(s.key, set);
    }
  }

  // Pairwise shared length, counting each cable's own samples (min of both directions).
  const shared = new Map<string, number>();
  for (const [id, ss] of perCable) {
    const seen = new Map<Id, number>();
    for (const s of ss) {
      for (const other of cells.get(s.key) ?? []) {
        if (other !== id) seen.set(other, (seen.get(other) ?? 0) + s.w);
      }
    }
    for (const [other, len] of seen) {
      const key = id < other ? `${id}|${other}` : `${other}|${id}`;
      shared.set(key, Math.min(shared.get(key) ?? Infinity, len));
    }
  }
  const pairs: PairOverlap[] = [...shared]
    .map(([k, length]) => {
      const [a, b] = k.split('|') as [Id, Id];
      return { a, b, length };
    })
    .filter((p) => p.length >= MIN_SHARED);

  // Union-find over pairs.
  const parent = new Map<Id, Id>();
  const find = (x: Id): Id => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const { a, b } of pairs) parent.set(find(a), find(b));

  const groups = new Map<Id, Id[]>();
  for (const { a, b } of pairs) {
    for (const id of [a, b]) {
      const root = find(id);
      const g = groups.get(root) ?? [];
      if (!g.includes(id)) g.push(id);
      groups.set(root, g);
    }
  }

  const cableById = new Map(layout.cables.map((c) => [c.id, c]));
  const bundleOf = new Map<Id, string>();
  const bundles: Bundle[] = [...groups.values()].map((ids, i) => {
    const id = `B${i + 1}`;
    ids.forEach((c) => bundleOf.set(c, id));
    const members = new Set(ids);
    let sharedLength = 0;
    let maxCount = 0;
    let maxDiameter = 0;
    for (const cid of ids) {
      let mine = 0;
      for (const s of perCable.get(cid) ?? []) {
        const here = [...(cells.get(s.key) ?? [])].filter((x) => members.has(x));
        if (here.length < 2) continue;
        mine += s.w;
        if (here.length >= maxCount) {
          maxCount = here.length;
          maxDiameter = Math.max(maxDiameter, bundleDiameter(here.map((x) => cableDiameter(cableById.get(x)!))));
        }
      }
      sharedLength = Math.max(sharedLength, mine);
    }
    return { id, cableIds: ids, sharedLength, maxCount, maxDiameter };
  });

  return { bundles, bundleOf, pairs };
}

// ---------------------------------------------------------------------------
// Container fill (trays, raceways, grommets, spines, clips)
// ---------------------------------------------------------------------------

export interface ContainerFill {
  container: string;
  name: string;
  cableIds: Id[];
  bundleDiameter: number;
  /** Fraction of usable capacity used; > 1 means it won't fit. */
  ratio: number;
  capacityLabel: string;
}

/** Usable fraction of a tray/raceway cross-section before it's considered full. */
const TRAY_FILL = 0.5;
const RACEWAY_FILL = 0.4;
/** Grommet openings are partly taken by the cap/brush. */
const GROMMET_USABLE = 0.8;

export function containerFill(layout: Layout, routes: ReadonlyMap<Id, Route>): { fills: ContainerFill[]; issues: Issue[] } {
  const byContainer = new Map<string, Set<Id>>();
  for (const [id, r] of routes) {
    for (const s of r.segments) {
      if (!s.container) continue;
      const set = byContainer.get(s.container) ?? new Set<Id>();
      set.add(id);
      byContainer.set(s.container, set);
    }
  }
  const cableById = new Map(layout.cables.map((c) => [c.id, c]));
  const fills: ContainerFill[] = [];
  const issues: Issue[] = [];

  for (const [container, ids] of byContainer) {
    const diameters = [...ids].map((id) => cableDiameter(cableById.get(id)!));
    const d = bundleDiameter(diameters);
    const area = diameters.reduce((s, x) => s + (Math.PI * x * x) / 4, 0);
    const [kind, a, b] = container.split(':');
    let name = container;
    let ratio = 0;
    let capacityLabel = '';

    if (kind === 'grommet') {
      const s = layout.surfaces.find((x) => x.id === a);
      const g = s?.grommets.find((x) => x.id === b);
      if (!s || !g) continue;
      name = `${s.name} grommet`;
      ratio = d / (g.diameter * GROMMET_USABLE);
      capacityLabel = `${g.diameter}" hole`;
    } else {
      const infra = layout.infra.find((x) => x.id === a);
      if (!infra) continue;
      name = infra.name;
      if (infra.kind === 'tray') {
        ratio = area / (infra.width * infra.depth * TRAY_FILL);
        capacityLabel = `${infra.width}" × ${infra.depth}"`;
      } else if (infra.kind === 'raceway') {
        ratio = area / (infra.width * infra.depth * RACEWAY_FILL);
        capacityLabel = `${infra.width}" × ${infra.depth}"`;
      } else if (infra.kind === 'spine' || infra.kind === 'clip') {
        ratio = d / infra.capacity;
        capacityLabel = `${infra.capacity}" bundle`;
      } else {
        continue;
      }
    }

    fills.push({ container, name, cableIds: [...ids], bundleDiameter: d, ratio, capacityLabel });
    if (ratio > 1) {
      issues.push({
        severity: 'error',
        code: 'fill.over',
        message: `${name} is overfull: ${ids.size} cables (~${d.toFixed(2)}" bundle) exceed ${capacityLabel}.`,
        refs: [a ?? container, ...ids],
      });
    } else if (ratio > 0.8) {
      issues.push({
        severity: 'warn',
        code: 'fill.near',
        message: `${name} is ${Math.round(ratio * 100)}% full; little room to add cables.`,
        refs: [a ?? container, ...ids],
      });
    }
  }
  return { fills, issues };
}
