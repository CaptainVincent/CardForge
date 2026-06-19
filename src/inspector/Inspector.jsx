import { useMemo } from 'react';
import { useFlowStore } from '../store/flowStore';
import { nodeTitle, nodeSummary, nodeAccent } from '../lib/summary';
import { NodeGlyph, MousePointerClick } from '../lib/icons';
import { nodeIssues } from '../lib/validate';
import CardFields from './CardFields';
import ConditionFields from './ConditionFields';
import AnyFields from './AnyFields';
import RewardFields from './RewardFields';
import LimitFields from './LimitFields';
import GateFields from './GateFields';

const FIELDS = {
  card: CardFields,
  condition: ConditionFields,
  any: AnyFields,
  reward: RewardFields,
  limit: LimitFields,
  gate: GateFields,
};

export default function Inspector() {
  // Select stable references only; derive arrays/objects with useMemo so the
  // store snapshot stays cached (a fresh array per call would loop forever).
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId) || null);
  const edges = useFlowStore((s) => s.edges);
  const nodes = useFlowStore((s) => s.nodes);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const deleteNode = useFlowStore((s) => s.deleteNode);

  const issues = useMemo(() => (node ? nodeIssues(node, edges) : []), [node, edges]);

  // Live reward rate feeding the selected limit node (for the "≈ spend cap" hint).
  const parentRate = useMemo(() => {
    if (node?.type !== 'limit') return 0;
    const incoming = edges.find((e) => e.target === node.id);
    const reward = incoming && nodes.find((x) => x.id === incoming.source);
    if (reward?.type !== 'reward') return 0;
    const rd = reward.data || {};
    return rd.method === 'percentage' ? (Number(rd.rate) || 0) / 100 : 0;
  }, [node, edges, nodes]);

  if (!node) {
    return (
      <aside className="cf-panel flex flex-col items-center justify-center px-8 text-center">
        <MousePointerClick size={28} strokeWidth={1.5} className="mb-3 text-[var(--cf-text-faint)] opacity-50" />
        <p className="text-xs leading-relaxed text-[var(--cf-text-faint)]">
          點選畫布上的節點<br />在此編輯細節
        </p>
      </aside>
    );
  }

  const Fields = FIELDS[node.type];
  const update = (patch) => updateNodeData(node.id, patch);
  const accent = nodeAccent(node.type);

  return (
    <aside className="cf-panel flex flex-col">
      <header className="flex items-center gap-2.5 border-b border-[var(--cf-border)] px-4 py-3">
        <div className="cf-node__icon" style={{ '--accent': accent }}><NodeGlyph type={node.type} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--cf-text)]">{nodeTitle(node.type)}</div>
          <div className="truncate text-[11px] text-[var(--cf-text-faint)]">{nodeSummary(node)}</div>
        </div>
      </header>

      <div key={node.id} className="cf-panel__body flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {issues.length > 0 && (
          <div
            className="rounded-lg px-3 py-2"
            style={{
              border: '1px solid color-mix(in srgb, var(--cf-warn) 32%, transparent)',
              background: 'color-mix(in srgb, var(--cf-warn) 12%, transparent)',
            }}
          >
            <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--cf-warn)' }}>待完成</div>
            <ul className="list-inside list-disc space-y-0.5 text-[11px] text-[var(--cf-text-dim)]">
              {issues.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          </div>
        )}
        {Fields ? <Fields data={node.data || {}} update={update} parentRate={parentRate} /> : null}
      </div>

      {node.type !== 'card' && (
        <footer className="border-t border-[var(--cf-border)] p-3">
          <button
            onClick={() => deleteNode(node.id)}
            className="w-full rounded-lg border border-[var(--cf-border)] py-2 text-xs font-medium text-[var(--cf-text-faint)] transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
          >
            刪除此節點
          </button>
        </footer>
      )}
    </aside>
  );
}
