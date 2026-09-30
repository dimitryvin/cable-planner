import type {
  Device,
  Id,
  Infra,
  Layout,
  Mount,
  Port,
  PortOwner,
  PortRef,
  Size3,
  Surface,
  Vec2,
  Vec3,
  WallFeature,
  Waypoint,
} from '../model/types';
import { findWall, wallPoint } from './room';
import { add2, rotate2 } from './vec';

/** Surface heights to evaluate at (e.g. a standing desk at max), keyed by surface id. */
export type HeightOverrides = Readonly<Record<Id, number>>;

export interface Pose {
  /** Bottom-center of the item in room coordinates. */
  pos: Vec3;
  /** Clockwise plan rotation in degrees. */
  rotation: number;
  /** Surface the item ultimately rides on, if any (moves with a standing desk). */
  surfaceId?: Id;
}

export function surfaceHeight(s: Surface, heights?: HeightOverrides): number {
  return heights?.[s.id] ?? s.height;
}

/** Surface-local (u from left edge, v from back edge) → plan coordinates. */
export function surfaceToPlan(s: Surface, u: number, v: number): Vec2 {
  return add2(s.center, rotate2({ x: u - s.width / 2, y: v - s.depth / 2 }, s.rotation));
}

/** Plan coordinates → surface-local (u, v). */
export function planToSurface(s: Surface, p: Vec2): { u: number; v: number } {
  const local = rotate2({ x: p.x - s.center.x, y: p.y - s.center.y }, -s.rotation);
  return { u: local.x + s.width / 2, v: local.y + s.depth / 2 };
}

export function surfaceCorners(s: Surface): Vec2[] {
  return [
    surfaceToPlan(s, 0, 0),
    surfaceToPlan(s, s.width, 0),
    surfaceToPlan(s, s.width, s.depth),
    surfaceToPlan(s, 0, s.depth),
  ];
}

/** Rotation that makes an item's back face the wall. */
function wallFacingRotation(inward: Vec2): number {
  return (Math.atan2(-inward.x, inward.y) * 180) / Math.PI;
}

export function resolveMount(
  layout: Layout,
  mount: Mount,
  size: Size3,
  heights?: HeightOverrides,
  depth = 0,
): Pose | undefined {
  switch (mount.on) {
    case 'surfaceTop':
    case 'surfaceUnder': {
      const s = layout.surfaces.find((x) => x.id === mount.surfaceId);
      if (!s) return undefined;
      const top = surfaceHeight(s, heights);
      const z = mount.on === 'surfaceTop' ? top : top - s.thickness - size.h;
      const p = surfaceToPlan(s, mount.u, mount.v);
      return { pos: { ...p, z }, rotation: s.rotation + mount.rotation, surfaceId: s.id };
    }
    case 'floor':
      return { pos: { ...mount.pos, z: 0 }, rotation: mount.rotation };
    case 'wall': {
      const wall = findWall(layout.room, mount.at.wallId);
      if (!wall) return undefined;
      const p = wallPoint(wall, mount.at.offset, size.d / 2);
      return { pos: { ...p, z: mount.at.z }, rotation: wallFacingRotation(wall.inward) };
    }
    case 'arm': {
      if (depth > 4) return undefined;
      const arm = layout.infra.find((i) => i.id === mount.armId);
      if (!arm || arm.kind !== 'monitorArm') return undefined;
      const base = resolveMount(layout, arm.mount, { w: 4, d: 4, h: 0 }, heights, depth + 1);
      if (!base) return undefined;
      const fwd = rotate2({ x: 0, y: arm.reach }, base.rotation);
      return {
        pos: { x: base.pos.x + fwd.x, y: base.pos.y + fwd.y, z: base.pos.z + arm.height - size.h / 2 },
        rotation: base.rotation,
        surfaceId: base.surfaceId,
      };
    }
  }
}

export type OwnerEntry =
  | { kind: 'device'; entity: Device }
  | { kind: 'feature'; entity: WallFeature }
  | { kind: 'infra'; entity: Infra };

export function findOwner(layout: Layout, id: Id): OwnerEntry | undefined {
  const d = layout.devices.find((x) => x.id === id);
  if (d) return { kind: 'device', entity: d };
  const f = layout.features.find((x) => x.id === id);
  if (f) return { kind: 'feature', entity: f };
  const i = layout.infra.find((x) => x.id === id);
  if (i) return { kind: 'infra', entity: i };
  return undefined;
}

