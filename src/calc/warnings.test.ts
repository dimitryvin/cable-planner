import type { Route } from '../routing/route';
import { DEFAULT_SETTINGS } from '../model/defaults';
import { clipsNeeded, unsupportedSpans } from './warnings';

const seg = (x0: number, x1: number, supported: boolean) => ({
  a: { x: x0, y: 0, z: 20 },
  b: { x: x1, y: 0, z: 20 },
  support: supported ? ('tray' as const) : ('under' as const),
  supported,
});

describe('unsupported spans', () => {
  const route: Route = {
    cableId: 'c',
    points: [],
    segments: [seg(0, 10, false), seg(10, 30, false), seg(30, 40, true), seg(40, 45, false)],
    length: 45,
    surfaces: [],
    ok: true,
  };

  it('joins consecutive hanging segments and splits at supports', () => {
    expect(unsupportedSpans(route).map((s) => s.length)).toEqual([30, 5]);
  });

  it('estimates clips from spacing', () => {
    expect(clipsNeeded(route, { ...DEFAULT_SETTINGS, clipSpacing: 12 })).toBe(2);
  });
});
