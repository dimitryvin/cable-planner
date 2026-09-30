import { exampleLayout } from '../model/seed';
import { deserializeLayout, loadFromStorage, saveToStorage, serializeLayout } from './persistence';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('persistence', () => {
  it('round-trips through JSON export/import', () => {
    const layout = exampleLayout();
    const parsed = deserializeLayout(serializeLayout(layout));
    expect(parsed.ok && parsed.layout).toEqual(layout);
  });

  it('round-trips through storage', () => {
    const s = memoryStorage();
    const layout = exampleLayout();
    expect(saveToStorage(layout, s)).toBe(true);
    expect(loadFromStorage(s)).toEqual(layout);
  });

  it('rejects bad input with a readable error', () => {
    expect(deserializeLayout('{nope')).toMatchObject({ ok: false });
    expect(deserializeLayout('{"schemaVersion": 99, "room": {"shape": {"kind":"rect","width":1,"depth":1}}}')).toMatchObject({
      ok: false,
      error: expect.stringContaining('newer'),
    });
    expect(deserializeLayout('{"schemaVersion": 1, "room": {"shape": {"kind":"rect","width":0,"depth":1}}}')).toMatchObject({
      ok: false,
    });
  });

  it('fills defaults for missing optional fields', () => {
    const r = deserializeLayout('{"schemaVersion":1,"room":{"shape":{"kind":"rect","width":100,"depth":80},"labelStyle":"compass","ceilingHeight":96}}');
    expect(r.ok && r.layout.cables).toEqual([]);
    expect(r.ok && r.layout.settings.slackPct).toBe(0.15);
  });

  it('returns undefined for corrupt storage', () => {
    expect(loadFromStorage({ getItem: () => '{broken' })).toBeUndefined();
  });
});
