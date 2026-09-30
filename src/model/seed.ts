import { BUILT_IN_PRESETS, DEFAULT_SETTINGS } from './defaults';
import {
  deviceFromPreset,
  makeCable,
  makeEthernetJack,
  makeObstacle,
  makeOutlet,
  makePowerStrip,
  makeSurface,
} from './factories';
import { newId } from './ids';
import { SCHEMA_VERSION, type Device, type Infra, type Layout, type PortType, type WallFeature } from './types';

export function emptyLayout(name = 'Untitled layout'): Layout {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    units: 'in',
    settings: { ...DEFAULT_SETTINGS },
    room: { shape: { kind: 'rect', width: 144, depth: 120 }, labelStyle: 'compass', ceilingHeight: 96 },
    features: [],
    surfaces: [],
    devices: [],
    infra: [],
    cables: [],
    customPresets: [],
  };
}

const presetById = (id: string) => {
  const p = BUILT_IN_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
};

function portOf(owner: Device | WallFeature | Infra, type: PortType, nth = 0) {
  const ports = 'ports' in owner ? owner.ports : [];
  const port = ports.filter((p) => p.type === type)[nth];
  if (!port) throw new Error(`${owner.name} has no ${type} port #${nth}`);
  return { ref: { ownerId: owner.id, portId: port.id }, type: port.type };
}

function connect(
  a: ReturnType<typeof portOf>,
  b: ReturnType<typeof portOf>,
  label: string,
) {
  return makeCable(a.ref, b.ref, a.type, b.type, label);
}

/**
 * A generic example office so first-time users see every feature. It is not
 * anyone's real room: replace it via "New layout" or import your own JSON.
 */
export function exampleLayout(): Layout {
  const base = emptyLayout('Example office');

  const desk = makeSurface({
    name: 'Standing desk',
    center: { x: 62, y: 16 },
    width: 60,
    depth: 30,
    height: 29,
    standing: { min: 25, max: 50 },
    grommets: [
      { id: newId('gr'), u: 8, v: 4, diameter: 2.4 },
      { id: newId('gr'), u: 52, v: 4, diameter: 2.4 },
    ],
    beams: [{ id: newId('bm'), u: 4, v: 13, lengthU: 52, lengthV: 3, drop: 2.5 }],
  });
  const side = makeSurface({
    name: 'Side table',
    kind: 'table',
    center: { x: 120, y: 13 },
    width: 24,
    depth: 24,
    height: 26,
    thickness: 0.75,
  });

  const outletN = makeOutlet({ on: 'wall', at: { wallId: 'w0', offset: 30, z: 12 } }, 2, [], 'North outlet');
  const outletE = makeOutlet({ on: 'wall', at: { wallId: 'w1', offset: 60, z: 12 } }, 2, ['usb-a', 'usb-c'], 'East USB outlet');
  const jack = makeEthernetJack({ on: 'wall', at: { wallId: 'w0', offset: 108, z: 12 } }, 2, 'Ethernet jack');
  const window = makeObstacle({ wallId: 'w0', offset: 96, z: 36 }, 30, 48, 'window');
  const heater = makeObstacle({ wallId: 'w2', offset: 40, z: 2 }, 48, 8, 'heater', 'Baseboard heater');

  const arm: Infra = {
    id: newId('arm'),
    kind: 'monitorArm',
    name: 'Monitor arm',
    mount: { on: 'surfaceTop', surfaceId: desk.id, u: 30, v: 3, rotation: 0 },
    print3d: false,
    reach: 8,
    height: 16,
    hasChannel: true,
  };
  const tray: Infra = {
    id: newId('tray'),
    kind: 'tray',
    name: 'Under-desk tray',
    mount: { on: 'surfaceUnder', surfaceId: desk.id, u: 30, v: 6, rotation: 0 },
    print3d: false,
    length: 40,
    width: 5,
    depth: 3.5,
  };
  const strip = makePowerStrip({ on: 'surfaceUnder', surfaceId: desk.id, u: 30, v: 6, rotation: 0 }, 6, 1800, 72);
  const spine: Infra = {
    id: newId('spine'),
    kind: 'spine',
    name: 'Cable spine',
    mount: { on: 'surfaceUnder', surfaceId: desk.id, u: 10, v: 3, rotation: 0 },
    print3d: false,
    length: 28,
    capacity: 1.2,
  };
  const brickHolder: Infra = {
    id: newId('bh'),
    kind: 'brickHolder',
    name: 'Dock brick holder',
    mount: { on: 'surfaceUnder', surfaceId: desk.id, u: 48, v: 8, rotation: 0 },
    print3d: true,
    size: { w: 7, d: 3.5, h: 1.6 },
  };

  const monitor = deviceFromPreset(presetById('monitor-34uw'), { on: 'arm', armId: arm.id });
  const mini = deviceFromPreset(presetById('mac-mini'), { on: 'surfaceTop', surfaceId: desk.id, u: 50, v: 20, rotation: 0 });
  const dock = deviceFromPreset(presetById('tb-dock'), { on: 'surfaceUnder', surfaceId: desk.id, u: 44, v: 12, rotation: 0 });
  const speakers = deviceFromPreset(presetById('speakers'), { on: 'surfaceTop', surfaceId: desk.id, u: 8, v: 8, rotation: 0 });
  const lamp = deviceFromPreset(presetById('desk-lamp'), { on: 'surfaceTop', surfaceId: side.id, u: 12, v: 8, rotation: 0 });
  const router = deviceFromPreset(presetById('router'), { on: 'floor', pos: { x: 110, y: 6 }, rotation: 0 });
  const laptop = deviceFromPreset(presetById('laptop'), { on: 'surfaceTop', surfaceId: desk.id, u: 18, v: 20, rotation: 0 });
  const holder = { ...brickHolder, forDeviceId: dock.id };

  const stripCord = {
    ...connect(portOf(strip, 'ac', 0), portOf(outletN, 'ac', 0), 'Power strip cord'),
    fixedLength: 72,
  };

  const cables = [
    stripCord,
    connect(portOf(monitor, 'ac'), portOf(strip, 'ac', 1), 'Monitor power'),
    connect(portOf(mini, 'ac'), portOf(strip, 'ac', 2), 'Mac mini power'),
    connect(portOf(dock, 'dc'), portOf(strip, 'ac', 3), 'Dock power'),
    connect(portOf(speakers, 'ac'), portOf(strip, 'ac', 4), 'Speaker power'),
    connect(portOf(mini, 'thunderbolt', 0), portOf(monitor, 'thunderbolt'), 'Mini → monitor'),
    connect(portOf(mini, 'thunderbolt', 1), portOf(dock, 'thunderbolt', 0), 'Mini → dock'),
    connect(portOf(laptop, 'usb-c', 0), portOf(dock, 'thunderbolt', 1), 'Laptop → dock'),
    connect(portOf(dock, '3.5mm'), portOf(speakers, '3.5mm'), 'Dock → speakers'),
    connect(portOf(dock, 'ethernet'), portOf(router, 'ethernet', 1), 'Dock → router'),
    connect(portOf(router, 'ethernet', 0), portOf(jack, 'ethernet', 0), 'Router WAN'),
    connect(portOf(router, 'dc'), portOf(outletE, 'ac', 0), 'Router power'),
    connect(portOf(lamp, 'ac'), portOf(outletN, 'ac', 1), 'Lamp power'),
  ];

  return {
    ...base,
    features: [outletN, outletE, jack, window, heater],
    surfaces: [desk, side],
    devices: [monitor, mini, dock, speakers, lamp, router, laptop],
    infra: [arm, tray, strip, spine, holder],
    cables,
  };
}
