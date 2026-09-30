import { newId } from '../model/ids';
import type { Cable, Device, Id, Infra, Layout, Port, Surface, WallFeature, Waypoint } from '../model/types';

export type EntityKind = 'feature' | 'surface' | 'device' | 'infra' | 'cable';

export interface Selection {
  kind: EntityKind | 'room';
  id: Id;
}

type EntityOf<K extends EntityKind> = K extends 'feature'
  ? WallFeature
  : K extends 'surface'
    ? Surface
    : K extends 'device'
      ? Device
      : K extends 'infra'
        ? Infra
        : Cable;

const LIST: { [K in EntityKind]: 'features' | 'surfaces' | 'devices' | 'infra' | 'cables' } = {
  feature: 'features',
  surface: 'surfaces',
  device: 'devices',
  infra: 'infra',
  cable: 'cables',
};

export function getEntity<K extends EntityKind>(layout: Layout, kind: K, id: Id): EntityOf<K> | undefined {
  return (layout[LIST[kind]] as { id: Id }[]).find((e) => e.id === id) as EntityOf<K> | undefined;
}

export function kindOf(layout: Layout, id: Id): EntityKind | undefined {
  return (Object.keys(LIST) as EntityKind[]).find((k) => getEntity(layout, k, id));
}

export function addEntity<K extends EntityKind>(kind: K, entity: EntityOf<K>) {
  return (l: Layout): Layout => ({ ...l, [LIST[kind]]: [...(l[LIST[kind]] as unknown[]), entity] });
}

export function updateEntity<K extends EntityKind>(kind: K, id: Id, fn: (e: EntityOf<K>) => EntityOf<K>) {
  return (l: Layout): Layout => {
    const list = l[LIST[kind]] as EntityOf<K>[];
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return l;
    const next = fn(list[idx]!);
    if (next === list[idx]) return l;
    return { ...l, [LIST[kind]]: list.map((e, i) => (i === idx ? next : e)) };
  };
}

/** Everything whose position depends on a surface or arm. */
function dependents(l: Layout, id: Id): Id[] {
  const onIt = (m: { on: string; surfaceId?: Id; armId?: Id }) => m.surfaceId === id || m.armId === id;
  return [
    ...l.devices.filter((d) => onIt(d.mount as never)).map((d) => d.id),
    ...l.infra.filter((i) => onIt(i.mount as never)).map((i) => i.id),
  ];
}

const waypointUses = (wp: Waypoint, ids: ReadonlySet<Id>): boolean =>
  (wp.kind === 'anchor' && ids.has(wp.infraId)) ||
  (wp.kind === 'grommet' && ids.has(wp.surfaceId)) ||
  (wp.kind === 'free' && wp.frame === 'surface' && ids.has(wp.surfaceId));

/**
 * Deletes an entity and everything that can't exist without it: items mounted
 * on a deleted surface/arm, cables to deleted ports, and waypoints anchored to
 * deleted things.
 */
export function removeEntity(id: Id) {
  return (l: Layout): Layout => {
    const doomed = new Set<Id>([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const d of [...doomed].flatMap((x) => dependents(l, x))) {
        if (!doomed.has(d)) {
          doomed.add(d);
          grew = true;
        }
      }
    }
    return {
      ...l,
      features: l.features.filter((f) => !doomed.has(f.id)),
      surfaces: l.surfaces.filter((s) => !doomed.has(s.id)),
      devices: l.devices.filter((d) => !doomed.has(d.id)),
      infra: l.infra.filter((i) => !doomed.has(i.id)),
      cables: l.cables
        .filter((c) => !doomed.has(c.id) && !doomed.has(c.from.ownerId) && !doomed.has(c.to.ownerId))
        .map((c) => (c.waypoints.some((w) => waypointUses(w, doomed)) ? { ...c, waypoints: c.waypoints.filter((w) => !waypointUses(w, doomed)) } : c)),
    };
  };
}

/** Removes a port and any cable plugged into it. */
export function removePort(ownerId: Id, portId: Id) {
  return (l: Layout): Layout => {
    const strip = (ports: Port[]) => ports.filter((p) => p.id !== portId);
    const hit = (c: Cable) => (c.from.ownerId === ownerId && c.from.portId === portId) || (c.to.ownerId === ownerId && c.to.portId === portId);
    return {
      ...l,
      devices: l.devices.map((d) => (d.id === ownerId ? { ...d, ports: strip(d.ports) } : d)),
      features: l.features.map((f) => (f.id === ownerId ? { ...f, ports: strip(f.ports) } : f)),
      infra: l.infra.map((i) => (i.id === ownerId && i.kind === 'powerStrip' ? { ...i, ports: strip(i.ports) } : i)),
      cables: l.cables.filter((c) => !hit(c)),
    };
  };
}

