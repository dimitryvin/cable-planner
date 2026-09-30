import type { Analysis } from '../calc/analyze';
import { findPort } from '../geometry/resolve';
import { SPECS } from '../model/defaults';
import type { Cable, Layout, PortRef } from '../model/types';
import { formatLong } from '../model/units';
import type { Support } from '../routing/network';
import type { Table } from './format';

const SUPPORT_WORDS: Record<Support, string> = {
  top: 'desk top',
  under: 'under desk',
  tray: 'tray',
  raceway: 'raceway',
  spine: 'spine',
  grommet: 'grommet',
  arm: 'monitor arm',
  drop: 'drop',
  baseboard: 'along wall',
  floor: 'floor',
  wall: 'up wall',
  bridge: 'hop',
  free: 'direct',
};

/** Human-readable route summary, collapsing repeats: "grommet → under desk → tray → drop → along wall". */
export function routeSummary(supports: readonly Support[]): string {
  const words = supports.map((s) => SUPPORT_WORDS[s]).filter((w, i, a) => i === 0 || w !== a[i - 1]);
  return words.join(' → ');
}

export interface WiringRow {
  cable: Cable;
  from: string;
  to: string;
  type: string;
  exact: string;
  retail: string;
  route: string;
  bundle: string;
}

const endName = (layout: Layout, ref: PortRef) => {
  const hit = findPort(layout, ref);
  return hit ? `${hit.owner.name} · ${hit.port.label}` : '—';
};

export function wiringRows(layout: Layout, analysis: Analysis): WiringRow[] {
  const u = layout.units;
  return layout.cables.map((c) => {
    const len = analysis.lengths.get(c.id);
    const route = analysis.routes.get(c.id);
    const retail = len ? (u === 'cm' ? len.retailMetric : len.retailImperial) : undefined;
    return {
      cable: c,
      from: endName(layout, c.from),
      to: endName(layout, c.to),
      type: SPECS[c.spec].label,
      exact: len ? formatLong(len.required, u) : '—',
      retail: c.fixedLength !== undefined ? `attached ${formatLong(c.fixedLength, u)}` : c.source !== 'buy' ? `(${c.source})` : (retail?.label ?? '—'),
      route: route?.ok ? routeSummary(route.segments.map((s) => s.support)) : 'unrouted',
      bundle: analysis.bundles.bundleOf.get(c.id) ?? '',
    };
  });
}

export function wiringTable(rows: readonly WiringRow[]): Table {
  return {
    headers: ['From', 'To', 'Cable', 'Length needed', 'Retail', 'Route', 'Bundle'],
    rows: rows.map((r) => [r.from, r.to, r.type, r.exact, r.retail, r.route, r.bundle]),
  };
}
