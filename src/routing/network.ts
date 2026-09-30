import { nearestWall, pointInRoom, roomWalls, wallPoint, type WallGeom } from '../geometry/room';
import {
  findOwner,
  resolveOwnerPose,
  resolvePort,
  surfaceHeight,
  surfaceToPlan,
  type HeightOverrides,
} from '../geometry/resolve';
import { dist2, dist3 } from '../geometry/vec';
import type { Id, Infra, Layout, PortRef, Surface, Vec2, Vec3 } from '../model/types';
import type { WeightedEdge } from './dijkstra';

/**
 * How a stretch of cable is held. Drives routing cost, unsupported-span
 * warnings, and clip estimates.
 */
export type Support =
  | 'top' // lying on the desk surface
  | 'under' // hanging along the underside rail (needs clips)
  | 'tray'
  | 'raceway'
  | 'spine'
  | 'grommet'
  | 'arm' // along a monitor arm
  | 'drop' // hanging vertical drop from a desk to the floor
  | 'baseboard' // on the floor along a wall
  | 'floor' // across open floor
  | 'wall' // vertical run on a wall to an outlet/jack
  | 'bridge' // short hop between surfaces or from a wall point to a desk
  | 'free'; // user-placed segment

export const SUPPORTED: Readonly<Record<Support, boolean>> = {
  top: true,
  under: false,
  tray: true,
  raceway: true,
  spine: true,
  grommet: true,
  arm: true,
  drop: false,
  baseboard: true,
  floor: true,
  wall: false,
  bridge: false,
  free: false,
};

/** Cost multipliers per inch. Lower is preferred; walls and trays win over open floor. */
export const COST: Readonly<Record<Support, number>> = {
  top: 1.8,
  under: 1.0,
  tray: 0.6,
  raceway: 0.6,
  spine: 0.7,
  grommet: 0.5,
  arm: 0.8,
  drop: 1.3,
  baseboard: 1.0,
  floor: 3.5,
  wall: 1.1,
  bridge: 1.6,
  free: 1.2,
};

const FLOOR_UNDER_DESK = 1.4;
const HEATER_PENALTY = 6;
const DOOR_PENALTY = 40;
const ARM_NO_CHANNEL = 1.4;
const RAIL_INSET = 1.5;
const HANG_BELOW = 0.75;
const BRIDGE_REACH = 24;
const LOW_OBSTACLE_Z = 12;

export interface NetEdge extends WeightedEdge {
  support: Support;
  container?: string;
}

export interface NetNode {
  p: Vec3;
  surfaceId?: Id;
  /** Port nodes are route endpoints only; other cables must not pass through them. */
  terminal?: boolean;
}

export interface WallAttach {
  wallId: Id;
  offset: number;
  node: number;
}

/** Container key for a grommet, shared by routing and capacity checks. */
export const grommetKey = (surfaceId: Id, grommetId: Id): string => `grommet:${surfaceId}:${grommetId}`;

export class Network {
  readonly nodes: NetNode[] = [];
  readonly adj: NetEdge[][] = [];
  readonly keys = new Map<string, number>();
  private readonly wallNodes = new Map<Id, { offset: number; node: number }[]>();
  private readonly floorOpen: number[] = [];

  constructor(
    readonly layout: Layout,
    readonly heights: HeightOverrides | undefined,
  ) {}

  /** Copy whose nodes/edges can grow (e.g. per-cable via points) without touching this network. */
  fork(): Network {
    const copy = new Network(this.layout, this.heights);
    copy.nodes.push(...this.nodes);
    copy.adj.push(...this.adj.map((a) => [...a]));
    this.keys.forEach((v, k) => copy.keys.set(k, v));
    return copy;
  }

  get standoff(): number {
    return this.layout.settings.wallStandoff;
  }

  addNode(p: Vec3, surfaceId?: Id, key?: string): number {
    if (key !== undefined) {
      const existing = this.keys.get(key);
      if (existing !== undefined) return existing;
    }
    const id = this.nodes.length;
    this.nodes.push({ p, surfaceId });
    this.adj.push([]);
    if (key !== undefined) this.keys.set(key, id);
    return id;
  }

  addEdge(a: number, b: number, support: Support, factor = COST[support], container?: string): void {
    if (a === b) return;
    const cost = dist3(this.nodes[a]!.p, this.nodes[b]!.p) * factor + 0.01;
    this.adj[a]!.push({ to: b, cost, support, container });
    this.adj[b]!.push({ to: a, cost, support, container });
  }

