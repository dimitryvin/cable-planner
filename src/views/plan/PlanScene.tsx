import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { infraSize, resolveMount, resolvePort, surfaceToPlan, wallFootprint, type OwnerEntry } from '../../geometry/resolve';
import { CATEGORY_OF_PORT, SPECS } from '../../model/defaults';
import type { Device, Id, Infra, Layout, Mount, Port, Size3, Surface, Vec2, WallFeature } from '../../model/types';
import { updateEntity } from '../../state/actions';
import { useLayout } from '../../state/store';
import { useUi } from '../../state/ui';
import { useCableTool } from '../shared/cableTool';
import { cableColor } from '../shared/Legend';
import { dragFloorOrWall, dragSurfaceItem, snapFloorPoint, snapSurfaceCenter, snapToWall } from '../shared/snap';
import { useCanvas } from '../shared/SvgCanvas';
import { useDrag } from '../shared/useDrag';
import { FeatureShape, RoomShape, SurfaceShape } from './shapes';

export type PlanLayer = 'all' | 'top' | 'under';

type Mounted = { kind: 'device'; entity: Device } | { kind: 'infra'; entity: Infra };

const isUnder = (m: Mount, layout: Layout): boolean => {
  if (m.on === 'surfaceUnder') return true;
  if (m.on === 'arm') {
    const arm = layout.infra.find((i) => i.id === m.armId);
    return arm ? isUnder(arm.mount, layout) : false;
  }
  return false;
};

const onSurface = (m: Mount, layout: Layout): Id | undefined => {
  if (m.on === 'surfaceTop' || m.on === 'surfaceUnder') return m.surfaceId;
  if (m.on === 'arm') {
    const arm = layout.infra.find((i) => i.id === m.armId);
    return arm ? onSurface(arm.mount, layout) : undefined;
  }
  return undefined;
};

function sizeOf(item: Mounted): Size3 {
  return item.kind === 'device' ? item.entity.size : infraSize(item.entity);
}

/**
 * Top-down scene used by both the room view (layer "all") and the desk view
 * (one surface, "top" or "under" layer). Handles selection, dragging with
 * snapping, and cable drawing.
 */