const OFFSET = 3;

function nudge<T extends { mount?: unknown; center?: { x: number; y: number } }>(e: T): T {
  if (e.center) return { ...e, center: { x: e.center.x + OFFSET, y: e.center.y + OFFSET } };
  const m = e.mount as { on: string; pos?: { x: number; y: number }; u?: number; v?: number; at?: { offset: number } } | undefined;
  if (!m) return e;
  if (m.pos) return { ...e, mount: { ...m, pos: { x: m.pos.x + OFFSET, y: m.pos.y + OFFSET } } };
  if (m.u !== undefined && m.v !== undefined) return { ...e, mount: { ...m, u: m.u + OFFSET, v: m.v + OFFSET } };
  if (m.at) return { ...e, mount: { ...m, at: { ...m.at, offset: m.at.offset + OFFSET } } };
  return e;
}

const freshPorts = (ports: Port[]): Port[] => ports.map((p) => ({ ...p, id: newId('p') }));

/** Copies an entity (not its cables) with new ids, nudged so it's visible. Returns the new id. */
export function duplicateEntity(layout: Layout, id: Id): { layout: Layout; newId?: Id } {
  const kind = kindOf(layout, id);
  if (!kind) return { layout };
  const nid = newId(kind.slice(0, 3));
  switch (kind) {
    case 'device': {
      const d = getEntity(layout, 'device', id)!;
      return { layout: addEntity('device', { ...nudge(d), id: nid, name: `${d.name} copy`, ports: freshPorts(d.ports) })(layout), newId: nid };
    }
    case 'infra': {
      const i = getEntity(layout, 'infra', id)!;
      const copy = { ...nudge(i), id: nid, name: `${i.name} copy` } as Infra;
      if (copy.kind === 'powerStrip') copy.ports = freshPorts(copy.ports);
      return { layout: addEntity('infra', copy)(layout), newId: nid };
    }
    case 'surface': {
      const s = getEntity(layout, 'surface', id)!;
      const copy: Surface = {
        ...nudge(s),
        id: nid,
        name: `${s.name} copy`,
        grommets: s.grommets.map((g) => ({ ...g, id: newId('gr') })),
        beams: s.beams.map((b) => ({ ...b, id: newId('bm') })),
        drawers: s.drawers.map((d) => ({ ...d, id: newId('dr') })),
      };
      return { layout: addEntity('surface', copy)(layout), newId: nid };
    }
    case 'feature': {
      const f = getEntity(layout, 'feature', id)!;
      const shift = (at: { offset: number }) => ({ ...at, offset: at.offset + OFFSET });
      const copy = (
        f.kind === 'obstacle'
          ? { ...f, at: shift(f.at) }
          : { ...f, placement: f.placement.on === 'wall' ? { ...f.placement, at: shift(f.placement.at) } : f.placement }
      ) as WallFeature;
      return { layout: addEntity('feature', { ...copy, id: nid, name: `${f.name} copy`, ports: freshPorts(f.ports) } as WallFeature)(layout), newId: nid };
    }
    case 'cable':
      return { layout };
  }
}

const norm = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/**
 * Rotates a surface, device or piece of gear by `delta` degrees: surfaces and
 * items on a surface or the floor turn in plan; wall-mounted items turn within
 * the wall (e.g. a power strip from horizontal to vertical). Items on a monitor
 * arm and wall features (outlets, windows) don't rotate.
 */
export function rotateEntity(id: Id, delta: number) {
  return (l: Layout): Layout => {
    const kind = kindOf(l, id);
    if (kind === 'surface') return updateEntity('surface', id, (s) => ({ ...s, rotation: norm(s.rotation + delta) }))(l);
    if (kind !== 'device' && kind !== 'infra') return l;
    if (!canRotate(l, id)) return l;
    const turn = <T extends { mount: Device['mount'] }>(e: T): T => {
      const m = e.mount;
      if (m.on === 'arm') return e;
      return { ...e, mount: { ...m, rotation: norm((m.rotation ?? 0) + delta) } };
    };
    return kind === 'device' ? updateEntity('device', id, turn)(l) : updateEntity('infra', id, (i) => turn(i) as Infra)(l);
  };
}

export const canRotate = (l: Layout, id: Id): boolean => {
  const kind = kindOf(l, id);
  if (kind === 'surface') return true;
  if (kind === 'device') return getEntity(l, 'device', id)!.mount.on !== 'arm';
  if (kind === 'infra') {
    const i = getEntity(l, 'infra', id)!;
    // Raceways are laid out with their own horizontal/vertical Direction.
    return i.mount.on !== 'arm' && i.kind !== 'raceway';
  }
  return false;
};
