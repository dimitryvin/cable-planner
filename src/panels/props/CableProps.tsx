import { findPort } from '../../geometry/resolve';
import { SPECS } from '../../model/defaults';
import type { Cable, CableSpec, PortRef } from '../../model/types';
import { formatLength, formatLong } from '../../model/units';
import { useLayout } from '../../state/store';
import { useUi } from '../../state/ui';
import { LengthField, NumberField, SelectField, TextField } from '../fields';

export function useEndpointName() {
  const { layout } = useLayout();
  return (ref: PortRef) => {
    const hit = findPort(layout, ref);
    return hit ? `${hit.owner.name} · ${hit.port.label}` : 'Missing port';
  };
}

const SPEC_OPTIONS = (Object.keys(SPECS) as CableSpec[]).map((k) => [k, SPECS[k].label] as const);

export function CableProps({ c, update }: { c: Cable; update: (fn: (c: Cable) => Cable) => void }) {
  const { layout } = useLayout();
  const { analysis } = useUi();
  const endpoint = useEndpointName();
  const set = (patch: Partial<Cable>) => update((x) => ({ ...x, ...patch }));
  const len = analysis.lengths.get(c.id);
  const bundle = analysis.bundles.bundleOf.get(c.id);
  const issues = analysis.issues.filter((i) => i.refs.includes(c.id));
  const u = layout.units;

  return (
    <>
      <TextField label="Label" value={c.label} onChange={(label) => set({ label })} />
      <div className="endpoints">
        <div>{endpoint(c.from)}</div>
        <button className="icon-btn" title="Swap ends" onClick={() => set({ from: c.to, to: c.from })}>⇅</button>
        <div>{endpoint(c.to)}</div>
      </div>
      <SelectField label="Cable type" value={c.spec} options={SPEC_OPTIONS} onChange={(spec) => set({ spec })} />
      <SelectField
        label="Routing"
        value={c.routing}
        options={[['auto', 'Automatic (hug walls, use trays)'], ['manual', 'Manual (straight through my waypoints)']]}
        onChange={(routing) => set({ routing })}
      />
      <SelectField
        label="Source"
        value={c.source}
        options={[['buy', 'Need to buy'], ['owned', 'Already own'], ['included', 'Comes with device']]}
        onChange={(source) => set({ source })}
      />
      <NumberField
        label="Slack"
        unit="%"
        min={0}
        max={200}
        value={Math.round((c.slackPct ?? layout.settings.slackPct) * 100)}
        onChange={(pct) => set({ slackPct: pct / 100 })}
      />
      <LengthField label="Diameter" min={0.05} value={c.diameter ?? SPECS[c.spec].diameter} onChange={(diameter) => set({ diameter })} />
      {c.fixedLength !== undefined && <LengthField label="Attached cord" min={1} value={c.fixedLength} onChange={(fixedLength) => set({ fixedLength })} />}

      {c.waypoints.length > 0 && (
        <>
          <h3>Waypoints</h3>
          <ol className="waypoints">
            {c.waypoints.map((w) => (
              <li key={w.id}>
                {w.kind === 'free' ? 'Point' : w.kind === 'grommet' ? 'Grommet' : layout.infra.find((i) => i.id === w.infraId)?.name ?? 'Anchor'}
                <button className="icon-btn" onClick={() => set({ waypoints: c.waypoints.filter((x) => x.id !== w.id) })}>×</button>
              </li>
            ))}
          </ol>
          <button className="btn small" onClick={() => set({ waypoints: [] })}>Clear waypoints</button>
        </>
      )}

      {len && (
        <>
          <h3>Length</h3>
          <dl className="stats">
            <dt>Routed path</dt>
            <dd>{formatLong(len.routed, u)}</dd>
            {len.standing && (
              <>
                <dt>At worst desk height</dt>
                <dd>
                  {formatLong(len.worstCase, u)} {len.standingExtra > 0.5 && <span className="muted">(+{formatLength(len.standingExtra, u, 0)})</span>}
                </dd>
              </>
            )}
            <dt>Slack</dt>
            <dd>{formatLength(len.slack, u, 0)}</dd>
            <dt>Needed</dt>
            <dd>
              <b>{formatLong(len.required, u)}</b>
            </dd>
            {c.fixedLength === undefined && (
              <>
                <dt>Buy</dt>
                <dd>
                  <b>{u === 'cm' ? len.retailMetric.label : len.retailImperial.label}</b>{' '}
                  <span className="muted">/ {u === 'cm' ? len.retailImperial.label : len.retailMetric.label}</span>
                </dd>
              </>
            )}
            {bundle && (
              <>
                <dt>Bundle</dt>
                <dd>{bundle}</dd>
              </>
            )}
          </dl>
        </>
      )}
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i, n) => (
            <li key={n} className={i.severity}>
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
