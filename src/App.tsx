import { useEffect, useRef, useState } from 'react';
import { emptyLayout, exampleLayout } from './model/seed';
import { deserializeLayout, downloadText, serializeLayout } from './state/persistence';
import { useLayout } from './state/store';

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
  const { layout, apply, undo, redo, replace, canUndo, canRedo } = useLayout();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cable-planner:theme', theme);
    } catch {
      /* non-critical */
    }
  }, [theme]);

  const onImport = async (file: File) => {
    const result = deserializeLayout(await file.text());
    if (result.ok) {
      replace(result.layout);
      setError(undefined);
    } else {
      setError(`Import failed: ${result.error}`);
    }
  };

  const slug = layout.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'layout';

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Cable Planner</h1>
        <button className="btn" onClick={() => confirm('Start a new empty layout?') && replace(emptyLayout())}>
          New
        </button>
        <button className="btn" onClick={() => replace(exampleLayout())}>Load example</button>
        <button className="btn" onClick={() => fileInput.current?.click()}>Import</button>
        <button className="btn" onClick={() => downloadText(`${slug}.json`, serializeLayout(layout))}>Export</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
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
      <div className="main">
        <aside className="pane left">
          <div className="section">
            <h2>Layout</h2>
            <div>{layout.name}</div>
            <div className="muted">
              {layout.surfaces.length} surfaces · {layout.devices.length} devices · {layout.cables.length} cables
            </div>
          </div>
        </aside>
        <main className="center" />
        <aside className="pane right" />
      </div>
    </div>
  );
}
