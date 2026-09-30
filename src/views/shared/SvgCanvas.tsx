import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Vec2 } from '../../model/types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasApi {
  /** Client (screen) coordinates → world coordinates. */
  toWorld: (clientX: number, clientY: number) => Vec2;
  /** Converts a size in screen pixels to world units at the current zoom. */
  px: (n: number) => number;
}

const CanvasContext = createContext<CanvasApi | null>(null);

export function useCanvas(): CanvasApi {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used inside <SvgCanvas>');
  return ctx;
}

const PAD = 0.08;
const CLICK_SLOP = 3;

function fit(bounds: Box, aspect: number): Box {
  const padX = bounds.w * PAD;
  const padY = bounds.h * PAD;
  let w = bounds.w + padX * 2;
  let h = bounds.h + padY * 2;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { x: bounds.x + bounds.w / 2 - w / 2, y: bounds.y + bounds.h / 2 - h / 2, w, h };
}

/**
 * Pan/zoom SVG surface in world units. Drag empty space to pan, scroll to
 * zoom. A background click without movement is reported via `onBackgroundClick`.
 */
export function SvgCanvas({
  bounds,
  fitKey,
  children,
  onBackgroundClick,
  onPointerMoveWorld,
  label,
}: {
  bounds: Box;
  /** Changing this re-fits the view to `bounds`. */
  fitKey: string;
  children: ReactNode;
  onBackgroundClick?: (p: Vec2) => void;
  onPointerMoveWorld?: (p: Vec2) => void;
  label: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<Box>(() => fit(bounds, 800 / 600));
  const pan = useRef<{ x: number; y: number; view: Box; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width || 1, h: entry.contentRect.height || 1 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit when the subject changes or the canvas is resized; bounds are read at that moment.
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  useEffect(() => {
    setView(fit(boundsRef.current, size.w / size.h));
  }, [fitKey, size.w, size.h]);

  const scale = size.w / view.w;
  const toWorld = useCallback(
    (cx: number, cy: number): Vec2 => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: view.x + ((cx - r.left) / r.width) * view.w, y: view.y + ((cy - r.top) / r.height) * view.h };
    },
    [view],
  );
  const px = useCallback((n: number) => n / scale, [scale]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => {
        const r = el.getBoundingClientRect();
        const wx = v.x + ((e.clientX - r.left) / r.width) * v.w;
        const wy = v.y + ((e.clientY - r.top) / r.height) * v.h;
        const w = Math.min(Math.max(v.w * factor, 6), 2000);
        const h = (w * v.h) / v.w;
        return { x: wx - ((wx - v.x) * w) / v.w, y: wy - ((wy - v.y) * h) / v.h, w, h };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <CanvasContext.Provider value={{ toWorld, px }}>
      <svg
        ref={svgRef}
        className="canvas"
        role="img"
        aria-label={label}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          pan.current = { x: e.clientX, y: e.clientY, view, moved: false };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          onPointerMoveWorld?.(toWorld(e.clientX, e.clientY));
          const p = pan.current;
          if (!p) return;
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          if (!p.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
          p.moved = true;
          const r = svgRef.current!.getBoundingClientRect();
          setView({ ...p.view, x: p.view.x - (dx / r.width) * p.view.w, y: p.view.y - (dy / r.height) * p.view.h });
        }}
        onPointerUp={(e) => {
          const p = pan.current;
          pan.current = null;
          if (p && !p.moved) onBackgroundClick?.(toWorld(e.clientX, e.clientY));
        }}
      >
        {children}
      </svg>
      <button className="btn fit-btn" onClick={() => setView(fit(bounds, size.w / size.h))} title="Fit to view">
        Fit
      </button>
    </CanvasContext.Provider>
  );
}
