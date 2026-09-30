import { analyzeLayout } from '../calc/analyze';
import { exampleLayout } from '../model/seed';
import { installChecklist } from './checklist';
import { toCsv, toMarkdownTable } from './format';
import { printParts } from './printParts';
import { shoppingList, velcroTies } from './shopping';
import { routeSummary, wiringRows } from './wiring';

describe('outputs', () => {
  const layout = exampleLayout();
  const analysis = analyzeLayout(layout);

  it('groups identical cables into one shopping line with a quantity', () => {
    const doubled = { ...layout, cables: [...layout.cables, { ...layout.cables.find((c) => c.label === 'Router WAN')!, id: 'dup' }] };
    const items = shoppingList(doubled, analyzeLayout(doubled));
    const cat6 = items.filter((i) => i.category === 'Cables' && i.name.startsWith('Cat6'));
    expect(cat6.find((i) => i.refs.includes('dup'))!.qty).toBeGreaterThanOrEqual(2);
  });

  it('lists only cables to buy, and included cords separately', () => {
    const items = shoppingList(layout, analysis);
    const buy = layout.cables.filter((c) => c.source === 'buy' && c.fixedLength === undefined).length;
    expect(items.filter((i) => i.category === 'Cables').reduce((n, i) => n + i.qty, 0)).toBe(buy);
    expect(items.some((i) => i.category === 'Check included cords')).toBe(true);
    expect(items.flatMap((i) => i.refs)).not.toContain(layout.cables.find((c) => c.fixedLength !== undefined)!.id);
  });

  it('excludes printed gear from the shopping list', () => {
    const items = shoppingList(layout, analysis);
    expect(items.some((i) => i.name === 'Power brick holder')).toBe(false);
    expect(printParts(layout, analysis).some((p) => p.name === 'Dock brick holder' && p.kind === 'planned')).toBe(true);
  });

  it('estimates velcro ties from bundle length and spacing', () => {
    const ties = velcroTies(layout, analysis);
    const expected = analysis.bundles.bundles.reduce((n, b) => n + Math.floor(b.sharedLength / layout.settings.velcroSpacing) + 1, 0);
    expect(ties).toBe(expected);
    expect(ties).toBeGreaterThan(0);
  });

  it('builds one wiring row per cable with a readable route', () => {
    const rows = wiringRows(layout, analysis);
    expect(rows).toHaveLength(layout.cables.length);
    expect(routeSummary(['top', 'grommet', 'under', 'under', 'tray'])).toBe('desk top → grommet → under desk → tray');
  });

  it('orders the install: mount, power, video, data, test, tie', () => {
    const ids = installChecklist(layout, analysis).map((s) => s.id);
    const order = ['mount', 'strips', 'power', 'video', 'data', 'range', 'tie', 'power-on'];
    const positions = order.map((id) => ids.indexOf(id)).filter((i) => i >= 0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(ids[0]).toBe('fix'); // example has a blocking reach error
  });

  it('escapes CSV and Markdown cells', () => {
    const t = { headers: ['a', 'b'], rows: [['x, "y"', 'p|q']] };
    expect(toCsv(t)).toBe('a,b\n"x, ""y""",p|q\n');
    expect(toMarkdownTable(t)).toContain('p\\|q');
  });
});
