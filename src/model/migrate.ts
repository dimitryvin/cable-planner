import { DEFAULT_SETTINGS } from './defaults';
import { SCHEMA_VERSION, type Layout } from './types';

export type ParseResult = { ok: true; layout: Layout } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Fills cable fields added after a file was saved, so older exports keep working. */
function normalizeCable(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const power = raw.spec === 'ac' || raw.spec === 'dc';
  return {
    routing: 'auto',
    waypoints: [],
    label: '',
    ...raw,
    source: raw.source === 'buy' || raw.source === 'owned' || raw.source === 'included' ? raw.source : raw.fixedLength !== undefined || power ? 'included' : 'buy',
  };
}

const ARRAY_KEYS = ['features', 'surfaces', 'devices', 'infra', 'cables', 'customPresets'] as const;

/**
 * Validates and upgrades an imported/stored document. Checks structure, not
 * every field; unknown extra fields are kept so newer files degrade gracefully.
 */
export function parseLayout(input: unknown): ParseResult {
  if (!isObj(input)) return { ok: false, error: 'File is not a layout object.' };
  const version = input.schemaVersion;
  if (typeof version !== 'number') return { ok: false, error: 'Missing schemaVersion.' };
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: `Layout is from a newer version (schema ${version}); update the app.` };
  }
  if (!isObj(input.room) || !isObj(input.room.shape)) return { ok: false, error: 'Missing room definition.' };
  const shape = input.room.shape;
  if (shape.kind !== 'rect' && shape.kind !== 'L') return { ok: false, error: 'Unknown room shape.' };
  if (!(Number(shape.width) > 0) || !(Number(shape.depth) > 0)) {
    return { ok: false, error: 'Room width and depth must be positive.' };
  }
  for (const key of ARRAY_KEYS) {
    if (input[key] !== undefined && !Array.isArray(input[key])) return { ok: false, error: `"${key}" must be a list.` };
  }

  const layout = {
    ...input,
    schemaVersion: SCHEMA_VERSION,
    name: typeof input.name === 'string' ? input.name : 'Imported layout',
    units: input.units === 'cm' ? 'cm' : 'in',
    settings: { ...DEFAULT_SETTINGS, ...(isObj(input.settings) ? input.settings : {}) },
    features: input.features ?? [],
    surfaces: input.surfaces ?? [],
    devices: input.devices ?? [],
    infra: input.infra ?? [],
    cables: ((input.cables as unknown[] | undefined) ?? []).map(normalizeCable),
    customPresets: input.customPresets ?? [],
  } as Layout;
  return { ok: true, layout };
}
