import { roomWalls, type WallGeom } from '../../geometry/room';
import { surfaceCorners } from '../../geometry/resolve';
import type { Id, Layout, Surface, Vec2 } from '../../model/types';

/** Distance (inches) within which edges pull flush against walls or other surfaces. */
export const SNAP_DISTANCE = 3;

export const snapTo = (v: number, grid: number): number => (grid > 0 ? Math.round(v / grid) * grid : v);

export function snapPoint(p: Vec2, grid: number): Vec2 {
  return { x: snapTo(p.x, grid), y: snapTo(p.y, grid) };
}

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function boxOf(points: readonly Vec2[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Best single-axis correction from candidate (edge, target) pairs within range. */
function bestShift(pairs: readonly [number, number][], range: number): number {
  let best = 0;
  let bestAbs = range;
  for (const [edge, target] of pairs) {
    const d = target - edge;
    if (Math.abs(d) < bestAbs) {
      best = d;
      bestAbs = Math.abs(d);
    }
  }
  return best;
}

/**
 * Moves a surface to `center`, snapping to the grid, then pulling its edges
 * flush with nearby walls and other surfaces' edges.
 */
export function snapSurfaceCenter(layout: Layout, surface: Surface, center: Vec2, enabled: boolean): Vec2 {
  if (!enabled) return center;
  const grid = layout.settings.gridSize;
  const gridded = snapPoint(center, grid);
  const box = boxOf(surfaceCorners({ ...surface, center: gridded }));

  const walls = roomWalls(layout.room);
  const xTargets: number[] = [];
  const yTargets: number[] = [];
  for (const w of walls) {
    if (Math.abs(w.dir.y) > 0.99) xTargets.push(w.start.x);
    if (Math.abs(w.dir.x) > 0.99) yTargets.push(w.start.y);
  }
  for (const other of layout.surfaces) {
    if (other.id === surface.id) continue;
    const b = boxOf(surfaceCorners(other));
    xTargets.push(b.minX, b.maxX);
    yTargets.push(b.minY, b.maxY);
  }
  const dx = bestShift(xTargets.flatMap((t) => [[box.minX, t], [box.maxX, t]] as [number, number][]), SNAP_DISTANCE);
  const dy = bestShift(yTargets.flatMap((t) => [[box.minY, t], [box.maxY, t]] as [number, number][]), SNAP_DISTANCE);
  return { x: gridded.x + dx, y: gridded.y + dy };
}

/** Snaps a floor item's center so its back sits against a nearby wall. */
export function snapFloorPoint(layout: Layout, p: Vec2, halfDepth: number, enabled: boolean): Vec2 {
  if (!enabled) return p;
  const g = snapPoint(p, layout.settings.gridSize);
  let out = g;
  for (const w of roomWalls(layout.room)) {
    const rel = { x: g.x - w.start.x, y: g.y - w.start.y };
    const along = rel.x * w.dir.x + rel.y * w.dir.y;
    if (along < 0 || along > w.length) continue;
    const dist = rel.x * w.inward.x + rel.y * w.inward.y;
    const target = halfDepth;
    if (Math.abs(dist - target) < SNAP_DISTANCE) {
      out = { x: out.x + w.inward.x * (target - dist), y: out.y + w.inward.y * (target - dist) };
    }
  }
  return out;
}

/** Nearest wall + offset for a pointer, with the offset snapped to the grid. */
export function snapToWall(layout: Layout, p: Vec2, enabled: boolean): { wall: WallGeom; offset: number } | undefined {
  let best: { wall: WallGeom; offset: number; d: number } | undefined;
  for (const wall of roomWalls(layout.room)) {
    const rel = { x: p.x - wall.start.x, y: p.y - wall.start.y };
    const t = Math.max(0, Math.min(wall.length, rel.x * wall.dir.x + rel.y * wall.dir.y));
    const q = { x: wall.start.x + wall.dir.x * t, y: wall.start.y + wall.dir.y * t };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.d) best = { wall, offset: t, d };
  }
  if (!best) return undefined;
  const offset = enabled ? Math.max(0, Math.min(best.wall.length, snapTo(best.offset, layout.settings.gridSize))) : best.offset;
  return { wall: best.wall, offset };
}

/** Clamps and snaps a surface-local point, pulling items flush with the surface edges. */
export function snapOnSurface(
  surface: Surface,
  u: number,
  v: number,
  half: { w: number; d: number },
  grid: number,
  enabled: boolean,
): { u: number; v: number } {
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  let su = enabled ? snapTo(u, grid) : u;
  let sv = enabled ? snapTo(v, grid) : v;
  if (enabled) {
    if (Math.abs(su - half.w) < SNAP_DISTANCE) su = half.w;
    if (Math.abs(surface.width - half.w - su) < SNAP_DISTANCE) su = surface.width - half.w;
    if (Math.abs(sv - half.d) < SNAP_DISTANCE) sv = half.d;
    if (Math.abs(surface.depth - half.d - sv) < SNAP_DISTANCE) sv = surface.depth - half.d;
  }
  return { u: clamp(su, 0, surface.width), v: clamp(sv, 0, surface.depth) };
}

export type { Id };
