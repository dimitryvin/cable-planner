import { roomWalls } from '../geometry/room';
import { makeEthernetJack, makeObstacle, makeOutlet, makeSurface } from '../model/factories';
import type { Corner, Room, Surface, WallFeature } from '../model/types';
import { formatLong } from '../model/units';
import { addEntity } from '../state/actions';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';
import { LengthField, SelectField, TextField } from './fields';

export function RoomPanel() {
  const { layout, apply } = useLayout();
  const { select, selection, setFocusSurfaceId } = useUi();
  const room = layout.room;
  const shape = room.shape;
  const walls = roomWalls(room);
  const setRoom = (fn: (r: Room) => Room, key?: string) => apply((l) => ({ ...l, room: fn(l.room) }), key);

  const firstWall = walls[0]!;
  const addFeature = (f: WallFeature) => {
    apply(addEntity('feature', f));
    select({ kind: 'feature', id: f.id });
  };
  const addSurface = (s: Surface) => {
    apply(addEntity('surface', s));
    select({ kind: 'surface', id: s.id });
    setFocusSurfaceId(s.id);
  };
  const mid = { wallId: firstWall.id, offset: firstWall.length / 2 };
  const surfaceAt = (partial: Partial<Surface>) =>
    makeSurface({ center: { x: shape.width / 2, y: (partial.depth ?? 30) / 2 + 1 }, ...partial });

  return (
    <>
      <div className="section">
        <h2>Room</h2>
        <TextField label="Layout name" value={layout.name} onChange={(name) => apply((l) => ({ ...l, name }))} />
        <SelectField
          label="Shape"
          value={shape.kind}
          options={[
            ['rect', 'Rectangle'],
            ['L', 'L-shape'],
          ]}
          onChange={(k) =>
            setRoom((r) => ({
              ...r,
              shape:
                k === 'rect'
                  ? { kind: 'rect', width: r.shape.width, depth: r.shape.depth }
                  : { kind: 'L', width: r.shape.width, depth: r.shape.depth, notch: { corner: 'NE', width: r.shape.width / 3, depth: r.shape.depth / 3 } },
            }))
          }
        />
        <LengthField label="Width (N/S walls)" min={24} value={shape.width} onChange={(width) => setRoom((r) => ({ ...r, shape: { ...r.shape, width } }))} />
        <LengthField label="Depth (E/W walls)" min={24} value={shape.depth} onChange={(depth) => setRoom((r) => ({ ...r, shape: { ...r.shape, depth } }))} />
        {shape.kind === 'L' && (
          <>
            <SelectField<Corner>
              label="Cut-out corner"
              value={shape.notch.corner}
              options={[
                ['NE', 'North-east'],
                ['SE', 'South-east'],
                ['SW', 'South-west'],
                ['NW', 'North-west'],
              ]}
              onChange={(corner) => setRoom((r) => (r.shape.kind === 'L' ? { ...r, shape: { ...r.shape, notch: { ...r.shape.notch, corner } } } : r))}
            />
            <LengthField
              label="Cut-out width"
              min={1}
              max={shape.width - 12}
              value={shape.notch.width}
              onChange={(width) => setRoom((r) => (r.shape.kind === 'L' ? { ...r, shape: { ...r.shape, notch: { ...r.shape.notch, width } } } : r))}
            />
            <LengthField
              label="Cut-out depth"
              min={1}
              max={shape.depth - 12}
              value={shape.notch.depth}
              onChange={(depth) => setRoom((r) => (r.shape.kind === 'L' ? { ...r, shape: { ...r.shape, notch: { ...r.shape.notch, depth } } } : r))}
            />
          </>
        )}
        <SelectField
          label="Wall labels"
          value={room.labelStyle}
          options={[
            ['compass', 'North / East / …'],
            ['letters', 'A / B / C …'],
          ]}
          onChange={(labelStyle) => setRoom((r) => ({ ...r, labelStyle }))}
        />
        <LengthField label="Ceiling height" min={60} value={room.ceilingHeight} onChange={(ceilingHeight) => setRoom((r) => ({ ...r, ceilingHeight }))} />
        <div className="wall-list">
          {walls.map((w) => (
            <span key={w.id} className="chip">
              {w.label} <b>{formatLong(w.length, layout.units)}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Add to room</h2>
        <div className="btn-grid">
          <button className="btn" onClick={() => addFeature(makeOutlet({ on: 'wall', at: { ...mid, z: 12 } }))}>Wall outlet</button>
          <button className="btn" onClick={() => addFeature(makeOutlet({ on: 'wall', at: { ...mid, z: 12 } }, 2, ['usb-a', 'usb-c'], 'USB outlet'))}>USB outlet</button>
          <button className="btn" onClick={() => addFeature(makeOutlet({ on: 'floor', pos: { x: shape.width / 2, y: shape.depth / 2 } }, 2, [], 'Floor outlet'))}>Floor outlet</button>
          <button className="btn" onClick={() => addFeature(makeEthernetJack({ on: 'wall', at: { ...mid, z: 12 } }))}>Ethernet jack</button>
          <button className="btn" onClick={() => addFeature(makeObstacle({ ...mid, z: 36 }, 36, 48, 'window'))}>Window</button>
          <button className="btn" onClick={() => addFeature(makeObstacle({ ...mid, z: 2 }, 48, 8, 'heater', 'Baseboard heater'))}>Heater</button>
          <button className="btn" onClick={() => addFeature(makeObstacle({ ...mid, z: 0 }, 32, 80, 'door'))}>Door</button>
          <button className="btn" onClick={() => addSurface(surfaceAt({ name: 'Desk' }))}>Desk</button>
          <button className="btn" onClick={() => addSurface(surfaceAt({ name: 'Standing desk', standing: { min: 25, max: 50 } }))}>Standing desk</button>
          <button className="btn" onClick={() => addSurface(surfaceAt({ name: 'Side table', kind: 'table', width: 24, depth: 20, height: 26 }))}>Side table</button>
          <button className="btn" onClick={() => addSurface(surfaceAt({ name: 'Shelf', kind: 'shelf', width: 36, depth: 10, height: 48, thickness: 0.75 }))}>Shelf</button>
        </div>
      </div>

      <div className="section">
        <h2>In this room</h2>
        <ul className="item-list">
          {layout.surfaces.map((s) => (
            <li key={s.id} className={selection?.id === s.id ? 'on' : ''} onClick={() => { select({ kind: 'surface', id: s.id }); setFocusSurfaceId(s.id); }}>
              <span className="swatch surface" /> {s.name}
            </li>
          ))}
          {layout.features.map((f) => (
            <li key={f.id} className={selection?.id === f.id ? 'on' : ''} onClick={() => select({ kind: 'feature', id: f.id })}>
              <span className={`swatch ${f.kind}`} /> {f.name}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
