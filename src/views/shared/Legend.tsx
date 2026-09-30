import type { CableCategory } from '../../model/types';
import { useUi } from '../../state/ui';

export const CATEGORY_LABELS: Record<CableCategory, string> = {
  power: 'Power',
  video: 'Video',
  usb: 'USB / TB',
  network: 'Network',
  audio: 'Audio',
  other: 'Other',
};

export const cableColor = (c: CableCategory) => `var(--cable-${c})`;

export function Legend() {
  const { filters, toggleFilter } = useUi();
  return (
    <div className="legend" role="group" aria-label="Cable types">
      {(Object.keys(CATEGORY_LABELS) as CableCategory[]).map((c) => (
        <button key={c} className={filters[c] ? '' : 'off'} onClick={() => toggleFilter(c)} title={filters[c] ? 'Hide' : 'Show'}>
          <span className="line" style={{ background: cableColor(c) }} />
          {CATEGORY_LABELS[c]}
        </button>
      ))}
    </div>
  );
}
