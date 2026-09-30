import type { Analysis } from '../calc/analyze';
import { clipsNeeded } from '../calc/warnings';
import { findPort } from '../geometry/resolve';
import { PORT_LABELS, SPECS } from '../model/defaults';
import type { Cable, Layout, PortType } from '../model/types';
import { formatLong } from '../model/units';
import type { Table } from './format';

export type ShoppingCategory = 'Cables' | 'Check included cords' | 'Power' | 'Cable management' | 'Mounts' | 'Consumables';

export interface ShoppingItem {
  category: ShoppingCategory;
  name: string;
  detail: string;
  qty: number;
  /** Cables this line covers (for highlighting). */
  refs: string[];
}

const connectorsOf = (layout: Layout, c: Cable): [PortType, PortType] => {
  const a = findPort(layout, c.from)?.port.type ?? 'other';
  const b = findPort(layout, c.to)?.port.type ?? 'other';
  // Stable order so A→B and B→A group together.
  return a <= b ? [a, b] : [b, a];
};

const connectorLabel = ([a, b]: [PortType, PortType]) => (a === b ? `${PORT_LABELS[a]} ↔ ${PORT_LABELS[b]}` : `${PORT_LABELS[a]} → ${PORT_LABELS[b]}`);

function add(list: ShoppingItem[], item: ShoppingItem): ShoppingItem[] {
  const i = list.findIndex((x) => x.category === item.category && x.name === item.name && x.detail === item.detail);
  if (i < 0) return [...list, item];
  const merged = { ...list[i]!, qty: list[i]!.qty + item.qty, refs: [...list[i]!.refs, ...item.refs] };
  return list.map((x, j) => (j === i ? merged : x));
}

export function shoppingList(layout: Layout, analysis: Analysis): ShoppingItem[] {
  const units = layout.units;
  let items: ShoppingItem[] = [];

  for (const c of layout.cables) {
    const len = analysis.lengths.get(c.id);
    if (!len || c.fixedLength !== undefined) continue;
    const conns = connectorsOf(layout, c);
    const retail = units === 'cm' ? len.retailMetric : len.retailImperial;
    if (c.source === 'buy') {
      items = add(items, {
        category: 'Cables',
        name: `${SPECS[c.spec].label} · ${connectorLabel(conns)}`,
        detail: retail.overflow ? `custom length ≥ ${formatLong(len.required, units)}` : retail.label,
        qty: 1,
        refs: [c.id],
      });
    } else if (c.source === 'included') {
      items = add(items, {
        category: 'Check included cords',
        name: c.label || connectorLabel(conns),
        detail: `needs ≥ ${formatLong(len.required, units)}`,
        qty: 1,
        refs: [c.id],
      });
    }
  }

  const buyable = layout.infra.filter((i) => !i.print3d);
  for (const i of buyable) {
    switch (i.kind) {
      case 'powerStrip':
        items = add(items, { category: 'Power', name: `Power strip, ${i.ports.length - 1} outlets`, detail: `${i.maxWatts} W, ${formatLong(i.cordLength, units)} cord`, qty: 1, refs: [i.id] });
        break;
      case 'tray':
        items = add(items, { category: 'Cable management', name: 'Under-desk cable tray', detail: `${formatLong(i.length, units)} long, ${formatLong(i.width, units)} wide`, qty: 1, refs: [i.id] });
        break;
      case 'raceway':
        items = add(items, { category: 'Cable management', name: 'Cable raceway', detail: `${formatLong(i.length, units)} (${i.orientation})`, qty: 1, refs: [i.id] });
        break;
      case 'spine':
        items = add(items, { category: 'Cable management', name: 'Cable spine', detail: formatLong(i.length, units), qty: 1, refs: [i.id] });
        break;
      case 'monitorArm':
        items = add(items, { category: 'Mounts', name: 'Monitor arm', detail: i.hasChannel ? 'with cable channel' : '', qty: 1, refs: [i.id] });
        break;
      case 'brickHolder':
        items = add(items, { category: 'Mounts', name: 'Power brick holder', detail: `fits ${formatLong(i.size.w, units)} × ${formatLong(i.size.d, units)}`, qty: 1, refs: [i.id] });
        break;
      case 'clip':
        break;
    }
  }

  // Clips: ones placed explicitly (unless printed) plus enough for every hanging span.
  const placedClips = buyable.filter((i) => i.kind === 'clip').length;
  const printedClips = layout.infra.some((i) => i.kind === 'clip' && i.print3d);
  const spanClips = [...analysis.routes.values()].reduce((n, r) => n + (r.ok ? clipsNeeded(r, layout.settings) : 0), 0);
  if (!printedClips && placedClips + spanClips > 0) {
    items = add(items, {
      category: 'Consumables',
      name: 'Adhesive cable clips',
      detail: `${placedClips} placed + ${spanClips} for hanging spans (every ${formatLong(layout.settings.clipSpacing, units)})`,
      qty: placedClips + spanClips,
      refs: [],
    });
  }

  const ties = velcroTies(layout, analysis);
  if (ties > 0) {
    items = add(items, {
      category: 'Consumables',
      name: 'Velcro cable ties',
      detail: `bundles tied every ${formatLong(layout.settings.velcroSpacing, units)}`,
      qty: ties,
      refs: [],
    });
  }

  return items;
}

/** One tie per spacing along each bundle, plus one at each end. */
export function velcroTies(layout: Layout, analysis: Analysis): number {
  const spacing = Math.max(1, layout.settings.velcroSpacing);
  return analysis.bundles.bundles.reduce((n, b) => n + Math.floor(b.sharedLength / spacing) + 1, 0);
}

const ORDER: ShoppingCategory[] = ['Cables', 'Power', 'Cable management', 'Mounts', 'Consumables', 'Check included cords'];

export function shoppingTable(items: readonly ShoppingItem[]): Table {
  const sorted = [...items].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  return { headers: ['Category', 'Item', 'Details', 'Qty'], rows: sorted.map((i) => [i.category, i.name, i.detail, i.qty]) };
}

export function groupShopping(items: readonly ShoppingItem[]): [ShoppingCategory, ShoppingItem[]][] {
  return ORDER.map((c) => [c, items.filter((i) => i.category === c)] as [ShoppingCategory, ShoppingItem[]]).filter(([, xs]) => xs.length > 0);
}
