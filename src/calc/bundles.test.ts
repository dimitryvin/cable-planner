import { makeSurface } from '../model/factories';
import { emptyLayout } from '../model/seed';
import type { Cable, Layout, Vec3 } from '../model/types';
import type { Route } from '../routing/route';
import { bundleDiameter, containerFill, detectBundles } from './bundles';

const cable = (id: string, spec: Cable['spec'] = 'usb3-5g', diameter?: number): Cable => ({
  id,
  label: id,
  from: { ownerId: 'a', portId: 'a' },
  to: { ownerId: 'b', portId: 'b' },
  spec,
  routing: 'auto',
  waypoints: [],
  source: 'buy',
  diameter,
});

const route = (id: string, pts: Vec3[], container?: string): Route => ({
  cableId: id,
  points: pts,
  segments: pts.slice(1).map((b, i) => ({ a: pts[i]!, b, support: 'under', supported: false, container })),
  length: 0,
  surfaces: [],
  ok: true,
});

const p = (x: number, y: number, z = 0.5): Vec3 => ({ x, y, z });

describe('bundleDiameter', () => {
  it('handles 0, 1 and 2 cables exactly', () => {
    expect(bundleDiameter([])).toBe(0);
    expect(bundleDiameter([0.25])).toBe(0.25);
    expect(bundleDiameter([0.25, 0.2])).toBeCloseTo(0.45);
  });

  it('grows with the square root of cable count', () => {
    const seven = bundleDiameter(Array(7).fill(0.25));
    expect(seven).toBeGreaterThan(0.75); // hex-packed 7 = 3d
    expect(seven).toBeLessThan(0.9);
  });
});

describe('detectBundles', () => {
  const layout: Layout = { ...emptyLayout(), cables: [cable('a'), cable('b'), cable('c'), cable('d')] };

  it('groups cables that share a stretch of path', () => {
    const routes = new Map([
      ['a', route('a', [p(0, 0.5), p(40, 0.5)])],
      ['b', route('b', [p(10, 0.5), p(30, 0.5), p(30, 20)])], // shares 20" with a
      ['c', route('c', [p(0, 60), p(40, 60)])], // far away
      ['d', route('d', [p(35, 0.5), p(38, 0.5), p(38, 30)])], // shares only 3" with a
    ]);
    const r = detectBundles(layout, routes);
    expect(r.bundles).toHaveLength(1);
    expect(r.bundles[0]!.cableIds.sort()).toEqual(['a', 'b']);
    expect(r.bundles[0]!.sharedLength).toBeGreaterThanOrEqual(19);
    expect(r.bundles[0]!.sharedLength).toBeLessThanOrEqual(22);
    expect(r.bundleOf.get('c')).toBeUndefined();
    expect(r.bundleOf.get('d')).toBeUndefined();
  });

  it('merges chains of overlaps into one bundle', () => {
    const routes = new Map([
      ['a', route('a', [p(0, 0.5), p(20, 0.5)])],
      ['b', route('b', [p(10, 0.5), p(40, 0.5)])],
      ['c', route('c', [p(30, 0.5), p(60, 0.5)])],
    ]);
    const r = detectBundles(layout, routes);
    expect(r.bundles).toHaveLength(1);
    expect(r.bundles[0]!.cableIds.sort()).toEqual(['a', 'b', 'c']);
    expect(r.bundles[0]!.maxCount).toBe(2);
  });
});

describe('containerFill', () => {
  it('flags an overfull grommet', () => {
    const desk = makeSurface({ center: { x: 30, y: 15 }, grommets: [{ id: 'g', u: 5, v: 5, diameter: 1 }] });
    const cables = ['a', 'b', 'c', 'd', 'e'].map((id) => cable(id, 'hdmi2.1'));
    const key = `grommet:${desk.id}:g`;
    const routes = new Map(cables.map((c) => [c.id, route(c.id, [p(5, 5, 29), p(5, 5, 28)], key)]));
    const r = containerFill({ ...emptyLayout(), surfaces: [desk], cables }, routes);
    expect(r.fills[0]!.cableIds).toHaveLength(5);
    expect(r.fills[0]!.ratio).toBeGreaterThan(1);
    expect(r.issues[0]!.code).toBe('fill.over');
  });

  it('checks tray cross-section area', () => {
    const tray = { id: 't', kind: 'tray' as const, name: 'Tray', mount: { on: 'floor' as const, pos: p(0, 0), rotation: 0 }, print3d: false, length: 40, width: 4, depth: 3 };
    const cables = ['a', 'b'].map((id) => cable(id));
    const routes = new Map(cables.map((c) => [c.id, route(c.id, [p(0, 0), p(10, 0)], 'tray:t')]));
    const r = containerFill({ ...emptyLayout(), infra: [tray], cables }, routes);
    expect(r.fills[0]!.ratio).toBeLessThan(0.05);
    expect(r.issues).toEqual([]);
  });
});
