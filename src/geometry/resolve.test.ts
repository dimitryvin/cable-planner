import { exampleLayout } from '../model/seed';
import { planToSurface, resolvePort, resolveWaypoint, surfaceToPlan } from './resolve';

describe('resolve', () => {
  const layout = exampleLayout();
  const desk = layout.surfaces[0]!;

  it('round-trips surface-local coordinates, including rotation', () => {
    const rotated = { ...desk, rotation: 90 };
    const p = surfaceToPlan(rotated, 10, 5);
    const back = planToSurface(rotated, p);
    expect(back.u).toBeCloseTo(10);
    expect(back.v).toBeCloseTo(5);
  });

  it('resolves every cable endpoint in the example layout', () => {
    for (const c of layout.cables) {
      expect(resolvePort(layout, c.from), `${c.label} from`).toBeDefined();
      expect(resolvePort(layout, c.to), `${c.label} to`).toBeDefined();
    }
  });

  it('moves desk-mounted ports with the standing desk height', () => {
    const mini = layout.devices.find((d) => d.name === 'Mac mini')!;
    const ref = { ownerId: mini.id, portId: mini.ports[0]!.id };
    const low = resolvePort(layout, ref, { [desk.id]: 25 })!;
    const high = resolvePort(layout, ref, { [desk.id]: 50 })!;
    expect(high.point.z - low.point.z).toBeCloseTo(25);
    expect(high.surfaceId).toBe(desk.id);
  });

  it('places wall outlets on the wall at the given height', () => {
    const outlet = layout.features.find((f) => f.name === 'North outlet')!;
    const r = resolvePort(layout, { ownerId: outlet.id, portId: outlet.ports[0]!.id })!;
    expect(r.point.y).toBeCloseTo(0);
    expect(r.point.x).toBeCloseTo(30);
    expect(r.point.z).toBeCloseTo(12.75);
    expect(r.surfaceId).toBeUndefined();
  });

  it('resolves grommets to top and underside points', () => {
    const g = desk.grommets[0]!;
    const r = resolveWaypoint(layout, { id: 'x', kind: 'grommet', surfaceId: desk.id, grommetId: g.id })!;
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!.z - r.points[1]!.z).toBeCloseTo(desk.thickness);
  });
});
