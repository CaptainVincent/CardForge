import { useEffect, useRef } from 'react';
import { useFlowStore, useTemporalStore } from '../store/flowStore';

// Global shortcuts: ⌘Z/⌘⇧Z undo·redo, ⌘D duplicate, ⌘C/⌘V copy·paste, ⌘S export.
// Handlers are read through a ref so the listener subscribes once.
export function useKeyboardShortcuts(handlers) {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; });

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      if (typing || !mod) return;
      const key = e.key.toLowerCase();

      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) useTemporalStore.getState().redo();
        else useTemporalStore.getState().undo();
      } else if (key === 'y') {
        e.preventDefault();
        useTemporalStore.getState().redo();
      } else if (key === 'd') {
        e.preventDefault();
        const id = useFlowStore.getState().selectedNodeId;
        if (id) ref.current.onDuplicate?.(id);
      } else if (key === 'c') {
        const id = useFlowStore.getState().selectedNodeId;
        if (id) { e.preventDefault(); ref.current.onCopy?.(id); }
      } else if (key === 'v') {
        e.preventDefault();
        ref.current.onPaste?.(useFlowStore.getState().selectedNodeId);
      } else if (key === 's') {
        e.preventDefault();
        ref.current.onExport?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
