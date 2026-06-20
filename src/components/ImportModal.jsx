import { useRef, useState } from 'react';
import { toast } from 'sonner';
import ModalOverlay from './ModalOverlay';
import SegmentedControl from '../inspector/fields/SegmentedControl';

const MODES = [
  { value: 'paste', label: '貼上' },
  { value: 'file', label: '檔案' },
  { value: 'url', label: '網址' },
];

// Bring a rules database in from any of three sources. All three converge to raw
// text → onSubmitText(text), which the caller parses + loads (one import path).
export default function ImportModal({ onClose, onSubmitText }) {
  const [mode, setMode] = useState('paste');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const loadFile = (file) => {
    const r = new FileReader();
    r.onload = (e) => onSubmitText(e.target.result);
    r.readAsText(file);
  };

  const loadUrl = async () => {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSubmitText(await res.text());
    } catch (err) {
      toast.error(`讀取網址失敗：${err.message}（可能是 CORS 限制，改用貼上或下載檔案）`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--cf-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--cf-text)]">匯入 JSON</span>
          <button onClick={onClose} className="cf-btn cf-btn--ghost">關閉</button>
        </div>

        <div className="space-y-3 p-4">
          <SegmentedControl value={mode} options={MODES} onChange={setMode} />

          {mode === 'paste' && (
            <>
              <textarea
                className="cf-input !h-auto font-mono !text-[11px] leading-relaxed"
                rows={10}
                placeholder='貼上規則 JSON，例如 {"cards":[…]}'
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex justify-end">
                <button className="cf-btn cf-btn--primary" disabled={!text.trim()} onClick={() => onSubmitText(text)}>載入</button>
              </div>
            </>
          )}

          {mode === 'file' && (
            <div className="rounded-lg border border-dashed border-[var(--cf-border-strong)] px-4 py-10 text-center">
              <p className="mb-3 text-xs text-[var(--cf-text-faint)]">選擇 .json 檔案匯入</p>
              <button className="cf-btn cf-btn--primary" onClick={() => fileRef.current?.click()}>選擇檔案</button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }}
              />
            </div>
          )}

          {mode === 'url' && (
            <>
              <input
                className="cf-input"
                placeholder="https://…/rules.json"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUrl()}
              />
              <p className="text-[10px] leading-relaxed text-[var(--cf-text-faint)]">
                需該網址允許跨來源讀取（CORS）；GitHub raw / gist 通常可。
              </p>
              <div className="flex justify-end">
                <button className="cf-btn cf-btn--primary" disabled={!url.trim() || busy} onClick={loadUrl}>{busy ? '讀取中…' : '載入'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
