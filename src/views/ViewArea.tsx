import { useUi } from '../state/ui';
import { Legend } from './shared/Legend';
import { RoomView } from './RoomView';
import { DeskView } from './DeskView';
import { ElevationView } from './ElevationView';

export function ViewArea() {
  const { view, cableMode, draft } = useUi();
  return (
    <div className={`view-area ${cableMode ? 'cable-mode' : ''}`}>
      {view === 'room' && <RoomView />}
      {view === 'desk' && <DeskView />}
      {view === 'elevation' && <ElevationView />}
      {view === 'outputs' && <div className="muted" style={{ padding: 24 }}>outputs coming next</div>}
      {view !== 'outputs' && <Legend />}
      {cableMode && (
        <div className="hint">
          {draft ? 'Click the other port to finish, or click along the way to pin waypoints. Esc cancels.' : 'Click a port to start a cable.'}
        </div>
      )}
    </div>
  );
}
