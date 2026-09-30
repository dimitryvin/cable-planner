import { useUi } from '../state/ui';

export function ViewArea() {
  const { view } = useUi();
  return <div className="view-area muted" style={{ padding: 24 }}>{view} view coming next</div>;
}
