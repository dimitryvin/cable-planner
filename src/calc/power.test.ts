import { BUILT_IN_PRESETS } from '../model/defaults';
import { deviceFromPreset, makeCable, makeOutlet, makePowerStrip } from '../model/factories';
import { emptyLayout, exampleLayout } from '../model/seed';
import type { Device, Infra, Layout, WallFeature } from '../model/types';
import { powerBudget } from './power';

const floor = { on: 'floor' as const, pos: { x: 10, y: 10 }, rotation: 0 };
const dev = (watts: number, name = `Dev ${watts}`, presetId = 'desk-lamp'): Device => ({
  ...deviceFromPreset(BUILT_IN_PRESETS.find((p) => p.id === presetId)!, floor),
  watts,
  name,
});
const acPort = (o: Device | WallFeature | Infra, n = 0) => {
  const ports = 'ports' in o ? o.ports : [];
  return { ownerId: o.id, portId: ports.filter((p) => p.type === 'ac' || p.type === 'dc')[n]!.id };
};
const plugInto = (load: Device | Infra, loadN: number, src: WallFeature | Infra, srcN: number) =>
  makeCable(acPort(load, loadN), acPort(src, srcN), 'ac', 'ac');

function setup(parts: Partial<Layout>): Layout {
  return { ...emptyLayout(), ...parts };
}

describe('powerBudget', () => {
  it('sums loads through a strip up to the wall outlet', () => {
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 20, z: 12 } });
    const strip = makePowerStrip(floor, 4, 1000);
    const a = dev(300);
    const b = dev(200);
    const r = powerBudget(
      setup({
        features: [outlet],
        infra: [strip],
        devices: [a, b],
        cables: [plugInto(strip, 0, outlet, 0), plugInto(a, 0, strip, 1), plugInto(b, 0, strip, 2)],
      }),
    );
    const s = r.sources.find((x) => x.id === strip.id)!;
    const o = r.sources.find((x) => x.id === outlet.id)!;
    expect(s.totalWatts).toBe(500);
    expect(s.used).toBe(2);
    expect(s.free).toBe(2);
    expect(s.pluggedInto).toBe(outlet.id);
    expect(o.totalWatts).toBe(500);
    expect(r.issues.filter((i) => i.severity !== 'info')).toEqual([]);
  });

  it('warns at 80% and errors at 100%', () => {
    const strip = makePowerStrip(floor, 4, 1000);
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 20, z: 12 } });
    const base = { features: [outlet], infra: [strip] };
    const at = (w: number) =>
      powerBudget(setup({ ...base, devices: [dev(w)], cables: [plugInto(strip, 0, outlet, 0)] }))
        .issues.map((i) => i.code);
    const withLoad = (w: number) => {
      const d = dev(w);
      return powerBudget(setup({ ...base, devices: [d], cables: [plugInto(strip, 0, outlet, 0), plugInto(d, 0, strip, 1)] }))
        .issues.map((i) => i.code);
    };
    expect(at(0)).not.toContain('power.near');
    expect(withLoad(799)).not.toContain('power.near');
    expect(withLoad(800)).toContain('power.near');
    expect(withLoad(1000)).toContain('power.over');
  });

  it('flags a wall-wart brick blocking the neighboring receptacle', () => {
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 20, z: 12 } }, 2);
    const router = dev(15, 'Router', 'router'); // wall wart that blocks adjacent
    const lamp = dev(10, 'Lamp');
    const r = powerBudget(
      setup({ features: [outlet], devices: [router, lamp], cables: [plugInto(router, 0, outlet, 0), plugInto(lamp, 0, outlet, 1)] }),
    );
    expect(r.issues.map((i) => i.code)).toContain('power.brick-blocks');
  });

  it('reports running out of receptacles when a brick blocks the last one', () => {
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 20, z: 12 } }, 2);
    const router = dev(15, 'Router', 'router');
    const r = powerBudget(setup({ features: [outlet], devices: [router], cables: [plugInto(router, 0, outlet, 0)] }));
    const o = r.sources[0]!;
    expect(o).toMatchObject({ used: 1, blocked: 1, free: 0 });
    expect(r.issues.map((i) => i.code)).toContain('power.receptacles');
  });

  it('warns about daisy-chained strips and unplugged strips', () => {
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 20, z: 12 } });
    const s1 = makePowerStrip(floor);
    const s2 = makePowerStrip(floor);
    const s3 = makePowerStrip(floor);
    const r = powerBudget(setup({ features: [outlet], infra: [s1, s2, s3], cables: [plugInto(s1, 0, outlet, 0), plugInto(s2, 0, s1, 1)] }));
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('power.daisy-chain');
    expect(r.issues.filter((i) => i.code === 'power.strip-unplugged').map((i) => i.refs[0])).toEqual([s3.id]);
  });

  it('survives a strip plugged into itself', () => {
    const s1 = makePowerStrip(floor);
    const r = powerBudget(setup({ infra: [s1], cables: [plugInto(s1, 0, s1, 1)] }));
    expect(r.sources[0]!.totalWatts).toBe(0);
  });

  it('computes the example layout without errors', () => {
    const r = powerBudget(exampleLayout());
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const strip = r.sources.find((s) => s.kind === 'strip')!;
    expect(strip.totalWatts).toBe(60 + 65 + 120 + 40);
  });
});
