/**
 * Core data model. Everything is stored in inches; the unit toggle only
 * affects display and input parsing.
 *
 * Coordinate system (plan view): x grows to the right, y grows *down* the
 * screen (matching SVG), z grows up from the floor. North is up.
 * Room walls run clockwise on screen; a wall's `offset` is measured from its
 * start vertex, which is the left corner when standing inside facing it.
 */

export type Id = string;
export type Inches = number;

export interface Vec2 {
  x: Inches;
  y: Inches;
}

export interface Vec3 extends Vec2 {
  z: Inches;
}

export type Units = 'in' | 'cm';

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

export type Corner = 'NE' | 'SE' | 'SW' | 'NW';

export type RoomShape =
  | { kind: 'rect'; width: Inches; depth: Inches }
  | { kind: 'L'; width: Inches; depth: Inches; notch: { corner: Corner; width: Inches; depth: Inches } };

export interface Room {
  shape: RoomShape;
  labelStyle: 'compass' | 'letters';
  ceilingHeight: Inches;
}

/** A position on a wall: distance from the wall's left corner and height above the floor. */
export interface WallRef {
  wallId: Id;
  offset: Inches;
  z: Inches;
}

// ---------------------------------------------------------------------------
// Ports and connections
// ---------------------------------------------------------------------------

export type PortType =
  | 'ac'
  | 'dc'
  | 'usb-c'
  | 'usb-a'
  | 'thunderbolt'
  | 'hdmi'
  | 'dp'
  | 'ethernet'
  | '3.5mm'
  | 'other';

export interface Port {
  id: Id;
  type: PortType;
  label: string;
  /** Offset from the owner's bottom-center, in the owner's local frame. */
  local: Vec3;
}

/** Any entity that owns ports: a device, a wall feature, or a piece of infrastructure. */
export interface PortRef {
  ownerId: Id;
  portId: Id;
}

// ---------------------------------------------------------------------------
// Wall features (fixed points in the room)
// ---------------------------------------------------------------------------

interface WallFeatureBase {
  id: Id;
  name: string;
  ports: Port[];
}

export type FeaturePlacement = { on: 'wall'; at: WallRef } | { on: 'floor'; pos: Vec2 };

export type WallFeature =
  | (WallFeatureBase & {
      kind: 'outlet';
      placement: FeaturePlacement;
      /** Max continuous load on the circuit feeding this outlet (80% of 15 A @ 120 V by default). */
      maxWatts: number;
      /** Center-to-center spacing between receptacles. */
      spacing: Inches;
    })
  | (WallFeatureBase & { kind: 'ethernetJack'; placement: FeaturePlacement })
  | (WallFeatureBase & {
      kind: 'obstacle';
      /** Windows, baseboard heaters, radiators, doors: areas cables should avoid. */
      at: WallRef;
      width: Inches;
      height: Inches;
      obstacleType: 'window' | 'heater' | 'door' | 'other';
    });

// ---------------------------------------------------------------------------
// Surfaces (desks, tables, shelves)
// ---------------------------------------------------------------------------

export interface Grommet {
  id: Id;
  /** Center in surface-local coordinates (u along width, v along depth from the back edge). */
  u: Inches;
  v: Inches;
  diameter: Inches;
}

export interface Beam {
  id: Id;
  u: Inches;
  v: Inches;
  /** Extent along u and v (a beam along the width has a large `lengthU`). */
  lengthU: Inches;
  lengthV: Inches;
  /** How far the beam hangs below the underside of the top. */
  drop: Inches;
}

export interface Drawer {
  id: Id;
  u: Inches;
  v: Inches;
  width: Inches;
  depth: Inches;
  drop: Inches;
}

export interface Surface {
  id: Id;
  name: string;
  kind: 'desk' | 'table' | 'shelf';
  /** Plan position of the surface center. */
  center: Vec2;
  /** Clockwise rotation in degrees. 0 means the back edge faces north. */
  rotation: number;
  width: Inches;
  depth: Inches;
  /** Current height of the top surface. */
  height: Inches;
  thickness: Inches;
  standing?: { min: Inches; max: Inches };
  grommets: Grommet[];
  beams: Beam[];
  drawers: Drawer[];
}

// ---------------------------------------------------------------------------
// Mounting
// ---------------------------------------------------------------------------

export type Mount =
  | { on: 'surfaceTop'; surfaceId: Id; u: Inches; v: Inches; rotation: number }
  | { on: 'surfaceUnder'; surfaceId: Id; u: Inches; v: Inches; rotation: number }
  | { on: 'floor'; pos: Vec2; rotation: number }
  | { on: 'wall'; at: WallRef }
  | { on: 'arm'; armId: Id };

