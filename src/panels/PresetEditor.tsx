import { PORT_LABELS } from '../model/defaults';
import type { DevicePreset, MountKind, PortType } from '../model/types';
import { LengthField, NumberField, SelectField, TextField } from './fields';

const MOUNTS: [MountKind, string][] = [
  ['surfaceTop', 'On a surface'],
  ['surfaceUnder', 'Under a surface'],
  ['floor', 'Floor'],
  ['wall', 'Wall'],
  ['arm', 'Monitor arm'],
];
const TYPES = Object.keys(PORT_LABELS) as PortType[];

/** Inline editor for a user preset. Port positions are laid out across the back automatically. */
export function PresetEditor({ preset, onChange, onDone }: { preset: DevicePreset; onChange: (p: DevicePreset) => void; onDone: () => void }) {
  const set = (patch: Partial<DevicePreset>) => onChange({ ...preset, ...patch });
  const relayout = (ports: DevicePreset['ports']): DevicePreset['ports'] =>
    ports.map((p, i) => ({
      ...p,
      local: { x: ports.length === 1 ? 0 : -preset.size.w / 2 + (preset.size.w * (i + 0.5)) / ports.length, y: -preset.size.d / 2, z: Math.min(1, preset.size.h / 2) },
    }));

  return (
    <div className="preset-editor">
      <TextField label="Name" value={preset.name} onChange={(name) => set({ name })} />
      <LengthField label="Width" min={0.1} value={preset.size.w} onChange={(w) => set({ size: { ...preset.size, w } })} />
      <LengthField label="Depth" min={0.1} value={preset.size.d} onChange={(d) => set({ size: { ...preset.size, d } })} />
      <LengthField label="Height" min={0.1} value={preset.size.h} onChange={(h) => set({ size: { ...preset.size, h } })} />
      <NumberField label="Power draw" unit="W" min={0} value={preset.watts} onChange={(watts) => set({ watts })} />
      <SelectField label="Default placement" value={preset.defaultMount} options={MOUNTS} onChange={(defaultMount) => set({ defaultMount })} />
      <div className="ports">
        {preset.ports.map((p, i) => (
          <div key={i} className="port-row">
            <select className="input" value={p.type} onChange={(e) => set({ ports: preset.ports.map((x, j) => (j === i ? { ...x, type: e.target.value as PortType } : x)) })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {PORT_LABELS[t]}
                </option>
              ))}
            </select>
            <input className="input" value={p.label} onChange={(e) => set({ ports: preset.ports.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <span />
            <button className="icon-btn" onClick={() => set({ ports: relayout(preset.ports.filter((_, j) => j !== i)) })}>×</button>
          </div>
        ))}
        <button className="btn small" onClick={() => set({ ports: relayout([...preset.ports, { type: 'usb-c', label: `Port ${preset.ports.length + 1}`, local: { x: 0, y: 0, z: 0 } }]) })}>
          + Port
        </button>
      </div>
      <button className="btn small primary" onClick={onDone}>Done</button>
    </div>
  );
}
