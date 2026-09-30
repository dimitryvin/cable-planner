import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Vec2 } from '../../model/types';
import { useLayout } from '../../state/store';
import { useCanvas } from './SvgCanvas';

const SLOP = 3;

/**
 * Pointer-drag handler for canvas items. `onMove` receives the pointer's world
 * position and the offset from where the item was grabbed. The whole drag is
 * one undo step. Returns a pointerdown handler; `onClick` fires if the pointer
 * didn't move.
 */
export function useDrag() {
  const { toWorld } = useCanvas();
  const { endGesture } = useLayout();

  return (e: ReactPointerEvent, handlers: { onMove?: (world: Vec2, start: Vec2) => void; onClick?: () => void }) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = toWorld(e.clientX, e.clientY);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < SLOP) return;
      moved = true;
      handlers.onMove?.(toWorld(ev.clientX, ev.clientY), start);
    };
    const up = () => {
      target.removeEventListener('pointermove', move as EventListener);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (moved) endGesture();
      else handlers.onClick?.();
    };
    target.addEventListener('pointermove', move as EventListener);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
}
