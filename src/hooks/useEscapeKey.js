import { useEffect } from 'react';

// Close a modal/popover on Esc. `enabled` lets callers (e.g. per-node menus)
// only subscribe while open, so we don't attach a listener per node.
export function useEscapeKey(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enabled]);
}
