import { useEffect } from 'react';

// Close a popover/menu on Esc OR pointer-down outside `ref`. One place so every
// dismissable surface (toolbar menus, drop menu, …) behaves identically.
export function useDismiss(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [ref, onClose, enabled]);
}
