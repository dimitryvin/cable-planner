import { roomWalls } from '../geometry/room';
import { newId } from '../model/ids';
import type { Id, Infra, Layout, Mount, MountKind, Size3 } from '../model/types';

/** Sensible starting mount for a new item; the user drags or edits it afterwards. */
export function defaultMount(
  layout: Layout,
  kind: MountKind,
  size: Size3,
  surfaceId: Id | undefined,
): { mount: Mount; extraInfra?: Infra } {
  const surface = layout.surfaces.find((s) => s.id === surfaceId) ?? layout.surfaces[0];
  const shape = layout.room.shape;
  const center = { x: shape.width / 2, y: shape.depth / 2 };

  if ((kind === 'surfaceTop' || kind === 'surfaceUnder' || kind === 'arm') && !surface) {
    return { mount: { on: 'floor', pos: center, rotation: 0 } };
  }
  switch (kind) {
    case 'surfaceTop':
      return { mount: { on: 'surfaceTop', surfaceId: surface!.id, u: surface!.width / 2, v: Math.min(surface!.depth - size.d / 2, surface!.depth / 2), rotation: 0 } };
    case 'surfaceUnder':
      return { mount: { on: 'surfaceUnder', surfaceId: surface!.id, u: surface!.width / 2, v: Math.min(surface!.depth / 2, 8), rotation: 0 } };
    case 'arm': {
      const used = new Set(layout.devices.flatMap((d) => (d.mount.on === 'arm' ? [d.mount.armId] : [])));
      const free = layout.infra.find((i) => i.kind === 'monitorArm' && !used.has(i.id));
      if (free) return { mount: { on: 'arm', armId: free.id } };
      const arm: Infra = {
        id: newId('arm'),
        kind: 'monitorArm',
        name: 'Monitor arm',
        mount: { on: 'surfaceTop', surfaceId: surface!.id, u: surface!.width / 2, v: 3, rotation: 0 },
        print3d: false,
        reach: 8,
        height: 16,
        hasChannel: true,
      };
      return { mount: { on: 'arm', armId: arm.id }, extraInfra: arm };
    }
    case 'floor':
      return { mount: { on: 'floor', pos: center, rotation: 0 } };
    case 'wall': {
      const wall = roomWalls(layout.room)[0]!;
      return { mount: { on: 'wall', at: { wallId: wall.id, offset: wall.length / 2, z: 48 } } };
    }
  }
}
