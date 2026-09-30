import type { Settings } from '../../model/types';
import { useLayout } from '../../state/store';
import { CheckField, LengthField, NumberField } from '../fields';

export function SettingsProps() {
  const { layout, apply } = useLayout();
  const s = layout.settings;
  const set = (patch: Partial<Settings>) => apply((l) => ({ ...l, settings: { ...l.settings, ...patch } }));
  return (
    <>
      <p className="muted small">Select something in a view or list to edit it. These settings apply to the whole layout.</p>
      <LengthField label="Grid size" min={0.125} value={s.gridSize} onChange={(gridSize) => set({ gridSize })} />
      <CheckField label="Snap to grid, walls and desk edges" value={s.snapToGrid} onChange={(snapToGrid) => set({ snapToGrid })} />
      <NumberField label="Default slack" unit="%" min={0} max={200} value={Math.round(s.slackPct * 100)} onChange={(pct) => set({ slackPct: pct / 100 })} />
      <LengthField label="Max unsupported span" min={1} value={s.maxUnsupportedSpan} onChange={(maxUnsupportedSpan) => set({ maxUnsupportedSpan })} />
      <LengthField label="Clip spacing" min={1} value={s.clipSpacing} onChange={(clipSpacing) => set({ clipSpacing })} />
      <LengthField label="Velcro tie spacing" min={1} value={s.velcroSpacing} onChange={(velcroSpacing) => set({ velcroSpacing })} />
      <LengthField label="Power/data parallel warning" min={1} value={s.parallelRunWarn} onChange={(parallelRunWarn) => set({ parallelRunWarn })} />
      <LengthField label="Cable distance from wall" min={0} value={s.wallStandoff} onChange={(wallStandoff) => set({ wallStandoff })} />
    </>
  );
}
