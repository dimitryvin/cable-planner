import { findPort } from '../../geometry/resolve';
import { makeCable } from '../../model/factories';
import { newId } from '../../model/ids';
import type { PortRef, Waypoint } from '../../model/types';
import { addEntity } from '../../state/actions';
import { useLayout } from '../../state/store';
import { useUi } from '../../state/ui';

type NewWaypoint = Waypoint extends infer W ? (W extends Waypoint ? Omit<W, 'id'> : never) : never;

/** Port-to-port cable drawing shared by every view. */
export function useCableTool() {
  const { layout, apply } = useLayout();
  const { draft, setDraft, cableMode, select } = useUi();

  const clickPort = (ref: PortRef) => {
    if (!cableMode) return false;
    if (!draft) {
      setDraft({ from: ref, waypoints: [] });
      return true;
    }
    if (draft.from.ownerId === ref.ownerId && draft.from.portId === ref.portId) {
      setDraft(null);
      return true;
    }
    const a = findPort(layout, draft.from);
    const b = findPort(layout, ref);
    if (!a || !b) return true;
    const label = `${a.owner.name} → ${b.owner.name}`;
    const cable = { ...makeCable(draft.from, ref, a.port.type, b.port.type, label), waypoints: draft.waypoints };
    apply(addEntity('cable', cable));
    select({ kind: 'cable', id: cable.id });
    setDraft(null);
    return true;
  };

  /** Adds a pinned waypoint while drawing; returns false when not drawing. */
  const addWaypoint = (wp: NewWaypoint) => {
    if (!draft) return false;
    setDraft({ ...draft, waypoints: [...draft.waypoints, { ...wp, id: newId('wp') } as Waypoint] });
    return true;
  };

  return { draft, cableMode, clickPort, addWaypoint };
}
