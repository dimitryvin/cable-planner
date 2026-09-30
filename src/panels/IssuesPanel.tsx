import { kindOf } from '../state/actions';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';

export function IssuesPanel() {
  const { layout } = useLayout();
  const { analysis, select } = useUi();
  const { issues } = analysis;
  const counts = { error: 0, warn: 0, info: 0 };
  issues.forEach((i) => counts[i.severity]++);

  return (
    <div className="section">
      <h2>
        Checks{' '}
        <span className="counts">
          {counts.error > 0 && <span className="pill error">{counts.error}</span>}
          {counts.warn > 0 && <span className="pill warn">{counts.warn}</span>}
          {counts.info > 0 && <span className="pill info">{counts.info}</span>}
        </span>
      </h2>
      {issues.length === 0 && <p className="muted small">No problems found.</p>}
      <ul className="issues">
        {issues.map((i, n) => (
          <li
            key={n}
            className={`${i.severity} clickable`}
            onClick={() => {
              const target = i.refs.find((r) => kindOf(layout, r));
              const kind = target && kindOf(layout, target);
              if (target && kind) select({ kind, id: target });
            }}
          >
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
