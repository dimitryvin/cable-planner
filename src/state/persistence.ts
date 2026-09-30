import { parseLayout, type ParseResult } from '../model/migrate';
import type { Layout } from '../model/types';

export const STORAGE_KEY = 'cable-planner:layout';

export function loadFromStorage(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Layout | undefined {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = parseLayout(JSON.parse(raw));
    return parsed.ok ? parsed.layout : undefined;
  } catch {
    return undefined;
  }
}

export function saveToStorage(layout: Layout, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}

export const serializeLayout = (layout: Layout): string => JSON.stringify(layout, null, 2);

export function deserializeLayout(text: string): ParseResult {
  try {
    return parseLayout(JSON.parse(text));
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
