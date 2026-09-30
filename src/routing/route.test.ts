import { dist3 } from '../geometry/vec';
import { deviceFromPreset, makeCable, makeOutlet, makeSurface } from '../model/factories';
import { BUILT_IN_PRESETS } from '../model/defaults';
import { emptyLayout, exampleLayout } from '../model/seed';
import type { Layout } from '../model/types';
import { beamHits, buildNetwork, dipUnderBeams, routeCable, type Route } from './route';

const preset = (id: string) => BUILT_IN_PRESETS.find((p) => p.id === id)!;
const lengthBy = (r: Route, support: string) =>
  r.segments.filter((s) => s.support === support).reduce((t, s) => t + dist3(s.a, s.b), 0);

function routeAll(layout: Layout) {
  const network = buildNetwork(layout);
  return new Map(layout.cables.map((c) => [c.label, routeCable(layout, c, network)]));
}

describe('auto routing', () => {
  it('routes every cable in the example layout', () => {
    for (const [label, r] of routeAll(exampleLayout())) expect(r.ok, `${label}: ${r.error}`).toBe(true);
  });

  it('never passes through another port', () => {
    const layout = exampleLayout();
    const routes = routeAll(layout);
    const outlet = layout.features.find((f) => f.name === 'North outlet')!;
    const r = routes.get('Dock → router')!;
    // The north outlet sits at x=30 on the north wall; no interior route point may coincide with its receptacles.
    const interior = r.points.slice(1, -1);
    expect(interior.some((p) => Math.abs(p.x - 30) < 0.01 && p.y < 0.01)).toBe(false);
    expect(outlet).toBeDefined();
  });

  it('sends desk-top devices through a grommet rather than over the desk', () => {
    const r = routeAll(exampleLayout()).get('Mac mini power')!;
    expect(r.segments.some((s) => s.container?.startsWith('grommet'))).toBe(true);
    expect(r.segments.some((s) => s.container?.startsWith('tray'))).toBe(true);
  });

  it('hugs walls instead of crossing open floor', () => {
    const layout = emptyLayout();
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w1', offset: 100, z: 12 } }); // east wall, near SE
    const nas = deviceFromPreset(preset('nas'), { on: 'floor', pos: { x: 10, y: 10 }, rotation: 0 }); // NW corner
    const cable = makeCable({ ownerId: nas.id, portId: nas.ports[0]!.id }, { ownerId: outlet.id, portId: outlet.ports[0]!.id }, 'dc', 'ac');
    const withAll: Layout = { ...layout, features: [outlet], devices: [nas], cables: [cable] };
    const r = routeCable(withAll, cable, buildNetwork(withAll));
    expect(r.ok).toBe(true);
    expect(lengthBy(r, 'floor')).toBeLessThan(15);
    expect(lengthBy(r, 'baseboard')).toBeGreaterThan(150);
  });

  it('avoids baseboard heaters when a clear path exists', () => {
    const layout = emptyLayout();
    const outlet = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 120, z: 12 } });
    const nas = deviceFromPreset(preset('nas'), { on: 'floor', pos: { x: 20, y: 6 }, rotation: 0 });
    const heater = {
      id: 'h',
      kind: 'obstacle' as const,
      name: 'Heater',
      at: { wallId: 'w0', offset: 70, z: 2 },
      width: 60,
      height: 8,
      obstacleType: 'heater' as const,
      ports: [],
    };
    const cable = makeCable({ ownerId: nas.id, portId: nas.ports[0]!.id }, { ownerId: outlet.id, portId: outlet.ports[0]!.id }, 'dc', 'ac');
    const l: Layout = { ...layout, features: [outlet, heater], devices: [nas], cables: [cable] };
    const r = routeCable(l, cable, buildNetwork(l));
    const alongHeater = r.segments.filter(
      (s) => s.support === 'baseboard' && Math.min(s.a.x, s.b.x) < 100 && Math.max(s.a.x, s.b.x) > 40 && s.a.y < 2,
    );
    expect(alongHeater).toHaveLength(0);
  });

  it('follows pinned waypoints in order', () => {
    const layout = exampleLayout();
    const clip = { id: 'clip1', kind: 'clip' as const, name: 'Clip', mount: { on: 'floor' as const, pos: { x: 70, y: 60 }, rotation: 0 }, print3d: true, capacity: 0.5 };
    const cable = layout.cables.find((c) => c.label === 'Router WAN')!;
    const pinned = { ...cable, waypoints: [{ id: 'w', kind: 'anchor' as const, infraId: clip.id }] };
    const l: Layout = { ...layout, infra: [...layout.infra, clip], cables: layout.cables.map((c) => (c.id === cable.id ? pinned : c)) };
    const r = routeCable(l, pinned, buildNetwork(l));
    expect(r.ok).toBe(true);
    expect(r.points.some((p) => Math.abs(p.x - 70) < 0.01 && Math.abs(p.y - 60) < 0.01)).toBe(true);
  });

  it('manual routes go straight through waypoints', () => {
    const layout = exampleLayout();
    const c = layout.cables.find((x) => x.label === 'Router WAN')!;
    const manual = { ...c, routing: 'manual' as const, waypoints: [{ id: 'w', kind: 'free' as const, frame: 'room' as const, p: { x: 100, y: 30, z: 0 } }] };
    const r = routeCable(layout, manual, buildNetwork(layout));
    expect(r.points).toHaveLength(3);
    expect(r.segments.every((s) => s.support === 'free')).toBe(true);
  });
});

describe('beams', () => {
  const desk = makeSurface({
    center: { x: 30, y: 15 },
    beams: [{ id: 'b', u: 0, v: 10, lengthU: 60, lengthV: 3, drop: 2 }],
  });
  const under = desk.height - desk.thickness - 0.75;
  const seg = { a: { x: 30, y: 2, z: under }, b: { x: 30, y: 28, z: under } };

  it('detects a segment passing through a beam', () => {
    const hits = beamHits(desk, seg, desk.height - desk.thickness);
    expect(hits).toHaveLength(1);
  });

  it('dips under the beam, adding roughly twice the clearance', () => {
    const layout = { ...emptyLayout(), surfaces: [desk] };
    const out = dipUnderBeams(layout, undefined, [{ ...seg, support: 'under', supported: false, surfaceId: desk.id }]);
    const total = out.reduce((t, s) => t + dist3(s.a, s.b), 0);
    const expectedDip = 2 * (desk.height - desk.thickness - 2 - 0.5 - under) * -1;
    expect(total).toBeCloseTo(26 + expectedDip, 5);
    expect(out.every((s) => beamHits(desk, s, desk.height - desk.thickness).length === 0)).toBe(true);
  });
});
