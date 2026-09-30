import { dist2, dist3 } from '../geometry/vec';
import { CATEGORY_OF_PORT, SPECS } from '../model/defaults';
import type { Cable, CableCategory, Id, Layout, PortType, Settings } from '../model/types';
import { pointOverSurface } from '../routing/network';
import { beamHits, type Route } from '../routing/route';
import { findPort } from '../geometry/resolve';
import type { PairOverlap } from './bundles';
import type { CableLength } from './cableLength';
import type { Issue } from './issues';
import { formatLong } from '../model/units';

const name = (c: Cable) => `"${c.label || 'Unnamed cable'}"`;

export function cableCategory(c: Cable): CableCategory {
  return SPECS[c.spec].category;
}

const DATA: ReadonlySet<CableCategory> = new Set(['video', 'usb', 'network', 'audio']);

export interface UnsupportedSpan {
  length: number;
  start: { x: number; y: number; z: number };
}

/** Consecutive runs of unsupported segments (hanging cable). */
export function unsupportedSpans(route: Route): UnsupportedSpan[] {
  const spans: UnsupportedSpan[] = [];
  let current: UnsupportedSpan | undefined;
  for (const s of route.segments) {
    if (s.supported) {
      if (current) spans.push(current);
      current = undefined;
      continue;
    }
    current = current ?? { length: 0, start: s.a };
    current.length += dist3(s.a, s.b);
  }
  if (current) spans.push(current);
  return spans;
}

/** Adhesive clips needed so no hanging span exceeds the clip spacing. */
export function clipsNeeded(route: Route, settings: Settings): number {
  return unsupportedSpans(route).reduce((n, s) => n + Math.floor(s.length / Math.max(1, settings.clipSpacing)), 0);
}

export const COMPATIBLE: readonly (readonly PortType[])[] = [
  ['usb-c', 'usb-a', 'thunderbolt'],
  ['hdmi', 'dp', 'usb-c', 'thunderbolt'],
  ['ac', 'dc'],
  ['ethernet'],
  ['3.5mm'],
];

function connectorIssue(layout: Layout, c: Cable): Issue | undefined {
  const a = findPort(layout, c.from)?.port.type;
  const b = findPort(layout, c.to)?.port.type;
  if (!a || !b || a === b || a === 'other' || b === 'other') return undefined;
  if (!COMPATIBLE.some((g) => g.includes(a) && g.includes(b))) {
    return { severity: 'error', code: 'cable.incompatible', message: `${name(c)} joins ${a} to ${b}; those don't connect.`, refs: [c.id] };
  }
  if (CATEGORY_OF_PORT[a] === 'video' || CATEGORY_OF_PORT[b] === 'video') {
    if (a !== b && !(a === 'usb-c' && b === 'thunderbolt') && !(a === 'thunderbolt' && b === 'usb-c')) {
      return { severity: 'info', code: 'cable.adapter', message: `${name(c)} needs a ${a} → ${b} cable or adapter.`, refs: [c.id] };
    }
  }
  return undefined;
}

export interface WarningInputs {
  layout: Layout;
  routes: ReadonlyMap<Id, Route>;
  lengths: ReadonlyMap<Id, CableLength>;
  pairs: readonly PairOverlap[];
}

export function cableWarnings({ layout, routes, lengths, pairs }: WarningInputs): Issue[] {
  const issues: Issue[] = [];
  const { settings } = layout;
  const fmt = (x: number) => formatLong(x, layout.units);
  const cableById = new Map(layout.cables.map((c) => [c.id, c]));

  for (const c of layout.cables) {
    const route = routes.get(c.id);
    const len = lengths.get(c.id);
    if (!route?.ok || !len) {
      issues.push({ severity: 'error', code: 'route.failed', message: `${name(c)}: ${route?.error ?? 'could not be routed'}.`, refs: [c.id] });
      continue;
    }

    const conn = connectorIssue(layout, c);
    if (conn) issues.push(conn);

    if (c.fixedLength !== undefined) {
      if (len.worstCase > c.fixedLength) {
        issues.push({
          severity: 'error',
          code: 'cable.cant-reach',
          message: `${name(c)} is ${fmt(c.fixedLength)} but the route needs ${fmt(len.worstCase)}${len.standingExtra > 0.5 ? ' at full desk height' : ''}.`,
          refs: [c.id],
        });
      }
    } else {
      const spec = SPECS[c.spec];
      if (len.required > spec.maxLength) {
        issues.push({
          severity: 'warn',
          code: 'cable.spec-length',
          message: `${name(c)} needs ${fmt(len.required)}, beyond the ~${fmt(spec.maxLength)} typical for passive ${spec.label}. Use an active/optical cable or move the devices closer.`,
          refs: [c.id],
        });
      }
      if (len.retailImperial.overflow) {
        issues.push({
          severity: 'warn',
          code: 'cable.retail-overflow',
          message: `${name(c)} needs ${fmt(len.required)}, longer than common retail lengths.`,
          refs: [c.id],
        });
      }
    }

    for (const span of unsupportedSpans(route)) {
      if (span.length > settings.maxUnsupportedSpan) {
        issues.push({
          severity: 'warn',
          code: 'cable.unsupported',
          message: `${name(c)} hangs unsupported for ${fmt(span.length)} (limit ${fmt(settings.maxUnsupportedSpan)}). Add clips, a tray or a spine.`,
          refs: [c.id],
        });
      }
    }

    const openFloor = route.segments
      .filter((s) => s.support === 'floor')
      .filter((s) => {
        const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
        return !layout.surfaces.some((srf) => pointOverSurface(srf, mid));
      })
      .reduce((t, s) => t + dist2(s.a, s.b), 0);
    if (openFloor > 12) {
      issues.push({
        severity: 'warn',
        code: 'cable.open-floor',
        message: `${name(c)} crosses ${fmt(openFloor)} of open floor (trip hazard). Consider a floor cord cover or a different outlet.`,
        refs: [c.id],
      });
    }

    for (const s of route.segments) {
      const surface = s.surfaceId && layout.surfaces.find((x) => x.id === s.surfaceId);
      if (!surface) continue;
      const underside = surface.height - surface.thickness;
      if (beamHits(surface, s, underside).length > 0) {
        issues.push({
          severity: 'error',
          code: 'cable.through-beam',
          message: `${name(c)} passes through a frame beam under ${surface.name}.`,
          refs: [c.id, surface.id],
        });
        break;
      }
    }
  }

  for (const p of pairs) {
    const a = cableById.get(p.a);
    const b = cableById.get(p.b);
    if (!a || !b || p.length < settings.parallelRunWarn) continue;
    const [power, data] =
      cableCategory(a) === 'power' && DATA.has(cableCategory(b))
        ? [a, b]
        : cableCategory(b) === 'power' && DATA.has(cableCategory(a))
          ? [b, a]
          : [undefined, undefined];
    if (!power || !data) continue;
    issues.push({
      severity: 'info',
      code: 'cable.parallel-power',
      message: `${name(power)} runs alongside ${name(data)} for ${fmt(p.length)}. Keep power and data a couple of inches apart or cross at right angles if you see interference.`,
      refs: [power.id, data.id],
    });
  }

  return issues;
}
