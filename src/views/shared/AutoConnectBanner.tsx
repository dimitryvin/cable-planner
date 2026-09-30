import { kindOf } from '../../state/actions';
import { useLayout } from '../../state/store';
import { useUi } from '../../state/ui';

export function AutoConnectBanner() {
  const { layout } = useLayout();
  const { autoReport: r, setAutoReport, select } = useUi();
  if (!r) return null;
  const pick = (id: string) => {
    const kind = kindOf(layout, id);
    if (kind) select({ kind, id });
  };
  const nothing = r.added.length === 0 && r.unresolved.length === 0;
  return (
    <div className="auto-banner" role="status">
      <div className="auto-head">
        <span className={`sev ${r.unresolved.length ? 'warn' : 'ok'}`} aria-hidden="true" />
        <span>
          <b>Auto-connect ({r.scope}):</b>{' '}
          {nothing ? 'everything is already connected.' : `added ${r.added.length} cable${r.added.length === 1 ? '' : 's'}`}
          {r.unresolved.length > 0 && `, ${r.unresolved.length} couldn't be connected`}
        </span>
        <button className="icon-btn" aria-label="Dismiss" onClick={() => setAutoReport(null)}>×</button>
      </div>
      {r.unresolved.length > 0 && (
        <ul className="auto-list unresolved">
          {r.unresolved.map((u, i) => (
            <li key={i} onClick={() => pick(u.ownerId)}>{u.message}</li>
          ))}
        </ul>
      )}
      {r.connected.length > 0 && (
        <details>
          <summary>Connected</summary>
          <ul className="auto-list">
            {r.connected.map((c, i) => (
              <li key={i} onClick={() => r.added[i] && pick(r.added[i]!)}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
