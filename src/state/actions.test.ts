import { exampleLayout } from '../model/seed';
import { duplicateEntity, removeEntity, removePort, updateEntity } from './actions';

describe('layout actions', () => {
  const layout = exampleLayout();
  const desk = layout.surfaces[0]!;

  it('deleting a desk removes everything mounted on it and their cables', () => {
    const next = removeEntity(desk.id)(layout);
    expect(next.surfaces.map((s) => s.id)).not.toContain(desk.id);
    // monitor rides an arm that's clamped to the desk
    expect(next.devices.map((d) => d.name)).not.toContain('34" ultrawide');
    expect(next.devices.map((d) => d.name)).toContain('Router');
    const ids = new Set([...next.devices, ...next.features, ...next.infra].map((x) => x.id));
    for (const c of next.cables) {
      expect(ids.has(c.from.ownerId) && ids.has(c.to.ownerId)).toBe(true);
    }
  });

  it('removing a port drops its cables', () => {
    const router = layout.devices.find((d) => d.name === 'Router')!;
    const wan = router.ports.find((p) => p.label === 'WAN')!;
    const next = removePort(router.id, wan.id)(layout);
    expect(next.cables.find((c) => c.label === 'Router WAN')).toBeUndefined();
    expect(next.devices.find((d) => d.id === router.id)!.ports).toHaveLength(router.ports.length - 1);
  });

  it('updates immutably and returns the same object on no-op', () => {
    const next = updateEntity('surface', desk.id, (s) => ({ ...s, width: 72 }))(layout);
    expect(next.surfaces[0]!.width).toBe(72);
    expect(layout.surfaces[0]!.width).toBe(60);
    expect(updateEntity('surface', desk.id, (s) => s)(layout)).toBe(layout);
  });

  it('duplicates with fresh ids', () => {
    const mini = layout.devices.find((d) => d.name === 'Mac mini')!;
    const { layout: next, newId } = duplicateEntity(layout, mini.id);
    const copy = next.devices.find((d) => d.id === newId)!;
    expect(copy.name).toBe('Mac mini copy');
    expect(copy.ports.map((p) => p.id)).not.toEqual(mini.ports.map((p) => p.id));
  });
});
