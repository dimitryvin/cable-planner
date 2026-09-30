import { useUi } from '../state/ui';
import { Legend } from './shared/Legend';
import { RoomView } from './RoomView';
import { DeskView } from './DeskView';
import { ElevationView } from './ElevationView';
import { OutputsView } from '../outputs/OutputsView';

export function ViewArea() {
  const { view, cableMode, draft } = useUi();
  return (
    <div className={`view-area ${cableMode ? 'cable-mode' : ''}`}>
      {view === 'room' && <RoomView />}
      {view === 'desk' && <DeskView />}
      {view === 'elevation' && <ElevationView />}
      {view === 'outputs' && <OutputsView />}
      {view !== 'outputs' && <Legend />}
      {cableMode && (
        <div className="hint">
          {draft ? 'Click the other port to finish, or click along the way to pin waypoints. Esc cancels.' : 'Click a port to start a cable.'}
        </div>
      )}
    </div>
  );
}