export function PlanScene({ layer, focusSurfaceId, cursor }: { layer: PlanLayer; focusSurfaceId?: Id; cursor?: Vec2 }) {
  const { layout, apply } = useLayout();
  const { selection, select, analysis, filters, cableMode, draft, autoReport } = useUi();
  const fresh = new Set(autoReport?.added ?? []);
  const { px } = useCanvas();
  const drag = useDrag();
  const tool = useCableTool();
  const [hoverPort, setHoverPort] = useState<string>();
  const snap = layout.settings.snapToGrid;

  const inLayer = (m: Mount) => {
    if (layer === 'all') return true;
    if (focusSurfaceId && onSurface(m, layout) !== focusSurfaceId && m.on !== 'floor' && m.on !== 'wall') return false;
    return layer === 'under' ? isUnder(m, layout) || m.on === 'floor' : !isUnder(m, layout);
  };

  // --- Dragging -------------------------------------------------------------

  const moveMounted = (item: Mounted, start: Vec2, startMount: Mount) => (world: Vec2) => {
    const size = sizeOf(item);
    const key = `drag:${item.entity.id}`;
    const setMount = (mount: Mount) => {
      if (item.kind === 'device') apply(updateEntity('device', item.entity.id, (d) => ({ ...d, mount })), key);
      else apply(updateEntity('infra', item.entity.id, (i) => ({ ...i, mount }) as Infra), key);
    };
    const delta = { x: world.x - start.x, y: world.y - start.y };
    switch (startMount.on) {
      case 'floor': {
        // Near a wall a floor item mounts on it; away from walls it stays on the floor.
        const p = { x: startMount.pos.x + delta.x, y: startMount.pos.y + delta.y };
        setMount(dragFloorOrWall(layout, startMount, world, p, size.d / 2, snap));
        break;
      }
      case 'surfaceTop':
      case 'surfaceUnder': {
        const from = layout.surfaces.find((s) => s.id === startMount.surfaceId);
        if (!from) break;
        const startPlan = surfaceToPlan(from, startMount.u, startMount.v);
        const plan = { x: startPlan.x + delta.x, y: startPlan.y + delta.y };
        setMount(dragSurfaceItem(layout, startMount, plan, world, size, snap));
        break;
      }
      case 'wall':
        // Slides along walls (keeping its height); pulled well away, it drops to the floor.
        setMount(dragFloorOrWall(layout, startMount, world, world, size.d / 2, snap));
        break;
      case 'arm':
        break;
    }
  };

  const onItemDown = (e: ReactPointerEvent, item: Mounted) => {
    // Arm-mounted devices drag their arm.
    const target: Mounted =
      item.entity.mount.on === 'arm'
        ? (() => {
            const armId = (item.entity.mount as { armId: Id }).armId;
            const arm = layout.infra.find((i) => i.id === armId);
            return arm ? { kind: 'infra' as const, entity: arm } : item;
          })()
        : item;
    drag(e, {
      onMove: (world, start) => moveMounted(target, start, target.entity.mount)(world),
      onClick: () => {
        if (cableMode && draft && item.kind === 'infra' && ['clip', 'tray', 'spine', 'raceway'].includes(item.entity.kind)) {
          tool.addWaypoint({ kind: 'anchor', infraId: item.entity.id });
          return;
        }
        select({ kind: item.kind, id: item.entity.id });
      },
    });
  };

  const onSurfaceDown = (e: ReactPointerEvent, s: Surface) => {
    const startCenter = s.center;
    drag(e, {
      onMove: (world, start) => {
        const c = { x: startCenter.x + world.x - start.x, y: startCenter.y + world.y - start.y };
        apply(updateEntity('surface', s.id, (x) => ({ ...x, center: snapSurfaceCenter(layout, x, c, snap) })), `drag:${s.id}`);
      },
      onClick: () => select({ kind: 'surface', id: s.id }),
    });
  };

  const onGrommetDown = (e: ReactPointerEvent, s: Surface, grommetId: Id) => {
    if (!(cableMode && draft)) return onSurfaceDown(e, s);
    e.stopPropagation();
    tool.addWaypoint({ kind: 'grommet', surfaceId: s.id, grommetId });
  };

  const onFeatureDown = (e: ReactPointerEvent, f: WallFeature) => {
    drag(e, {
      onMove: (world) => {
        const hit = snapToWall(layout, world, snap);
        apply(
          updateEntity('feature', f.id, (x) => {
            if (x.kind === 'obstacle') return hit ? { ...x, at: { ...x.at, wallId: hit.wall.id, offset: hit.offset } } : x;
            if (x.placement.on === 'floor') return { ...x, placement: { on: 'floor', pos: snapFloorPoint(layout, world, 2, snap) } } as WallFeature;
            return hit ? ({ ...x, placement: { on: 'wall', at: { ...x.placement.at, wallId: hit.wall.id, offset: hit.offset } } } as WallFeature) : x;
          }),
          `drag:${f.id}`,
        );
      },
      onClick: () => select({ kind: 'feature', id: f.id }),
    });
  };

  // --- Rendering --------------------------------------------------------------

  const focus = focusSurfaceId ? layout.surfaces.find((s) => s.id === focusSurfaceId) : undefined;
  const selectedId = selection?.id;
  const selectedCable = selection?.kind === 'cable' ? layout.cables.find((c) => c.id === selection.id) : undefined;

  const mounted: Mounted[] = [
    ...layout.infra.map((entity) => ({ kind: 'infra' as const, entity })),
    ...layout.devices.map((entity) => ({ kind: 'device' as const, entity })),
  ].filter((m) => inLayer(m.entity.mount));
  const underItems = mounted.filter((m) => isUnder(m.entity.mount, layout) || m.entity.mount.on === 'floor');
  const topItems = mounted.filter((m) => !underItems.includes(m));

  const showPortsFor = (ownerId: Id) => cableMode || selectedId === ownerId;

  const renderItem = (m: Mounted) => {
    const pose = resolveMount(layout, m.entity.mount, sizeOf(m));
    if (!pose) return null;
    const size = sizeOf(m);
    const under = isUnder(m.entity.mount, layout);
    const cls = `item ${m.kind} ${m.kind === 'infra' ? m.entity.kind : ''} ${under ? 'under' : ''} ${m.entity.mount.on} ${selectedId === m.entity.id ? 'selected' : ''} ${m.entity.print3d ? 'print3d' : ''}`;
    const armBase =
      m.entity.mount.on === 'arm'
        ? (() => {
            const armId = (m.entity.mount as { armId: Id }).armId;
            const arm = layout.infra.find((i) => i.id === armId);
            return arm && resolveMount(layout, arm.mount, infraSize(arm));
          })()
        : undefined;
    const shape =
      m.kind === 'infra' && (m.entity.kind === 'clip' || m.entity.kind === 'spine' || m.entity.kind === 'monitorArm') ? (
        <circle r={m.entity.kind === 'clip' ? 0.9 : 1.6} />
      ) : (
        (() => {
          // Wall-mounted items turned within the wall take up their rotated width along it.
          const w = pose.inWall ? wallFootprint(pose.inWall, pose.inWall.rotation).w : size.w;
          return <rect x={-w / 2} y={-size.d / 2} width={w} height={Math.max(size.d, 0.5)} rx={0.4} />;
        })()
      );
    return (
      <g key={m.entity.id}>
        {armBase && <line className="arm-link" x1={armBase.pos.x} y1={armBase.pos.y} x2={pose.pos.x} y2={pose.pos.y} />}
        <g className={cls} transform={`translate(${pose.pos.x} ${pose.pos.y}) rotate(${pose.rotation})`} onPointerDown={(e) => onItemDown(e, m)}>
          {shape}
          {m.kind === 'device' && size.w > px(40) && (
            <text fontSize={px(10)} textAnchor="middle" dominantBaseline="middle" className="item-label">
              {m.entity.name}
            </text>
          )}
          <title>{m.entity.name}</title>
        </g>
      </g>
    );
  };

  const renderPorts = (owner: OwnerEntry) => {
    const ports: Port[] = owner.kind === 'infra' ? (owner.entity.kind === 'powerStrip' ? owner.entity.ports : []) : owner.entity.ports;
    if (!showPortsFor(owner.entity.id) || ports.length === 0) return null;
    if (owner.kind !== 'feature' && !inLayer(owner.entity.mount)) return null;
    const used = new Set(layout.cables.flatMap((c) => [c.from, c.to]).filter((r) => r.ownerId === owner.entity.id).map((r) => r.portId));
    return ports.map((p) => {
      const r = resolvePort(layout, { ownerId: owner.entity.id, portId: p.id });
      if (!r) return null;
      const key = `${owner.entity.id}:${p.id}`;
      const isDraftStart = draft?.from.ownerId === owner.entity.id && draft.from.portId === p.id;
      return (
        <g key={key}>
          <circle
            className={`port ${used.has(p.id) ? 'used' : ''} ${isDraftStart ? 'start' : ''}`}
            cx={r.point.x}
            cy={r.point.y}
            r={px(hoverPort === key ? 6 : 4.5)}
            style={{ fill: cableColor(CATEGORY_OF_PORT[p.type]) }}
            onPointerEnter={() => setHoverPort(key)}
            onPointerLeave={() => setHoverPort(undefined)}
            onPointerDown={(e) => {
              if (cableMode) {
                e.stopPropagation();
                tool.clickPort({ ownerId: owner.entity.id, portId: p.id });
                return;
              }
              // Outside cable mode the port markers are part of the item: grab it to drag.
              if (owner.kind === 'feature') onFeatureDown(e, owner.entity);
              else onItemDown(e, owner.kind === 'device' ? { kind: 'device', entity: owner.entity } : { kind: 'infra', entity: owner.entity });
            }}
          >
            <title>{`${owner.entity.name}: ${p.label}${used.has(p.id) ? ' (connected)' : ''}`}</title>
          </circle>
          {hoverPort === key && (
            <text className="port-label" x={r.point.x + px(8)} y={r.point.y - px(8)} fontSize={px(11)}>
              {p.label}
            </text>
          )}
        </g>
      );
    });
  };

  const cableVisible = (c: Layout['cables'][number]) => {
    if (!filters[SPECS[c.spec].category]) return false;
    if (layer === 'all' || !focus) return true;
    const r = analysis.routes.get(c.id);
    return !!r?.surfaces.includes(focus.id) || [c.from, c.to].some((ref) => resolvePort(layout, ref)?.surfaceId === focus.id);
  };

  const cables = layout.cables.filter(cableVisible);
  const draftStart = draft && resolvePort(layout, draft.from)?.point;

  return (
    <g className={`plan layer-${layer}`}>
      <RoomShape layout={layout} px={px} />
      {layout.features.map((f) => (
        <g key={f.id} onPointerDown={(e) => onFeatureDown(e, f)}>
          <FeatureShape layout={layout} f={f} selected={selectedId === f.id} px={px} />
        </g>
      ))}

      {underItems.filter((m) => m.entity.mount.on === 'floor').map(renderItem)}

      {layout.surfaces.map((s) => (
        <g key={s.id} onPointerDown={(e) => onSurfaceDown(e, s)}>
          <SurfaceShape s={s} selected={selectedId === s.id} dim={!!focus && focus.id !== s.id} px={px} showUnder={layer !== 'top'} />
          {cableMode &&
            draft &&
            s.grommets.map((g) => {
              const p = surfaceToPlan(s, g.u, g.v);
              return <circle key={g.id} className="grommet-target" cx={p.x} cy={p.y} r={g.diameter / 2 + px(4)} onPointerDown={(e) => onGrommetDown(e, s, g.id)} />;
            })}
        </g>
      ))}

      {/* Cable click targets sit below items, so gear under a cable stays grabbable. */}
      <g className="cable-hits">
        {cables.map((c) => {
          const route = analysis.routes.get(c.id);
          if (!route?.ok || route.points.length < 2) return null;
          const d = route.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
          return <path key={c.id} className="cable-hit" d={d} onPointerDown={(e) => { e.stopPropagation(); select({ kind: 'cable', id: c.id }); }} />;
        })}
      </g>

      <g className={layer === 'top' ? 'ghost' : ''}>{underItems.filter((m) => m.entity.mount.on !== 'floor').map(renderItem)}</g>

      <g className="cables">
        {cables.map((c) => {
          const route = analysis.routes.get(c.id);
          if (!route?.ok || route.points.length < 2) return null;
          const d = route.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
          const sel = selectedId === c.id;
          const color = cableColor(SPECS[c.spec].category);
          // In the desk view, fade the parts of a cable that are on the other layer.
          const top = focus ? focus.height - focus.thickness / 2 : 0;
          const segs =
            focus && layer !== 'all'
              ? route.segments.filter((sg) => (layer === 'top' ? Math.min(sg.a.z, sg.b.z) >= top : Math.max(sg.a.z, sg.b.z) < top))
              : undefined;
          const strong = segs?.map((sg) => `M${sg.a.x.toFixed(2)},${sg.a.y.toFixed(2)} L${sg.b.x.toFixed(2)},${sg.b.y.toFixed(2)}`).join(' ');
          return (
            <g key={c.id}>
              <path className={`cable ${sel ? 'selected' : ''} ${c.routing} ${segs ? 'faint' : ''} ${fresh.has(c.id) ? 'fresh' : ''}`} d={d} style={{ stroke: color }} />
              {strong && <path className={`cable ${sel ? 'selected' : ''} ${c.routing}`} d={strong} style={{ stroke: color }} />}
            </g>
          );
        })}
        {selectedCable?.waypoints.map((w) => {
          const route = analysis.routes.get(selectedCable.id);
          const p = w.kind === 'free' ? (w.frame === 'room' ? w.p : undefined) : undefined;
          if (!p || !route) return null;
          return <circle key={w.id} className="waypoint" cx={p.x} cy={p.y} r={px(5)} />;
        })}
      </g>

      {topItems.map(renderItem)}

      <g className="ports">
        {layout.features.map((f) => renderPorts({ kind: 'feature', entity: f }))}
        {layout.infra.map((i) => renderPorts({ kind: 'infra', entity: i }))}
        {layout.devices.map((d) => renderPorts({ kind: 'device', entity: d }))}
      </g>

      {draft && draftStart && <DraftLine start={draftStart} layout={layout} cursor={cursor} />}
    </g>
  );
}

