import ModalOverlay from './ModalOverlay';

export default function LintPanel({ issues, onFocus, onClose }) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const Row = ({ it }) => (
    <li>
      <button
        className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs ${it.nodeId ? 'hover:bg-[var(--cf-surface-hover)]' : 'cursor-default'}`}
        onClick={() => it.nodeId && onFocus(it.nodeId)}
      >
        <span className="mt-0.5 flex-none" style={{ color: it.severity === 'error' ? '#d4503a' : 'var(--cf-warn)' }}>
          {it.severity === 'error' ? '✕' : '!'}
        </span>
        <span className="text-[var(--cf-text-dim)]">{it.message}{it.nodeId && <span className="text-[var(--cf-text-faint)]"> ↗</span>}</span>
      </button>
    </li>
  );

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="flex max-h-[78vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--cf-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--cf-text)]">
            規則檢查{issues.length === 0 ? '' : `（${errors.length} 錯誤 · ${warnings.length} 提醒）`}
          </span>
          <button onClick={onClose} className="cf-btn cf-btn--ghost">關閉</button>
        </div>
        <div className="overflow-y-auto p-3">
          {issues.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[var(--cf-text-faint)]">✓ 沒有發現問題</div>
          ) : (
            <>
              {errors.length > 0 && (
                <div className="mb-2">
                  <div className="cf-field-label mb-1 px-1">錯誤(規則無法運作)</div>
                  <ul className="space-y-0.5">{errors.map((it) => <Row key={it.id} it={it} />)}</ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div>
                  <div className="cf-field-label mb-1 px-1">提醒</div>
                  <ul className="space-y-0.5">{warnings.map((it) => <Row key={it.id} it={it} />)}</ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
