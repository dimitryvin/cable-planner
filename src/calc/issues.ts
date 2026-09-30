import type { Id } from '../model/types';

export type Severity = 'error' | 'warn' | 'info';

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  /** Entities to highlight/select (cables, devices, strips, outlets…). */
  refs: Id[];
}

const RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
export const bySeverity = (a: Issue, b: Issue): number => RANK[a.severity] - RANK[b.severity];

/** 80% → warn, 100% → error. */
export function loadSeverity(ratio: number): Severity | undefined {
  if (ratio >= 1) return 'error';
  if (ratio >= 0.8) return 'warn';
  return undefined;
}
