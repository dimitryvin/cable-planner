import type { Inches } from '../model/types';
import { retailLength, type RetailPick } from './retail';

export interface LengthInputs {
  /** Routed length at the surfaces' current heights. */
  current: Inches;
  /** Routed lengths with standing desks fully lowered/raised; set only when the route touches one. */
  atMin?: Inches;
  atMax?: Inches;
  slackPct: number;
}

export interface CableLength {
  routed: Inches;
  /** Longest routed length across desk heights, before slack. */
  worstCase: Inches;
  standing: boolean;
  /** Extra length needed to reach at the worst-case height versus the current one. */
  standingExtra: Inches;
  slack: Inches;
  /** Length to buy for: worst case plus slack. */
  required: Inches;
  retailImperial: RetailPick;
  retailMetric: RetailPick;
}

/**
 * Cable length = routed 3D path + slack. Routes that ride a standing desk are
 * evaluated at both extremes and the longer one wins, so the cable still
 * reaches at full height.
 */
export function cableLength({ current, atMin, atMax, slackPct }: LengthInputs): CableLength {
  const standing = atMin !== undefined || atMax !== undefined;
  const worstCase = Math.max(current, atMin ?? 0, atMax ?? 0);
  const slack = worstCase * Math.max(0, slackPct);
  const required = worstCase + slack;
  return {
    routed: current,
    worstCase,
    standing,
    standingExtra: worstCase - current,
    slack,
    required,
    retailImperial: retailLength(required, 'imperial'),
    retailMetric: retailLength(required, 'metric'),
  };
}