export function portsOf(entry: OwnerEntry | undefined): Port[] {
  if (!entry) return [];
  if (entry.kind === 'infra') return entry.entity.kind === 'powerStrip' ? entry.entity.ports : [];
  return entry.entity.ports;
}

export function findPort(layout: Layout, ref: PortRef): { owner: PortOwner; port: Port } | undefined {
  const entry = findOwner(layout, ref.ownerId);
  const port = portsOf(entry).find((p) => p.id === ref.portId);
  if (!entry || !port) return undefined;
  return { owner: entry.entity as PortOwner, port };
}

/** Pose of any entity that can own ports or anchor a cable. */
export function resolveOwnerPose(
  layout: Layout,
  entry: OwnerEntry,
  heights?: HeightOverrides,
): Pose | undefined {
  if (entry.kind === 'device') return resolveMount(layout, entry.entity.mount, entry.entity.size, heights);
  if (entry.kind === 'infra') return resolveMount(layout, entry.entity.mount, infraSize(entry.entity), heights);

  const f = entry.entity;
  if (f.kind === 'obstacle') {
    return resolveMount(layout, { on: 'wall', at: f.at }, { w: f.width, d: 0, h: f.height }, heights);
  }
  if (f.placement.on === 'floor') return { pos: { ...f.placement.pos, z: 0 }, rotation: 0 };
  return resolveMount(layout, { on: 'wall', at: f.placement.at }, { w: 3, d: 0, h: 5 }, heights);
}

export function infraSize(i: Infra): Size3 {
  switch (i.kind) {
    case 'powerStrip':
      return i.size;
    case 'tray':
      return { w: i.length, d: i.width, h: i.depth };
    case 'raceway':
      return i.orientation === 'horizontal'
        ? { w: i.length, d: i.depth, h: i.width }
        : { w: i.width, d: i.depth, h: i.length };
    case 'clip':
      return { w: 1, d: 1, h: 0.5 };
    case 'spine':
      return { w: 2, d: 2, h: i.length };
    case 'monitorArm':
      return { w: 4, d: 4, h: i.height };
    case 'brickHolder':
      return i.size;
  }
}

export interface ResolvedPort {
  point: Vec3;
  surfaceId?: Id;
}

export function resolvePort(layout: Layout, ref: PortRef, heights?: HeightOverrides): ResolvedPort | undefined {
  const entry = findOwner(layout, ref.ownerId);
  const port = portsOf(entry).find((p) => p.id === ref.portId);
  if (!entry || !port) return undefined;
  const pose = resolveOwnerPose(layout, entry, heights);
  if (!pose) return undefined;
  const off = rotate2(port.local, pose.rotation);
  return {
    point: { x: pose.pos.x + off.x, y: pose.pos.y + off.y, z: pose.pos.z + port.local.z },
    surfaceId: pose.surfaceId,
  };
}

export interface ResolvedWaypoint {
  /** One point for most waypoints; grommets yield the top and underside. */
  points: Vec3[];
  surfaceId?: Id;
}

export function resolveWaypoint(
  layout: Layout,
  wp: Waypoint,
  heights?: HeightOverrides,
): ResolvedWaypoint | undefined {
  switch (wp.kind) {
    case 'free':
      if (wp.frame === 'room') return { points: [wp.p] };
      {
        const s = layout.surfaces.find((x) => x.id === wp.surfaceId);
        if (!s) return undefined;
        const p = surfaceToPlan(s, wp.u, wp.v);
        return { points: [{ ...p, z: surfaceHeight(s, heights) + wp.zOffset }], surfaceId: s.id };
      }
    case 'grommet': {
      const s = layout.surfaces.find((x) => x.id === wp.surfaceId);
      const g = s?.grommets.find((x) => x.id === wp.grommetId);
      if (!s || !g) return undefined;
      const p = surfaceToPlan(s, g.u, g.v);
      const top = surfaceHeight(s, heights);
      return { points: [{ ...p, z: top }, { ...p, z: top - s.thickness }], surfaceId: s.id };
    }
    case 'anchor': {
      const infra = layout.infra.find((x) => x.id === wp.infraId);
      if (!infra) return undefined;
      const pose = resolveMount(layout, infra.mount, infraSize(infra), heights);
      if (!pose) return undefined;
      return { points: [pose.pos], surfaceId: pose.surfaceId };
    }
  }
}
