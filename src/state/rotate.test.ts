import { resolvePort, wallFootprint } from '../geometry/resolve';
import { makePowerStrip, makeSurface } from '../model/factories';
import { emptyLayout, exampleLayout } from '../model/seed';
import type { Infra, Layout } from '../model/types';
import { dragFloorOrWall, WALL_MOUNT_Z } from '../views/shared/snap';
import { canRotate, rotateEntity } from './actions';

describe('rotating', () => {
  const layout = exampleLayout();

  it('turns surfaces and items on desks or the floor by 90° steps, wrapping at 360', () => {
    const desk = layout.surfaces[0]!;
    let l = rotateEntity(desk.id, 90)(layout);
    expect(l.surfaces[0]!.rotation).toBe(90);
    l = rotateEntity(desk.id, -180)(l);
    expect(l.surfaces[0]!.rotation).toBe(270);
    const router = layout.devices.find((d) => d.name === 'Router')!;
    const r = rotateEntity(router.id, 90)(layout).devices.find((d) => d.id === router.id)!;
    expect(r.mount.on === 'floor' && r.mount.rotation).toBe(90);
  });

  it('does not rotate arm-mounted monitors or wall features', () => {
    const monitor = layout.devices.find((d) => d.mount.on === 'arm')!;
    expect(canRotate(layout, monitor.id)).toBe(false);
    expect(rotateEntity(monitor.id, 90)(layout)).toBe(layout);
    const outlet = layout.features[0]!;
    expect(rotateEntity(outlet.id, 90)(layout)).toBe(layout);
  });
});

describe('wall-mounted items', () => {
  const room = emptyLayout(); // 144 x 120; w0 is the north wall
  const strip = makePowerStrip({ on: 'wall', at: { wallId: 'w0', offset: 40, z: 20 } }, 6) as Extract<Infra, { kind: 'powerStrip' }>;
  const layout: Layout = { ...room, infra: [strip] };
  const outletPorts = strip.ports.slice(1);

  it('lays a horizontal strip\'s outlets along the wall at one height', () => {
    const pts = outletPorts.map((p) => resolvePort(layout, { ownerId: strip.id, portId: p.id })!.point);
    expect(new Set(pts.map((p) => p.z.toFixed(3))).size).toBe(1);
    expect(pts[pts.length - 1]!.x - pts[0]!.x).toBeCloseTo(strip.spacing * 5);
  });

  it('stands a strip rotated 90° vertically, bottom kept at the mount height', () => {
    const vertical = rotateEntity(strip.id, 90)(layout);
    const pts = outletPorts.map((p) => resolvePort(vertical, { ownerId: strip.id, portId: p.id })!.point);
    expect(new Set(pts.map((p) => p.x.toFixed(3))).size).toBe(1); // all at one spot along the wall
    const zs = pts.map((p) => p.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(strip.spacing * 5);
    const foot = wallFootprint({ w: strip.size.w, h: strip.size.h }, 90);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...zs)).toBeLessThanOrEqual(20 + foot.h);
    expect(foot.h).toBeCloseTo(strip.size.w);
  });
});

describe('dragging onto and off walls', () => {
  const room = { ...emptyLayout(), surfaces: [makeSurface({ center: { x: 72, y: 60 } })] };
  const floor = { on: 'floor' as const, pos: { x: 72, y: 60 }, rotation: 0 };

  it('mounts a floor item on a wall when dragged close, at outlet height', () => {
    const m = dragFloorOrWall(room, floor, { x: 50, y: 2 }, { x: 50, y: 2 }, 1.1, true);
    expect(m).toMatchObject({ on: 'wall', at: { wallId: 'w0', offset: 50, z: WALL_MOUNT_Z } });
  });

  it('stays on the floor when not close to a wall', () => {
    expect(dragFloorOrWall(room, floor, { x: 50, y: 20 }, { x: 50, y: 20 }, 1.1, true).on).toBe('floor');
  });

  it('keeps a wall item\'s height while sliding along, and drops it to the floor when pulled away', () => {
    const wall = { on: 'wall' as const, at: { wallId: 'w0', offset: 40, z: 30 }, rotation: 90 };
    expect(dragFloorOrWall(room, wall, { x: 60, y: 8 }, { x: 60, y: 8 }, 1.1, true)).toMatchObject({ on: 'wall', at: { offset: 60, z: 30 }, rotation: 90 });
    expect(dragFloorOrWall(room, wall, { x: 60, y: 40 }, { x: 60, y: 40 }, 1.1, true)).toMatchObject({ on: 'floor', rotation: 0 });
    // A plan rotation doesn't turn into a vertical orientation on the wall.
    const turned = { ...floor, rotation: 90 };
    expect(dragFloorOrWall(room, turned, { x: 50, y: 2 }, { x: 50, y: 2 }, 1.1, true)).toMatchObject({ on: 'wall', rotation: 0 });
  });
});
