import { newId } from '../../model/ids';
import type { Device, DevicePreset, Infra } from '../../model/types';
import { infraSize } from '../../geometry/resolve';
import { useLayout } from '../../state/store';
import { CheckField, LengthField, NumberField, SelectField, TextField } from '../fields';
import { MountEditor } from './MountEditor';
import { PortsEditor } from './PortsEditor';

export function DeviceProps({ d, update }: { d: Device; update: (fn: (d: Device) => Device) => void }) {
  const { apply } = useLayout();
  const set = (patch: Partial<Device>) => update((x) => ({ ...x, ...patch }));
  const saveAsPreset = () => {
    const preset: DevicePreset = {
      id: newId('preset'),
      name: d.name,
      size: d.size,
      watts: d.watts,
      brick: d.brick,
      ports: d.ports.map(({ id: _id, ...rest }) => rest),
      defaultMount: d.mount.on,
      builtIn: false,
    };
    apply((l) => ({ ...l, customPresets: [...l.customPresets, preset] }));
  };

  return (
    <>
      <TextField label="Name" value={d.name} onChange={(name) => set({ name })} />
      <LengthField label="Width" min={0.1} value={d.size.w} onChange={(w) => set({ size: { ...d.size, w } })} />
      <LengthField label="Depth" min={0.1} value={d.size.d} onChange={(dd) => set({ size: { ...d.size, d: dd } })} />
      <LengthField label="Height" min={0.1} value={d.size.h} onChange={(h) => set({ size: { ...d.size, h } })} />
      <NumberField label="Power draw" unit="W" min={0} value={d.watts} onChange={(watts) => set({ watts })} />
      <MountEditor mount={d.mount} size={d.size} onChange={(mount) => set({ mount })} />

      <h3>Power brick</h3>
      <SelectField
        label="Brick"
        value={d.brick?.style ?? 'none'}
        options={[['none', 'None'], ['wallWart', 'Wall wart (plugs into outlet)'], ['inline', 'Inline brick (on the cord)']]}
        onChange={(style) => set({ brick: style === 'none' ? undefined : { style, size: d.brick?.size ?? { w: 4, d: 2.5, h: 1.2 }, blocksAdjacent: d.brick?.blocksAdjacent ?? style === 'wallWart' } })}
      />
      {d.brick && (
        <>
          <LengthField label="Brick width" min={0.1} value={d.brick.size.w} onChange={(w) => set({ brick: { ...d.brick!, size: { ...d.brick!.size, w } } })} />
          <LengthField label="Brick depth" min={0.1} value={d.brick.size.d} onChange={(dd) => set({ brick: { ...d.brick!, size: { ...d.brick!.size, d: dd } } })} />
          <LengthField label="Brick height" min={0.1} value={d.brick.size.h} onChange={(h) => set({ brick: { ...d.brick!, size: { ...d.brick!.size, h } } })} />
          {d.brick.style === 'wallWart' && (
            <CheckField label="Blocks the neighboring receptacle" value={d.brick.blocksAdjacent} onChange={(blocksAdjacent) => set({ brick: { ...d.brick!, blocksAdjacent } })} />
          )}
        </>
      )}
      <CheckField label="I'll 3D-print a mount for this" value={d.print3d} onChange={(print3d) => set({ print3d })} />

      <h3>Ports</h3>
      <PortsEditor ownerId={d.id} ports={d.ports} onChange={(ports) => set({ ports })} />
      <button className="btn small" onClick={saveAsPreset}>Save as my preset</button>
    </>
  );
}

export function InfraProps({ i, update }: { i: Infra; update: (fn: (i: Infra) => Infra) => void }) {
  const { layout } = useLayout();
  const set = (patch: Partial<Infra>) => update((x) => ({ ...x, ...patch }) as Infra);
  const num = (key: string, label: string, min = 0.1) => (
    <LengthField label={label} min={min} value={(i as unknown as Record<string, number>)[key]!} onChange={(v) => set({ [key]: v } as Partial<Infra>)} />
  );
  return (
    <>
      <TextField label="Name" value={i.name} onChange={(name) => set({ name })} />
      <MountEditor
        mount={i.mount}
        size={infraSize(i)}
        onChange={(mount) => set({ mount })}
        allowed={i.kind === 'raceway' ? ['wall'] : i.kind === 'monitorArm' ? ['surfaceTop', 'wall'] : ['surfaceTop', 'surfaceUnder', 'floor', 'wall']}
      />
      {i.kind === 'powerStrip' && (
        <>
          <NumberField label="Rated max" unit="W" min={1} value={i.maxWatts} onChange={(maxWatts) => set({ maxWatts } as Partial<Infra>)} />
          {num('cordLength', 'Cord length')}
          {num('spacing', 'Outlet spacing')}
          <p className="muted small">The first port is the strip's own plug. Connect it to a wall outlet to check load and cord reach.</p>
        </>
      )}
      {i.kind === 'tray' && (
        <>
          {num('length', 'Length')}
          {num('width', 'Width')}
          {num('depth', 'Depth')}
        </>
      )}
      {i.kind === 'raceway' && (
        <>
          <SelectField label="Direction" value={i.orientation} options={[['horizontal', 'Horizontal'], ['vertical', 'Vertical']]} onChange={(orientation) => set({ orientation } as Partial<Infra>)} />
          {num('length', 'Length')}
          {num('width', 'Channel width')}
          {num('depth', 'Channel depth')}
        </>
      )}
      {(i.kind === 'clip' || i.kind === 'spine') && num('capacity', 'Holds bundle up to')}
      {i.kind === 'spine' && num('length', 'Length')}
      {i.kind === 'monitorArm' && (
        <>
          {num('reach', 'Reach forward', 0)}
          {num('height', 'Screen center above desk', 0)}
          <CheckField label="Has a cable channel" value={i.hasChannel} onChange={(hasChannel) => set({ hasChannel } as Partial<Infra>)} />
        </>
      )}
      {i.kind === 'brickHolder' && (
        <>
          <SelectField
            label="Holds brick of"
            value={i.forDeviceId ?? ''}
            options={[['', 'Custom size'], ...layout.devices.filter((d) => d.brick).map((d) => [d.id, d.name] as const)]}
            onChange={(forDeviceId) => set({ forDeviceId: forDeviceId || undefined } as Partial<Infra>)}
          />
          <LengthField label="Inner width" min={0.1} value={i.size.w} onChange={(w) => set({ size: { ...i.size, w } } as Partial<Infra>)} />
          <LengthField label="Inner depth" min={0.1} value={i.size.d} onChange={(dd) => set({ size: { ...i.size, d: dd } } as Partial<Infra>)} />
          <LengthField label="Inner height" min={0.1} value={i.size.h} onChange={(h) => set({ size: { ...i.size, h } } as Partial<Infra>)} />
        </>
      )}
      <CheckField label="I'll 3D-print this" value={i.print3d} onChange={(print3d) => set({ print3d })} />
      {i.kind === 'powerStrip' && (
        <>
          <h3>Outlets</h3>
          <PortsEditor ownerId={i.id} ports={i.ports} onChange={(ports) => set({ ports } as Partial<Infra>)} />
        </>
      )}
    </>
  );
}
