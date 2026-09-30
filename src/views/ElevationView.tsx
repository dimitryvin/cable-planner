import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { roomWalls } from '../geometry/room';
import { findOwner, infraSize, planToSurface, portsOf, resolveMount, resolveOwnerPose, resolvePort, wallFootprint } from '../geometry/resolve';
import { CATEGORY_OF_PORT, SPECS } from '../model/defaults';
import type { Device, Infra, Surface, Vec2, Vec3, WallFeature } from '../model/types';
import { formatLength } from '../model/units';
import { updateEntity } from '../state/actions';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';
import { useCableTool } from './shared/cableTool';
import { cableColor } from './shared/Legend';
import { snapTo } from './shared/snap';
import { SvgCanvas, useCanvas } from './shared/SvgCanvas';
import { useDrag } from './shared/useDrag';
import { FACING_LABELS, facingAngle, projector, type Facing, type Projection } from './elevation/projection';

/** Items this far behind the surface's far edge (toward the wall) or in front of it are drawn. */
const BEHIND = 48;
const IN_FRONT = 24;
const SIDE_MARGIN = 30;

export function ElevationView() {
  const { layout } = useLayout();
  const { focusSurfaceId, setFocusSurfaceId, draft, select, facing, setFacing } = useUi();
  const tool = useCableTool();
  const [cursor, setCursor] = useState<Vec2>();
  const surface = layout.surfaces.find((s) => s.id === focusSurfaceId);
  if (!surface) return <div className="empty">Add a desk or table from the Room panel to use this view.</div>;

  const angle = facingAngle(facing, surface);
  const proj = projector(surface, angle);
  const top = Math.max(surface.height, surface.standing?.max ?? 0);
  const bounds = { x: -SIDE_MARGIN, y: -(top + 30), w: proj.extentH + SIDE_MARGIN * 2, h: top + 36 };

  const onBackgroundClick = (p: Vec2) => {
    if (!draft) return select(null);
    const z = Math.max(0, -p.y);
    if (z < 1) {
      // A floor point along the far edge of the surface (toward the wall being faced).
      tool.addWaypoint({ kind: 'free', frame: 'room', p: { ...proj.planAt(p.x, 0), z: 0 } });
    } else {
      const { u, v } = planToSurface(surface, proj.planAt(p.x, Math.min(1.5, proj.extentD / 2)));
      tool.addWaypoint({ kind: 'free', frame: 'surface', surfaceId: surface.id, u, v, zOffset: z - surface.height });
    }
  };

  return (
    <>
      <div className="view-toolbar">
        <select className="input" value={surface.id} onChange={(e) => setFocusSurfaceId(e.target.value)} aria-label="Surface">
          {layout.surfaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="input" value={facing} onChange={(e) => setFacing(e.target.value as Facing)} aria-label="Facing">
          {(Object.keys(FACING_LABELS) as Facing[]).map((f) => (
            <option key={f} value={f}>
              {FACING_LABELS[f]}
            </option>
          ))}
        </select>
        <span className="muted small">Drag the top to preview heights.</span>
      </div>
      <SvgCanvas
        label={`Elevation of ${surface.name}, ${FACING_LABELS[facing].toLowerCase()}`}
        bounds={bounds}
        fitKey={`elev:${surface.id}:${facing}`}
        onBackgroundClick={onBackgroundClick}
        onPointerMoveWorld={draft ? setCursor : undefined}
      >
        <ElevationScene surface={surface} proj={proj} angle={angle} cursor={draft ? cursor : undefined} />
      </SvgCanvas>
    </>
  );
}

function ElevationScene({ surface: s, proj, angle, cursor }: { surface: Surface; proj: Projection; angle: number; cursor?: Vec2 }) {
  const { layout, apply } = useLayout();
  const { selection, select, analysis, filters, cableMode, draft, autoReport } = useUi();
  const fresh = new Set(autoReport?.added ?? []);
  const { px } = useCanvas();
  const drag = useDrag();
  const tool = useCableTool();
  const W = proj.extentH;
  const units = layout.units;
  const sel = selection?.id;
  const underside = s.height - s.thickness;
  const toXY = (p: Vec3) => ({ x: proj.h(p), y: -p.z });
  const near = (p: Vec2) => {
    const d = proj.depth(p);
    const h = proj.h(p);
    return d > -BEHIND && d < proj.extentD + IN_FRONT && h > -SIDE_MARGIN && h < W + SIDE_MARGIN;
  };

  // --- Wall behind the desk ---------------------------------------------------
  const backWall = roomWalls(layout.room)
    .filter((w) => Math.abs(w.dir.x * proj.uDir.x + w.dir.y * proj.uDir.y) > 0.9)
    .map((w) => ({ w, d: proj.depth(w.start) }))
    .filter((x) => x.d <= 0.5)
    .sort((a, b) => b.d - a.d)[0]?.w;

  const features = layout.features.filter((f) => {
    if (f.kind === 'obstacle') return f.at.wallId === backWall?.id;
    if (f.placement.on === 'wall') return f.placement.at.wallId === backWall?.id;
    return near(f.placement.pos);
  });

  const dragDeskHeight = (e: ReactPointerEvent) =>
    drag(e, {
      onMove: (world) => {
        const lo = s.standing?.min ?? 10;
        const hi = s.standing?.max ?? 60;
        const h = Math.min(hi, Math.max(lo, snapTo(-world.y, 0.5)));
        apply(updateEntity('surface', s.id, (x) => ({ ...x, height: h })), `height:${s.id}`);
      },
      onClick: () => select({ kind: 'surface', id: s.id }),
    });

  const dragFeature = (e: ReactPointerEvent, f: WallFeature) =>
    drag(e, {
      onMove: (world, start) => {
        const grid = layout.settings.gridSize;
        const flip = backWall && backWall.dir.x * proj.uDir.x + backWall.dir.y * proj.uDir.y < 0 ? -1 : 1;
        apply(
          updateEntity('feature', f.id, (x) => {
            const shift = <T extends { offset: number; z: number }>(at: T, a0: T): T => ({
              ...at,
              offset: Math.max(0, snapTo(a0.offset + flip * (world.x - start.x), grid)),
              z: Math.max(0, snapTo(a0.z - (world.y - start.y), grid)),
            });
            if (x.kind === 'obstacle' && f.kind === 'obstacle') return { ...x, at: shift(x.at, f.at) };
            if (x.kind !== 'obstacle' && f.kind !== 'obstacle' && x.placement.on === 'wall' && f.placement.on === 'wall')
              return { ...x, placement: { on: 'wall', at: shift(x.placement.at, f.placement.at) } } as WallFeature;
            return x;
          }),
          `drag:${f.id}`,
        );
      },
      onClick: () => select({ kind: 'feature', id: f.id }),
    });

  const dragArmHeight = (e: ReactPointerEvent, d: Device) => {
    const armId = d.mount.on === 'arm' ? d.mount.armId : undefined;
    const arm = layout.infra.find((i) => i.id === armId);
    drag(e, {
      onMove: (world, start) => {
        if (!arm || arm.kind !== 'monitorArm') return;
        const height = Math.max(0, snapTo(arm.height - (world.y - start.y), 0.5));
        apply(updateEntity('infra', arm.id, (x) => ({ ...x, height }) as Infra), `drag:${arm.id}`);
      },
      onClick: () => select({ kind: 'device', id: d.id }),
    });
  };

  // --- Items ------------------------------------------------------------------
  const items: ({ kind: 'device'; e: Device } | { kind: 'infra'; e: Infra })[] = [
    ...layout.infra.map((e) => ({ kind: 'infra' as const, e })),
    ...layout.devices.map((e) => ({ kind: 'device' as const, e })),
  ];

  const renderItem = (it: (typeof items)[number]) => {
    const raw = it.kind === 'device' ? it.e.size : infraSize(it.e);
    const pose = resolveMount(layout, it.e.mount, raw);
    // A wall item turned within the wall shows its rotated outline when seen face-on.
    const size = pose?.inWall ? { ...raw, ...wallFootprint(pose.inWall, pose.inWall.rotation) } : raw;
    if (!pose || !near(pose.pos)) return null;
    const h = proj.h(pose.pos);
    const rel = pose.rotation - angle;
    const facingW = Math.abs(Math.cos((rel * Math.PI) / 180)) * size.w + Math.abs(Math.sin((rel * Math.PI) / 180)) * size.d;
    const cls = `item ${it.kind} ${it.kind === 'infra' ? it.e.kind : ''} ${sel === it.e.id ? 'selected' : ''} ${it.e.print3d ? 'print3d' : ''}`;
    const onDown = (e: ReactPointerEvent) => {
      if (it.kind === 'device' && it.e.mount.on === 'arm') return dragArmHeight(e, it.e);
      e.stopPropagation();
      if (cableMode && draft && it.kind === 'infra' && ['clip', 'tray', 'spine', 'raceway'].includes(it.e.kind)) {
        tool.addWaypoint({ kind: 'anchor', infraId: it.e.id });
        return;
      }
      select({ kind: it.kind, id: it.e.id });
    };

    if (it.kind === 'infra' && it.e.kind === 'monitorArm') {
      return (
        <g key={it.e.id} className={cls} onPointerDown={onDown}>
          <rect x={h - 0.75} y={-(pose.pos.z + it.e.height + 2)} width={1.5} height={it.e.height + 2} />
        </g>
      );
    }
    if (it.kind === 'infra' && it.e.kind === 'spine') {
      return (
        <g key={it.e.id} className={cls} onPointerDown={onDown}>
          <rect x={h - 0.8} y={-(pose.pos.z + size.h)} width={1.6} height={Math.min(size.h, pose.pos.z + size.h)} />
        </g>
      );
    }
    return (
      <g key={it.e.id} className={cls} onPointerDown={onDown}>
        <rect x={h - facingW / 2} y={-(pose.pos.z + size.h)} width={facingW} height={Math.max(size.h, 0.4)} rx={0.3} />
        {it.kind === 'device' && facingW > px(50) && (
          <text x={h} y={-(pose.pos.z + size.h / 2)} fontSize={px(10)} textAnchor="middle" dominantBaseline="middle" className="item-label">
            {it.e.name}
          </text>
        )}
        <title>{it.e.name}</title>
      </g>
    );
  };

  // --- Ports ------------------------------------------------------------------
  const ownerIds = [...layout.devices.map((d) => d.id), ...layout.features.map((f) => f.id), ...layout.infra.map((i) => i.id)];
  const ports = cableMode || sel
    ? ownerIds.flatMap((id) => {
        if (!cableMode && id !== sel) return [];
        const entry = findOwner(layout, id);
        return portsOf(entry).flatMap((p) => {
          const r = resolvePort(layout, { ownerId: id, portId: p.id });
          if (!r || !near(r.point)) return [];
          return [{ id, p, pt: toXY(r.point), name: entry?.entity.name ?? '' }];
        });
      })
    : [];

  // --- Cables -----------------------------------------------------------------
  const cables = layout.cables.filter((c) => {
    if (!filters[SPECS[c.spec].category]) return false;
    const r = analysis.routes.get(c.id);
    return r?.ok && r.points.some((p) => near(p));
  });

  const draftStart = draft && resolvePort(layout, draft.from);
  const legU = 2;
  const floorY = 0;

  return (
    <g className="elevation">
      {/* Wall behind */}
      <rect className="elev-wall" x={-SIDE_MARGIN * 2} y={-(layout.room.ceilingHeight)} width={W + SIDE_MARGIN * 4} height={layout.room.ceilingHeight} />
      <line className="elev-floor" x1={-SIDE_MARGIN * 2} x2={W + SIDE_MARGIN * 2} y1={floorY} y2={floorY} />

      {features.map((f) => {
        const pose = resolveOwnerPose(layout, { kind: 'feature', entity: f });
        if (!pose) return null;
        const h = proj.h(pose.pos);
        const cls = `feature ${f.kind} ${f.kind === 'obstacle' ? f.obstacleType : ''} ${sel === f.id ? 'selected' : ''}`;
        if (f.kind === 'obstacle') {
          return (
            <g key={f.id} className={cls} onPointerDown={(e) => dragFeature(e, f)}>
              <rect x={h - f.width / 2} y={-(f.at.z + f.height)} width={f.width} height={f.height} />
              <text x={h} y={-(f.at.z + f.height / 2)} fontSize={px(10)} textAnchor="middle" className="item-label">
                {f.name}
              </text>
            </g>
          );
        }
        return (
          <g key={f.id} className={cls} onPointerDown={(e) => dragFeature(e, f)}>
            <rect x={h - 1.4} y={-(pose.pos.z + 2.25)} width={2.8} height={4.5} rx={0.3} />
            <text x={h + 2.2} y={-pose.pos.z} fontSize={px(10)} className="dim-label" dominantBaseline="middle">
              {formatLength(pose.pos.z, units, 1)}
            </text>
            <title>{f.name}</title>
          </g>
        );
      })}

      {/* Standing range */}
      {s.standing && (
        <g className="standing-range">
          {[s.standing.min, s.standing.max].map((z) => (
            <g key={z}>
              <line x1={-4} x2={W + 4} y1={-z} y2={-z} />
              <text x={W + 6} y={-z} fontSize={px(10)} dominantBaseline="middle">
                {z === s.standing!.min ? 'min' : 'max'} {formatLength(z, units, 1)}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* Desk: legs, top, beams, drawers */}
      <g className={`surface elev ${sel === s.id ? 'selected' : ''}`}>
        {[legU, W - legU].map((u) => (
          <rect key={u} className="leg" x={u - 1} y={-underside} width={2} height={underside} />
        ))}
        {s.beams.map((b) => {
          const [a, z] = proj.rangeOf(b.u, b.v, b.lengthU, b.lengthV);
          return <rect key={b.id} className="beam-elev" x={a} y={-underside} width={z - a} height={b.drop} />;
        })}
        {s.drawers.map((d) => {
          const [a, z] = proj.rangeOf(d.u, d.v, d.width, d.depth);
          return <rect key={d.id} className="drawer-elev" x={a} y={-underside} width={z - a} height={d.drop} />;
        })}
        <rect className="top" x={0} y={-s.height} width={W} height={s.thickness} onPointerDown={dragDeskHeight} />
        {s.grommets.map((g) => (
          <rect key={g.id} className="grommet-elev" x={proj.rangeOf(g.u, g.v, 0, 0)[0] - g.diameter / 2} y={-s.height - 0.2} width={g.diameter} height={s.thickness + 0.4} />
        ))}
        <text className="dim-label" x={-2} y={-s.height} fontSize={px(10)} textAnchor="end" dominantBaseline="middle">
          {formatLength(s.height, units, 1)}
        </text>
      </g>

      {items.map(renderItem)}

      <g className="cables">
        {cables.map((c) => {
          const r = analysis.routes.get(c.id)!;
          const d = r.points.map((p, i) => `${i ? 'L' : 'M'}${proj.h(p).toFixed(2)},${(-p.z).toFixed(2)}`).join(' ');
          return (
            <g key={c.id}>
              <path className="cable-hit" d={d} onPointerDown={(e) => { e.stopPropagation(); select({ kind: 'cable', id: c.id }); }} />
              <path className={`cable ${sel === c.id ? 'selected' : ''} ${c.routing} ${fresh.has(c.id) ? 'fresh' : ''}`} d={d} style={{ stroke: cableColor(SPECS[c.spec].category) }} />
            </g>
          );
        })}
      </g>

      <g className="ports">
        {ports.map(({ id, p, pt, name }) => (
          <circle
            key={`${id}:${p.id}`}
            className="port"
            cx={pt.x}
            cy={pt.y}
            r={px(4.5)}
            style={{ fill: cableColor(CATEGORY_OF_PORT[p.type]) }}
            onPointerDown={(e) => {
              e.stopPropagation();
              tool.clickPort({ ownerId: id, portId: p.id });
            }}
          >
            <title>{`${name}: ${p.label}`}</title>
          </circle>
        ))}
      </g>

      {draftStart && (
        <polyline
          className="draft"
          pointerEvents="none"
          points={[toXY(draftStart.point), ...(cursor ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
        />
      )}
    </g>
  );
}

