import { useState } from 'react';
import { BUILT_IN_PRESETS } from '../model/defaults';
import { deviceFromPreset, makePowerStrip } from '../model/factories';
import { newId } from '../model/ids';
import type { DevicePreset, Infra, InfraKind, Layout } from '../model/types';
import { addEntity } from '../state/actions';
import { defaultMount } from '../state/placement';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';
import { PresetEditor } from './PresetEditor';

const INFRA_LABELS: Record<InfraKind, string> = {
  powerStrip: 'Power strip',
  tray: 'Cable tray',
  raceway: 'Raceway',
  clip: 'Adhesive clip',
  spine: 'Cable spine',
  monitorArm: 'Monitor arm',
  brickHolder: 'Brick holder',
};

function makeInfra(layout: Layout, kind: InfraKind, surfaceId: string | undefined): Infra {
  const under = defaultMount(layout, 'surfaceUnder', { w: 4, d: 4, h: 2 }, surfaceId).mount;
  const top = defaultMount(layout, 'surfaceTop', { w: 4, d: 4, h: 2 }, surfaceId).mount;
  const wall = defaultMount(layout, 'wall', { w: 4, d: 1, h: 1 }, surfaceId).mount;
  const base = { id: newId(kind.slice(0, 4)), name: INFRA_LABELS[kind], print3d: false };
  switch (kind) {
    case 'powerStrip':
      return makePowerStrip(under);
    case 'tray':
      return { ...base, kind, mount: under, length: 36, width: 5, depth: 3.5 };
    case 'raceway':
      return { ...base, kind, mount: wall.on === 'wall' ? { ...wall, at: { ...wall.at, z: 4 } } : wall, length: 48, width: 1, depth: 0.6, orientation: 'horizontal' };
    case 'clip':
      return { ...base, kind, mount: under, capacity: 0.5, print3d: true };
    case 'spine':
      return { ...base, kind, mount: under.on === 'surfaceUnder' ? { ...under, v: 3 } : under, length: 28, capacity: 1.2 };
    case 'monitorArm':
      return { ...base, kind, mount: top.on === 'surfaceTop' ? { ...top, v: 3 } : top, reach: 8, height: 16, hasChannel: true };
    case 'brickHolder':
      return { ...base, kind, mount: under, size: { w: 6, d: 3, h: 1.5 }, print3d: true };
  }
}

export function LibraryPanel() {
  const { layout, apply } = useLayout();
  const { select, focusSurfaceId, selection } = useUi();
  const presets: DevicePreset[] = [...BUILT_IN_PRESETS, ...layout.customPresets];
  const [editing, setEditing] = useState<string>();

  const savePreset = (p: DevicePreset) =>
    apply((l) => ({ ...l, customPresets: l.customPresets.map((x) => (x.id === p.id ? p : x)) }), `preset:${p.id}`);
  const customize = (p: DevicePreset) => {
    const copy: DevicePreset = { ...p, id: newId('preset'), name: `${p.name} (mine)`, builtIn: false };
    apply((l) => ({ ...l, customPresets: [...l.customPresets, copy] }));
    setEditing(copy.id);
  };
  const removePreset = (id: string) => apply((l) => ({ ...l, customPresets: l.customPresets.filter((x) => x.id !== id) }));

  const addDevice = (p: DevicePreset) => {
    const { mount, extraInfra } = defaultMount(layout, p.defaultMount, p.size, focusSurfaceId);
    const device = deviceFromPreset(p, mount);
    apply((l) => addEntity('device', device)(extraInfra ? addEntity('infra', extraInfra)(l) : l));
    select({ kind: 'device', id: device.id });
  };
  const addInfra = (kind: InfraKind) => {
    const item = makeInfra(layout, kind, focusSurfaceId);
    apply(addEntity('infra', item));
    select({ kind: 'infra', id: item.id });
  };

  return (
    <>
      <div className="section">
        <h2>Devices</h2>
        <ul className="item-list compact">
          {presets.map((p) => (
            <li key={p.id} className="preset" onClick={() => addDevice(p)} title="Add to layout">
              <span className="plus">+</span> {p.name}
              {!p.builtIn && <span className="tag">mine</span>}
              <span className="muted right">{p.watts ? `${p.watts} W` : ''}</span>
              <button
                className="icon-btn"
                title={p.builtIn ? 'Customize a copy' : 'Edit preset'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (p.builtIn) customize(p);
                  else setEditing(editing === p.id ? undefined : p.id);
                }}
              >
                ✎
              </button>
              {!p.builtIn && (
                <button className="icon-btn" title="Delete preset" onClick={(e) => { e.stopPropagation(); removePreset(p.id); }}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {editing && layout.customPresets.find((p) => p.id === editing) && (
          <PresetEditor preset={layout.customPresets.find((p) => p.id === editing)!} onChange={savePreset} onDone={() => setEditing(undefined)} />
        )}
        <p className="muted small">Click to add. ✎ on a built-in makes an editable copy; select a placed device and use “Save as my preset” to capture it.</p>
      </div>
      <div className="section">
        <h2>Cable management</h2>
        <div className="btn-grid">
          {(Object.keys(INFRA_LABELS) as InfraKind[]).map((k) => (
            <button key={k} className="btn" onClick={() => addInfra(k)}>
              {INFRA_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="section">
        <h2>Placed</h2>
        <ul className="item-list">
          {layout.devices.map((d) => (
            <li key={d.id} className={selection?.id === d.id ? 'on' : ''} onClick={() => select({ kind: 'device', id: d.id })}>
              <span className="swatch device" /> {d.name}
            </li>
          ))}
          {layout.infra.map((i) => (
            <li key={i.id} className={selection?.id === i.id ? 'on' : ''} onClick={() => select({ kind: 'infra', id: i.id })}>
              <span className="swatch infra" /> {i.name}
              {i.print3d && <span className="tag">print</span>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
