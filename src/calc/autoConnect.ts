import { findOwner, resolvePort } from '../geometry/resolve';
import { dist3 } from '../geometry/vec';
import { makeCable } from '../model/factories';
import type { Cable, Device, DeviceRole, Id, Infra, Layout, Port, PortRef, PortType, Vec3, WallFeature } from '../model/types';
import { powerBudget } from './power';
import { roleOf } from './roles';
import { COMPATIBLE } from './warnings';

type Strip = Extract<Infra, { kind: 'powerStrip' }>;
type Target = DeviceRole | 'jack';

/** Something a device needs connected. */
type Need =
  | { kind: 'power' }
  | {
      kind: 'link';
      what: string;
      mine: readonly PortType[];
      targets: readonly Target[];
      theirs: readonly PortType[];
      /** Only use the device's first port of these types (e.g. a router's WAN). */
      firstPortOnly?: boolean;
      /** Skip silently when no device of a target type exists (e.g. laptop with no dock). */
      optional?: boolean;
    };

const VIDEO: readonly PortType[] = ['thunderbolt', 'usb-c', 'dp', 'hdmi'];
const USB: readonly PortType[] = ['usb-c', 'usb-a', 'thunderbolt'];

export function needsFor(role: DeviceRole, d: Device, hasLaptop: boolean): Need[] {
  const has = (t: PortType) => d.ports.some((p) => p.type === t);
  const power: Need[] = d.ports.some((p) => p.type === 'ac' || p.type === 'dc') ? [{ kind: 'power' }] : [];
  const ethernet = (targets: readonly Target[]): Need[] =>
    has('ethernet') ? [{ kind: 'link', what: 'network', mine: ['ethernet'], targets, theirs: ['ethernet'], optional: true }] : [];

  switch (role) {
    case 'display':
      return [...power, { kind: 'link', what: 'video input', mine: VIDEO, targets: ['computer', 'dock', 'laptop'], theirs: VIDEO }];
    case 'computer':
      return [
        ...power,
        ...ethernet(['network', 'jack']),
        ...(hasLaptop ? [] : [{ kind: 'link' as const, what: 'dock', mine: ['thunderbolt', 'usb-c'] as PortType[], targets: ['dock'] as Target[], theirs: ['thunderbolt', 'usb-c'] as PortType[], optional: true }]),
      ];
    case 'laptop':
      return [...power, { kind: 'link', what: 'dock', mine: ['usb-c', 'thunderbolt'], targets: ['dock'], theirs: ['thunderbolt', 'usb-c'], optional: true }];
    case 'dock':
      return [...power, ...ethernet(['network', 'jack'])];
    case 'peripheral':
      return [...power, { kind: 'link', what: 'USB', mine: USB, targets: ['dock', 'computer', 'laptop'], theirs: USB }];
    case 'audio':
      return [...power, ...(has('3.5mm') ? [{ kind: 'link' as const, what: 'audio input', mine: ['3.5mm'] as PortType[], targets: ['dock', 'computer', 'laptop'] as Target[], theirs: ['3.5mm'] as PortType[] }] : [])];
    case 'network':
      return [...power, ...(has('ethernet') ? [{ kind: 'link' as const, what: 'internet (WAN)', mine: ['ethernet'] as PortType[], targets: ['jack'] as Target[], theirs: ['ethernet'] as PortType[], firstPortOnly: true }] : [])];
    case 'storage':
      return [...power, ...ethernet(['network', 'dock', 'computer'])];
    case 'appliance':
    case 'other':
      return power;
  }
}

export interface AutoConnectResult {
  layout: Layout;
  added: Id[];
  /** One line per connection made. */
  connected: string[];
  /** One line per need that couldn't be met, with the reason. */
  unresolved: { ownerId: Id; message: string }[];
}

const key = (r: PortRef) => `${r.ownerId}:${r.portId}`;
const INPUT_LABEL = /\b(host|in|input|upstream)\b/i;

function usedPorts(layout: Layout): Set<string> {
  return new Set(layout.cables.flatMap((c) => [key(c.from), key(c.to)]));
}

const compatible = (a: PortType, b: PortType) => a === b || COMPATIBLE.some((g) => g.includes(a) && g.includes(b));

