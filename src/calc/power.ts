import { findOwner } from '../geometry/resolve';
import type { Cable, Device, Id, Infra, Layout, Port, PortRef, WallFeature } from '../model/types';
import { loadSeverity, type Issue } from './issues';

type Strip = Extract<Infra, { kind: 'powerStrip' }>;
type Outlet = Extract<WallFeature, { kind: 'outlet' }>;

export interface PowerLoad {
  cableId: Id;
  portId: Id;
  /** Device name, or "<strip> (strip)" for a downstream strip. */
  name: string;
  watts: number;
}

export interface PowerSourceReport {
  id: Id;
  name: string;
  kind: 'outlet' | 'strip';
  loads: PowerLoad[];
  totalWatts: number;
  maxWatts: number;
  ratio: number;
  receptacles: number;
  used: number;
  blocked: number;
  free: number;
  /** For strips: the outlet or strip this one plugs into. */
  pluggedInto?: Id;
}

export interface PowerReport {
  sources: PowerSourceReport[];
  issues: Issue[];
}

const isPowerPort = (p: Port) => p.type === 'ac' || p.type === 'dc';

type SourceOwner = { kind: 'outlet'; entity: Outlet } | { kind: 'strip'; entity: Strip };

function sourceOf(layout: Layout, ref: PortRef): SourceOwner | undefined {
  const entry = findOwner(layout, ref.ownerId);
  if (!entry) return undefined;
  if (entry.kind === 'feature' && entry.entity.kind === 'outlet') return { kind: 'outlet', entity: entry.entity };
  if (entry.kind === 'infra' && entry.entity.kind === 'powerStrip') {
    // A strip's first port is its own plug, which draws power rather than supplying it.
    if (entry.entity.ports[0]?.id === ref.portId) return undefined;
    return { kind: 'strip', entity: entry.entity };
  }
  return undefined;
}

/** Receptacles (AC ports) a source offers, in physical order. */
function receptaclesOf(src: SourceOwner): Port[] {
  const ports = src.kind === 'strip' ? src.entity.ports.slice(1) : src.entity.ports;
  return ports.filter((p) => p.type === 'ac');
}

interface Connection {
  cable: Cable;
  source: SourceOwner;
  sourcePort: PortRef;
  load: PortRef;
}

function powerConnections(layout: Layout): { connections: Connection[]; issues: Issue[] } {
  const connections: Connection[] = [];
  const issues: Issue[] = [];
  for (const cable of layout.cables) {
    const a = sourceOf(layout, cable.from);
    const b = sourceOf(layout, cable.to);
    if (a && b) {
      issues.push({
        severity: 'error',
        code: 'power.source-to-source',
        message: `"${cable.label || 'Cable'}" connects two power sources together.`,
        refs: [cable.id],
      });
      continue;
    }
    if (a) connections.push({ cable, source: a, sourcePort: cable.from, load: cable.to });
    else if (b) connections.push({ cable, source: b, sourcePort: cable.to, load: cable.from });
  }
  return { connections, issues };
}

/**
 * Power budget per wall outlet and power strip: load vs. rating, receptacle
 * usage (including receptacles blocked by bulky wall-wart bricks), and
 * daisy-chained strips.
 */
