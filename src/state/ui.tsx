import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { analyzeLayout, type Analysis } from '../calc/analyze';
import type { CableCategory, Id, PortRef, Waypoint } from '../model/types';
import type { Selection } from './actions';
import { useLayout } from './store';

export type ViewName = 'room' | 'desk' | 'elevation' | 'outputs';

export interface CableDraft {
  from: PortRef;
  waypoints: Waypoint[];
}

export interface AutoConnectReport {
  added: Id[];
  connected: string[];
  unresolved: { ownerId: Id; message: string }[];
  scope: string;
}

export interface UiState {
  selection: Selection | null;
  select: (s: Selection | null) => void;
  view: ViewName;
  setView: (v: ViewName) => void;
  /** Surface shown in the desk and elevation views. */
  focusSurfaceId: Id | undefined;
  setFocusSurfaceId: (id: Id | undefined) => void;
  deskLayer: 'top' | 'under';
  setDeskLayer: (l: 'top' | 'under') => void;
  cableMode: boolean;
  setCableMode: (on: boolean) => void;
  draft: CableDraft | null;
  setDraft: (d: CableDraft | null) => void;
  filters: Record<CableCategory, boolean>;
  toggleFilter: (c: CableCategory) => void;
  analysis: Analysis;
  autoReport: AutoConnectReport | null;
  setAutoReport: (r: AutoConnectReport | null) => void;
}

const UiContext = createContext<UiState | null>(null);

const ALL_ON: Record<CableCategory, boolean> = { power: true, video: true, usb: true, network: true, audio: true, other: true };

export function UiProvider({ children }: { children: ReactNode }) {
  const { layout } = useLayout();
  const [selection, select] = useState<Selection | null>(null);
  const [view, setView] = useState<ViewName>('room');
  const [focus, setFocus] = useState<Id | undefined>();
  const [deskLayer, setDeskLayer] = useState<'top' | 'under'>('top');
  const [cableMode, setCableModeRaw] = useState(false);
  const [draft, setDraft] = useState<CableDraft | null>(null);
  const [filters, setFilters] = useState(ALL_ON);
  const [autoReport, setAutoReport] = useState<AutoConnectReport | null>(null);

  // Routing + calculations for the whole layout (~ms); recomputed only when the layout changes.
  const analysis = useMemo(() => analyzeLayout(layout), [layout]);
  const focusSurfaceId = layout.surfaces.some((s) => s.id === focus) ? focus : layout.surfaces[0]?.id;

  const value = useMemo<UiState>(
    () => ({
      selection,
      select,
      view,
      setView,
      focusSurfaceId,
      setFocusSurfaceId: setFocus,
      deskLayer,
      setDeskLayer,
      cableMode,
      setCableMode: (on) => {
        setCableModeRaw(on);
        if (!on) setDraft(null);
      },
      draft,
      setDraft,
      filters,
      toggleFilter: (c) => setFilters((f) => ({ ...f, [c]: !f[c] })),
      analysis,
      autoReport,
      setAutoReport,
    }),
    [selection, view, focusSurfaceId, deskLayer, cableMode, draft, filters, analysis, autoReport],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside <UiProvider>');
  return ctx;
}
