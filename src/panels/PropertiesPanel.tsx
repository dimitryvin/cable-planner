import { duplicateEntity, getEntity, removeEntity, updateEntity, type EntityKind } from '../state/actions';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';
import { CableProps } from './props/CableProps';
import { DeviceProps, InfraProps } from './props/DeviceProps';
import { FeatureProps } from './props/FeatureProps';
import { SettingsProps } from './props/SettingsProps';
import { SurfaceProps } from './props/SurfaceProps';

const TITLES: Record<EntityKind, string> = {
  feature: 'Wall item',
  surface: 'Surface',
  device: 'Device',
  infra: 'Cable management',
  cable: 'Cable',
};

export function PropertiesPanel() {
  const { layout, apply } = useLayout();
  const { selection, select } = useUi();
  const kind = selection && selection.kind !== 'room' ? selection.kind : undefined;
  const entity = kind && selection ? getEntity(layout, kind, selection.id) : undefined;

  if (!kind || !entity || !selection) {
    return (
      <div className="section">
        <h2>Layout settings</h2>
        <SettingsProps />
      </div>
    );
  }

  const id = selection.id;
  const key = `props:${id}`;
  return (
    <div className="section props">
      <div className="props-head">
        <h2>{TITLES[kind]}</h2>
        <div className="spacer" />
        {kind !== 'cable' && (
          <button
            className="btn small"
            title="Duplicate (⌘D)"
            onClick={() => {
              const r = duplicateEntity(layout, id);
              if (r.newId) {
                apply(() => r.layout);
                select({ kind, id: r.newId });
              }
            }}
          >
            Duplicate
          </button>
        )}
        <button className="btn small danger" title="Delete (⌫)" onClick={() => { apply(removeEntity(id)); select(null); }}>
          Delete
        </button>
      </div>
      {kind === 'surface' && 'grommets' in entity && <SurfaceProps s={entity} update={(fn, k) => apply(updateEntity('surface', id, fn), k ?? key)} />}
      {kind === 'feature' && <FeatureProps f={getEntity(layout, 'feature', id)!} update={(fn) => apply(updateEntity('feature', id, fn), key)} />}
      {kind === 'device' && <DeviceProps d={getEntity(layout, 'device', id)!} update={(fn) => apply(updateEntity('device', id, fn), key)} />}
      {kind === 'infra' && <InfraProps i={getEntity(layout, 'infra', id)!} update={(fn) => apply(updateEntity('infra', id, fn), key)} />}
      {kind === 'cable' && <CableProps c={getEntity(layout, 'cable', id)!} update={(fn) => apply(updateEntity('cable', id, fn), key)} />}
    </div>
  );
}
