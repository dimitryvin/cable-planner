import { newId } from './ids';
import { defaultSpec } from './defaults';
import type {
  Cable,
  Device,
  DevicePreset,
  FeaturePlacement,
  Infra,
  Mount,
  Port,
  PortRef,
  PortType,
  Surface,
  WallFeature,
  WallRef,
} from './types';

const withIds = (ports: Omit<Port, 'id'>[]): Port[] => ports.map((p) => ({ ...p, id: newId('p') }));

export function deviceFromPreset(preset: DevicePreset, mount: Mount, name = preset.name): Device {
  return {
    id: newId('dev'),
    name,
    presetId: preset.id,
    role: preset.role,
    size: { ...preset.size },
    mount,
    watts: preset.watts,
    brick: preset.brick ? { ...preset.brick, size: { ...preset.brick.size } } : undefined,
    ports: withIds(preset.ports),
    print3d: false,
  };
}

/** Receptacles stack vertically (duplex style) around the outlet center; USB ports sit below them. */
export function makeOutlet(
  placement: FeaturePlacement,
  receptacles = 2,
  usb: PortType[] = [],
  name = 'Outlet',
): WallFeature {
  const spacing = 1.5;
  const ac = Array.from({ length: receptacles }, (_, i) => ({
    type: 'ac' as const,
    label: `Receptacle ${i + 1}`,
    local: { x: 0, y: 0, z: ((receptacles - 1) / 2 - i) * spacing },
  }));
  const usbPorts = usb.map((type, i) => ({
    type,
    label: `${type.toUpperCase()} ${i + 1}`,
    local: { x: (i - (usb.length - 1) / 2) * 0.6, y: 0, z: -((receptacles + 1) / 2) * spacing },
  }));
  return {
    id: newId('out'),
    kind: 'outlet',
    name,
    placement,
    maxWatts: 1440,
    spacing,
    ports: withIds([...ac, ...usbPorts]),
  };
}

export function makeEthernetJack(placement: FeaturePlacement, count = 1, name = 'Ethernet jack'): WallFeature {
  return {
    id: newId('eth'),
    kind: 'ethernetJack',
    name,
    placement,
    ports: withIds(
      Array.from({ length: count }, (_, i) => ({
        type: 'ethernet' as const,
        label: `Jack ${i + 1}`,
        local: { x: (i - (count - 1) / 2) * 0.8, y: 0, z: 0 },
      })),
    ),
  };
}

export function makeObstacle(
  at: WallRef,
  width: number,
  height: number,
  obstacleType: 'window' | 'heater' | 'door' | 'other',
  name = obstacleType[0]!.toUpperCase() + obstacleType.slice(1),
): WallFeature {
  return { id: newId('obs'), kind: 'obstacle', name, at, width, height, obstacleType, ports: [] };
}

export function makeSurface(partial: Partial<Surface> & Pick<Surface, 'center'>): Surface {
  return {
    id: newId('srf'),
    name: 'Desk',
    kind: 'desk',
    rotation: 0,
    width: 60,
    depth: 30,
    height: 29,
    thickness: 1,
    grommets: [],
    beams: [],
    drawers: [],
    ...partial,
  };
}

export function makePowerStrip(mount: Mount, outlets = 6, maxWatts = 1800, cordLength = 72): Infra {
  const spacing = 1.75;
  const w = outlets * spacing + 2;
  return {
    id: newId('ps'),
    kind: 'powerStrip',
    name: `${outlets}-outlet power strip`,
    mount,
    print3d: false,
    maxWatts,
    cordLength,
    spacing,
    size: { w, d: 2.2, h: 1.5 },
    ports: withIds([
      { type: 'ac', label: 'Plug', local: { x: -w / 2, y: 0, z: 0.75 } },
      ...Array.from({ length: outlets }, (_, i) => ({
        type: 'ac' as const,
        label: `Outlet ${i + 1}`,
        local: { x: -w / 2 + 1 + spacing * (i + 0.5), y: 0, z: 1.5 },
      })),
    ]),
  };
}

/** The strip's own plug is always its first port. */
export const stripPlugPort = (strip: Extract<Infra, { kind: 'powerStrip' }>): Port => strip.ports[0]!;

export function makeCable(
  from: PortRef,
  to: PortRef,
  fromType: PortType,
  toType: PortType,
  label = '',
): Cable {
  return {
    id: newId('cab'),
    label,
    from,
    to,
    spec: defaultSpec(fromType, toType),
    routing: 'auto',
    waypoints: [],
    source: fromType === 'ac' || fromType === 'dc' || toType === 'ac' || toType === 'dc' ? 'included' : 'buy',
  };
}
