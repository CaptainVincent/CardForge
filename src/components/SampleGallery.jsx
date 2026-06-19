import { SAMPLES } from '../lib/samples';
import ModalOverlay from './ModalOverlay';

// 範例畫廊 — wide cards (title + one-line description) so labels never wrap and
// each sample explains what it demonstrates. Loading replaces the canvas.
export default function SampleGallery({ onLoad, onClose }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--cf-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--cf-text)]">範例</span>
          <button onClick={onClose} className="cf-btn cf-btn--ghost">關閉</button>
        </div>

        <div className="overflow-y-auto p-3">
          <p className="mb-2 px-1 text-[11px] text-[var(--cf-text-faint)]">載入會取代目前畫布內容(會先詢問)。</p>
          <ul className="space-y-1.5">
            {SAMPLES.map((s) => (
              <li key={s.name}>
                <button
                  className="flex w-full flex-col gap-1 rounded-lg border border-[var(--cf-border)] px-3.5 py-3 text-left transition-colors hover:border-[var(--cf-border-strong)] hover:bg-[var(--cf-surface-hover)]"
                  onClick={() => onLoad(s)}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--cf-text)]">{s.name}</span>
                    {s.hint && <span className="rounded bg-[var(--cf-surface)] px-1.5 py-0.5 text-[10px] text-[var(--cf-text-faint)]">{s.hint}</span>}
                  </span>
                  <span className="text-xs leading-relaxed text-[var(--cf-text-dim)]">{s.desc}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalOverlay>
  );
}