  /** Registers a baseboard point on a wall; edges along walls are created in `finalize`. */
  wallNode(wall: WallGeom, offset: number): number {
    const t = Math.max(0, Math.min(wall.length, offset));
    const key = `wall:${wall.id}:${t.toFixed(2)}`;
    const p = wallPoint(wall, t, this.standoff);
    const id = this.addNode({ ...p, z: 0 }, undefined, key);
    const list = this.wallNodes.get(wall.id) ?? [];
    if (!list.some((n) => n.node === id)) list.push({ offset: t, node: id });
    this.wallNodes.set(wall.id, list);
    return id;
  }

  /** A point on the floor that should connect to the wall network and other open-floor points. */
  floorNode(p: Vec2, key?: string): number {
    const id = this.addNode({ ...p, z: 0 }, undefined, key);
    if (!this.floorOpen.includes(id)) this.floorOpen.push(id);
    return id;
  }

  finalize(): void {
    const walls = roomWalls(this.layout.room);
    const s = this.standoff;

    // Corners: the inset corner lies on both adjacent walls' baseboard lines.
    walls.forEach((wall, i) => {
      const prev = walls[(i - 1 + walls.length) % walls.length]!;
      const corner = wall.start;
      const inset = {
        x: corner.x + s * (wall.inward.x + prev.inward.x),
        y: corner.y + s * (wall.inward.y + prev.inward.y),
      };
      const id = this.addNode({ ...inset, z: 0 }, undefined, `corner:${i}`);
      const offWall = (w: WallGeom) => (inset.x - w.start.x) * w.dir.x + (inset.y - w.start.y) * w.dir.y;
      for (const w of [wall, prev]) {
        const list = this.wallNodes.get(w.id) ?? [];
        list.push({ offset: offWall(w), node: id });
        this.wallNodes.set(w.id, list);
      }
    });

    // Open-floor points attach perpendicular to each wall they can see, and to each other.
    for (const id of this.floorOpen) {
      const p = this.nodes[id]!.p;
      for (const wall of walls) {
        const t = (p.x - wall.start.x) * wall.dir.x + (p.y - wall.start.y) * wall.dir.y;
        if (t < 0 || t > wall.length) continue;
        const foot = wallPoint(wall, t, s);
        if (!segmentInsideRoom(this.layout, p, foot)) continue;
        const w = this.wallNode(wall, t);
        this.addEdge(id, w, 'floor', this.floorFactor(p, foot));
      }
    }
    // Open-floor points connect to each other with L-shaped (axis-aligned) runs,
    // the way cable is actually laid, never as diagonals.
    const open = [...this.floorOpen];
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        this.addFloorRun(open[i]!, open[j]!);
      }
    }

    // Baseboard runs along each wall, penalized where they pass heaters or doors.
    for (const wall of walls) {
      const list = [...(this.wallNodes.get(wall.id) ?? [])].sort((a, b) => a.offset - b.offset);
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1]!;
        const b = list[i]!;
        this.addEdge(a.node, b.node, 'baseboard', COST.baseboard * this.baseboardPenalty(wall.id, a.offset, b.offset));
      }
    }
  }

  private addFloorRun(ia: number, ib: number): void {
    const a = this.nodes[ia]!.p;
    const b = this.nodes[ib]!.p;
    const aligned = Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;
    if (aligned) {
      if (segmentInsideRoom(this.layout, a, b)) this.addEdge(ia, ib, 'floor', this.floorFactor(a, b));
      return;
    }
    for (const c of [{ x: a.x, y: b.y }, { x: b.x, y: a.y }]) {
      if (!segmentInsideRoom(this.layout, a, c) || !segmentInsideRoom(this.layout, c, b)) continue;
      const corner = this.addNode({ ...c, z: 0 }, undefined, `floorcorner:${c.x.toFixed(2)}:${c.y.toFixed(2)}`);
      this.addEdge(ia, corner, 'floor', this.floorFactor(a, c));
      this.addEdge(corner, ib, 'floor', this.floorFactor(c, b));
    }
  }

  /**
   * Cost per inch for a floor segment, blended by how much of it actually runs
   * under a desk (sampled), so a long diagonal that merely clips a desk corner
   * still pays the open-floor rate.
   */
  private floorFactor(a: Vec2, b: Vec2): number {
    const steps = Math.max(1, Math.ceil(dist2(a, b) / 2));
    let under = 0;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (this.layout.surfaces.some((s) => pointOverSurface(s, p))) under++;
    }
    const frac = under / steps;
    return frac * FLOOR_UNDER_DESK + (1 - frac) * COST.floor;
  }

  private baseboardPenalty(wallId: Id, from: number, to: number): number {
    let factor = 1;
    for (const f of this.layout.features) {
      if (f.kind !== 'obstacle' || f.at.wallId !== wallId || f.at.z > LOW_OBSTACLE_Z) continue;
      const lo = f.at.offset - f.width / 2;
      const hi = f.at.offset + f.width / 2;
      if (Math.min(from, to) < hi && Math.max(from, to) > lo) {
        factor = Math.max(factor, f.obstacleType === 'door' ? DOOR_PENALTY : f.obstacleType === 'heater' ? HEATER_PENALTY : 2);
      }
    }
    return factor;
  }
}

