import ModalOverlay from './ModalOverlay';

// In-app confirmation — replaces native window.confirm so the UX matches the
// rest of the app's modals. Esc / backdrop = cancel; Enter = confirm (the
// confirm button is auto-focused). Sits above other modals (z-[60]).
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = '確定',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <ModalOverlay onClose={onCancel} z="z-[60]">
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-sm font-semibold text-[var(--cf-text)]">{title}</h2>
          {body && <p className="mt-1.5 text-xs leading-relaxed text-[var(--cf-text-dim)]">{body}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4 pt-3">
          <button onClick={onCancel} className="cf-btn cf-btn--ghost">{cancelLabel}</button>
          <button
            autoFocus
            onClick={onConfirm}
            className="cf-btn cf-btn--primary"
            style={danger ? { background: 'var(--cf-danger)', color: '#fff' } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
