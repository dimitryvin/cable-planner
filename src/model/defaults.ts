import type { CableCategory, CableSpec, DevicePreset, Inches, Port, PortType, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  gridSize: 1,
  snapToGrid: true,
  slackPct: 0.15,
  maxUnsupportedSpan: 18,
  clipSpacing: 12,
  velcroSpacing: 12,
  parallelRunWarn: 36,
  wallStandoff: 1,
};

export const CM_PER_INCH = 2.54;

/** Retail cable lengths, in inches. */
export const RETAIL_LENGTHS_FT: readonly Inches[] = [1, 3, 6, 10, 15].map((ft) => ft * 12);
export const RETAIL_LENGTHS_M: readonly Inches[] = [0.5, 1, 2, 3, 5].map((m) => (m * 100) / CM_PER_INCH);

export const CATEGORY_OF_PORT: Record<PortType, CableCategory> = {
  ac: 'power',
  dc: 'power',
  'usb-c': 'usb',
  'usb-a': 'usb',
  thunderbolt: 'usb',
  hdmi: 'video',
  dp: 'video',
  ethernet: 'network',
  '3.5mm': 'audio',
  other: 'other',
};

export interface SpecInfo {
  label: string;
  category: CableCategory;
  /** Typical maximum reliable passive length, in inches. `Infinity` = no practical limit at desk scale. */
  maxLength: Inches;
  /** Typical outer diameter, in inches. */
  diameter: Inches;
}

const m = (meters: number): Inches => (meters * 100) / CM_PER_INCH;

/**
 * Typical passive-cable limits. These are conservative rules of thumb, not
 * hard spec ceilings; certified or active cables can go further.
 */
export const SPECS: Record<CableSpec, SpecInfo> = {
  ac: { label: 'AC power', category: 'power', maxLength: Infinity, diameter: 0.28 },
  dc: { label: 'DC barrel', category: 'power', maxLength: m(3), diameter: 0.18 },
  usb2: { label: 'USB 2.0', category: 'usb', maxLength: m(5), diameter: 0.16 },
  'usb3-5g': { label: 'USB 5Gbps', category: 'usb', maxLength: m(2), diameter: 0.18 },
  'usb3-10g': { label: 'USB 10Gbps', category: 'usb', maxLength: m(1), diameter: 0.19 },
  'usb4-40g': { label: 'USB4 40Gbps', category: 'usb', maxLength: m(0.8), diameter: 0.2 },
  'usb-c-charge': { label: 'USB-C charging (USB 2.0 data)', category: 'power', maxLength: m(4), diameter: 0.18 },
  thunderbolt: { label: 'Thunderbolt 4/5 (passive)', category: 'usb', maxLength: m(2), diameter: 0.2 },
  'hdmi2.0': { label: 'HDMI 2.0', category: 'video', maxLength: m(5), diameter: 0.28 },
  'hdmi2.1': { label: 'HDMI 2.1 (48Gbps)', category: 'video', maxLength: m(3), diameter: 0.3 },
  'dp1.4': { label: 'DisplayPort 1.4', category: 'video', maxLength: m(3), diameter: 0.25 },
  'dp2.1': { label: 'DisplayPort 2.1 (UHBR)', category: 'video', maxLength: m(2), diameter: 0.25 },
  cat6: { label: 'Cat6 Ethernet', category: 'network', maxLength: m(100), diameter: 0.25 },
  audio: { label: '3.5mm audio', category: 'audio', maxLength: m(5), diameter: 0.15 },
  other: { label: 'Other', category: 'other', maxLength: Infinity, diameter: 0.2 },
};

/** Best-guess spec for a new cable between two port types. */
export function defaultSpec(a: PortType, b: PortType): CableSpec {
  const has = (t: PortType) => a === t || b === t;
  if (has('ac')) return 'ac';
  if (has('dc')) return 'dc';
  if (has('hdmi')) return 'hdmi2.1';
  if (has('dp')) return 'dp1.4';
  if (has('thunderbolt')) return 'thunderbolt';
  if (has('ethernet')) return 'cat6';
  if (has('3.5mm')) return 'audio';
  if (a === 'usb-c' && b === 'usb-c') return 'usb3-10g';
  if (has('usb-a') || has('usb-c')) return 'usb3-5g';
  return 'other';
}

