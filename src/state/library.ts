import { newId } from '../model/ids';
import { exampleLayout } from '../model/seed';
import type { Layout } from '../model/types';
import { deserializeLayout, STORAGE_KEY } from './persistence';

/**
 * Multiple saved layouts in browser storage.
 *
 * - `cable-planner:index` lists layouts and remembers which one is open.
 * - `cable-planner:layouts:<id>` holds each layout in the same JSON as exports.
 * - The single-layout key from earlier versions (`cable-planner:layout`) is
 *   never modified or deleted. Its contents are imported once, and imported
 *   again as a "(recovered)" copy whenever an older version of the app (an
 *   open tab, a cached bundle, a rollback) writes something new to it.
 */

export const INDEX_KEY = 'cable-planner:index';
export const LAYOUT_PREFIX = 'cable-planner:layouts:';
export const LEGACY_KEY = STORAGE_KEY;

export type LibraryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** In-memory fallback when browser storage is unavailable (private mode, blocked storage). */
export class MemoryStorage implements LibraryStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

export function browserStorage(): LibraryStorage {
  try {
    const s = globalThis.localStorage;
    s.getItem(INDEX_KEY);
    return s;
  } catch {
    return new MemoryStorage();
  }
}

export interface LayoutEntry {
  id: string;
  name: string;
  updatedAt: number;
  recovered?: boolean;
}

export interface LibraryIndex {
  version: 1;
  currentId: string;
  /** Digest of the legacy value last imported, so it is only imported again when it changes. */
  legacyDigest?: string;
  layouts: LayoutEntry[];
}

export interface OpenResult {
  index: LibraryIndex;
  layout: Layout;
}

export interface LibraryDeps {
  now?: () => number;
  makeId?: () => string;
}

const layoutKey = (id: string) => `${LAYOUT_PREFIX}${id}`;
const defaults = (deps: LibraryDeps) => ({ now: deps.now ?? Date.now, makeId: deps.makeId ?? (() => newId('lay')) });

