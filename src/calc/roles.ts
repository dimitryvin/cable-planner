import { BUILT_IN_PRESETS } from '../model/defaults';
import type { Device, DeviceRole, Layout } from '../model/types';

export const ROLE_LABELS: Record<DeviceRole, string> = {
  computer: 'Computer',
  laptop: 'Laptop',
  dock: 'Dock / hub',
  display: 'Display',
  peripheral: 'USB peripheral',
  audio: 'Speakers / audio',
  network: 'Router / switch',
  storage: 'Storage / NAS',
  appliance: 'Power only (lamp, charger)',
  other: 'Other',
};

/** Explicit role, else the preset's, else a guess from ports and name. */
export function roleOf(layout: Layout, d: Device): DeviceRole {
  if (d.role) return d.role;
  const preset = [...BUILT_IN_PRESETS, ...layout.customPresets].find((p) => p.id === d.presetId);
  if (preset?.role) return preset.role;
  const types = new Set(d.ports.map((p) => p.type));
  const name = d.name.toLowerCase();
  if (/monitor|display|screen|tv\b/.test(name)) return 'display';
  if (/laptop|macbook|notebook/.test(name)) return 'laptop';
  if (/dock|hub/.test(name)) return 'dock';
  if (/router|switch|modem|access point/.test(name)) return 'network';
  if (/nas|drive|storage/.test(name)) return 'storage';
  if (/speaker|dac|amp/.test(name)) return 'audio';
  if (d.ports.filter((p) => p.type === 'ethernet').length >= 3) return 'network';
  if ((types.has('hdmi') || types.has('dp')) && types.has('ethernet')) return 'computer';
  if (d.ports.length > 0 && d.ports.every((p) => p.type === 'ac' || p.type === 'dc')) return 'appliance';
  if (d.ports.length <= 2 && (types.has('usb-a') || types.has('usb-c'))) return 'peripheral';
  return 'other';
}
