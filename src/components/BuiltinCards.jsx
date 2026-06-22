import { BUILTIN_CARDS } from '../lib/builtinCards';
import ModalOverlay from './ModalOverlay';

// 內建卡片畫廊 — 收錄 cards/ 裡已建立好的真實卡片。「加入」疊到目前畫布(可比較
// 多張),「取代」清空後載入(會先詢問)。與「匯入 JSON」同一條 applyDb 路徑。
export default function BuiltinCards({ onImport, onClose }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--cf-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--cf-text)]">內建卡片</span>
          <button onClick={onClose} className="cf-btn cf-btn--ghost">關閉</button>
        </div>

        <div className="overflow-y-auto p-3">
          <p className="mb-2 px-1 text-[11px] text-[var(--cf-text-faint)]">
            已建立好的真實卡片規則。<strong>加入</strong>疊到目前畫布(可多張比較);<strong>取代</strong>清空後載入(會先詢問)。
          </p>
          {BUILTIN_CARDS.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-[var(--cf-text-faint)]">尚無內建卡片。</p>
          ) : (
            <ul className="space-y-1.5">
              {BUILTIN_CARDS.map((c) => (
                <li
                  key={c.file}
                  className="flex items-center gap-2 rounded-lg border border-[var(--cf-border)] px-3.5 py-3 transition-colors hover:border-[var(--cf-border-strong)] hover:bg-[var(--cf-surface-hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--cf-text)]">{c.names.join('、') || c.file}</div>
                    <div className="truncate text-[11px] text-[var(--cf-text-faint)]">{c.ruleCount} 條規則{c.cardCount > 1 ? ` · ${c.cardCount} 張` : ''} · {c.file}</div>
                  </div>
                  <button className="cf-btn cf-btn--ghost flex-none" onClick={() => onImport(c.db, { append: true })}>加入</button>
                  <button className="cf-btn cf-btn--ghost flex-none" onClick={() => onImport(c.db, { append: false })}>取代</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