/** Where a free waypoint sits in plan, for drawing the in-progress cable. */
function waypointPlan(layout: Layout, w: Layout['cables'][number]['waypoints'][number]): Vec2 | undefined {
  if (w.kind === 'free') {
    if (w.frame === 'room') return w.p;
    const s = layout.surfaces.find((x) => x.id === w.surfaceId);
    return s && surfaceToPlan(s, w.u, w.v);
  }
  if (w.kind === 'grommet') {
    const s = layout.surfaces.find((x) => x.id === w.surfaceId);
    const g = s?.grommets.find((x) => x.id === w.grommetId);
    return s && g ? surfaceToPlan(s, g.u, g.v) : undefined;
  }
  const i = layout.infra.find((x) => x.id === w.infraId);
  return i && resolveMount(layout, i.mount, infraSize(i))?.pos;
}

function DraftLine({ start, layout, cursor }: { start: Vec2; layout: Layout; cursor?: Vec2 }) {
  const { draft } = useUi();
  const { px } = useCanvas();
  if (!draft) return null;
  const mids = draft.waypoints.map((w) => waypointPlan(layout, w)).filter((p): p is Vec2 => !!p);
  const pts = [start, ...mids, ...(cursor ? [cursor] : [])];
  return (
    <g pointerEvents="none">
      <polyline className="draft" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
      {mids.map((p, i) => (
        <circle key={i} className="waypoint" cx={p.x} cy={p.y} r={px(4)} />
      ))}
    </g>
  );
}
