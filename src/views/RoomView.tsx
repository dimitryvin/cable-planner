import { useState } from 'react';
import type { Vec2 } from '../model/types';
import { pointOverSurface } from '../routing/network';
import { planToSurface } from '../geometry/resolve';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';
import { useCableTool } from './shared/cableTool';
import { SvgCanvas } from './shared/SvgCanvas';
import { PlanScene } from './plan/PlanScene';

export function RoomView() {
  const { layout } = useLayout();
  const { select, draft } = useUi();
  const tool = useCableTool();
  const [cursor, setCursor] = useState<Vec2>();
  const { width, depth } = layout.room.shape;

  const onBackgroundClick = (p: Vec2) => {
    if (draft) {
      // Over a desk, a pinned point most likely means "under the desk"; elsewhere, "along the floor".
      const s = layout.surfaces.find((x) => pointOverSurface(x, p));
      if (s) {
        const { u, v } = planToSurface(s, p);
        tool.addWaypoint({ kind: 'free', frame: 'surface', surfaceId: s.id, u, v, zOffset: -s.thickness - 1 });
      } else {
        tool.addWaypoint({ kind: 'free', frame: 'room', p: { ...p, z: 0 } });
      }
      return;
    }
    select(null);
  };

  return (
    <SvgCanvas
      label="Top-down room view"
      bounds={{ x: 0, y: 0, w: width, h: depth }}
      fitKey={`room:${layout.name}`}
      onBackgroundClick={onBackgroundClick}
      onPointerMoveWorld={draft ? setCursor : undefined}
    >
      <PlanScene layer="all" cursor={draft ? cursor : undefined} />
    </SvgCanvas>
  );
}
