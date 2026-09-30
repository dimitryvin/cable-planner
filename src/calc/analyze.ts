import type { HeightOverrides } from '../geometry/resolve';
import type { Id, Layout } from '../model/types';
import { buildNetwork, routeCable, type Route } from '../routing/route';
import { containerFill, detectBundles, type BundleReport, type ContainerFill } from './bundles';
import { cableLength, type CableLength } from './cableLength';
import { bySeverity, type Issue } from './issues';
import { powerBudget, type PowerReport } from './power';
import { cableWarnings } from './warnings';

export interface Analysis {
  routes: Map<Id, Route>;
  lengths: Map<Id, CableLength>;
  power: PowerReport;
  bundles: BundleReport;
  fills: ContainerFill[];
  issues: Issue[];
}

function standingHeights(layout: Layout, which: 'min' | 'max'): HeightOverrides | undefined {
  const entries = layout.surfaces.filter((s) => s.standing).map((s) => [s.id, s.standing![which]] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Runs routing and every calculation over a layout. Pure; memoize on the layout object. */
export function analyzeLayout(layout: Layout): Analysis {
  const network = buildNetwork(layout);
  const minH = standingHeights(layout, 'min');
  const maxH = standingHeights(layout, 'max');
  const netMin = minH && buildNetwork(layout, minH);
  const netMax = maxH && buildNetwork(layout, maxH);
  const standingIds = new Set(layout.surfaces.filter((s) => s.standing).map((s) => s.id));

  const routes = new Map<Id, Route>();
  const lengths = new Map<Id, CableLength>();
  for (const cable of layout.cables) {
    const route = routeCable(layout, cable, network);
    routes.set(cable.id, route);
    if (!route.ok) continue;
    const touchesStanding = route.surfaces.some((s) => standingIds.has(s));
    const atMin = touchesStanding && netMin ? routeCable(layout, cable, netMin) : undefined;
    const atMax = touchesStanding && netMax ? routeCable(layout, cable, netMax) : undefined;
    lengths.set(
      cable.id,
      cableLength({
        current: route.length,
        atMin: atMin?.ok ? atMin.length : undefined,
        atMax: atMax?.ok ? atMax.length : undefined,
        slackPct: cable.slackPct ?? layout.settings.slackPct,
      }),
    );
  }

  const power = powerBudget(layout);
  const bundles = detectBundles(layout, routes);
  const fill = containerFill(layout, routes);
  const issues = [
    ...cableWarnings({ layout, routes, lengths, pairs: bundles.pairs }),
    ...power.issues,
    ...fill.issues,
  ].sort(bySeverity);

  return { routes, lengths, power, bundles, fills: fill.fills, issues };
}
