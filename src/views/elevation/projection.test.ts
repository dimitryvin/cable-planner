import { makeSurface } from '../../model/factories';
import { facingAngle, projector } from './projection';

describe('elevation projection', () => {
  // A 16" x 60" table along the west wall, drawn with rotation 0 (its "front" faces south).
  const table = makeSurface({ center: { x: 10, y: 60 }, width: 16, depth: 60 });

  it('matches the old front view when facing the front', () => {
    const p = projector(table, facingAngle('front', table));
    expect(p.extentH).toBeCloseTo(16);
    expect(p.extentD).toBeCloseTo(60);
    expect(p.h({ x: 2, y: 60 })).toBeCloseTo(0);
    expect(p.depth({ x: 10, y: 30 })).toBeCloseTo(0);
  });

  it('facing west shows the long side, with north on the right', () => {
    const p = projector(table, facingAngle('W', table));
    expect(p.extentH).toBeCloseTo(60);
    expect(p.extentD).toBeCloseTo(16);
    // South end on the left, north end on the right.
    expect(p.h({ x: 10, y: 90 })).toBeCloseTo(0);
    expect(p.h({ x: 10, y: 30 })).toBeCloseTo(60);
    // The west wall (x = 0) is behind the table: depth <= 0.
    expect(p.depth({ x: 0, y: 60 })).toBeCloseTo(-2);
    expect(p.depth({ x: 18, y: 60 })).toBeCloseTo(16);
  });

  it('round-trips plan points', () => {
    for (const f of ['front', 'N', 'E', 'S', 'W'] as const) {
      const p = projector(table, facingAngle(f, table));
      const q = p.planAt(12, 5);
      expect(p.h(q)).toBeCloseTo(12);
      expect(p.depth(q)).toBeCloseTo(5);
    }
  });

  it('projects surface-local rectangles to screen intervals', () => {
    const p = projector(table, facingAngle('W', table));
    // A grommet-sized square near the table's north end (v small).
    const [a, b] = p.rangeOf(6, 2, 4, 4);
    expect(b - a).toBeCloseTo(4);
    expect(a).toBeGreaterThan(50);
  });
});
