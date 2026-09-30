import { CM_PER_INCH, RETAIL_LENGTHS_FT, RETAIL_LENGTHS_M } from '../model/defaults';
import type { Inches } from '../model/types';

export type RetailSystem = 'imperial' | 'metric';

export interface RetailPick {
  /** Chosen retail length in inches (the longest available when `overflow`). */
  length: Inches;
  label: string;
  /** Needed length exceeds every common retail size. */
  overflow: boolean;
}

const label = (inches: Inches, system: RetailSystem): string =>
  system === 'imperial' ? `${Number((inches / 12).toFixed(2))} ft` : `${Number(((inches * CM_PER_INCH) / 100).toFixed(2))} m`;

/** Rounds a required length up to the next common retail cable length. */
export function retailLength(needed: Inches, system: RetailSystem): RetailPick {
  const sizes = system === 'imperial' ? RETAIL_LENGTHS_FT : RETAIL_LENGTHS_M;
  // Small tolerance so an exact 6 ft need doesn't jump to 10 ft from float noise.
  const hit = sizes.find((s) => s + 1e-6 >= needed);
  if (hit !== undefined) return { length: hit, label: label(hit, system), overflow: false };
  const longest = sizes[sizes.length - 1]!;
  return { length: longest, label: `> ${label(longest, system)}`, overflow: true };
}