export const PORT_LABELS: Record<PortType, string> = {
  ac: 'AC',
  dc: 'DC',
  'usb-c': 'USB-C',
  'usb-a': 'USB-A',
  thunderbolt: 'Thunderbolt',
  hdmi: 'HDMI',
  dp: 'DisplayPort',
  ethernet: 'Ethernet',
  '3.5mm': '3.5mm',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Device presets
// ---------------------------------------------------------------------------

type PortSpec = Omit<Port, 'id'>;

/** Ports laid out left→right across the back face of a device of width `w` and depth `d`. */
export function backPorts(w: number, d: number, z: number, specs: [PortType, string][]): PortSpec[] {
  const n = specs.length;
  return specs.map(([type, label], i) => ({
    type,
    label,
    local: { x: n === 1 ? 0 : -w / 2 + (w * (i + 0.5)) / n, y: -d / 2, z },
  }));
}

const preset = (p: Omit<DevicePreset, 'builtIn'>): DevicePreset => ({ ...p, builtIn: true });

export const BUILT_IN_PRESETS: readonly DevicePreset[] = [
  preset({
    id: 'monitor-27',
    name: '27" monitor',
    size: { w: 24.1, d: 2, h: 14.3 },
    watts: 35,
    defaultMount: 'arm',
    ports: backPorts(24.1, 2, 3, [['ac', 'Power'], ['hdmi', 'HDMI'], ['dp', 'DP'], ['usb-c', 'USB-C in']]),
  }),
  preset({
    id: 'monitor-32',
    name: '32" monitor',
    size: { w: 28.5, d: 2, h: 16.8 },
    watts: 45,
    defaultMount: 'arm',
    ports: backPorts(28.5, 2, 3, [['ac', 'Power'], ['hdmi', 'HDMI'], ['dp', 'DP'], ['usb-c', 'USB-C in']]),
  }),
  preset({
    id: 'monitor-34uw',
    name: '34" ultrawide',
    size: { w: 31.9, d: 3.5, h: 14.4 },
    watts: 60,
    defaultMount: 'arm',
    ports: backPorts(31.9, 3.5, 3, [['ac', 'Power'], ['hdmi', 'HDMI'], ['dp', 'DP'], ['thunderbolt', 'TB in']]),
  }),
  preset({
    id: 'laptop',
    name: 'Laptop',
    size: { w: 12.3, d: 8.7, h: 0.7 },
    watts: 0,
    defaultMount: 'surfaceTop',
    ports: [
      { type: 'usb-c', label: 'USB-C L1', local: { x: -6.15, y: 2, z: 0.3 } },
      { type: 'usb-c', label: 'USB-C L2', local: { x: -6.15, y: 1, z: 0.3 } },
    ],
  }),
  preset({
    id: 'tower',
    name: 'Desktop tower',
    size: { w: 8.5, d: 18, h: 18 },
    watts: 350,
    defaultMount: 'floor',
    ports: backPorts(8.5, 18, 10, [
      ['ac', 'Power'],
      ['dp', 'DP 1'],
      ['hdmi', 'HDMI'],
      ['usb-a', 'USB-A'],
      ['usb-c', 'USB-C'],
      ['ethernet', 'LAN'],
      ['3.5mm', 'Audio'],
    ]),
  }),
  preset({
    id: 'mac-mini',
    name: 'Mac mini',
    size: { w: 5, d: 5, h: 2 },
    watts: 65,
    defaultMount: 'surfaceTop',
    ports: backPorts(5, 5, 0.8, [
      ['ac', 'Power'],
      ['ethernet', 'LAN'],
      ['thunderbolt', 'TB 1'],
      ['thunderbolt', 'TB 2'],
      ['hdmi', 'HDMI'],
    ]),
  }),
  preset({
    id: 'tb-dock',
    name: 'Thunderbolt dock',
    size: { w: 7.5, d: 3, h: 1.1 },
    watts: 120,
    defaultMount: 'surfaceUnder',
    brick: { style: 'inline', size: { w: 6.5, d: 3, h: 1.2 }, blocksAdjacent: false },
    ports: backPorts(7.5, 3, 0.5, [
      ['dc', 'DC in'],
      ['thunderbolt', 'Host'],
      ['thunderbolt', 'TB out'],
      ['dp', 'DP'],
      ['usb-a', 'USB-A 1'],
      ['usb-a', 'USB-A 2'],
      ['ethernet', 'LAN'],
      ['3.5mm', 'Audio'],
    ]),
  }),
  preset({
    id: 'speakers',
    name: 'Powered speakers (pair)',
    size: { w: 6, d: 7, h: 9 },
    watts: 40,
    defaultMount: 'surfaceTop',
    ports: backPorts(6, 7, 2, [['ac', 'Power'], ['3.5mm', 'Line in'], ['other', 'Speaker link']]),
  }),
  preset({
    id: 'mic-arm',
    name: 'Mic on arm (USB)',
    size: { w: 2.5, d: 2.5, h: 7 },
    watts: 1,
    defaultMount: 'surfaceTop',
    ports: backPorts(2.5, 2.5, 0.5, [['usb-c', 'USB']]),
  }),
  preset({
    id: 'webcam',
    name: 'Webcam',
    size: { w: 3.7, d: 1, h: 1.3 },
    watts: 2,
    defaultMount: 'surfaceTop',
    ports: backPorts(3.7, 1, 0.6, [['usb-c', 'USB']]),
  }),
  preset({
    id: 'router',
    name: 'Router',
    size: { w: 9, d: 6, h: 2 },
    watts: 18,
    defaultMount: 'floor',
    brick: { style: 'wallWart', size: { w: 2.4, d: 1.8, h: 3 }, blocksAdjacent: true },
    ports: backPorts(9, 6, 1, [
      ['dc', 'DC in'],
      ['ethernet', 'WAN'],
      ['ethernet', 'LAN 1'],
      ['ethernet', 'LAN 2'],
      ['ethernet', 'LAN 3'],
    ]),
  }),
  preset({
    id: 'desk-lamp',
    name: 'Desk lamp',
    size: { w: 6, d: 6, h: 16 },
    watts: 10,
    defaultMount: 'surfaceTop',
    ports: backPorts(6, 6, 0.5, [['ac', 'Power']]),
  }),
  preset({
    id: 'phone-charger',
    name: 'Phone charger stand',
    size: { w: 3.5, d: 3.5, h: 5 },
    watts: 15,
    defaultMount: 'surfaceTop',
    brick: { style: 'wallWart', size: { w: 1.6, d: 1.4, h: 2.2 }, blocksAdjacent: false },
    ports: backPorts(3.5, 3.5, 0.3, [['usb-c', 'USB-C in']]),
  }),
  preset({
    id: 'nas',
    name: 'NAS (2-bay)',
    size: { w: 4, d: 9, h: 6.5 },
    watts: 25,
    defaultMount: 'floor',
    brick: { style: 'inline', size: { w: 5, d: 2.2, h: 1.3 }, blocksAdjacent: false },
    ports: backPorts(4, 9, 1, [['dc', 'DC in'], ['ethernet', 'LAN']]),
  }),
];