export type MountKind = Mount['on'];

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export interface Size3 {
  w: Inches;
  d: Inches;
  h: Inches;
}

export interface PowerBrick {
  style: 'wallWart' | 'inline';
  size: Size3;
  /** A wall wart this wide covers the neighboring receptacle. */
  blocksAdjacent: boolean;
}

export interface Device {
  id: Id;
  name: string;
  presetId?: Id;
  size: Size3;
  mount: Mount;
  /** Draw at the wall, in watts. */
  watts: number;
  brick?: PowerBrick;
  ports: Port[];
  /** Print a mount/holder for this device (listed in 3D-printable parts). */
  print3d: boolean;
}

export interface DevicePreset {
  id: Id;
  name: string;
  size: Size3;
  watts: number;
  brick?: PowerBrick;
  ports: Omit<Port, 'id'>[];
  defaultMount: MountKind;
  builtIn: boolean;
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

interface InfraBase {
  id: Id;
  name: string;
  mount: Mount;
  /** "I'll print this": listed in the 3D-printable parts output. */
  print3d: boolean;
}

export type Infra =
  | (InfraBase & {
      kind: 'powerStrip';
      ports: Port[];
      maxWatts: number;
      cordLength: Inches;
      spacing: Inches;
      size: Size3;
    })
  | (InfraBase & { kind: 'tray'; length: Inches; width: Inches; depth: Inches })
  | (InfraBase & {
      kind: 'raceway';
      /** Raceways run along a wall; `mount` must be a wall mount marking the start. */
      length: Inches;
      width: Inches;
      depth: Inches;
      orientation: 'horizontal' | 'vertical';
    })
  | (InfraBase & { kind: 'clip'; capacity: Inches })
  | (InfraBase & { kind: 'spine'; length: Inches; capacity: Inches })
  | (InfraBase & { kind: 'monitorArm'; reach: Inches; height: Inches; hasChannel: boolean })
  | (InfraBase & { kind: 'brickHolder'; size: Size3 });

export type InfraKind = Infra['kind'];

// ---------------------------------------------------------------------------
// Cables
// ---------------------------------------------------------------------------

export type CableCategory = 'power' | 'video' | 'usb' | 'network' | 'audio' | 'other';

/** Spec used for max-length warnings. */
export type CableSpec =
  | 'ac'
  | 'dc'
  | 'usb2'
  | 'usb3-5g'
  | 'usb3-10g'
  | 'usb4-40g'
  | 'usb-c-charge'
  | 'thunderbolt'
  | 'hdmi2.0'
  | 'hdmi2.1'
  | 'dp1.4'
  | 'dp2.1'
  | 'cat6'
  | 'audio'
  | 'other';

export type Waypoint =
  | { id: Id; kind: 'anchor'; infraId: Id }
  | { id: Id; kind: 'grommet'; surfaceId: Id; grommetId: Id }
  | { id: Id; kind: 'free'; frame: 'room'; p: Vec3 }
  | { id: Id; kind: 'free'; frame: 'surface'; surfaceId: Id; u: Inches; v: Inches; zOffset: Inches };

export interface Cable {
  id: Id;
  label: string;
  from: PortRef;
  to: PortRef;
  spec: CableSpec;
  /**
   * 'auto': the router plans a path (through any pinned waypoints, in order).
   * 'manual': the path is exactly the waypoints the user placed.
   */
  routing: 'auto' | 'manual';
  waypoints: Waypoint[];
  /** Overrides the layout default when set. */
  slackPct?: number;
  /** Outer diameter; falls back to a per-spec default. */
  diameter?: Inches;
  /**
   * Set for cords permanently attached to a device or strip (e.g. a power
   * strip's cord). Excluded from the shopping list; routed length beyond this
   * value is reported as "can't reach".
   */
  fixedLength?: Inches;
}

// ---------------------------------------------------------------------------
// Layout (root document)
// ---------------------------------------------------------------------------

export interface Settings {
  gridSize: Inches;
  snapToGrid: boolean;
  slackPct: number;
  maxUnsupportedSpan: Inches;
  clipSpacing: Inches;
  velcroSpacing: Inches;
  parallelRunWarn: Inches;
  /** How far auto-routed cables sit off the wall/floor junction. */
  wallStandoff: Inches;
}

export const SCHEMA_VERSION = 1;

export interface Layout {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  units: Units;
  settings: Settings;
  room: Room;
  features: WallFeature[];
  surfaces: Surface[];
  devices: Device[];
  infra: Infra[];
  cables: Cable[];
  /** User-defined device presets (built-ins live in code). */
  customPresets: DevicePreset[];
}

/** Anything that can own ports. */
export type PortOwner = Device | WallFeature | Extract<Infra, { kind: 'powerStrip' }>;
