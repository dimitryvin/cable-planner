import type { Analysis } from '../calc/analyze';
import { SPECS } from '../model/defaults';
import type { Cable, CableCategory, Layout } from '../model/types';
import { formatLength, formatLong } from '../model/units';
import { printParts } from './printParts';

export interface ChecklistStep {
  id: string;
  title: string;
  items: string[];
}

const PHASE: Record<CableCategory, number> = { power: 0, video: 1, usb: 2, network: 2, audio: 2, other: 2 };

/**
 * Install order: prep and print, mount infrastructure, power first, then
 * video, then data, then test the desk range and tie off bundles.
 */
export function installChecklist(layout: Layout, analysis: Analysis): ChecklistStep[] {
  const u = layout.units;
  const steps: ChecklistStep[] = [];
  const cableLine = (c: Cable) => {
    const len = analysis.lengths.get(c.id);
    return `${c.label || 'Cable'}${len ? ` (${formatLong(len.required, u)})` : ''}`;
  };

  const blocking = analysis.issues.filter((i) => i.severity === 'error');
  if (blocking.length > 0) {
    steps.push({ id: 'fix', title: 'Resolve blocking problems first', items: blocking.map((i) => i.message) });
  }

  const outlets = layout.features.flatMap((f) => (f.kind === 'obstacle' ? [] : [f]));
  steps.push({
    id: 'measure',
    title: 'Verify measurements',
    items: [
      'Re-measure room walls and desk position against the plan.',
      ...outlets.map((f) => `Confirm ${f.name} location${f.placement.on === 'wall' ? ` (${formatLength(f.placement.at.z, u, 1)} high)` : ''}.`),
    ],
  });

  const prints = printParts(layout, analysis).filter((p) => p.kind === 'planned');
  if (prints.length > 0) steps.push({ id: 'print', title: 'Print parts', items: prints.map((p) => `${p.qty}× ${p.name} — ${p.dimensions}`) });

  const mountOrder = ['tray', 'raceway', 'spine', 'brickHolder', 'clip', 'monitorArm'] as const;
  const mounts = layout.infra
    .filter((i) => (mountOrder as readonly string[]).includes(i.kind))
    .sort((a, b) => mountOrder.indexOf(a.kind as (typeof mountOrder)[number]) - mountOrder.indexOf(b.kind as (typeof mountOrder)[number]));
  if (mounts.length > 0) steps.push({ id: 'mount', title: 'Mount cable management', items: mounts.map((i) => `Install ${i.name}.`) });

  const strips = layout.infra.filter((i) => i.kind === 'powerStrip');
  if (strips.length > 0) {
    steps.push({
      id: 'strips',
      title: 'Mount power strips (leave unplugged)',
      items: strips.map((s) => `Mount ${s.name}${s.mount.on === 'surfaceUnder' ? ' under the desk' : ''}.`),
    });
  }

  const byPhase = (phase: number) =>
    layout.cables
      .filter((c) => PHASE[SPECS[c.spec].category] === phase && c.fixedLength === undefined)
      .sort((a, b) => (analysis.bundles.bundleOf.get(a.id) ?? '').localeCompare(analysis.bundles.bundleOf.get(b.id) ?? ''))
      .map(cableLine);
  const power = [...layout.cables.filter((c) => c.fixedLength !== undefined).map((c) => `Route ${cableLine(c)} to the wall (don't plug in yet).`), ...byPhase(0)];
  if (power.length > 0) steps.push({ id: 'power', title: 'Run power', items: power });
  const video = byPhase(1);
  if (video.length > 0) steps.push({ id: 'video', title: 'Run video', items: video });
  const data = byPhase(2);
  if (data.length > 0) steps.push({ id: 'data', title: 'Run data and audio', items: data });

  const standing = layout.surfaces.filter((s) => s.standing);
  if (standing.length > 0) {
    steps.push({
      id: 'range',
      title: 'Test the standing range before tying off',
      items: standing.flatMap((s) => [
        `Raise ${s.name} to ${formatLength(s.standing!.max, u, 1)}; check nothing pulls tight.`,
        `Lower it to ${formatLength(s.standing!.min, u, 1)}; check nothing gets pinched.`,
      ]),
    });
  }

  const ties = analysis.bundles.bundles.map(
    (b) => `${b.id}: ${b.cableIds.length} cables, ~${formatLong(b.sharedLength, u)} — tie every ${formatLong(layout.settings.velcroSpacing, u)}.`,
  );
  steps.push({ id: 'tie', title: 'Tie off bundles', items: ties.length > 0 ? ties : ['No shared runs to bundle.'] });
  steps.push({ id: 'power-on', title: 'Plug in and power on', items: ['Plug power strips into the wall.', 'Power on devices one at a time and confirm each connection.'] });

  return steps;
}

export function checklistMarkdown(steps: readonly ChecklistStep[]): string {
  return steps.map((s, i) => `### ${i + 1}. ${s.title}\n\n${s.items.map((x) => `- [ ] ${x}`).join('\n')}\n`).join('\n');
}
