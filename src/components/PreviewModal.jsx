import { toast } from 'sonner';
import ModalOverlay from './ModalOverlay';

export default function PreviewModal({ json, onClose, onDownload }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--cf-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--cf-text)]">JSON 預覽</span>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(json); toast.success('已複製到剪貼簿'); }}
              className="cf-btn cf-btn--quiet"
            >複製</button>
            <button onClick={onClose} className="cf-btn cf-btn--ghost">關閉</button>
            <button onClick={onDownload} className="cf-btn cf-btn--primary">下載</button>
          </div>
        </div>
        <pre className="max-h-[68vh] overflow-auto bg-[var(--cf-canvas)] p-4 font-mono text-[11px] leading-relaxed text-[var(--cf-text-dim)]">{json}</pre>
      </div>
    </ModalOverlay>
  );
}
