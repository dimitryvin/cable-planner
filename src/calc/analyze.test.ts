import { exampleLayout } from '../model/seed';
import type { Layout } from '../model/types';
import { analyzeLayout } from './analyze';

describe('analyzeLayout (example)', () => {
  const layout = exampleLayout();
  const a = analyzeLayout(layout);
  const byLabel = (label: string) => layout.cables.find((c) => c.label === label)!.id;

  it('routes and sizes every cable', () => {
    expect(a.lengths.size).toBe(layout.cables.length);
  });

  it('gives cables on the standing desk extra length for full height', () => {
    const toRouter = a.lengths.get(byLabel('Dock → router'))!;
    expect(toRouter.standing).toBe(true);
    expect(toRouter.standingExtra).toBeGreaterThan(15);
    const wan = a.lengths.get(byLabel('Router WAN'))!;
    expect(wan.standing).toBe(false);
  });

  it('does not add standing slack when both ends ride the same desk', () => {
    expect(a.lengths.get(byLabel('Mini → dock'))!.standingExtra).toBeCloseTo(0, 1);
    expect(a.lengths.get(byLabel('Mac mini power'))!.standingExtra).toBeCloseTo(0, 1);
  });

  it('catches the example strip cord being too short at full height', () => {
    const cord = a.issues.find((i) => i.code === 'cable.cant-reach');
    expect(cord?.refs).toEqual([byLabel('Power strip cord')]);
  });

  it('finds the under-desk bundle', () => {
    expect(a.bundles.bundles.length).toBeGreaterThan(0);
    const biggest = [...a.bundles.bundles].sort((x, y) => y.cableIds.length - x.cableIds.length)[0]!;
    expect(biggest.cableIds.length).toBeGreaterThanOrEqual(4);
  });

  it('clears the reach error once the cord is long enough', () => {
    const longer: Layout = {
      ...layout,
      cables: layout.cables.map((c) => (c.label === 'Power strip cord' ? { ...c, fixedLength: 120 } : c)),
    };
    expect(analyzeLayout(longer).issues.map((i) => i.code)).not.toContain('cable.cant-reach');
  });
});
