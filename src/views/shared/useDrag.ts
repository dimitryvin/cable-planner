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
    // Listen on the window, not the element: dragging an item onto a wall or off
    // a desk re-renders it as a different element mid-drag, and listeners on the
    // old one would stop receiving moves and the release.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < SLOP) return;
      moved = true;
      handlers.onMove?.(toWorld(ev.clientX, ev.clientY), start);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (moved) endGesture();
      else handlers.onClick?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
}
