import { useEffect } from 'react';
import { duplicateEntity, removeEntity } from '../state/actions';
import { useLayout } from '../state/store';
import { useUi } from '../state/ui';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export function useKeyboardShortcuts(): void {
  const { layout, apply, undo, redo } = useLayout();
  const { selection, select, draft, setDraft, cableMode, setCableMode } = useUi();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (isTyping(e.target)) return;

      if (e.key === 'Escape') {
        if (draft) setDraft(null);
        else if (cableMode) setCableMode(false);
        else select(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection && selection.kind !== 'room') {
        e.preventDefault();
        apply(removeEntity(selection.id));
        select(null);
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && selection && selection.kind !== 'room' && selection.kind !== 'cable') {
        e.preventDefault();
        const r = duplicateEntity(layout, selection.id);
        if (r.newId) {
          apply(() => r.layout);
          select({ kind: selection.kind, id: r.newId });
        }
        return;
      }
      if (!mod && e.key.toLowerCase() === 'c') setCableMode(!cableMode);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, apply, undo, redo, selection, select, draft, setDraft, cableMode, setCableMode]);
}
