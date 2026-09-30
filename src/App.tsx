import { useEffect, useState } from 'react';
import { downloadText, serializeLayout } from './state/persistence';
import { LayoutsMenu } from './panels/LayoutsMenu';
import { useLayout } from './state/store';
import { useUi, type ViewName } from './state/ui';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { RoomPanel } from './panels/RoomPanel';
import { LibraryPanel } from './panels/LibraryPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { IssuesPanel } from './panels/IssuesPanel';
import { ViewArea } from './views/ViewArea';
import { useAutoConnect } from './hooks/useAutoConnect';

const VIEWS: [ViewName, string][] = [
  ['room', 'Room'],
  ['desk', 'Desk'],
  ['elevation', 'Elevation'],
  ['outputs', 'Shopping & install'],
];

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('cable-planner:theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable: fall back to system preference */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function App() {
  const { layout, apply, undo, redo, canUndo, canRedo, library } = useLayout();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [error, setError] = useState<string>();
  const [leftTab, setLeftTab] = useState<'room' | 'library'>('room');
  const { view, setView, cableMode, setCableMode, select } = useUi();
  useKeyboardShortcuts();
  const { connectAll } = useAutoConnect();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cable-planner:theme', theme);
    } catch {
      /* non-critical */
    }
  }, [theme]);

  const slug = layout.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'layout';

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Cable Planner</h1>
        <LayoutsMenu onError={setError} />
        <button className="btn" onClick={() => downloadText(`${slug}.json`, serializeLayout(layout))} title="Download this room as a JSON file">Export</button>
        <button className="btn" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)">Undo</button>
        <button className="btn" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)">Redo</button>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="Units">
          {(['in', 'cm'] as const).map((u) => (
            <button key={u} className={layout.units === u ? 'on' : ''} onClick={() => apply((l) => ({ ...l, units: u }))}>
              {u}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>
      {error && <div className="error-banner" onClick={() => setError(undefined)}>{error}</div>}
      {library.saveFailed && (
        <div className="error-banner">Couldn't save changes in this browser (storage is full or blocked). Use Export to keep a copy.</div>
      )}
      <div className="main">
        <aside className="pane left">
          <div className="tabs">
            <button className={leftTab === 'room' ? 'on' : ''} onClick={() => setLeftTab('room')}>Room</button>
            <button className={leftTab === 'library' ? 'on' : ''} onClick={() => setLeftTab('library')}>Devices & gear</button>
          </div>
          {leftTab === 'room' ? <RoomPanel /> : <LibraryPanel />}
        </aside>
        <main className="center">
          <div className="view-tabs">
            {VIEWS.map(([v, label]) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
            <div className="spacer" />
            {view !== 'outputs' && (
              <button className="btn" title="Connect power, video, data and network for every device and power strip" onClick={connectAll}>
                Auto-connect all
              </button>
            )}
            {view !== 'outputs' && (
              <button
                className={`btn ${cableMode ? 'active' : ''}`}
                title="Click a port, then another port. Click empty space or a clip/grommet in between to pin waypoints. (C)"
                onClick={() => {
                  setCableMode(!cableMode);
                  select(null);
                }}
              >
                {cableMode ? 'Drawing cable… (Esc)' : 'Draw cable'}
              </button>
            )}
          </div>
          <ViewArea />
        </main>
        <aside className="pane right">
          <PropertiesPanel />
          <IssuesPanel />
        </aside>
      </div>
    </div>
  );
}
