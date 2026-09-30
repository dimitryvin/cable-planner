import { emptyLayout, exampleLayout } from '../model/seed';
import type { Layout } from '../model/types';
import {
  createLayout,
  deleteLayout,
  digest,
  INDEX_KEY,
  LAYOUT_PREFIX,
  LEGACY_KEY,
  loadLayoutById,
  openLibrary,
  readIndex,
  saveLayout,
  switchLayout,
  type LibraryStorage,
} from './library';

class MemoryStorage implements LibraryStorage {
  private m = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function deps() {
  let t = 1000;
  let n = 0;
  return { now: () => (t += 10), makeId: () => `id${++n}` };
}

const named = (name: string): Layout => ({ ...emptyLayout(name) });

describe('layout library', () => {
  it('migrates the legacy layout on first load and leaves the legacy key untouched', () => {
    const s = new MemoryStorage();
    const legacy = { ...exampleLayout(), name: 'My office' };
    const raw = JSON.stringify(legacy);
    s.setItem(LEGACY_KEY, raw);
    const d = deps();

    const first = openLibrary(s, d);
    expect(first.layout).toEqual(legacy);
    expect(first.index.layouts.map((e) => e.name)).toEqual(['My office']);
    expect(s.getItem(LEGACY_KEY)).toBe(raw);

    const second = openLibrary(s, d);
    expect(second.index.layouts).toHaveLength(1);
    expect(second.layout).toEqual(legacy);
    expect(s.getItem(LEGACY_KEY)).toBe(raw);
  });

  it('recovers edits an older app version writes to the legacy key after migration', () => {
    const s = new MemoryStorage();
    const d = deps();
    s.setItem(LEGACY_KEY, JSON.stringify(named('Office')));
    const first = openLibrary(s, d);
    const migratedId = first.index.currentId;
    const migratedBefore = s.getItem(`${LAYOUT_PREFIX}${migratedId}`);

    // An old tab keeps saving to the legacy key.
    const changed = { ...named('Office'), units: 'cm' as const };
    const changedRaw = JSON.stringify(changed);
    s.setItem(LEGACY_KEY, changedRaw);

    const second = openLibrary(s, d);
    const recovered = second.index.layouts.filter((e) => e.recovered);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.name).toBe('Office (recovered)');
    expect(loadLayoutById(s, recovered[0]!.id)).toEqual({ ...changed, name: 'Office (recovered)' });
    expect(second.index.currentId).toBe(migratedId); // stays on what you had open
    expect(s.getItem(`${LAYOUT_PREFIX}${migratedId}`)).toBe(migratedBefore);
    expect(s.getItem(LEGACY_KEY)).toBe(changedRaw);
    expect(second.index.legacyDigest).toBe(digest(changedRaw));

    const third = openLibrary(s, d);
    expect(third.index.layouts).toHaveLength(2);
  });

  it('seeds the example when nothing is saved, and ignores a corrupt legacy value', () => {
    const s = new MemoryStorage();
    s.setItem(LEGACY_KEY, '{broken');
    const r = openLibrary(s, deps());
    expect(r.layout.name).toBe('Example office');
    expect(r.index.layouts).toHaveLength(1);
    expect(r.index.legacyDigest).toBeUndefined();
    expect(s.getItem(LEGACY_KEY)).toBe('{broken');
  });

  it('rebuilds a corrupt index from saved layouts and re-imports the legacy value once', () => {
    const s = new MemoryStorage();
    const d = deps();
    s.setItem(LEGACY_KEY, JSON.stringify(named('Legacy')));
    const first = openLibrary(s, d);
    createLayout(s, first.index, named('Second'), d);
    s.setItem(INDEX_KEY, 'not json');
    s.setItem(`${LAYOUT_PREFIX}junk`, '{nope'); // unparseable entries are left alone

    const r = openLibrary(s, d);
    const names = r.index.layouts.map((e) => e.name).sort();
    expect(names).toEqual(['Legacy', 'Legacy (recovered)', 'Second']);
    expect(s.getItem(`${LAYOUT_PREFIX}junk`)).toBe('{nope');
    expect(openLibrary(s, d).index.layouts).toHaveLength(3);
  });

  it('creates, switches and saves without overwriting other layouts', () => {
    const s = new MemoryStorage();
    const d = deps();
    const a = openLibrary(s, d);
    const firstId = a.index.currentId;
    const b = createLayout(s, a.index, named('Bedroom'), d);
    expect(b.index.currentId).toBe(b.id);
    expect(loadLayoutById(s, firstId)?.name).toBe('Example office');

    const saved = saveLayout(s, b.index, b.id, { ...named('Bedroom desk') }, d);
    expect(saved.ok).toBe(true);
    const entry = saved.index.layouts.find((e) => e.id === b.id)!;
    expect(entry.name).toBe('Bedroom desk');
    expect(entry.updatedAt).toBeGreaterThan(b.index.layouts.find((e) => e.id === b.id)!.updatedAt);

    const back = switchLayout(s, saved.index, firstId)!;
    expect(back.layout.name).toBe('Example office');
    expect(readIndex(s)?.currentId).toBe(firstId);
  });

  it('deletes layouts, falling back to the most recent or a new empty one', () => {
    const s = new MemoryStorage();
    const d = deps();
    const a = openLibrary(s, d);
    const b = createLayout(s, a.index, named('B'), d);
    const other = deleteLayout(s, b.index, a.index.currentId, () => emptyLayout('Empty'), d);
    expect(other.layout).toBeUndefined(); // deleting a non-current layout keeps the current one open
    expect(other.index.layouts.map((e) => e.name)).toEqual(['B']);

    const last = deleteLayout(s, other.index, b.id, () => emptyLayout('Empty'), d);
    expect(last.layout?.name).toBe('Empty');
    expect(last.index.layouts.map((e) => e.name)).toEqual(['Empty']);
    expect(s.getItem(`${LAYOUT_PREFIX}${b.id}`)).toBeNull();
  });

  it('reports a failed save instead of throwing', () => {
    const s = new MemoryStorage();
    const d = deps();
    const a = openLibrary(s, d);
    s.failWrites = true;
    const r = saveLayout(s, a.index, a.index.currentId, named('X'), d);
    expect(r.ok).toBe(false);
    expect(r.index).toBe(a.index);
  });
});
