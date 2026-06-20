import { Wrench, Sun, Moon, Plus, Calculator, LayoutGrid, NodeGlyph } from '../lib/icons';
import { NODE_MENU, nodeAccent } from '../nodes/registry';
import OverflowMenu from './OverflowMenu';

const glyph = (type) => <NodeGlyph type={type} size={15} />;

export default function Toolbar({
  nodeCount,
  lintErrors = 0,
  lintWarnings = 0,
  onLint,
  isDark,
  onToggleTheme,
  onAddNode,
  onUndo,
  onRedo,
  onLayout,
  onReset,
  onDuplicate,
  onOpenImport,
  onOpenSamples,
  onAnalyze,
  onPreview,
  onExport,
}) {
  const addItems = [
    { header: '端點' },
    { label: '信用卡', dot: nodeAccent('card'), icon: glyph('card'), onClick: () => onAddNode('card') },
    ...NODE_MENU.filter((m) => m.kind === 'terminal').map((m) => ({ label: m.label, dot: m.dot, icon: glyph(m.type), onClick: () => onAddNode(m.type) })),
    { header: '邏輯' },
    ...NODE_MENU.filter((m) => m.kind === 'operator').map((m) => ({ label: m.label, dot: m.dot, icon: glyph(m.type), onClick: () => onAddNode(m.type) })),
  ];
  const editItems = [
    { label: '復原', hint: '⌘Z', onClick: onUndo },
    { label: '重做', hint: '⌘⇧Z', onClick: onRedo },
    { label: '複製選取（含子樹）', hint: '⌘D', onClick: onDuplicate },
    { label: '自動排版', onClick: onLayout },
    { label: '清空畫布', danger: true, onClick: onReset },
  ];
  const dataItems = [
    { label: '匯入 JSON', hint: '檔案/貼上/網址', onClick: onOpenImport },
    { label: 'JSON 預覽', onClick: onPreview },
    { label: '匯出 JSON', hint: '⌘S', onClick: onExport },
  ];

  return (
    <div className="cf-toolbar flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2">
      <h1 className="flex items-center gap-1.5 text-sm font-bold text-[var(--cf-text)]">
        <Wrench size={15} strokeWidth={1.75} className="text-[var(--cf-accent)]" />
        CardForge
      </h1>
      <span className="text-xs text-[var(--cf-text-faint)]">信用卡規則編輯器</span>
      <span className="rounded bg-[var(--cf-surface)] px-1.5 py-0.5 text-[11px] text-[var(--cf-text-faint)]">{nodeCount} 節點</span>
      <button
        onClick={onLint}
        title="規則檢查"
        className="rounded px-1.5 py-0.5 text-[11px]"
        style={
          lintErrors ? { color: '#d4503a', background: 'color-mix(in srgb,#d4503a 12%,transparent)' }
          : lintWarnings ? { color: 'var(--cf-warn)', background: 'color-mix(in srgb,var(--cf-warn) 14%,transparent)' }
          : { color: 'var(--cf-text-faint)', background: 'var(--cf-surface)' }
        }
      >
        {lintErrors ? `✕ ${lintErrors}` : lintWarnings ? `! ${lintWarnings}` : '✓ 無誤'}
      </button>
      <div className="flex-1" />

      <OverflowMenu trigger={<><Plus size={14} strokeWidth={2} />新增</>} title="新增節點" items={addItems} />
      <OverflowMenu trigger="編輯" title="編輯" items={editItems} />
      <OverflowMenu trigger="資料" title="匯入 / 預覽 / 匯出" items={dataItems} />
      <button onClick={onOpenSamples} className="cf-btn cf-btn--quiet"><LayoutGrid size={14} strokeWidth={1.75} />範例</button>
      <button onClick={onAnalyze} className="cf-btn cf-btn--quiet"><Calculator size={14} strokeWidth={1.75} />分析</button>

      <div className="cf-divider" />

      <button onClick={onToggleTheme} className="cf-btn cf-btn--quiet" title={isDark ? '切換淺色' : '切換深色'}>
        {isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
      </button>
    </div>
  );
}
