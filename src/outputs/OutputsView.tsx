import { useState } from 'react';
import { downloadText } from '../state/persistence';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';
import { checklistMarkdown, installChecklist } from './checklist';
import { toCsv, toMarkdownTable, type Table } from './format';
import { printParts, printPartsTable } from './printParts';
import { groupShopping, shoppingList, shoppingTable } from './shopping';
import { wiringRows, wiringTable } from './wiring';

type Tab = 'shopping' | 'print' | 'wiring' | 'checklist' | 'power';

const TABS: [Tab, string][] = [
  ['shopping', 'Shopping list'],
  ['print', '3D prints'],
  ['wiring', 'Wiring table'],
  ['checklist', 'Install checklist'],
  ['power', 'Power budget'],
];

function ExportButtons({ name, table, markdown }: { name: string; table?: Table; markdown?: string }) {
  const { layout } = useLayout();
  const slug = `${layout.name}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="export-row no-print">
      {table && <button className="btn small" onClick={() => downloadText(`${slug}.csv`, toCsv(table), 'text/csv')}>Export CSV</button>}
      <button
        className="btn small"
        onClick={() => downloadText(`${slug}.md`, markdown ?? (table ? `# ${layout.name}: ${name}\n\n${toMarkdownTable(table)}` : ''), 'text/markdown')}
      >
        Export Markdown
      </button>
    </div>
  );
}

function readChecked(storageKey: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Checklist ticks per layout; reloaded when the open layout changes. */
function useChecked(key: string) {
  const storageKey = `cable-planner:checklist:${key}`;
  const [state, setState] = useState(() => ({ storageKey, checked: readChecked(storageKey) }));
  const checked = state.storageKey === storageKey ? state.checked : readChecked(storageKey);
  if (state.storageKey !== storageKey) setState({ storageKey, checked });

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setState({ storageKey, checked: next });
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* checklist ticks are a convenience; ignore storage failures */
    }
  };
  return [checked, toggle] as const;
}

export function OutputsView() {
  const { layout, library } = useLayout();
  const { analysis, select } = useUi();
  const [tab, setTab] = useState<Tab>('shopping');
  const [checked, toggle] = useChecked(library.currentId);

  const shopping = shoppingList(layout, analysis);
  const parts = printParts(layout, analysis);
  const rows = wiringRows(layout, analysis);
  const steps = installChecklist(layout, analysis);
  const power = analysis.power.sources;

  return (
    <div className="outputs">
      <div className="output-tabs no-print">
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
        <div className="spacer" />
        <button className="btn small" onClick={() => window.print()}>Print summary</button>
      </div>

      <div className="print-only print-title">
        <h1>{layout.name}</h1>
        <p>Cable plan · {new Date().toLocaleDateString()}</p>
      </div>

      <section className={`output ${tab === 'shopping' ? 'active' : ''}`}>
        <h2>Shopping list</h2>
        <ExportButtons name="shopping-list" table={shoppingTable(shopping)} />
        {groupShopping(shopping).map(([cat, items]) => (
          <div key={cat} className="group">
            <h3>{cat}</h3>
            <table className="data">
              <tbody>
                {items.map((i, n) => (
                  <tr key={n} className={i.refs.length ? 'clickable' : ''} onClick={() => i.refs[0] && select({ kind: 'cable', id: i.refs[0] })}>
                    <td className="qty">{i.qty}×</td>
                    <td>{i.name}</td>
                    <td className="muted">{i.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className={`output ${tab === 'print' ? 'active' : ''}`}>
        <h2>3D-printable parts</h2>
        <ExportButtons name="3d-prints" table={printPartsTable(parts)} />
        {parts.length === 0 && <p className="muted">Nothing marked “I'll print this” yet. Tick it on any tray, clip, spine, brick holder or device.</p>}
        <table className="data">
          <thead>
            <tr><th>Part</th><th>Qty</th><th>Dimensions</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {parts.map((p, n) => (
              <tr key={n} className={p.kind}>
                <td>
                  {p.name} {p.kind === 'suggested' && <span className="tag">idea</span>}
                </td>
                <td>{p.qty}</td>
                <td className="mono">{p.dimensions}</td>
                <td className="muted">{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`output ${tab === 'wiring' ? 'active' : ''}`}>
        <h2>Wiring table</h2>
        <ExportButtons name="wiring" table={wiringTable(rows)} />
        <table className="data">
          <thead>
            <tr><th>From</th><th>To</th><th>Cable</th><th>Needed</th><th>Retail</th><th>Route</th><th>Bundle</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cable.id} className="clickable" onClick={() => select({ kind: 'cable', id: r.cable.id })}>
                <td>{r.from}</td>
                <td>{r.to}</td>
                <td>{r.type}</td>
                <td className="num">{r.exact}</td>
                <td className="num">{r.retail}</td>
                <td className="muted">{r.route}</td>
                <td>{r.bundle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`output ${tab === 'checklist' ? 'active' : ''}`}>
        <h2>Install checklist</h2>
        <ExportButtons name="install-checklist" markdown={`# ${layout.name}: install checklist\n\n${checklistMarkdown(steps)}`} />
        <ol className="checklist">
          {steps.map((s) => (
            <li key={s.id}>
              <h3>{s.title}</h3>
              <ul>
                {s.items.map((item, n) => {
                  const id = `${s.id}:${item}`;
                  return (
                    <li key={n}>
                      <label>
                        <input type="checkbox" checked={!!checked[id]} onChange={() => toggle(id)} /> <span className={checked[id] ? 'done' : ''}>{item}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className={`output ${tab === 'power' ? 'active' : ''}`}>
        <h2>Power budget</h2>
        <table className="data">
          <thead>
            <tr><th>Source</th><th>Load</th><th>Receptacles</th><th>Plugged in</th></tr>
          </thead>
          <tbody>
            {power.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => select({ kind: p.kind === 'strip' ? 'infra' : 'feature', id: p.id })}>
                <td>{p.name}</td>
                <td>
                  <div className="meter" title={`${Math.round(p.ratio * 100)}%`}>
                    <div className={`fill ${p.ratio >= 1 ? 'error' : p.ratio >= 0.8 ? 'warn' : ''}`} style={{ width: `${Math.min(100, p.ratio * 100)}%` }} />
                  </div>
                  <span className="num">{Math.round(p.totalWatts)} / {p.maxWatts} W</span>
                </td>
                <td className="num">
                  {p.used} used{p.blocked ? `, ${p.blocked} blocked` : ''}, {p.free} free of {p.receptacles}
                </td>
                <td className="muted">{p.loads.map((l) => `${l.name} (${l.watts} W)`).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
