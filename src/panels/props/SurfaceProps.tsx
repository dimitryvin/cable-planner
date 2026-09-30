import { newId } from '../../model/ids';
import type { Surface } from '../../model/types';
import { formatLength } from '../../model/units';
import { useLayout } from '../../state/store';
import { CheckField, LengthField, NumberField, SelectField, TextField } from '../fields';

export function SurfaceProps({ s, update }: { s: Surface; update: (fn: (s: Surface) => Surface, key?: string) => void }) {
  const { layout } = useLayout();
  const set = (patch: Partial<Surface>) => update((x) => ({ ...x, ...patch }));
  return (
    <>
      <TextField label="Name" value={s.name} onChange={(name) => set({ name })} />
      <SelectField label="Type" value={s.kind} options={[['desk', 'Desk'], ['table', 'Table'], ['shelf', 'Shelf']]} onChange={(kind) => set({ kind })} />
      <LengthField label="Width" min={4} value={s.width} onChange={(width) => set({ width })} />
      <LengthField label="Depth" min={4} value={s.depth} onChange={(depth) => set({ depth })} />
      <LengthField label="Top height" min={1} value={s.height} onChange={(height) => set({ height })} />
      <LengthField label="Top thickness" min={0.25} value={s.thickness} onChange={(thickness) => set({ thickness })} />
      <LengthField label="Center from west" value={s.center.x} onChange={(x) => set({ center: { ...s.center, x } })} />
      <LengthField label="Center from north" value={s.center.y} onChange={(y) => set({ center: { ...s.center, y } })} />
      <NumberField label="Rotation" unit="°" value={s.rotation} onChange={(rotation) => set({ rotation })} />

      <h3>Standing desk</h3>
      <CheckField label="Height adjustable" value={!!s.standing} onChange={(on) => set({ standing: on ? { min: Math.min(25, s.height), max: Math.max(50, s.height) } : undefined })} />
      {s.standing && (
        <>
          <LengthField label="Lowest" min={10} value={s.standing.min} onChange={(min) => set({ standing: { ...s.standing!, min } })} />
          <LengthField label="Highest" min={10} value={s.standing.max} onChange={(max) => set({ standing: { ...s.standing!, max } })} />
          <input
            type="range"
            className="range"
            min={s.standing.min}
            max={s.standing.max}
            step={0.5}
            value={s.height}
            onChange={(e) => update((x) => ({ ...x, height: Number(e.target.value) }), `height:${s.id}`)}
            aria-label="Current height"
          />
          <div className="muted small">Preview height: {formatLength(s.height, layout.units)}</div>
        </>
      )}

      <h3>Grommets</h3>
      {s.grommets.map((g, i) => (
        <div key={g.id} className="sub">
          <div className="sub-head">
            Grommet {i + 1}
            <button className="icon-btn" onClick={() => set({ grommets: s.grommets.filter((x) => x.id !== g.id) })}>×</button>
          </div>
          <LengthField label="From left" value={g.u} onChange={(u) => set({ grommets: s.grommets.map((x) => (x.id === g.id ? { ...x, u } : x)) })} />
          <LengthField label="From back" value={g.v} onChange={(v) => set({ grommets: s.grommets.map((x) => (x.id === g.id ? { ...x, v } : x)) })} />
          <LengthField label="Diameter" min={0.5} value={g.diameter} onChange={(diameter) => set({ grommets: s.grommets.map((x) => (x.id === g.id ? { ...x, diameter } : x)) })} />
        </div>
      ))}
      <button className="btn small" onClick={() => set({ grommets: [...s.grommets, { id: newId('gr'), u: s.width - 6, v: 4, diameter: 2.4 }] })}>+ Grommet</button>

      <h3>Frame beams</h3>
      {s.beams.map((b, i) => (
        <div key={b.id} className="sub">
          <div className="sub-head">
            Beam {i + 1}
            <button className="icon-btn" onClick={() => set({ beams: s.beams.filter((x) => x.id !== b.id) })}>×</button>
          </div>
          <LengthField label="Left edge" value={b.u} onChange={(u) => set({ beams: s.beams.map((x) => (x.id === b.id ? { ...x, u } : x)) })} />
          <LengthField label="Back edge" value={b.v} onChange={(v) => set({ beams: s.beams.map((x) => (x.id === b.id ? { ...x, v } : x)) })} />
          <LengthField label="Length (L→R)" min={0.25} value={b.lengthU} onChange={(lengthU) => set({ beams: s.beams.map((x) => (x.id === b.id ? { ...x, lengthU } : x)) })} />
          <LengthField label="Width (F→B)" min={0.25} value={b.lengthV} onChange={(lengthV) => set({ beams: s.beams.map((x) => (x.id === b.id ? { ...x, lengthV } : x)) })} />
          <LengthField label="Hangs down" min={0.25} value={b.drop} onChange={(drop) => set({ beams: s.beams.map((x) => (x.id === b.id ? { ...x, drop } : x)) })} />
        </div>
      ))}
      <button className="btn small" onClick={() => set({ beams: [...s.beams, { id: newId('bm'), u: 2, v: s.depth / 2 - 1.5, lengthU: s.width - 4, lengthV: 3, drop: 2 }] })}>+ Beam</button>

      <h3>Drawers</h3>
      {s.drawers.map((d, i) => (
        <div key={d.id} className="sub">
          <div className="sub-head">
            Drawer {i + 1}
            <button className="icon-btn" onClick={() => set({ drawers: s.drawers.filter((x) => x.id !== d.id) })}>×</button>
          </div>
          <LengthField label="Left edge" value={d.u} onChange={(u) => set({ drawers: s.drawers.map((x) => (x.id === d.id ? { ...x, u } : x)) })} />
          <LengthField label="Back edge" value={d.v} onChange={(v) => set({ drawers: s.drawers.map((x) => (x.id === d.id ? { ...x, v } : x)) })} />
          <LengthField label="Width" min={1} value={d.width} onChange={(width) => set({ drawers: s.drawers.map((x) => (x.id === d.id ? { ...x, width } : x)) })} />
          <LengthField label="Depth" min={1} value={d.depth} onChange={(depth) => set({ drawers: s.drawers.map((x) => (x.id === d.id ? { ...x, depth } : x)) })} />
          <LengthField label="Hangs down" min={0.5} value={d.drop} onChange={(drop) => set({ drawers: s.drawers.map((x) => (x.id === d.id ? { ...x, drop } : x)) })} />
        </div>
      ))}
      <button className="btn small" onClick={() => set({ drawers: [...s.drawers, { id: newId('dr'), u: 2, v: s.depth - 20, width: 18, depth: 18, drop: 4 }] })}>+ Drawer</button>
    </>
  );
}
