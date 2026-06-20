import { useRef } from 'react';
import { NODE_MENU } from '../nodes/registry';
import { useDismiss } from '../hooks/useDismiss';

// Appears when a connection is dropped on empty space; offers valid next types.
// Closes on Esc or outside click, like every other popover.
export default function DropMenu({ menu, onPick, onClose }) {
  const ref = useRef(null);
  useDismiss(ref, onClose, !!menu);
  if (!menu) return null;
  return (
    <div
      ref={ref}
      className="cf-drop-menu fixed z-50 rounded-xl border p-1.5 shadow-2xl"
      style={{
        left: menu.screenX,
        top: menu.screenY,
        transform: 'translate(-50%, -50%)',
        background: 'var(--cf-elevated)',
        borderColor: 'var(--cf-border-strong)',
      }}
    >
      <div className="mb-1 px-2 py-0.5 text-[10px] text-[var(--cf-text-faint)]">新增節點</div>
      {NODE_MENU.filter((m) => menu.allowed.includes(m.type)).map((m) => (
        <button
          key={m.type}
          onClick={() => onPick(m.type)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--cf-text-dim)] hover:bg-[var(--cf-surface-hover)] hover:text-[var(--cf-text)]"
        >
          <span className="cf-dot" style={{ background: m.dot }} />
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}
