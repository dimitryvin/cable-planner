import { useUi } from '../state/ui';
import { useLayout } from '../state/store';
import { Legend } from './shared/Legend';
import { AutoConnectBanner } from './shared/AutoConnectBanner';
import { RoomView } from './RoomView';
import { DeskView } from './DeskView';
import { ElevationView } from './ElevationView';
import { OutputsView } from '../outputs/OutputsView';

export function ViewArea() {
  const { view, cableMode, draft } = useUi();
  const { layout } = useLayout();
  const empty = layout.surfaces.length === 0 && layout.features.length === 0 && layout.devices.length === 0;
  return (
    <div className={`view-area ${cableMode ? 'cable-mode' : ''}`}>
      {view === 'room' && <RoomView />}
      {view === 'desk' && <DeskView />}
      {view === 'elevation' && <ElevationView />}
      {view === 'outputs' && <OutputsView />}
      {view !== 'outputs' && <Legend />}
      {view !== 'outputs' && <AutoConnectBanner />}
      {empty && view === 'room' && (
        <div className="onboarding">
          <h3>Plan your cables in five steps</h3>
          <ol>
            <li>Enter the room's width and depth (tape-measure input like <code>11' 4.5"</code> works).</li>
            <li>Add outlets, Ethernet jacks, windows and heaters, then drag them along the walls.</li>
            <li>Add your desk(s), then devices and gear from <b>Devices &amp; gear</b>.</li>
            <li>Press <b>C</b> (or Draw cable), click one port, then another. Routes are planned automatically.</li>
            <li>Open <b>Shopping &amp; install</b> for lengths, the parts list and the install order.</li>
          </ol>
        </div>
      )}
      {cableMode && (
        <div className="hint">
          {draft ? 'Click the other port to finish, or click along the way to pin waypoints. Esc cancels.' : 'Click a port to start a cable.'}
        </div>
      )}
    </div>
  );
}