export function pointOverSurface(s: Surface, p: Vec2): boolean {
  const r = (s.rotation * Math.PI) / 180;
  const dx = p.x - s.center.x;
  const dy = p.y - s.center.y;
  const u = dx * Math.cos(r) + dy * Math.sin(r);
  const v = -dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(u) <= s.width / 2 && Math.abs(v) <= s.depth / 2;
}

function segmentInsideRoom(layout: Layout, a: Vec2, b: Vec2): boolean {
  const steps = Math.max(2, Math.ceil(dist2(a, b) / 6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!pointInRoom(layout.room, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export interface SurfaceRig {
  surface: Surface;
  top: number;
  railZ: number;
  /** Rail node per u (rounded to 0.01"), keyed for reuse. */
  rail: (u: number) => number;
  edgeTop: (u: number) => number;
  toWorld: (u: number, v: number, z: number) => Vec3;
}

type Tray = Extract<Infra, { kind: 'tray' }>;
type Spine = Extract<Infra, { kind: 'spine' }>;

/**
 * Builds the under-desk network for one surface: a rail just inside the back
 * edge, back-edge crossing points on top, grommets, trays, and drops to the
 * floor at the spine and back corners.
 */
export function buildSurface(net: Network, surface: Surface, extraU: readonly number[]): SurfaceRig {
  const top = surfaceHeight(surface, net.heights);
  const underside = top - surface.thickness;
  const railZ = underside - HANG_BELOW;
  const railV = Math.min(RAIL_INSET, surface.depth / 2);
  const toWorld = (u: number, v: number, z: number): Vec3 => ({ ...surfaceToPlan(surface, u, v), z });
  const clampU = (u: number) => Math.max(RAIL_INSET, Math.min(surface.width - RAIL_INSET, u));
  const sid = surface.id;

  const rail = (u: number) => net.addNode(toWorld(clampU(u), railV, railZ), sid, `rail:${sid}:${clampU(u).toFixed(2)}`);
  const edgeTop = (u: number) => {
    const cu = clampU(u);
    const id = net.addNode(toWorld(cu, 0.5, top), sid, `edge:${sid}:${cu.toFixed(2)}`);
    net.addEdge(id, rail(cu), 'drop', 1.0);
    return id;
  };

  const trays = net.layout.infra.filter(
    (i): i is Tray => i.kind === 'tray' && i.mount.on === 'surfaceUnder' && i.mount.surfaceId === sid,
  );
  const spines = net.layout.infra.filter(
    (i): i is Spine => i.kind === 'spine' && i.mount.on === 'surfaceUnder' && i.mount.surfaceId === sid,
  );

  const us = new Set<number>([RAIL_INSET, surface.width - RAIL_INSET, ...extraU.map(clampU)]);
  surface.grommets.forEach((g) => us.add(clampU(g.u)));
  spines.forEach((s) => s.mount.on === 'surfaceUnder' && us.add(clampU(s.mount.u)));
  trays.forEach((t) => {
    if (t.mount.on !== 'surfaceUnder') return;
    us.add(clampU(t.mount.u - t.length / 2));
    us.add(clampU(t.mount.u + t.length / 2));
  });

  const sorted = [...us].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) net.addEdge(rail(sorted[i - 1]!), rail(sorted[i]!), 'under');

  // Trays: a parallel channel at the tray floor, joined to the rail at every u.
  for (const t of trays) {
    if (t.mount.on !== 'surfaceUnder') continue;
    const lo = t.mount.u - t.length / 2;
    const hi = t.mount.u + t.length / 2;
    const tz = underside - t.depth + 0.5;
    const inTray = sorted.filter((u) => u >= lo - 0.01 && u <= hi + 0.01);
    const ids = inTray.map((u) => {
      const id = net.addNode(toWorld(u, t.mount.on === 'surfaceUnder' ? t.mount.v : railV, tz), sid, `tray:${t.id}:${u.toFixed(2)}`);
      net.addEdge(id, rail(u), 'under');
      return id;
    });
    for (let i = 1; i < ids.length; i++) net.addEdge(ids[i - 1]!, ids[i]!, 'tray', COST.tray, `tray:${t.id}`);
  }

  // Grommets: top ↔ underside, joined to the rail.
  for (const g of surface.grommets) {
    const key = grommetKey(sid, g.id);
    const gt = net.addNode(toWorld(g.u, g.v, top), sid, `${key}:top`);
    const gb = net.addNode(toWorld(g.u, g.v, railZ), sid, `${key}:bot`);
    net.addEdge(gt, gb, 'grommet', COST.grommet, key);
    net.addEdge(gb, rail(g.u), 'under');
  }

  // Drops to the floor: a spine is best; otherwise hang at a back corner.
  for (const s of spines) {
    if (s.mount.on !== 'surfaceUnder') continue;
    const head = net.addNode(toWorld(s.mount.u, s.mount.v, railZ), sid, `spine:${s.id}:head`);
    net.addEdge(head, rail(s.mount.u), 'under');
    const foot = net.floorNode(surfaceToPlan(surface, s.mount.u, s.mount.v), `spine:${s.id}:foot`);
    net.addEdge(head, foot, 'spine', COST.spine, `spine:${s.id}`);
  }
  for (const u of [RAIL_INSET, surface.width - RAIL_INSET]) {
    const foot = net.floorNode(surfaceToPlan(surface, u, railV), `drop:${sid}:${u.toFixed(2)}`);
    net.addEdge(rail(u), foot, 'drop');
  }

  return { surface, top, railZ, rail, edgeTop, toWorld };
}

// ---------------------------------------------------------------------------
// Ports and waypoints
// ---------------------------------------------------------------------------

/** Adds a node for a port and connects it to the network according to how its owner is mounted. */
export function attachPort(net: Network, rigs: ReadonlyMap<Id, SurfaceRig>, ref: PortRef): number | undefined {
  const resolved = resolvePort(net.layout, ref, net.heights);
  const entry = findOwner(net.layout, ref.ownerId);
  if (!resolved || !entry) return undefined;
  const key = `port:${ref.ownerId}:${ref.portId}`;
  const existing = net.keys.get(key);
  if (existing !== undefined) return existing;
  const id = net.addNode(resolved.point, resolved.surfaceId, key);
  net.nodes[id] = { ...net.nodes[id]!, terminal: true };
  const p = resolved.point;

  const mount =
    entry.kind === 'feature'
      ? entry.entity.kind === 'obstacle'
        ? undefined
        : entry.entity.placement.on === 'wall'
          ? ({ on: 'wall', at: entry.entity.placement.at } as const)
          : ({ on: 'floor' } as const)
      : entry.entity.mount;
  if (!mount) return undefined;

  switch (mount.on) {
    case 'surfaceTop':
    case 'surfaceUnder': {
      const rig = rigs.get(mount.surfaceId);
      if (!rig) break;
      const uv = localU(rig.surface, p);
      if (mount.on === 'surfaceTop') {
        connectTop(net, rig, id, uv);
      } else {
        net.addEdge(id, rig.rail(uv), 'under');
        linkNearbyTray(net, rig, id);
      }
      break;
    }
    case 'arm': {
      const arm = net.layout.infra.find((i) => i.id === mount.armId);
      if (!arm || arm.kind !== 'monitorArm' || arm.mount.on !== 'surfaceTop') break;
      const rig = rigs.get(arm.mount.surfaceId);
      if (!rig) break;
      const base = net.addNode(rig.toWorld(arm.mount.u, arm.mount.v, rig.top), rig.surface.id, `arm:${arm.id}`);
      net.addEdge(id, base, 'arm', arm.hasChannel ? COST.arm : ARM_NO_CHANNEL);
      connectTop(net, rig, base, arm.mount.u);
      break;
    }
    case 'floor': {
      const foot = net.floorNode(p, `${key}:foot`);
      net.addEdge(id, foot, 'floor', 1);
      break;
    }
    case 'wall': {
      const wall = roomWalls(net.layout.room).find((w) => w.id === mount.at.wallId);
      if (!wall) break;
      const offset = (p.x - wall.start.x) * wall.dir.x + (p.y - wall.start.y) * wall.dir.y;
      net.addEdge(id, net.wallNode(wall, offset), 'wall');
      linkRaceways(net, wall, offset, id);
      break;
    }
  }

  bridgeToNearbyRails(net, rigs, id);
  return id;
}

export function localU(s: Surface, p: Vec2): number {
  const r = (s.rotation * Math.PI) / 180;
  const dx = p.x - s.center.x;
  const dy = p.y - s.center.y;
  return dx * Math.cos(r) + dy * Math.sin(r) + s.width / 2;
}

function connectTop(net: Network, rig: SurfaceRig, id: number, u: number): void {
  net.addEdge(id, rig.edgeTop(u), 'top');
  for (const g of rig.surface.grommets) {
    const gt = net.keys.get(`${grommetKey(rig.surface.id, g.id)}:top`);
    if (gt !== undefined) net.addEdge(id, gt, 'top');
  }
}

function linkNearbyTray(net: Network, rig: SurfaceRig, id: number): void {
  const p = net.nodes[id]!.p;
  for (const [key, node] of net.keys) {
    if (!key.startsWith('tray:')) continue;
    const q = net.nodes[node]!;
    if (q.surfaceId === rig.surface.id && dist3(p, q.p) < 12) net.addEdge(id, node, 'under');
  }
}

/** Ports near a desk (e.g. an outlet right behind it) may hop straight onto its rail. */
function bridgeToNearbyRails(net: Network, rigs: ReadonlyMap<Id, SurfaceRig>, id: number): void {
  const node = net.nodes[id]!;
  for (const rig of rigs.values()) {
    if (rig.surface.id === node.surfaceId) continue;
    let best: { n: number; d: number } | undefined;
    for (const [key, n] of net.keys) {
      if (!key.startsWith(`rail:${rig.surface.id}:`)) continue;
      const d = dist3(node.p, net.nodes[n]!.p);
      if (d < BRIDGE_REACH && (!best || d < best.d)) best = { n, d };
    }
    if (best) net.addEdge(id, best.n, 'bridge');
  }
}

function linkRaceways(net: Network, wall: WallGeom, offset: number, portNode: number): void {
  for (const r of net.layout.infra) {
    if (r.kind !== 'raceway' || r.mount.on !== 'wall' || r.mount.at.wallId !== wall.id) continue;
    const start = r.mount.at.offset;
    const z0 = r.mount.at.z;
    if (r.orientation === 'horizontal') {
      if (offset < start || offset > start + r.length) continue;
      const at = (o: number) => net.addNode({ ...wallPoint(wall, o, net.standoff), z: z0 }, undefined, `raceway:${r.id}:${o.toFixed(2)}`);
      const a = at(start);
      const b = at(start + r.length);
      const mid = at(offset);
      net.addEdge(a, mid, 'raceway', COST.raceway, `raceway:${r.id}`);
      net.addEdge(mid, b, 'raceway', COST.raceway, `raceway:${r.id}`);
      net.addEdge(portNode, mid, 'wall');
      net.addEdge(a, net.wallNode(wall, start), 'wall');
      net.addEdge(b, net.wallNode(wall, start + r.length), 'wall');
    } else if (Math.abs(offset - start) < 6) {
      const bottom = net.addNode({ ...wallPoint(wall, start, net.standoff), z: z0 }, undefined, `raceway:${r.id}:bottom`);
      const topNode = net.addNode({ ...wallPoint(wall, start, net.standoff), z: z0 + r.length }, undefined, `raceway:${r.id}:top`);
      net.addEdge(bottom, topNode, 'raceway', COST.raceway, `raceway:${r.id}`);
      net.addEdge(portNode, topNode, 'wall');
      net.addEdge(bottom, net.wallNode(wall, start), 'wall');
    }
  }
}

/**
 * Connects an arbitrary via point to its nearest passable network nodes. A
 * point on the floor only links to floor-level nodes, at open-floor cost.
 */
export function attachVia(net: Network, p: Vec3, key: string, surfaceId?: Id, k = 4): number {
  const onFloor = p.z < 1;
  const id = net.addNode(p, surfaceId, key);
  const near = net.nodes
    .map((n, i) => ({ i, n, d: dist3(n.p, p) }))
    .filter((x) => x.i !== id && !x.n.terminal && (!onFloor || x.n.p.z < 1))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  for (const { i } of near) net.addEdge(id, i, onFloor ? 'floor' : 'free');
  return id;
}

/** Plan-view helper used by the floor attach logic of wall-less points. */
export function nearestBaseboard(net: Network, p: Vec2): number | undefined {
  const hit = nearestWall(net.layout.room, p);
  return hit ? net.wallNode(hit.wall, hit.offset) : undefined;
}

export { resolveOwnerPose };
