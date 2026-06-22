import { useRef, useState } from 'react';
import { toast } from 'sonner';
import ModalOverlay from './ModalOverlay';
import SegmentedControl from '../inspector/fields/SegmentedControl';
import { Plus } from '../lib/icons';

const MODES = [
  { value: 'paste', label: '貼上' },
  { value: 'file', label: '檔案' },
  { value: 'url', label: '網址' },
];
const TARGETS = [
  { value: 'replace', label: '取代當前' },
  { value: 'append', label: '加入現有' },
];

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.onerror = () => reject(new Error(`讀取「${file.name}」失敗`));
    r.readAsText(file);
  });

// Bring in one or more rules databases. Files / URLs accept multiple; every
// source converges to an array of raw texts → onSubmitTexts(texts, { append }),
// which the caller parses, merges (cards + point_programs) and loads.
export default function ImportModal({ onClose, onSubmitTexts }) {
  const [mode, setMode] = useState('paste');
  const [target, setTarget] = useState('replace');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [urls, setUrls] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const append = target === 'append';

  const submitFiles = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      onSubmitTexts(await Promise.all(files.map(readFile)), { append });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitUrls = async () => {
    // Include the pending input even if 「＋」 wasn't pressed.
    const all = [...new Set([...urls, urlInput.trim()].filter(Boolean))];
    if (!all.length) return;
    setBusy(true);
    try {
      const texts = [];
      for (const u of all) {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`${u}：HTTP ${res.status}`);
        texts.push(await res.text());
      }
      onSubmitTexts(texts, { append });
    } catch (err) {
      toast.error(`讀取網址失敗:${err.message}(可能是 CORS 限制,改用貼上或下載檔案)`);
    } finally {
      setBusy(false);
    }
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (u && !urls.includes(u)) setUrls([...urls, u]);
    setUrlInput('');
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--cf-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--cf-text)]">匯入 JSON</span>
          <button type="button" onClick={onClose} className="cf-btn cf-btn--ghost">關閉</button>
        </div>

        <div className="space-y-3 p-4">
          <SegmentedControl
            label="匯入目標"
            value={target}
            options={TARGETS}
            onChange={setTarget}
            hint="取代當前=清空畫布換成匯入內容;加入現有=保留目前畫布,把匯入的卡片接在下方(可逐次累積多張卡)。"
          />
          <SegmentedControl value={mode} options={MODES} onChange={setMode} />

          {mode === 'paste' && (
            <>
              <textarea
                className="cf-input !h-auto font-mono !text-[11px] leading-relaxed"
                rows={10}
                placeholder='貼上規則 JSON,例如 {"cards":[…]}'
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex justify-end">
                <button type="button" className="cf-btn cf-btn--primary" disabled={!text.trim()} onClick={() => onSubmitTexts([text], { append })}>
                  {append ? '加入' : '載入'}
                </button>
              </div>
            </>
          )}

          {mode === 'file' && (
            <>
              <div className="rounded-lg border border-dashed border-[var(--cf-border-strong)] px-4 py-6 text-center">
                <p className="mb-3 text-xs text-[var(--cf-text-faint)]">選擇一或多個 .json 檔案</p>
                <button type="button" className="cf-btn" onClick={() => fileRef.current?.click()}>選擇檔案…</button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    if (picked.length) setFiles((prev) => [...prev, ...picked]);
                    e.target.value = '';
                  }}
                />
              </div>
              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button type="button" className="flex-none text-[var(--cf-text-faint)] hover:text-[var(--cf-danger)]" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <button type="button" className="cf-btn cf-btn--primary" disabled={!files.length || busy} onClick={submitFiles}>
                  {busy ? '讀取中…' : `${append ? '加入' : '載入'} ${files.length || ''} 個檔案`}
                </button>
              </div>
            </>
          )}

          {mode === 'url' && (
            <>
              {/* A real <form> so Enter submits HERE (preventDefault → addUrl)
                  and can never bubble to a full-page navigation/reload. */}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addUrl(); }}>
                <input
                  className="cf-input"
                  type="url"
                  autoComplete="off"
                  placeholder="https://…/rules.json"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <button type="submit" className="cf-btn flex-none" disabled={!urlInput.trim()} title="加入清單" aria-label="加入清單"><Plus size={14} strokeWidth={2.25} /></button>
              </form>
              {urls.length > 0 && (
                <ul className="space-y-1">
                  {urls.map((u, i) => (
                    <li key={u} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                      <span className="min-w-0 flex-1 truncate">{u}</span>
                      <button type="button" className="flex-none text-[var(--cf-text-faint)] hover:text-[var(--cf-danger)]" onClick={() => setUrls(urls.filter((_, j) => j !== i))}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] leading-relaxed text-[var(--cf-text-faint)]">
                需該網址允許跨來源讀取(CORS);GitHub raw / gist 通常可。可加入多個網址一次匯入。
              </p>
              <div className="flex justify-end">
                <button type="button" className="cf-btn cf-btn--primary" disabled={(!urls.length && !urlInput.trim()) || busy} onClick={submitUrls}>
                  {busy ? '讀取中…' : append ? '加入' : '載入'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
