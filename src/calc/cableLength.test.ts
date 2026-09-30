import { polylineLength3 } from '../geometry/vec';
import { cableLength } from './cableLength';

describe('cableLength', () => {
  it('sums 3D path segments', () => {
    // 3-4-5 triangle in plan, then a 12" vertical drop.
    const pts = [
      { x: 0, y: 0, z: 12 },
      { x: 3, y: 4, z: 12 },
      { x: 3, y: 4, z: 0 },
    ];
    expect(polylineLength3(pts)).toBeCloseTo(17);
  });

  it('adds slack and rounds to retail', () => {
    const r = cableLength({ current: 50, slackPct: 0.15 });
    expect(r.required).toBeCloseTo(57.5);
    expect(r.retailImperial.label).toBe('6 ft');
    expect(r.retailMetric.label).toBe('2 m');
    expect(r.standing).toBe(false);
  });

  it('uses the worst-case standing height', () => {
    const r = cableLength({ current: 40, atMin: 36, atMax: 62, slackPct: 0.1 });
    expect(r.standing).toBe(true);
    expect(r.worstCase).toBe(62);
    expect(r.standingExtra).toBe(22);
    expect(r.required).toBeCloseTo(68.2);
    expect(r.retailImperial.label).toBe('6 ft');
  });

  it('treats negative slack as zero', () => {
    expect(cableLength({ current: 10, slackPct: -1 }).required).toBe(10);
  });
});
