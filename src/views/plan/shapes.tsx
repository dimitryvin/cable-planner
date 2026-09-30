import { roomVertices, roomWalls, wallPoint, type WallGeom } from '../../geometry/room';
import type { Layout, Surface, Units, WallFeature } from '../../model/types';
import { formatLong } from '../../model/units';

export function RoomShape({ layout, px }: { layout: Layout; px: (n: number) => number }) {
  const verts = roomVertices(layout.room);
  const d = verts.map((v, i) => `${i === 0 ? 'M' : 'L'}${v.x},${v.y}`).join(' ') + 'Z';
  return (
    <g className="room">
      <path d={d} className="floor" />
      <path d={d} className="walls" strokeWidth={4} />
      {roomWalls(layout.room).map((w) => (
        <WallLabel key={w.id} wall={w} units={layout.units} px={px} />
      ))}
    </g>
  );
}

function WallLabel({ wall, units, px }: { wall: WallGeom; units: Units; px: (n: number) => number }) {
  const mid = wallPoint(wall, wall.length / 2, -px(18));
  const angle = (Math.atan2(wall.dir.y, wall.dir.x) * 180) / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  return (
    <text className="wall-label" x={mid.x} y={mid.y} fontSize={px(11)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${upright} ${mid.x} ${mid.y})`}>
      {wall.label} · {formatLong(wall.length, units)}
    </text>
  );
}

/** Outlets, jacks and obstacles drawn on or next to their wall. */
export function FeatureShape({ layout, f, selected, px }: { layout: Layout; f: WallFeature; selected: boolean; px: (n: number) => number }) {
  const cls = `feature ${f.kind} ${f.kind === 'obstacle' ? f.obstacleType : ''} ${selected ? 'selected' : ''}`;
  if (f.kind !== 'obstacle' && f.placement.on === 'floor') {
    const p = f.placement.pos;
    return <rect className={cls} x={p.x - 2} y={p.y - 2} width={4} height={4} rx={0.6} />;
  }
  const at = f.kind === 'obstacle' ? f.at : f.placement.on === 'wall' ? f.placement.at : undefined;
  const wall = at && roomWalls(layout.room).find((w) => w.id === at.wallId);
  if (!at || !wall) return null;
  const angle = (Math.atan2(wall.dir.y, wall.dir.x) * 180) / Math.PI;
  const c = wallPoint(wall, at.offset, 0);
  if (f.kind === 'obstacle') {
    const depth = f.obstacleType === 'heater' ? 4 : 3;
    const inset = f.obstacleType === 'heater' ? depth / 2 : 0;
    return (
      <g transform={`translate(${c.x} ${c.y}) rotate(${angle})`} className={cls}>
        <rect x={-f.width / 2} y={-depth / 2 + inset} width={f.width} height={depth} />
        {f.obstacleType === 'door' && <path className="door-swing" d={`M${-f.width / 2},0 A${f.width},${f.width} 0 0 1 ${f.width / 2},${f.width}`} />}
        <text
          y={inset + depth + px(10)}
          fontSize={px(10)}
          textAnchor="middle"
          dominantBaseline="middle"
          className="item-label"
          transform={Math.abs(angle) > 90 ? `rotate(180 0 ${inset + depth + px(10)})` : undefined}
        >
          {f.name}
        </text>
      </g>
    );
  }
  return (
    <g transform={`translate(${c.x} ${c.y}) rotate(${angle})`} className={cls}>
      <rect x={-1.6} y={-0.2} width={3.2} height={2.2} rx={0.4} />
    </g>
  );
}

export function SurfaceShape({ s, selected, dim, px, showUnder }: { s: Surface; selected: boolean; dim: boolean; px: (n: number) => number; showUnder: boolean }) {
  return (
    <g transform={`translate(${s.center.x} ${s.center.y}) rotate(${s.rotation}) translate(${-s.width / 2} ${-s.depth / 2})`} className={`surface ${selected ? 'selected' : ''} ${dim ? 'dim' : ''}`}>
      <rect width={s.width} height={s.depth} rx={0.8} className="top" />
      {showUnder &&
        s.beams.map((b) => <rect key={b.id} className="beam" x={b.u} y={b.v} width={b.lengthU} height={b.lengthV} />)}
      {showUnder &&
        s.drawers.map((d) => <rect key={d.id} className="drawer" x={d.u} y={d.v} width={d.width} height={d.depth} />)}
      {s.grommets.map((g) => (
        <circle key={g.id} className="grommet" cx={g.u} cy={g.v} r={g.diameter / 2} />
      ))}
      <text x={s.width / 2} y={s.depth - px(8)} fontSize={px(11)} textAnchor="middle" className="item-label">
        {s.name}
        {s.standing ? ' ↕' : ''}
      </text>
    </g>
  );
}
