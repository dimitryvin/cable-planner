import type { WallFeature } from '../../model/types';
import { CheckField, NumberField, SelectField, TextField, LengthField } from '../fields';
import { MountEditor } from './MountEditor';
import { PortsEditor } from './PortsEditor';

export function FeatureProps({ f, update }: { f: WallFeature; update: (fn: (f: WallFeature) => WallFeature) => void }) {
  const set = (patch: Partial<WallFeature>) => update((x) => ({ ...x, ...patch }) as WallFeature);

  if (f.kind === 'obstacle') {
    return (
      <>
        <TextField label="Name" value={f.name} onChange={(name) => set({ name })} />
        <SelectField
          label="Type"
          value={f.obstacleType}
          options={[['window', 'Window'], ['heater', 'Heater / radiator'], ['door', 'Door'], ['other', 'Other']]}
          onChange={(obstacleType) => set({ obstacleType } as Partial<WallFeature>)}
        />
        <MountEditor
          allowed={['wall']}
          mount={{ on: 'wall', at: f.at }}
          size={{ w: f.width, d: 0, h: f.height }}
          onChange={(m) => m.on === 'wall' && set({ at: m.at } as Partial<WallFeature>)}
        />
        <LengthField label="Width" min={1} value={f.width} onChange={(width) => set({ width } as Partial<WallFeature>)} />
        <LengthField label="Height" min={1} value={f.height} onChange={(height) => set({ height } as Partial<WallFeature>)} />
        <p className="muted small">Measured from the obstacle's center. Low obstacles (under 12″) steer cables off the baseboard.</p>
      </>
    );
  }

  return (
    <>
      <TextField label="Name" value={f.name} onChange={(name) => set({ name })} />
      <CheckField
        label="Floor box"
        value={f.placement.on === 'floor'}
        onChange={(floor) =>
          set({ placement: floor ? { on: 'floor', pos: { x: 48, y: 48 } } : { on: 'wall', at: { wallId: 'w0', offset: 24, z: 12 } } } as Partial<WallFeature>)
        }
      />
      {f.placement.on === 'wall' ? (
        <MountEditor allowed={['wall']} mount={{ on: 'wall', at: f.placement.at }} size={{ w: 3, d: 0, h: 5 }} onChange={(m) => m.on === 'wall' && set({ placement: { on: 'wall', at: m.at } } as Partial<WallFeature>)} />
      ) : (
        <MountEditor allowed={['floor']} mount={{ on: 'floor', pos: f.placement.pos, rotation: 0 }} size={{ w: 4, d: 4, h: 1 }} onChange={(m) => m.on === 'floor' && set({ placement: { on: 'floor', pos: m.pos } } as Partial<WallFeature>)} />
      )}
      {f.kind === 'outlet' && (
        <>
          <NumberField label="Circuit limit" unit="W" min={1} value={f.maxWatts} onChange={(maxWatts) => set({ maxWatts } as Partial<WallFeature>)} />
          <p className="muted small">1440 W = 80% of a 15 A / 120 V circuit. Use 1920 W for 20 A, ~2900 W for 230 V / 16 A.</p>
        </>
      )}
      <h3>{f.kind === 'outlet' ? 'Receptacles & USB' : 'Jacks'}</h3>
      <PortsEditor ownerId={f.id} ports={f.ports} onChange={(ports) => set({ ports })} />
    </>
  );
}