export function powerBudget(layout: Layout): PowerReport {
  const { connections, issues } = powerConnections(layout);
  const bySource = new Map<Id, Connection[]>();
  for (const c of connections) bySource.set(c.source.entity.id, [...(bySource.get(c.source.entity.id) ?? []), c]);

  const strips = layout.infra.filter((i): i is Strip => i.kind === 'powerStrip');
  const outlets = layout.features.filter((f): f is Outlet => f.kind === 'outlet');

  const pluggedInto = new Map<Id, Id>();
  for (const c of connections) {
    const loadEntry = findOwner(layout, c.load.ownerId);
    if (loadEntry?.kind === 'infra' && loadEntry.entity.kind === 'powerStrip') {
      pluggedInto.set(loadEntry.entity.id, c.source.entity.id);
      if (c.source.kind === 'strip') {
        issues.push({
          severity: 'warn',
          code: 'power.daisy-chain',
          message: `"${loadEntry.entity.name}" is plugged into another strip ("${c.source.entity.name}"). Daisy-chaining surge protectors is unsafe and voids most warranties.`,
          refs: [loadEntry.entity.id, c.source.entity.id],
        });
      }
    }
  }

  // Total watts drawn through a strip, following chains, with a cycle guard.
  const stripWatts = (id: Id, seen: ReadonlySet<Id>): number => {
    if (seen.has(id)) return 0;
    const next = new Set(seen).add(id);
    return (bySource.get(id) ?? []).reduce((sum, c) => sum + loadWatts(c, next), 0);
  };
  const loadWatts = (c: Connection, seen: ReadonlySet<Id>): number => {
    const entry = findOwner(layout, c.load.ownerId);
    if (!entry) return 0;
    if (entry.kind === 'device') return entry.entity.watts;
    if (entry.kind === 'infra' && entry.entity.kind === 'powerStrip') return stripWatts(entry.entity.id, seen);
    return 0;
  };
  const loadName = (c: Connection): string => {
    const entry = findOwner(layout, c.load.ownerId);
    if (!entry) return 'Unknown';
    return entry.kind === 'infra' ? `${entry.entity.name} (strip)` : entry.entity.name;
  };

  const report = (src: SourceOwner, maxWatts: number): PowerSourceReport => {
    const conns = bySource.get(src.entity.id) ?? [];
    const receptacles = receptaclesOf(src);
    const acConns = conns.filter((c) => receptacles.some((r) => r.id === c.sourcePort.portId));
    const loads = conns.map((c) => ({
      cableId: c.cable.id,
      portId: c.sourcePort.portId,
      name: loadName(c),
      watts: loadWatts(c, new Set([src.entity.id])),
    }));
    const totalWatts = loads.reduce((s, l) => s + l.watts, 0);
    const ratio = maxWatts > 0 ? totalWatts / maxWatts : 0;

    // Receptacle accounting.
    const usedIdx = new Map<number, Connection[]>();
    acConns.forEach((c) => {
      const idx = receptacles.findIndex((r) => r.id === c.sourcePort.portId);
      usedIdx.set(idx, [...(usedIdx.get(idx) ?? []), c]);
    });
    const blockedIdx = new Set<number>();
    for (const [idx, cs] of usedIdx) {
      if (cs.length > 1) {
        issues.push({
          severity: 'error',
          code: 'power.receptacle-double',
          message: `${src.entity.name}: ${cs.length} plugs assigned to the same receptacle.`,
          refs: [src.entity.id, ...cs.map((c) => c.cable.id)],
        });
      }
      for (const c of cs) {
        const dev = findOwner(layout, c.load.ownerId);
        const brick = dev?.kind === 'device' ? (dev.entity as Device).brick : undefined;
        if (brick?.style === 'wallWart' && brick.blocksAdjacent) {
          // Wall warts overhang the neighbor below on outlets and the next one along on strips.
          const neighbor = idx + 1 < receptacles.length ? idx + 1 : idx - 1;
          if (neighbor >= 0) blockedIdx.add(neighbor);
          const clash = usedIdx.get(neighbor);
          if (clash && neighbor !== idx) {
            issues.push({
              severity: 'error',
              code: 'power.brick-blocks',
              message: `${src.entity.name}: the ${dev?.entity.name} brick covers the receptacle used by ${clash.map(loadName).join(', ')}.`,
              refs: [src.entity.id, c.cable.id, ...clash.map((x) => x.cable.id)],
            });
          }
        }
      }
    }
    const used = usedIdx.size;
    const blocked = [...blockedIdx].filter((i) => !usedIdx.has(i)).length;
    const free = receptacles.length - used - blocked;

    const sev = loadSeverity(ratio);
    if (sev) {
      issues.push({
        severity: sev,
        code: sev === 'error' ? 'power.over' : 'power.near',
        message: `${src.entity.name}: ${Math.round(totalWatts)} W of ${maxWatts} W (${Math.round(ratio * 100)}%).`,
        refs: [src.entity.id],
      });
    }
    if (free < 0 || (free === 0 && blocked > 0)) {
      issues.push({
        severity: free < 0 ? 'error' : 'warn',
        code: 'power.receptacles',
        message: `${src.entity.name}: out of receptacles (${used} used, ${blocked} blocked by bricks, ${receptacles.length} total).`,
        refs: [src.entity.id],
      });
    }

    return {
      id: src.entity.id,
      name: src.entity.name,
      kind: src.kind,
      loads,
      totalWatts,
      maxWatts,
      ratio,
      receptacles: receptacles.length,
      used,
      blocked,
      free: Math.max(0, free),
      pluggedInto: src.kind === 'strip' ? pluggedInto.get(src.entity.id) : undefined,
    };
  };

  const sources = [
    ...outlets.map((o) => report({ kind: 'outlet', entity: o }, o.maxWatts)),
    ...strips.map((s) => report({ kind: 'strip', entity: s }, s.maxWatts)),
  ];

  for (const s of strips) {
    if (!pluggedInto.has(s.id)) {
      issues.push({ severity: 'warn', code: 'power.strip-unplugged', message: `${s.name} isn't plugged into anything.`, refs: [s.id] });
    }
  }

  const powered = new Set(connections.map((c) => c.load.ownerId));
  for (const d of layout.devices) {
    if (d.watts > 0 && d.ports.some(isPowerPort) && !powered.has(d.id)) {
      issues.push({ severity: 'info', code: 'power.device-unpowered', message: `${d.name} has no power cable yet.`, refs: [d.id] });
    }
  }

  return { sources, issues };
}
