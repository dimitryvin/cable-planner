import { useEffect, useRef, useState } from 'react';
import { emptyLayout, exampleLayout } from '../model/seed';
import { deserializeLayout } from '../state/persistence';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(ts).toLocaleDateString();
}

/** Toolbar menu listing every saved layout (room), with new/duplicate/example/import/delete. */
export function LayoutsMenu({ onError }: { onError: (message: string | undefined) => void }) {
  const { layout, library } = useLayout();
  const { select } = useUi();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const act = (fn: () => void) => {
    fn();
    select(null);
    setOpen(false);
  };

  const onImport = async (file: File) => {
    const result = deserializeLayout(await file.text());
    if (result.ok) {
      act(() => library.add(result.layout));
      onError(undefined);
    } else {
      onError(`Import failed: ${result.error}`);
    }
  };

  const now = Date.now();
  const entries = [...library.entries].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="layouts-menu" ref={panel}>
      <button className="btn layouts-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Your saved rooms">
        <span className="layouts-name">{layout.name}</span> <span className="caret">▾</span>
      </button>
      {open && (
        <div className="layouts-panel" role="menu">
          <div className="layouts-actions">
            <button className="btn small" onClick={() => act(() => library.add(emptyLayout()))}>New layout</button>
            <button className="btn small" onClick={() => act(library.duplicate)}>Duplicate</button>
            <button className="btn small" onClick={() => act(() => library.add(exampleLayout()))}>Add example</button>
            <button className="btn small" onClick={() => fileInput.current?.click()}>Import…</button>
          </div>
          <ul className="layouts-list">
            {entries.map((e) => {
              const current = e.id === library.currentId;
              return (
                <li key={e.id} className={current ? 'current' : ''}>
                  <button className="layouts-open" onClick={() => act(() => library.open(e.id))} aria-current={current}>
                    <span className="layouts-row-name">{current ? layout.name : e.name}</span>
                    {e.recovered && <span className="tag" title="Saved by an older version of the app in another tab">recovered</span>}
                    <span className="muted small">{current ? 'open' : ago(e.updatedAt, now)}</span>
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Delete ${e.name}`}
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete "${current ? layout.name : e.name}"? This can't be undone. Export it first if you want a copy.`)) {
                        act(() => library.remove(e.id));
                      }
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="muted small layouts-note">Saved in this browser only. Use Export to back up or move a room to another device.</p>
        </div>
      )}
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
    </div>
  );
}
