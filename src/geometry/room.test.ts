import { nearestWall, pointInRoom, roomVertices, roomWalls, wallPoint } from './room';
import type { Room } from '../model/types';

const rect: Room = { shape: { kind: 'rect', width: 144, depth: 120 }, labelStyle: 'compass', ceilingHeight: 96 };

describe('room geometry', () => {
  it('labels rectangle walls by compass direction, clockwise from north', () => {
    expect(roomWalls(rect).map((w) => [w.label, w.length])).toEqual([
      ['North', 144],
      ['East', 120],
      ['South', 144],
      ['West', 120],
    ]);
  });

  it('measures offsets from the left corner when facing the wall from inside', () => {
    const [north, east] = roomWalls(rect);
    expect(wallPoint(north!, 30)).toEqual({ x: 30, y: 0 });
    expect(wallPoint(east!, 30)).toEqual({ x: 144, y: 30 });
    // inward normals point into the room
    expect(north!.inward.y).toBeCloseTo(1);
    expect(east!.inward.x).toBeCloseTo(-1);
  });

  it('builds a six-wall L shape with disambiguated labels', () => {
    const L: Room = {
      ...rect,
      shape: { kind: 'L', width: 144, depth: 120, notch: { corner: 'NE', width: 40, depth: 30 } },
    };
    const walls = roomWalls(L);
    expect(walls).toHaveLength(6);
    expect(walls.map((w) => w.label)).toEqual(['North 1', 'East 1', 'North 2', 'East 2', 'South', 'West']);
    const perimeter = walls.reduce((s, w) => s + w.length, 0);
    expect(perimeter).toBeCloseTo(2 * (144 + 120));
    expect(pointInRoom(L, { x: 130, y: 10 })).toBe(false);
    expect(pointInRoom(L, { x: 130, y: 60 })).toBe(true);
  });

  it('uses letters when asked', () => {
    expect(roomWalls({ ...rect, labelStyle: 'letters' }).map((w) => w.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('finds the nearest wall', () => {
    const hit = nearestWall(rect, { x: 140, y: 50 });
    expect(hit?.wall.label).toBe('East');
    expect(hit?.offset).toBeCloseTo(50);
    expect(hit?.distance).toBeCloseTo(4);
    expect(roomVertices(rect)).toHaveLength(4);
  });
});
