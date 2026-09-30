import { CM_PER_INCH } from './defaults';
import type { Units } from './types';

export const toUnits = (inches: number, units: Units): number => (units === 'cm' ? inches * CM_PER_INCH : inches);
export const fromUnits = (value: number, units: Units): number => (units === 'cm' ? value / CM_PER_INCH : value);

const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));

export function formatLength(inches: number, units: Units, digits = 1): string {
  return units === 'cm' ? `${trim(inches * CM_PER_INCH, digits)} cm` : `${trim(inches, digits)}"`;
}

/** Longer lengths read better as feet+inches or meters. */
export function formatLong(inches: number, units: Units): string {
  if (units === 'cm') {
    const cm = inches * CM_PER_INCH;
    return cm >= 100 ? `${trim(cm / 100, 2)} m` : `${trim(cm, 0)} cm`;
  }
  const ft = Math.floor(inches / 12);
  const rest = inches - ft * 12;
  return ft > 0 ? `${ft}' ${trim(rest, 1)}"` : `${trim(rest, 1)}"`;
}

/**
 * Parses tape-measure input into inches. Accepts plain decimals in the current
 * unit ("29.5"), and explicit units: 5' 3.5", 5ft 3in, 63in, 160cm, 1.6m.
 */
export function parseLength(text: string, units: Units): number | undefined {
  const s = text.trim().toLowerCase().replace(/,/g, '.');
  if (s === '') return undefined;
  const num = '(-?\\d+(?:\\.\\d+)?|-?\\.\\d+)';
  const plain = new RegExp(`^${num}$`).exec(s);
  if (plain) return fromUnits(Number(plain[1]), units);
  const metric = new RegExp(`^${num}\\s*(mm|cm|m)$`).exec(s);
  if (metric) {
    const f = { mm: 0.1, cm: 1, m: 100 }[metric[2] as 'mm' | 'cm' | 'm'];
    return (Number(metric[1]) * f) / CM_PER_INCH;
  }
  const imperial = new RegExp(`^(?:${num}\\s*(?:'|ft|feet|foot))?\\s*(?:${num}\\s*(?:"|in|inch|inches)?)?$`).exec(s);
  if (imperial && (imperial[1] !== undefined || imperial[2] !== undefined)) {
    return Number(imperial[1] ?? 0) * 12 + Number(imperial[2] ?? 0);
  }
  return undefined;
}
