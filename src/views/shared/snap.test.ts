import { makeSurface } from '../../model/factories';
import { emptyLayout } from '../../model/seed';
import { snapFloorPoint, snapOnSurface, snapSurfaceCenter, snapTo, snapToWall } from './snap';

describe('snapping', () => {
  const layout = emptyLayout(); // 144 x 120

  it('snaps to grid', () => {
    expect(snapTo(10.4, 1)).toBe(10);
    expect(snapTo(10.3, 0.5)).toBe(10.5);
  });

  it('pulls a desk flush with the north wall', () => {
    const desk = makeSurface({ center: { x: 60, y: 20 }, width: 60, depth: 30 });
    // back edge would be at y=1.6 → pulled to 0
    const c = snapSurfaceCenter({ ...layout, surfaces: [desk] }, desk, { x: 60.2, y: 16.6 }, true);
    expect(c).toEqual({ x: 60, y: 15 });
  });

  it('aligns a desk edge with a neighboring surface', () => {
    const a = makeSurface({ center: { x: 40, y: 60 }, width: 40, depth: 20 }); // x 20..60
    const b = makeSurface({ center: { x: 90, y: 60 }, width: 30, depth: 20 });
    const c = snapSurfaceCenter({ ...layout, surfaces: [a, b] }, b, { x: 77, y: 60 }, true); // b left edge at 62 → 60
    expect(c.x).toBe(75);
  });

  it('leaves positions alone when snapping is off', () => {
    const desk = makeSurface({ center: { x: 60, y: 20 } });
    expect(snapSurfaceCenter(layout, desk, { x: 60.3, y: 16.2 }, false)).toEqual({ x: 60.3, y: 16.2 });
  });

  it('puts floor items against the wall', () => {
    expect(snapFloorPoint(layout, { x: 50, y: 5 }, 3, true)).toEqual({ x: 50, y: 3 });
  });

  it('projects to the nearest wall', () => {
    const r = snapToWall(layout, { x: 140, y: 30.4 }, true)!;
    expect(r.wall.label).toBe('East');
    expect(r.offset).toBe(30);
  });

  it('clamps and edge-snaps on a surface', () => {
    const desk = makeSurface({ center: { x: 60, y: 20 }, width: 60, depth: 30 });
    expect(snapOnSurface(desk, 2, 29, { w: 2.5, d: 2.5 }, 1, true)).toEqual({ u: 2.5, v: 27.5 });
    expect(snapOnSurface(desk, -10, 50, { w: 1, d: 1 }, 1, false)).toEqual({ u: 0, v: 30 });
  });
});
