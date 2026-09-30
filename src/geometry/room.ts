import type { Corner, Id, Room, Vec2, WallRef } from '../model/types';
import { dist2, sub2, scale2, add2 } from './vec';

export interface WallGeom {
  id: Id;
  label: string;
  start: Vec2;
  end: Vec2;
  length: number;
  /** Unit vector from start to end. */
  dir: Vec2;
  /** Unit normal pointing into the room. */
  inward: Vec2;
}

/**
 * Room outline as vertices in clockwise screen order, starting at the
 * north-west corner (or the first vertex after it for an NW notch).
 */
export function roomVertices(room: Room): Vec2[] {
  const s = room.shape;
  const W = s.width;
  const D = s.depth;
  if (s.kind === 'rect') {
    return [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D },
      { x: 0, y: D },
    ];
  }
  const nw = Math.min(s.notch.width, W);
  const nd = Math.min(s.notch.depth, D);
  const byCorner: Record<Corner, Vec2[]> = {
    NE: [
      { x: 0, y: 0 },
      { x: W - nw, y: 0 },
      { x: W - nw, y: nd },
      { x: W, y: nd },
      { x: W, y: D },
      { x: 0, y: D },
    ],
    SE: [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D - nd },
      { x: W - nw, y: D - nd },
      { x: W - nw, y: D },
      { x: 0, y: D },
    ],
    SW: [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D },
      { x: nw, y: D },
      { x: nw, y: D - nd },
      { x: 0, y: D - nd },
    ],
    NW: [
      { x: nw, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D },
      { x: 0, y: D },
      { x: 0, y: nd },
      { x: nw, y: nd },
    ],
  };
  return byCorner[s.notch.corner];
}

const LETTERS = 'ABCDEFGH';

function compassLabel(dir: Vec2): string {
  // A wall whose start→end runs east is the north wall (interior below it), etc.
  if (Math.abs(dir.x) > Math.abs(dir.y)) return dir.x > 0 ? 'North' : 'South';
  return dir.y > 0 ? 'East' : 'West';
}

/** Wall ids are positional (`w0`..`wN`), so they stay stable while the room is resized. */
export function roomWalls(room: Room): WallGeom[] {
  const verts = roomVertices(room);
  const walls = verts.map((start, i) => {
    const end = verts[(i + 1) % verts.length]!;
    const length = dist2(start, end);
    const dir = length > 0 ? scale2(sub2(end, start), 1 / length) : { x: 1, y: 0 };
    // Clockwise on a y-down screen: interior is to the right of travel.
    const inward = { x: -dir.y, y: dir.x };
    return { id: `w${i}`, label: '', start, end, length, dir, inward };
  });

  if (room.labelStyle === 'letters') {
    return walls.map((w, i) => ({ ...w, label: LETTERS[i] ?? `W${i + 1}` }));
  }
  const counts = new Map<string, number>();
  const base = walls.map((w) => compassLabel(w.dir));
  base.forEach((b) => counts.set(b, (counts.get(b) ?? 0) + 1));
  const seen = new Map<string, number>();
  return walls.map((w, i) => {
    const b = base[i]!;
    if ((counts.get(b) ?? 0) < 2) return { ...w, label: b };
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return { ...w, label: `${b} ${n}` };
  });
}

export function findWall(room: Room, wallId: Id): WallGeom | undefined {
  return roomWalls(room).find((w) => w.id === wallId);
}

/** Plan position of a wall reference, pushed `standoff` inches into the room. */
export function wallPoint(wall: WallGeom, offset: number, standoff = 0): Vec2 {
  return add2(add2(wall.start, scale2(wall.dir, offset)), scale2(wall.inward, standoff));
}

export function wallRefPoint(room: Room, ref: WallRef, standoff = 0): Vec2 | undefined {
  const wall = findWall(room, ref.wallId);
  return wall ? wallPoint(wall, ref.offset, standoff) : undefined;
}

/** Nearest wall to a plan point, with the offset along it and the perpendicular distance. */
export function nearestWall(
  room: Room,
  p: Vec2,
): { wall: WallGeom; offset: number; distance: number } | undefined {
  let best: { wall: WallGeom; offset: number; distance: number } | undefined;
  for (const wall of roomWalls(room)) {
    const rel = sub2(p, wall.start);
    const t = Math.max(0, Math.min(wall.length, rel.x * wall.dir.x + rel.y * wall.dir.y));
    const q = wallPoint(wall, t);
    const distance = dist2(p, q);
    if (!best || distance < best.distance) best = { wall, offset: t, distance };
  }
  return best;
}

/** Even-odd point-in-polygon test. */
export function pointInRoom(room: Room, p: Vec2): boolean {
  const vs = roomVertices(room);
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const a = vs[i]!;
    const b = vs[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