/** Lower is better: same connector, then USB-C ↔ Thunderbolt, then anything needing an adapter cable. */
function typeRank(a: PortType, b: PortType): number {
  if (a === b) return 0;
  if ((a === 'usb-c' && b === 'thunderbolt') || (a === 'thunderbolt' && b === 'usb-c')) return 1;
  return 2;
}

interface Ctx {
  layout: Layout;
  added: Id[];
  connected: string[];
  unresolved: { ownerId: Id; message: string }[];
}

function addCable(ctx: Ctx, a: PortRef, aType: PortType, b: PortRef, bType: PortType, label: string, extra: Partial<Cable> = {}): void {
  const cable = { ...makeCable(a, b, aType, bType, label), ...extra };
  ctx.layout = { ...ctx.layout, cables: [...ctx.layout.cables, cable] };
  ctx.added.push(cable.id);
  ctx.connected.push(label);
}

/** Lexicographic comparison of score tuples. */
function lessThan(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

const pointOf = (layout: Layout, ref: PortRef): Vec3 | undefined => resolvePort(layout, ref)?.point;

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

interface Receptacle {
  ref: PortRef;
  point: Vec3;
  source: { kind: 'strip'; entity: Strip } | { kind: 'outlet'; entity: Extract<WallFeature, { kind: 'outlet' }> };
  neighbor?: PortRef;
}

function receptacles(layout: Layout, includeStrips: boolean): Receptacle[] {
  const out: Receptacle[] = [];
  const push = (source: Receptacle['source'], ports: Port[]) => {
    const acs = ports.filter((p) => p.type === 'ac');
    acs.forEach((p, i) => {
      const ref = { ownerId: source.entity.id, portId: p.id };
      const point = pointOf(layout, ref);
      const n = acs[i + 1 < acs.length ? i + 1 : i - 1];
      if (point) out.push({ ref, point, source, neighbor: n && n.id !== p.id ? { ownerId: source.entity.id, portId: n.id } : undefined });
    });
  };
  for (const f of layout.features) if (f.kind === 'outlet') push({ kind: 'outlet', entity: f }, f.ports);
  if (includeStrips) for (const i of layout.infra) if (i.kind === 'powerStrip') push({ kind: 'strip', entity: i }, i.ports.slice(1));
  return out;
}

/** Receptacles covered by wall-wart bricks already plugged in. */
function blockedPorts(layout: Layout): Set<string> {
  const blocked = new Set<string>();
  const all = receptacles(layout, true);
  for (const c of layout.cables) {
    for (const [load, src] of [[c.from, c.to], [c.to, c.from]] as const) {
      const dev = layout.devices.find((d) => d.id === load.ownerId);
      if (dev?.brick?.style !== 'wallWart' || !dev.brick.blocksAdjacent) continue;
      const r = all.find((x) => key(x.ref) === key(src));
      if (r?.neighbor) blocked.add(key(r.neighbor));
    }
  }
  return blocked;
}

function connectPower(ctx: Ctx, owner: Device | Strip, deviceWatts: number): void {
  let watts = deviceWatts;
  const isStrip = 'kind' in owner && owner.kind === 'powerStrip';
  const myPort = isStrip ? owner.ports[0] : owner.ports.find((p) => p.type === 'ac' || p.type === 'dc');
  if (!myPort) return;
  const used = usedPorts(ctx.layout);
  const myRef = { ownerId: owner.id, portId: myPort.id };
  if (used.has(key(myRef))) return;
  const from = pointOf(ctx.layout, myRef);
  if (!from) return;

  const blocked = blockedPorts(ctx.layout);
  const budget = new Map(powerBudget(ctx.layout).sources.map((s) => [s.id, s]));
  // A strip brings along everything already plugged into it.
  if (isStrip) watts = budget.get(owner.id)?.totalWatts ?? 0;
  const brickBlocks = !isStrip && (owner as Device).brick?.style === 'wallWart' && (owner as Device).brick!.blocksAdjacent;
  const mySurface = resolvePort(ctx.layout, myRef)?.surfaceId;
  // Strips only plug into wall outlets (never daisy-chained).
  const candidates = receptacles(ctx.layout, !isStrip).filter((r) => r.source.entity.id !== owner.id);

  if (candidates.length === 0) {
    ctx.unresolved.push({ ownerId: owner.id, message: `${owner.name}: no ${isStrip ? 'wall outlets' : 'outlets or power strips'} to plug into.` });
    return;
  }

  let best: { r: Receptacle; score: number } | undefined;
  let sawFree = false;
  for (const r of candidates) {
    if (used.has(key(r.ref)) || blocked.has(key(r.ref))) continue;
    if (brickBlocks && r.neighbor && used.has(key(r.neighbor))) continue;
    sawFree = true;
    const src = budget.get(r.source.entity.id);
    const after = src ? (src.totalWatts + watts) / Math.max(1, src.maxWatts) : 0;
    const upstream = r.source.kind === 'strip' && src?.pluggedInto ? budget.get(src.pluggedInto) : undefined;
    const upAfter = upstream ? (upstream.totalWatts + watts) / Math.max(1, upstream.maxWatts) : 0;
    if (after >= 1 || upAfter >= 1) continue;
    const onSameSurface = mySurface !== undefined && resolvePort(ctx.layout, r.ref)?.surfaceId === mySurface;
    let score = dist3(from, r.point) * (r.source.kind === 'strip' ? 1 : 1.5) * (onSameSurface ? 0.5 : 1);
    if (after >= 0.8 || upAfter >= 0.8) score += 1000;
    // Wall warts go on an end receptacle where they block nothing, when possible.
    if (brickBlocks && r.neighbor) score += 5;
    if (!best || score < best.score) best = { r, score };
  }

  if (!best) {
    ctx.unresolved.push({
      ownerId: owner.id,
      message: sawFree
        ? `${owner.name}: every free receptacle would be overloaded (${Math.round(watts)} W).`
        : `${owner.name}: no free receptacle${brickBlocks ? ' with room for its wall-wart brick' : ''}.`,
    });
    return;
  }
  const label = isStrip ? `${owner.name} cord` : `${owner.name} power`;
  const extra: Partial<Cable> = isStrip ? { fixedLength: (owner as Strip).cordLength, source: 'included' } : {};
  addCable(ctx, myRef, myPort.type, best.r.ref, 'ac', label, extra);
}

// ---------------------------------------------------------------------------
// Data / video links
// ---------------------------------------------------------------------------

interface Peer {
  id: Id;
  name: string;
  role: Target;
  ports: Port[];
}

function peers(layout: Layout): Peer[] {
  return [
    ...layout.devices.map((d) => ({ id: d.id, name: d.name, role: roleOf(layout, d) as Target, ports: d.ports })),
    ...layout.features.flatMap((f) => (f.kind === 'ethernetJack' ? [{ id: f.id, name: f.name, role: 'jack' as Target, ports: f.ports }] : [])),
  ];
}

function linkSatisfied(layout: Layout, d: Device, need: Extract<Need, { kind: 'link' }>, all: readonly Peer[]): boolean {
  const byId = new Map(all.map((p) => [p.id, p]));
  return layout.cables.some((c) => {
    const [mine, other] = c.from.ownerId === d.id ? [c.from, c.to] : c.to.ownerId === d.id ? [c.to, c.from] : [undefined, undefined];
    if (!mine || !other) return false;
    const t = d.ports.find((p) => p.id === mine.portId)?.type;
    const peer = byId.get(other.ownerId);
    return !!t && need.mine.includes(t) && !!peer && need.targets.includes(peer.role);
  });
}

/** A router's first Ethernet port is its WAN; don't offer it as a LAN port. */
function offeredPorts(peer: Peer): Port[] {
  if (peer.role !== 'network') return peer.ports;
  const wan = peer.ports.find((p) => p.type === 'ethernet');
  return peer.ports.filter((p) => p !== wan);
}

function connectLink(ctx: Ctx, d: Device, need: Extract<Need, { kind: 'link' }>): void {
  const all = peers(ctx.layout).filter((p) => p.id !== d.id);
  if (linkSatisfied(ctx.layout, d, need, all)) return;
  const targetsPresent = all.filter((p) => need.targets.includes(p.role));
  if (targetsPresent.length === 0) {
    if (!need.optional) {
      const names = need.targets.map((t) => (t === 'jack' ? 'Ethernet jack' : t)).join(' or ');
      ctx.unresolved.push({ ownerId: d.id, message: `${d.name} ${need.what}: no ${names} in the layout.` });
    }
    return;
  }

  const used = usedPorts(ctx.layout);
  let mine = d.ports.filter((p) => need.mine.includes(p.type));
  if (need.firstPortOnly) mine = mine.slice(0, 1);
  mine = mine.filter((p) => !used.has(key({ ownerId: d.id, portId: p.id })));
  if (mine.length === 0) {
    ctx.unresolved.push({ ownerId: d.id, message: `${d.name} ${need.what}: all its ${need.mine.join('/')} ports are already in use.` });
    return;
  }

  // Devices that take a "host" connection (laptops/computers into a dock) should land on the dock's host port.
  const wantsHost = need.what === 'dock';
  let best: { a: Port; peer: Peer; b: Port; score: [number, number, number, number] } | undefined;
  for (const a of mine) {
    const pa = pointOf(ctx.layout, { ownerId: d.id, portId: a.id });
    if (!pa) continue;
    for (const peer of targetsPresent) {
      for (const b of offeredPorts(peer)) {
        if (!need.theirs.includes(b.type) || !compatible(a.type, b.type)) continue;
        if (used.has(key({ ownerId: peer.id, portId: b.id }))) continue;
        const pb = pointOf(ctx.layout, { ownerId: peer.id, portId: b.id });
        if (!pb) continue;
        // Host/input ports are reserved for the laptop or computer that drives the dock; everything
        // else avoids them even if that means a less exact connector match.
        const hostFit = INPUT_LABEL.test(b.label) === wantsHost ? 0 : 1;
        const score: [number, number, number, number] = [need.targets.indexOf(peer.role), hostFit, typeRank(a.type, b.type), dist3(pa, pb)];
        if (!best || lessThan(score, best.score)) best = { a, peer, b, score };
      }
    }
  }
  if (!best) {
    const names = [...new Set(targetsPresent.map((p) => p.name))].join(', ');
    ctx.unresolved.push({ ownerId: d.id, message: `${d.name} ${need.what}: no free compatible port on ${names}.` });
    return;
  }
  addCable(ctx, { ownerId: d.id, portId: best.a.id }, best.a.type, { ownerId: best.peer.id, portId: best.b.id }, best.b.type, `${d.name} → ${best.peer.name}`);
}

const ORDER: DeviceRole[] = ['dock', 'computer', 'laptop', 'display', 'storage', 'network', 'audio', 'peripheral', 'appliance', 'other'];

/**
 * Adds the cables that the given devices/strips need: power to the best free
 * receptacle within ratings, and data/video links chosen by device role.
 * Anything it can't satisfy is reported with a reason. Pure: returns a new layout.
 */
export function autoConnect(layout: Layout, ids: readonly Id[]): AutoConnectResult {
  const ctx: Ctx = { layout, added: [], connected: [], unresolved: [] };
  const wanted = new Set(ids);
  const hasLaptop = layout.devices.some((d) => roleOf(layout, d) === 'laptop');

  // Strips first so devices can plug into them (their load is read from the layout).
  for (const s of layout.infra) {
    if (s.kind === 'powerStrip' && wanted.has(s.id)) connectPower(ctx, s, 0);
  }
  const devices = layout.devices
    .filter((d) => wanted.has(d.id))
    .sort((a, b) => ORDER.indexOf(roleOf(layout, a)) - ORDER.indexOf(roleOf(layout, b)));
  for (const d of devices) {
    for (const need of needsFor(roleOf(layout, d), d, hasLaptop)) {
      const current = ctx.layout.devices.find((x) => x.id === d.id) ?? d;
      if (need.kind === 'power') connectPower(ctx, current, current.watts);
      else connectLink(ctx, current, need);
    }
  }
  const skipped = ids.filter((id) => {
    const o = findOwner(layout, id);
    return o?.kind === 'infra' && o.entity.kind !== 'powerStrip';
  });
  for (const id of skipped) {
    const o = findOwner(layout, id);
    if (o && wanted.size === 1) ctx.unresolved.push({ ownerId: id, message: `${o.entity.name} has no ports to connect; route cables through it with waypoints.` });
  }

  return { layout: ctx.layout, added: ctx.added, connected: ctx.connected, unresolved: ctx.unresolved };
}

/** Everything that can be auto-connected: all devices and power strips. */
export const allConnectable = (layout: Layout): Id[] => [
  ...layout.infra.filter((i) => i.kind === 'powerStrip').map((i) => i.id),
  ...layout.devices.map((d) => d.id),
];

