import { useEffect } from 'react';

// Close a popover/menu on Esc, pointer-down outside `ref`, OR loss of focus
// (window/tab/app blur, or focus moving to an element outside via keyboard Tab).
// One place so every dismissable surface (toolbar menus, drop menu, …) behaves
// identically.
export function useDismiss(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const close = () => onClose?.();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const outside = (e) => ref.current && e.target && !ref.current.contains(e.target);
    const onDown = (e) => { if (outside(e)) close(); };
    const onFocusIn = (e) => { if (outside(e)) close(); }; // 焦點移到選單外(Tab)→ 關
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('blur', close); // 視窗/分頁失焦 → 關
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('blur', close);
    };
  }, [ref, onClose, enabled]);
}
