import { useFlowStore } from '../store/flowStore';
import SegmentedControl from './fields/SegmentedControl';
import InfoHint from './fields/InfoHint';
import { rewardSummary } from '../lib/summary';
import { forwardReachable } from '../lib/graph.js';

const DEFAULTS = [
  { value: false, label: '未符合' },
  { value: true, label: '符合' },
];

// 資格節點:表達「新戶 / 已線上登錄」這類二元資格(符合與否)。連到多條回饋即
// 「一個開關控多條」;同名資格在分析面板會合併成同一個 ✓/✗ 情境開關。
export default function EligibilityFields({ data, nodeId, update }) {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);

  // Names already used elsewhere — offered for reuse to keep one shared flag
  // (same name = same flag) and avoid 同義異名 splitting into many toggles.
  const existingNames = [
    ...new Set(
      nodes
        .filter((n) => n.type === 'eligibility' && n.id !== nodeId && n.data?.name?.trim())
        .map((n) => n.data.name.trim())
    ),
  ];

  // Rewards forward-reachable from this node — what it actually controls.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const controlled = [...forwardReachable([nodeId], edges)]
    .map((id) => byId.get(id))
    .filter((n) => n?.type === 'reward');

  return (
    <>
      <label className="block">
        <span className="cf-field-label">
          資格名稱
          <InfoHint text="例:新戶、已線上登錄。相同名稱視為同一項資格,分析面板會合併成一個開關一起控制。" />
        </span>
        <input
          className="cf-input"
          list={`elig-names-${nodeId}`}
          value={data.name ?? ''}
          placeholder="例:新戶"
          onChange={(e) => update({ name: e.target.value })}
        />
        {existingNames.length > 0 && (
          <datalist id={`elig-names-${nodeId}`}>
            {existingNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
      </label>

      <SegmentedControl
        label="預設狀態"
        value={data.default}
        options={DEFAULTS}
        onChange={(v) => update({ default: v })}
        hint="新建時尚未選 → 節點顯示黃點提醒。限時 / 新戶促銷選「未符合」:日常試算不灌水,在分析面板勾選資格才解鎖下游。"
      />
      {data.default == null && (
        <p className="-mt-1 text-[10px]" style={{ color: 'var(--cf-warn)' }}>尚未選擇預設狀態</p>
      )}

      {controlled.length > 0 ? (
        <div>
          <span className="cf-field-label">控制中（{controlled.length} 條回饋）</span>
          <ul className="mt-1.5 space-y-1">
            {controlled.map((r) => (
              <li key={r.id} className="truncate text-xs text-[var(--cf-text-dim)]">
                · {rewardSummary({ ...r.data, isActive: true })}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[10px] text-[var(--cf-text-faint)]">把此節點連到回饋,即可用一個開關一起控制它們。</p>
      )}
    </>
  );
}
