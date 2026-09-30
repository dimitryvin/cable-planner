import type { Analysis } from '../calc/analyze';
import { grommetKey } from '../routing/network';
import { CM_PER_INCH } from '../model/defaults';
import type { Layout, Size3 } from '../model/types';
import type { Table } from './format';

/** Printed parts get this much clearance per side so real parts slide in. */
export const CLEARANCE_MM = 0.5;

const mm = (inches: number) => Math.round(inches * CM_PER_INCH * 10 * 10) / 10;
const fitMm = (s: Size3) =>
  `${mm(s.w) + 2 * CLEARANCE_MM} × ${mm(s.d) + 2 * CLEARANCE_MM} × ${mm(s.h) + CLEARANCE_MM} mm`;

export interface PrintPart {
  name: string;
  kind: 'planned' | 'suggested';
  qty: number;
  /** Critical dimensions for modelling the part. */
  dimensions: string;
  notes: string;
  refs: string[];
}

export function printParts(layout: Layout, analysis: Analysis): PrintPart[] {
  const parts: PrintPart[] = [];

  for (const i of layout.infra.filter((x) => x.print3d)) {
    switch (i.kind) {
      case 'brickHolder': {
        const device = layout.devices.find((d) => d.id === i.forDeviceId);
        const size = device?.brick?.size ?? i.size;
        parts.push({
          name: i.name,
          kind: 'planned',
          qty: 1,
          dimensions: `inner ${fitMm(size)}`,
          notes: `${device?.brick ? `Sized for the ${device.name} brick. ` : 'Set "Holds brick of" to size it from a device. '}Leave the cord ends open; screw or 3M VHB under the desk.`,
          refs: [i.id],
        });
        break;
      }
      case 'clip': {
        const through = [...analysis.routes.values()].filter((r) => r.segments.some((s) => s.container === `clip:${i.id}`)).length;
        parts.push({
          name: i.name,
          kind: 'planned',
          qty: 1,
          dimensions: `bundle opening Ø ${mm(i.capacity)} mm`,
          notes: `${through || 'No'} cables routed through it. Snap-in lip so cables can be added later.`,
          refs: [i.id],
        });
        break;
      }
      case 'spine':
        parts.push({
          name: i.name,
          kind: 'planned',
          qty: Math.max(1, Math.ceil(i.length / 2)),
          dimensions: `${Math.ceil(i.length / 2)} vertebrae, ~50 mm pitch, opening Ø ${mm(i.capacity)} mm`,
          notes: `Total length ${mm(i.length)} mm. Must flex over the full standing range if on a standing desk.`,
          refs: [i.id],
        });
        break;
      case 'tray':
        parts.push({
          name: i.name,
          kind: 'planned',
          qty: Math.max(1, Math.ceil((i.length * CM_PER_INCH * 10) / 220)),
          dimensions: `${mm(i.length)} long × ${mm(i.width)} wide × ${mm(i.depth)} deep`,
          notes: 'Split into sections that fit your bed (count assumes 220 mm); add dovetail joints between sections.',
          refs: [i.id],
        });
        break;
      case 'raceway':
        parts.push({
          name: i.name,
          kind: 'planned',
          qty: Math.max(1, Math.ceil((i.length * CM_PER_INCH * 10) / 220)),
          dimensions: `channel ${mm(i.width)} × ${mm(i.depth)} mm, ${mm(i.length)} mm total`,
          notes: 'Print in sections with a snap-on cover.',
          refs: [i.id],
        });
        break;
      case 'powerStrip':
        parts.push({
          name: `Mount for ${i.name}`,
          kind: 'planned',
          qty: 1,
          dimensions: `cradle ${fitMm(i.size)}`,
          notes: 'Keep the outlet face and switch exposed.',
          refs: [i.id],
        });
        break;
      case 'monitorArm':
        parts.push({ name: `${i.name} cable clips`, kind: 'planned', qty: 3, dimensions: 'measure arm tube diameter', notes: 'Clip-on cable guides along the arm.', refs: [i.id] });
        break;
    }
  }

  for (const d of layout.devices.filter((x) => x.print3d)) {
    parts.push({
      name: `Mount for ${d.name}`,
      kind: 'planned',
      qty: 1,
      dimensions: `cradle ${fitMm(d.size)}`,
      notes: `${d.mount.on === 'surfaceUnder' ? 'Under-desk sleeve; ' : ''}leave ${d.ports.length} port openings clear.`,
      refs: [d.id],
    });
  }

  // Suggestions: loose inline bricks and grommet inserts.
  const held = new Set(layout.infra.flatMap((i) => (i.kind === 'brickHolder' && i.forDeviceId ? [i.forDeviceId] : [])));
  for (const d of layout.devices) {
    if (d.brick?.style !== 'inline' || held.has(d.id)) continue;
    parts.push({
      name: `Brick holder for ${d.name}`,
      kind: 'suggested',
      qty: 1,
      dimensions: `inner ${fitMm(d.brick.size)}`,
      notes: 'Gets the brick off the floor; mount under the desk near the tray.',
      refs: [d.id],
    });
  }
  const fills = new Map(analysis.fills.map((f) => [f.container, f]));
  for (const s of layout.surfaces) {
    for (const g of s.grommets) {
      const fill = fills.get(grommetKey(s.id, g.id));
      if (!fill) continue;
      parts.push({
        name: `Grommet insert (${s.name})`,
        kind: 'suggested',
        qty: 1,
        dimensions: `outer Ø ${mm(g.diameter)} mm, slot ≥ ${Math.ceil(mm(fill.bundleDiameter))} mm`,
        notes: `${fill.cableIds.length} cables pass through. A slotted cap lets you add cables without unplugging.`,
        refs: [s.id],
      });
    }
  }
  return parts;
}

export function printPartsTable(parts: readonly PrintPart[]): Table {
  return {
    headers: ['Part', 'Status', 'Qty', 'Dimensions', 'Notes'],
    rows: parts.map((p) => [p.name, p.kind, p.qty, p.dimensions, p.notes]),
  };
}
