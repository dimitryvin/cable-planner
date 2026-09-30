import { useState } from 'react';
import { planToSurface, surfaceCorners } from '../geometry/resolve';
import type { Vec2 } from '../model/types';
import { pointOverSurface } from '../routing/network';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';
import { PlanScene } from './plan/PlanScene';
import { useCableTool } from './shared/cableTool';
import { SvgCanvas } from './shared/SvgCanvas';

const MARGIN = 10;

export function DeskView() {
  const { layout } = useLayout();
  const { focusSurfaceId, setFocusSurfaceId, deskLayer, setDeskLayer, select, draft } = useUi();
  const tool = useCableTool();
  const [cursor, setCursor] = useState<Vec2>();
  const surface = layout.surfaces.find((s) => s.id === focusSurfaceId);

  if (!surface) {
    return <div className="empty">Add a desk or table from the Room panel to use this view.</div>;
  }

  const corners = surfaceCorners(surface);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const bounds = {
    x: Math.min(...xs) - MARGIN,
    y: Math.min(...ys) - MARGIN,
    w: Math.max(...xs) - Math.min(...xs) + MARGIN * 2,
    h: Math.max(...ys) - Math.min(...ys) + MARGIN * 2,
  };

  const onBackgroundClick = (p: Vec2) => {
    if (!draft) return select(null);
    if (pointOverSurface(surface, p)) {
      const { u, v } = planToSurface(surface, p);
      const zOffset = deskLayer === 'top' ? 0.5 : -surface.thickness - 1;
      tool.addWaypoint({ kind: 'free', frame: 'surface', surfaceId: surface.id, u, v, zOffset });
    } else {
      tool.addWaypoint({ kind: 'free', frame: 'room', p: { ...p, z: 0 } });
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
        <div className="seg" role="group" aria-label="Layer">
          <button className={deskLayer === 'top' ? 'on' : ''} onClick={() => setDeskLayer('top')}>On desk</button>
          <button className={deskLayer === 'under' ? 'on' : ''} onClick={() => setDeskLayer('under')}>Under desk</button>
        </div>
      </div>
      <SvgCanvas
        label={`Top-down view of ${surface.name}`}
        bounds={bounds}
        fitKey={`desk:${surface.id}:${surface.width}:${surface.depth}:${surface.rotation}`}
        onBackgroundClick={onBackgroundClick}
        onPointerMoveWorld={draft ? setCursor : undefined}
      >
        <PlanScene layer={deskLayer} focusSurfaceId={surface.id} cursor={draft ? cursor : undefined} />
      </SvgCanvas>
    </>
  );
}
