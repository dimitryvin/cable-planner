import { surfaceToPlan } from '../../geometry/resolve';
import { rotate2 } from '../../geometry/vec';
import type { Surface, Vec2 } from '../../model/types';

/** Which way the viewer looks: at the surface's front, or straight at a wall. */
export type Facing = 'front' | 'N' | 'E' | 'S' | 'W';

export const FACING_LABELS: Record<Facing, string> = {
  front: 'Front of the surface',
  N: 'Facing north wall',
  E: 'Facing east wall',
  S: 'Facing south wall',
  W: 'Facing west wall',
};

/** Plan rotation (clockwise degrees) of the view; 0 looks north with east to the right. */
export function facingAngle(facing: Facing, s: Surface): number {
  switch (facing) {
    case 'front':
      return s.rotation;
    case 'N':
      return 0;
    case 'E':
      return 90;
    case 'S':
      return 180;
    case 'W':
      return 270;
  }
}

export interface Projection {
  /** Horizontal screen coordinate: 0 at the surface's left edge as seen from the viewer. */
  h: (p: Vec2) => number;
  /** Distance toward the viewer from the surface's far edge. */
  depth: (p: Vec2) => number;
  /** Plan point for a screen h at a given depth. */
  planAt: (h: number, depth: number) => Vec2;
  /** Screen interval covered by a surface-local rectangle. */
  rangeOf: (u: number, v: number, w: number, d: number) => [number, number];
  /** Unit vector pointing to the viewer's right. */
  uDir: Vec2;
  /** Unit vector pointing toward the viewer. */
  vDir: Vec2;
  /** Surface footprint width and depth as seen in this view. */
  extentH: number;
  extentD: number;
}

/**
 * Orthographic projection for an elevation looking along plan rotation
 * `angle`, framed on surface `s`.
 */
export function projector(s: Surface, angle: number): Projection {
  const uDir = rotate2({ x: 1, y: 0 }, angle);
  const vDir = rotate2({ x: 0, y: 1 }, angle);
  const rel = ((angle - s.rotation) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rel));
  const sn = Math.abs(Math.sin(rel));
  const extentH = c * s.width + sn * s.depth;
  const extentD = sn * s.width + c * s.depth;
  const along = (p: Vec2, dir: Vec2) => (p.x - s.center.x) * dir.x + (p.y - s.center.y) * dir.y;
  const h = (p: Vec2) => along(p, uDir) + extentH / 2;
  const depth = (p: Vec2) => along(p, vDir) + extentD / 2;
  return {
    h,
    depth,
    planAt: (hh, dd) => ({
      x: s.center.x + uDir.x * (hh - extentH / 2) + vDir.x * (dd - extentD / 2),
      y: s.center.y + uDir.y * (hh - extentH / 2) + vDir.y * (dd - extentD / 2),
    }),
    rangeOf: (u, v, w, d) => {
      const hs = [surfaceToPlan(s, u, v), surfaceToPlan(s, u + w, v), surfaceToPlan(s, u, v + d), surfaceToPlan(s, u + w, v + d)].map(h);
      return [Math.min(...hs), Math.max(...hs)];
    },
    uDir,
    vDir,
    extentH,
    extentD,
  };
}
