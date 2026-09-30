import { resolvePort, resolveWaypoint, type HeightOverrides } from '../geometry/resolve';
import { approxEq, dist3 } from '../geometry/vec';
import type { Cable, Id, Layout, PortRef, Vec3 } from '../model/types';
import { shortestPath } from './dijkstra';
import {
  attachPort,
  attachVia,
  buildSurface,
  localU,
  Network,
  SUPPORTED,
  type NetEdge,
  type Support,
  type SurfaceRig,
} from './network';

export interface RouteSegment {
  a: Vec3;
  b: Vec3;
  support: Support;
  supported: boolean;
  /** tray:<id>, raceway:<id>, spine:<id>, grommet:<surface>:<id> */
  container?: string;
  /** Surface this segment rides on (moves with a standing desk). */
  surfaceId?: Id;
}

export interface Route {
  cableId: Id;
  points: Vec3[];
  segments: RouteSegment[];
  length: number;
  /** Surfaces the route is attached to. */
  surfaces: Id[];
  ok: boolean;
  error?: string;
}

export interface RoutedNetwork {
  net: Network;
  rigs: Map<Id, SurfaceRig>;
  portNode: (ref: PortRef) => number | undefined;
}

/**
 * Builds the routing network for every cable endpoint in the layout, with
 * surfaces at the given heights.
 */
export function buildNetwork(layout: Layout, heights?: HeightOverrides): RoutedNetwork {
  const net = new Network(layout, heights);
  const refs = layout.cables.flatMap((c) => [c.from, c.to]);

  const extraU = new Map<Id, number[]>();
  const push = (sid: Id, u: number) => extraU.set(sid, [...(extraU.get(sid) ?? []), u]);
  for (const ref of refs) {
    const r = resolvePort(layout, ref, heights);
    const s = r?.surfaceId && layout.surfaces.find((x) => x.id === r.surfaceId);
    if (r && s) push(s.id, localU(s, r.point));
  }
  for (const i of layout.infra) {
    if (i.kind === 'monitorArm' && i.mount.on === 'surfaceTop') push(i.mount.surfaceId, i.mount.u);
  }

  const rigs = new Map<Id, SurfaceRig>();
  for (const s of layout.surfaces) rigs.set(s.id, buildSurface(net, s, extraU.get(s.id) ?? []));

  const portNodes = new Map<string, number | undefined>();
  const keyOf = (ref: PortRef) => `${ref.ownerId}:${ref.portId}`;
  for (const ref of refs) {
    if (!portNodes.has(keyOf(ref))) portNodes.set(keyOf(ref), attachPort(net, rigs, ref));
  }
  net.finalize();

  return { net, rigs, portNode: (ref) => portNodes.get(keyOf(ref)) };
}

const fail = (cable: Cable, error: string): Route => ({
  cableId: cable.id,
  points: [],
  segments: [],
  length: 0,
  surfaces: [],
  ok: false,
  error,
});

export function routeCable(layout: Layout, cable: Cable, network: RoutedNetwork): Route {
  return cable.routing === 'manual' ? manualRoute(layout, cable, network.net.heights) : autoRoute(layout, cable, network);
}

function autoRoute(layout: Layout, cable: Cable, network: RoutedNetwork): Route {
  const start = network.portNode(cable.from);
  const goal = network.portNode(cable.to);
  if (start === undefined || goal === undefined) return fail(cable, 'Endpoint not found');

  // Pinned waypoints become via points on a private copy of the graph.
  const { net } = network;
  const scratch = cable.waypoints.length > 0 ? net.fork() : net;
  const vias: number[] = [];
  for (const wp of cable.waypoints) {
    const r = resolveWaypoint(layout, wp, net.heights);
    if (!r) continue;
    for (const [i, p] of r.points.entries()) vias.push(attachVia(scratch, p, `via:${wp.id}:${i}`, r.surfaceId));
  }

  const stops = [start, ...vias, goal];
  const nodes: number[] = [start];
  const edges: NetEdge[] = [];
  for (let i = 1; i < stops.length; i++) {
    const leg = shortestPath(scratch.adj, stops[i - 1]!, stops[i]!, (n) => !scratch.nodes[n]!.terminal);
    if (!leg) return fail(cable, 'No route found');
    nodes.push(...leg.nodes.slice(1));
    edges.push(...leg.edges);
  }

  const segments: RouteSegment[] = edges.map((e, i) => {
    const a = scratch.nodes[nodes[i]!]!;
    const b = scratch.nodes[nodes[i + 1]!]!;
    const surfaceId = a.surfaceId !== undefined && a.surfaceId === b.surfaceId ? a.surfaceId : undefined;
    return { a: a.p, b: b.p, support: e.support, supported: SUPPORTED[e.support], container: e.container, surfaceId };
  });
  return finish(cable, dipUnderBeams(layout, net.heights, mergeCollinear(segments)));
}

