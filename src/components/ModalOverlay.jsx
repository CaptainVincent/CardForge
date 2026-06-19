import { useEscapeKey } from '../hooks/useEscapeKey';

// Shared modal scaffold — one place that defines how every dialog sits:
// anchored to a consistent top offset (so every dialog's top edge lines up
// regardless of its height), same backdrop + blur, Esc and outside-click to
// close. Children supply the panel itself (its own width/height/border) and
// stopPropagation so inner clicks don't dismiss. `z` lets a nested dialog
// (confirm) sit on top. Panels should cap max-height to ~80vh to fit below.
export default function ModalOverlay({ onClose, children, z = 'z-50' }) {
  useEscapeKey(onClose);
  return (
    <div
      className={`fixed inset-0 ${z} flex items-start justify-center bg-black/40 px-4 pb-4 pt-[10vh] backdrop-blur-sm`}
      onClick={onClose}
    >
      {children}
    </div>
  );
}
