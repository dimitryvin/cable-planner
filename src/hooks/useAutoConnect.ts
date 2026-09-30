import { allConnectable, autoConnect } from '../calc/autoConnect';
import type { Id } from '../model/types';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';

/** Runs auto-connect as a single undo step and publishes the report for the banner. */
export function useAutoConnect() {
  const { layout, apply } = useLayout();
  const { setAutoReport, setCableMode } = useUi();

  const run = (ids: readonly Id[], scope: string) => {
    const r = autoConnect(layout, ids);
    if (r.added.length > 0) apply(() => r.layout);
    setCableMode(false);
    setAutoReport({ added: r.added, connected: r.connected, unresolved: r.unresolved, scope });
  };

  return {
    connectOne: (id: Id, name: string) => run([id], name),
    connectAll: () => run(allConnectable(layout), 'all gear'),
  };
}