/** FNV-1a 64-bit of the raw string, plus its length. Only used to notice changes. */
export function digest(raw: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < raw.length; i++) {
    h ^= BigInt(raw.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `${h.toString(16)}:${raw.length}`;
}

function safeGet(storage: LibraryStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeIndex(storage: LibraryStorage, index: LibraryIndex): void {
  storage.setItem(INDEX_KEY, JSON.stringify(index));
}

function isEntry(x: unknown): x is LayoutEntry {
  const e = x as LayoutEntry;
  return !!e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.updatedAt === 'number';
}

export function readIndex(storage: LibraryStorage): LibraryIndex | undefined {
  const raw = safeGet(storage, INDEX_KEY);
  if (!raw) return undefined;
  try {
    const x = JSON.parse(raw) as LibraryIndex;
    if (x?.version !== 1 || !Array.isArray(x.layouts) || !x.layouts.every(isEntry) || typeof x.currentId !== 'string') return undefined;
    return x;
  } catch {
    return undefined;
  }
}

export function loadLayoutById(storage: LibraryStorage, id: string): Layout | undefined {
  const raw = safeGet(storage, layoutKey(id));
  if (!raw) return undefined;
  const parsed = deserializeLayout(raw);
  return parsed.ok ? parsed.layout : undefined;
}

/** Rebuild an index from whatever layout keys parse. Unparseable ones are left alone. */
function rebuildIndex(storage: LibraryStorage, now: number): LibraryIndex {
  const layouts: LayoutEntry[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(LAYOUT_PREFIX)) continue;
    const id = key.slice(LAYOUT_PREFIX.length);
    const layout = loadLayoutById(storage, id);
    if (layout) layouts.push({ id, name: layout.name, updatedAt: now });
  }
  return { version: 1, currentId: layouts[0]?.id ?? '', layouts };
}

function addEntry(storage: LibraryStorage, index: LibraryIndex, layout: Layout, id: string, now: number, recovered = false): LibraryIndex {
  storage.setItem(layoutKey(id), JSON.stringify(layout));
  const entry: LayoutEntry = { id, name: layout.name, updatedAt: now, ...(recovered ? { recovered: true } : {}) };
  return { ...index, layouts: [...index.layouts, entry] };
}

/**
 * Loads the library, migrating/recovering the legacy single layout and
 * seeding the example if there is nothing yet. Writes the index back.
 */
export function openLibrary(storage: LibraryStorage, deps: LibraryDeps = {}): OpenResult {
  const { now, makeId } = defaults(deps);
  const t = now();
  const existing = readIndex(storage);
  let index: LibraryIndex = existing ?? rebuildIndex(storage, t);
  const firstRun = !existing && index.layouts.length === 0;

  // Legacy reconciliation.
  const legacyRaw = safeGet(storage, LEGACY_KEY);
  if (legacyRaw) {
    const d = digest(legacyRaw);
    const parsed = deserializeLayout(legacyRaw);
    if (parsed.ok && d !== index.legacyDigest) {
      const id = makeId();
      if (firstRun) {
        index = { ...addEntry(storage, index, parsed.layout, id, t), currentId: id };
      } else {
        const layout = { ...parsed.layout, name: `${parsed.layout.name} (recovered)` };
        index = addEntry(storage, index, layout, id, t, true);
      }
      index = { ...index, legacyDigest: d };
    }
  }

  // Resolve the layout to open.
  let layout = index.currentId ? loadLayoutById(storage, index.currentId) : undefined;
  if (!layout) {
    const candidates = index.layouts.filter((e) => e.id !== index.currentId);
    for (const e of [...candidates].sort((a, b) => b.updatedAt - a.updatedAt)) {
      layout = loadLayoutById(storage, e.id);
      if (layout) {
        index = { ...index, currentId: e.id };
        break;
      }
    }
  }
  if (!layout) {
    const id = makeId();
    layout = exampleLayout();
    index = { ...addEntry(storage, index, layout, id, t), currentId: id };
  }

  writeIndex(storage, index);
  return { index, layout };
}

/** Saves a layout and refreshes its list entry. Never throws; `ok` is false if storage refused. */
export function saveLayout(storage: LibraryStorage, index: LibraryIndex, id: string, layout: Layout, deps: LibraryDeps = {}): { ok: boolean; index: LibraryIndex } {
  const { now } = defaults(deps);
  try {
    storage.setItem(layoutKey(id), JSON.stringify(layout));
    const t = now();
    const has = index.layouts.some((e) => e.id === id);
    const layouts = has
      ? index.layouts.map((e) => (e.id === id ? { ...e, name: layout.name, updatedAt: t } : e))
      : [...index.layouts, { id, name: layout.name, updatedAt: t }];
    const next = { ...index, layouts };
    writeIndex(storage, next);
    return { ok: true, index: next };
  } catch {
    return { ok: false, index };
  }
}

/** Adds a layout as a new entry and makes it current. */
export function createLayout(storage: LibraryStorage, index: LibraryIndex, layout: Layout, deps: LibraryDeps = {}): { index: LibraryIndex; id: string } {
  const { now, makeId } = defaults(deps);
  const id = makeId();
  const next = { ...addEntry(storage, index, layout, id, now()), currentId: id };
  writeIndex(storage, next);
  return { index: next, id };
}

export function switchLayout(storage: LibraryStorage, index: LibraryIndex, id: string): { index: LibraryIndex; layout: Layout } | undefined {
  const layout = loadLayoutById(storage, id);
  if (!layout) return undefined;
  const next = { ...index, currentId: id };
  writeIndex(storage, next);
  return { index: next, layout };
}

/**
 * Deletes a layout. If it was open, the most recently edited remaining one is
 * opened, or a new empty layout is created when none remain.
 */
export function deleteLayout(
  storage: LibraryStorage,
  index: LibraryIndex,
  id: string,
  makeEmpty: () => Layout,
  deps: LibraryDeps = {},
): { index: LibraryIndex; layout?: Layout } {
  // The index is written before the data is removed, so a refused write never
  // leaves a list entry pointing at nothing.
  let next: LibraryIndex = { ...index, layouts: index.layouts.filter((e) => e.id !== id) };
  if (index.currentId !== id) {
    writeIndex(storage, next);
    storage.removeItem(layoutKey(id));
    return { index: next };
  }
  for (const e of [...next.layouts].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const layout = loadLayoutById(storage, e.id);
    if (layout) {
      next = { ...next, currentId: e.id };
      writeIndex(storage, next);
      storage.removeItem(layoutKey(id));
      return { index: next, layout };
    }
  }
  const empty = makeEmpty();
  const created = createLayout(storage, next, empty, deps);
  storage.removeItem(layoutKey(id));
  return { index: created.index, layout: empty };
}

export interface SafeOpenResult extends OpenResult {
  storage: LibraryStorage;
  /** Storage refused writes; everything is kept in memory for this session. */
  degraded: boolean;
}

/**
 * Opens the library, falling back to an in-memory copy of the saved data when
 * the browser refuses writes (storage full or blocked), so the app still loads.
 * Nothing is written to the real storage in that case.
 */
export function openLibrarySafely(storage: LibraryStorage, deps: LibraryDeps = {}): SafeOpenResult {
  try {
    return { ...openLibrary(storage, deps), storage, degraded: false };
  } catch {
    const memory = new MemoryStorage();
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith('cable-planner:')) continue;
        const value = storage.getItem(key);
        if (value !== null) memory.setItem(key, value);
      }
    } catch {
      /* unreadable storage: start from an empty in-memory library */
    }
    return { ...openLibrary(memory, deps), storage: memory, degraded: true };
  }
}
