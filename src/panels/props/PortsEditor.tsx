import { PORT_LABELS } from '../../model/defaults';
import { newId } from '../../model/ids';
import type { Id, Port, PortType } from '../../model/types';
import { removePort } from '../../state/actions';
import { useLayout } from '../../state/store';

const TYPES = Object.keys(PORT_LABELS) as PortType[];

export function PortsEditor({ ownerId, ports, onChange }: { ownerId: Id; ports: Port[]; onChange: (ports: Port[]) => void }) {
  const { layout, apply } = useLayout();
  const inUse = (p: Port) => layout.cables.some((c) => (c.from.ownerId === ownerId && c.from.portId === p.id) || (c.to.ownerId === ownerId && c.to.portId === p.id));
  const edit = (id: Id, patch: Partial<Port>) => onChange(ports.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="ports">
      {ports.map((p) => (
        <div key={p.id} className="port-row">
          <select className="input" value={p.type} onChange={(e) => edit(p.id, { type: e.target.value as PortType })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {PORT_LABELS[t]}
              </option>
            ))}
          </select>
          <input className="input" value={p.label} onChange={(e) => edit(p.id, { label: e.target.value })} />
          <span className={`dot ${inUse(p) ? 'on' : ''}`} title={inUse(p) ? 'Connected' : 'Free'} />
          <button
            className="icon-btn"
            title={inUse(p) ? 'Remove port and its cable' : 'Remove port'}
            onClick={() => apply(removePort(ownerId, p.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="btn small"
        onClick={() => {
          const last = ports[ports.length - 1];
          onChange([...ports, { id: newId('p'), type: 'usb-c', label: `Port ${ports.length + 1}`, local: last ? { ...last.local, x: last.local.x + 0.8 } : { x: 0, y: 0, z: 0.5 } }]);
        }}
      >
        + Add port
      </button>
    </div>
  );
}