function manualRoute(layout: Layout, cable: Cable, heights?: HeightOverrides): Route {
  const a = resolvePort(layout, cable.from, heights);
  const b = resolvePort(layout, cable.to, heights);
  if (!a || !b) return fail(cable, 'Endpoint not found');

  const stops: { p: Vec3; surfaceId?: Id; container?: string }[] = [{ p: a.point, surfaceId: a.surfaceId }];
  for (const wp of cable.waypoints) {
    const r = resolveWaypoint(layout, wp, heights);
    if (!r) continue;
    const container =
      wp.kind === 'grommet' ? `grommet:${wp.surfaceId}:${wp.grommetId}` : wp.kind === 'anchor' ? anchorContainer(layout, wp.infraId) : undefined;
    for (const p of r.points) stops.push({ p, surfaceId: r.surfaceId, container });
  }
  stops.push({ p: b.point, surfaceId: b.surfaceId });

  const segments: RouteSegment[] = [];
  for (let i = 1; i < stops.length; i++) {
    const s = stops[i - 1]!;
    const t = stops[i]!;
    const container = s.container && s.container === t.container ? s.container : undefined;
    // Anchors (clips, trays…) support the cable at that point; the span between them hangs free.
    segments.push({
      a: s.p,
      b: t.p,
      support: container?.startsWith('grommet') ? 'grommet' : 'free',
      supported: container !== undefined,
      container,
      surfaceId: s.surfaceId !== undefined && s.surfaceId === t.surfaceId ? s.surfaceId : undefined,
    });
  }
  return finish(cable, segments);
}

function anchorContainer(layout: Layout, infraId: Id): string | undefined {
  const i = layout.infra.find((x) => x.id === infraId);
  if (!i) return undefined;
  return i.kind === 'tray' || i.kind === 'raceway' || i.kind === 'spine' || i.kind === 'clip' ? `${i.kind}:${i.id}` : undefined;
}

function finish(cable: Cable, segments: RouteSegment[]): Route {
  const nonZero = segments.filter((s) => dist3(s.a, s.b) > 1e-6);
  const points = nonZero.length > 0 ? [nonZero[0]!.a, ...nonZero.map((s) => s.b)] : [];
  const surfaces = [...new Set(nonZero.map((s) => s.surfaceId).filter((x): x is Id => x !== undefined))];
  const length = nonZero.reduce((sum, s) => sum + dist3(s.a, s.b), 0);
  return { cableId: cable.id, points, segments: nonZero, length, surfaces, ok: true };
}

/** Joins consecutive collinear segments with identical support so paths stay clean. */
export function mergeCollinear(segments: RouteSegment[]): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.support === s.support &&
      prev.container === s.container &&
      prev.surfaceId === s.surfaceId &&
      collinear(prev.a, prev.b, s.b)
    ) {
      out[out.length - 1] = { ...prev, b: s.b };
    } else {
      out.push(s);
    }
  }
  return out;
}

function collinear(a: Vec3, b: Vec3, c: Vec3): boolean {
  const ab = dist3(a, b);
  const bc = dist3(b, c);
  const ac = dist3(a, c);
  return approxEq(ab + bc, ac, 1e-3);
}

/**
 * Where an under-desk segment crosses a frame beam, route the cable down and
 * under it instead of through it.
 */
export function dipUnderBeams(layout: Layout, heights: HeightOverrides | undefined, segments: RouteSegment[]): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (const seg of segments) {
    const surface = seg.surfaceId ? layout.surfaces.find((s) => s.id === seg.surfaceId) : undefined;
    if (!surface || surface.beams.length === 0 || !['under', 'free'].includes(seg.support)) {
      out.push(seg);
      continue;
    }
    const underside = (heights?.[surface.id] ?? surface.height) - surface.thickness;
    const hits = beamHits(surface, seg, underside).sort((x, y) => x.t0 - y.t0);
    if (hits.length === 0) {
      out.push(seg);
      continue;
    }
    let cursor = seg.a;
    for (const h of hits) {
      const enter = lerp(seg.a, seg.b, h.t0);
      const exit = lerp(seg.a, seg.b, h.t1);
      const dz = h.bottom - 0.5;
      const pts = [enter, { ...enter, z: Math.min(enter.z, dz) }, { ...exit, z: Math.min(exit.z, dz) }, exit];
      out.push({ ...seg, a: cursor, b: pts[0]! });
      for (let i = 1; i < pts.length; i++) out.push({ ...seg, a: pts[i - 1]!, b: pts[i]! });
      cursor = exit;
    }
    out.push({ ...seg, a: cursor, b: seg.b });
  }
  return out;
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export interface BeamHit {
  beamId: Id;
  t0: number;
  t1: number;
  bottom: number;
}

/** Parametric range where a segment passes through a beam's volume (surface-local slab test). */
export function beamHits(
  surface: Layout['surfaces'][number],
  seg: { a: Vec3; b: Vec3 },
  underside: number,
): BeamHit[] {
  const toLocal = (p: Vec3) => {
    const r = (surface.rotation * Math.PI) / 180;
    const dx = p.x - surface.center.x;
    const dy = p.y - surface.center.y;
    return {
      u: dx * Math.cos(r) + dy * Math.sin(r) + surface.width / 2,
      v: -dx * Math.sin(r) + dy * Math.cos(r) + surface.depth / 2,
      z: p.z,
    };
  };
  const a = toLocal(seg.a);
  const b = toLocal(seg.b);
  const hits: BeamHit[] = [];
  for (const beam of surface.beams) {
    const bottom = underside - beam.drop;
    let t0 = 0;
    let t1 = 1;
    const slabs: [number, number, number, number][] = [
      [a.u, b.u, beam.u, beam.u + beam.lengthU],
      [a.v, b.v, beam.v, beam.v + beam.lengthV],
      [a.z, b.z, bottom, underside],
    ];
    let inside = true;
    for (const [p0, p1, lo, hi] of slabs) {
      const d = p1 - p0;
      if (Math.abs(d) < 1e-9) {
        if (p0 <= lo || p0 >= hi) inside = false;
        continue;
      }
      let ta = (lo - p0) / d;
      let tb = (hi - p0) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
    }
    if (inside && t1 - t0 > 1e-6) hits.push({ beamId: beam.id, t0, t1, bottom });
  }
  return hits;
}
