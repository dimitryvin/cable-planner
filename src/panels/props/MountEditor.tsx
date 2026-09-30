import { roomWalls } from '../../geometry/room';
import { resolveMount } from '../../geometry/resolve';
import type { Mount, MountKind, Size3 } from '../../model/types';
import { useLayout } from '../../state/store';
import { LengthField, NumberField, SelectField } from '../fields';

const LABELS: Record<MountKind, string> = {
  surfaceTop: 'On a surface',
  surfaceUnder: 'Under a surface',
  floor: 'On the floor',
  wall: 'On a wall',
  arm: 'On a monitor arm',
};

/** Edits where an item sits; switching mount type keeps it roughly in place. */
export function MountEditor({
  mount,
  size,
  onChange,
  allowed = ['surfaceTop', 'surfaceUnder', 'floor', 'wall', 'arm'],
}: {
  mount: Mount;
  size: Size3;
  onChange: (m: Mount) => void;
  allowed?: MountKind[];
}) {
  const { layout } = useLayout();
  const walls = roomWalls(layout.room);
  const arms = layout.infra.filter((i) => i.kind === 'monitorArm');
  const surfaces = layout.surfaces;
  const options = allowed
    .filter((k) => (k === 'arm' ? arms.length > 0 : k.startsWith('surface') ? surfaces.length > 0 : true))
    .map((k) => [k, LABELS[k]] as const);

  const switchTo = (on: MountKind) => {
    const here = resolveMount(layout, mount, size)?.pos ?? { x: 24, y: 24, z: 0 };
    const s = surfaces[0];
    switch (on) {
      case 'surfaceTop':
      case 'surfaceUnder':
        if (s) onChange({ on, surfaceId: s.id, u: s.width / 2, v: s.depth / 2, rotation: 0 });
        break;
      case 'floor':
        onChange({ on, pos: { x: here.x, y: here.y }, rotation: 0 });
        break;
      case 'wall':
        onChange({ on, at: { wallId: walls[0]!.id, offset: walls[0]!.length / 2, z: 36 } });
        break;
      case 'arm':
        if (arms[0]) onChange({ on, armId: arms[0].id });
        break;
    }
  };

  return (
    <>
      <SelectField label="Placement" value={mount.on} options={options} onChange={switchTo} />
      {(mount.on === 'surfaceTop' || mount.on === 'surfaceUnder') && (
        <>
          <SelectField
            label="Surface"
            value={mount.surfaceId}
            options={surfaces.map((s) => [s.id, s.name] as const)}
            onChange={(surfaceId) => onChange({ ...mount, surfaceId })}
          />
          <LengthField label="From left edge" hint="Center of the item, measured from the surface's left edge" value={mount.u} onChange={(u) => onChange({ ...mount, u })} />
          <LengthField label="From back edge" value={mount.v} onChange={(v) => onChange({ ...mount, v })} />
          <NumberField label="Rotation" unit="°" value={mount.rotation} onChange={(rotation) => onChange({ ...mount, rotation })} />
        </>
      )}
      {mount.on === 'floor' && (
        <>
          <LengthField label="From west wall" value={mount.pos.x} onChange={(x) => onChange({ ...mount, pos: { ...mount.pos, x } })} />
          <LengthField label="From north wall" value={mount.pos.y} onChange={(y) => onChange({ ...mount, pos: { ...mount.pos, y } })} />
          <NumberField label="Rotation" unit="°" value={mount.rotation} onChange={(rotation) => onChange({ ...mount, rotation })} />
        </>
      )}
      {mount.on === 'wall' && (
        <>
          <SelectField label="Wall" value={mount.at.wallId} options={walls.map((w) => [w.id, w.label] as const)} onChange={(wallId) => onChange({ ...mount, at: { ...mount.at, wallId } })} />
          <LengthField label="From left corner" hint="Standing in the room facing the wall" min={0} value={mount.at.offset} onChange={(offset) => onChange({ ...mount, at: { ...mount.at, offset } })} />
          <LengthField label="Height" hint="Bottom edge, from the floor" min={0} value={mount.at.z} onChange={(z) => onChange({ ...mount, at: { ...mount.at, z } })} />
          <SelectField
            label="On the wall"
            value={String(((mount.rotation ?? 0) % 180 + 180) % 180 === 90 ? 90 : 0)}
            options={[
              ['0', 'Horizontal'],
              ['90', 'Vertical'],
            ]}
            onChange={(r) => onChange({ ...mount, rotation: Number(r) })}
          />
        </>
      )}
      {mount.on === 'arm' && (
        <SelectField label="Arm" value={mount.armId} options={arms.map((a) => [a.id, a.name] as const)} onChange={(armId) => onChange({ ...mount, armId })} />
      )}
    </>
  );
}
