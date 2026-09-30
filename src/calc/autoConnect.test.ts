import { findPort } from '../geometry/resolve';
import { exampleLayout, emptyLayout } from '../model/seed';
import { deviceFromPreset, makeOutlet } from '../model/factories';
import { BUILT_IN_PRESETS } from '../model/defaults';
import type { Cable, Layout } from '../model/types';
import { allConnectable, autoConnect } from './autoConnect';
import { powerBudget } from './power';

const preset = (id: string) => BUILT_IN_PRESETS.find((p) => p.id === id)!;
const byName = (l: Layout, name: string) => l.devices.find((d) => d.name === name)!;
const cablesOf = (l: Layout, id: string) => l.cables.filter((c) => c.from.ownerId === id || c.to.ownerId === id);
const other = (c: Cable, id: string) => (c.from.ownerId === id ? c.to : c.from);
const mine = (c: Cable, id: string) => (c.from.ownerId === id ? c.from : c.to);

describe('autoConnect', () => {
  // The example office with every cable removed: all the gear, nothing wired.
  const bare: Layout = { ...exampleLayout(), cables: [] };
  const result = autoConnect(bare, allConnectable(bare));
  const l = result.layout;

  it('powers every device that has a power port', () => {
    for (const d of l.devices.filter((x) => x.ports.some((p) => p.type === 'ac' || p.type === 'dc'))) {
      const powered = cablesOf(l, d.id).some((c) => ['ac', 'dc'].includes(findPort(l, mine(c, d.id))!.port.type));
      expect(powered, d.name).toBe(true);
    }
  });

  it('plugs the power strip into a wall outlet with its attached cord', () => {
    const strip = l.infra.find((i) => i.kind === 'powerStrip')!;
    const cord = cablesOf(l, strip.id).find((c) => mine(c, strip.id).portId === (strip.kind === 'powerStrip' && strip.ports[0]!.id))!;
    expect(l.features.find((f) => f.id === other(cord, strip.id).ownerId)?.kind).toBe('outlet');
    expect(cord.fixedLength).toBe(72);
    expect(cord.source).toBe('included');
  });

  it('prefers the strip on the same desk for desk devices', () => {
    const strip = l.infra.find((i) => i.kind === 'powerStrip')!;
    const mini = byName(l, 'Mac mini');
    expect(cablesOf(l, mini.id).some((c) => other(c, mini.id).ownerId === strip.id)).toBe(true);
  });

  it('wires video, dock, USB/audio and network by device type', () => {
    const monitor = byName(l, '34" ultrawide');
    const mini = byName(l, 'Mac mini');
    const dock = byName(l, 'Thunderbolt dock');
    const laptop = byName(l, 'Laptop');
    const speakers = byName(l, 'Powered speakers (pair)');
    const router = byName(l, 'Router');
    const jack = l.features.find((f) => f.kind === 'ethernetJack')!;

    const linkTo = (a: string, b: string) => cablesOf(l, a).find((c) => other(c, a).ownerId === b);
    expect(linkTo(monitor.id, mini.id)).toBeDefined();
    const laptopDock = linkTo(laptop.id, dock.id)!;
    expect(findPort(l, other(laptopDock, laptop.id))!.port.label).toBe('Host');
    expect(linkTo(speakers.id, dock.id)).toBeDefined();
    const wan = linkTo(router.id, jack.id)!;
    expect(findPort(l, mine(wan, router.id))!.port.label).toBe('WAN');
    const dockNet = linkTo(dock.id, router.id)!;
    expect(findPort(l, other(dockNet, dock.id))!.port.label).not.toBe('WAN');
  });

  it('never uses a port twice and stays within power ratings', () => {
    const keys = l.cables.flatMap((c) => [`${c.from.ownerId}:${c.from.portId}`, `${c.to.ownerId}:${c.to.portId}`]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(powerBudget(l).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('is idempotent', () => {
    const again = autoConnect(l, allConnectable(l));
    expect(again.added).toEqual([]);
  });

  it('connects only the selected item', () => {
    const lamp = byName(bare, 'Desk lamp');
    const r = autoConnect(bare, [lamp.id]);
    expect(r.added).toHaveLength(1);
    expect(r.connected[0]).toBe('Desk lamp power');
  });

  it('explains what it could not connect', () => {
    const room = emptyLayout();
    const monitor = deviceFromPreset(preset('monitor-27'), { on: 'floor', pos: { x: 20, y: 20 }, rotation: 0 });
    const r1 = autoConnect({ ...room, devices: [monitor] }, [monitor.id]);
    expect(r1.added).toEqual([]);
    expect(r1.unresolved.map((u) => u.message)).toEqual([
      '27" monitor: no outlets or power strips to plug into.',
      '27" monitor video input: no computer or dock or laptop in the layout.',
    ]);

    // One duplex outlet, three lamps: two get power, the third is reported.
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 20, z: 12 } });
    const lamps = [1, 2, 3].map((n) => ({ ...deviceFromPreset(preset('desk-lamp'), { on: 'floor', pos: { x: 10 * n, y: 10 }, rotation: 0 }), name: `Lamp ${n}` }));
    const r2 = autoConnect({ ...room, features: [outlet], devices: lamps }, lamps.map((x) => x.id));
    expect(r2.added).toHaveLength(2);
    expect(r2.unresolved).toHaveLength(1);
    expect(r2.unresolved[0]!.message).toMatch(/no free receptacle/);
  });

  it('keeps wall-wart bricks from blocking a used receptacle', () => {
    const room = emptyLayout();
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 20, z: 12 } });
    const router = deviceFromPreset(preset('router'), { on: 'floor', pos: { x: 20, y: 5 }, rotation: 0 });
    const lamp = deviceFromPreset(preset('desk-lamp'), { on: 'floor', pos: { x: 25, y: 5 }, rotation: 0 });
    const r = autoConnect({ ...room, features: [outlet], devices: [lamp, router] }, [lamp.id, router.id]);
    // The router's brick covers the other half of the duplex, so only one of the two can be plugged in.
    expect(r.added).toHaveLength(1);
    const power = r.unresolved.filter((u) => /receptacle/.test(u.message));
    expect(power).toHaveLength(1);
    expect(r.unresolved.some((u) => /WAN\): no Ethernet jack/.test(u.message))).toBe(true);
    expect(powerBudget(r.layout).issues.map((i) => i.code)).not.toContain('power.brick-blocks');
  });
});
