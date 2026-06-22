import { useFlowStore } from '../store/flowStore';
import SegmentedControl from './fields/SegmentedControl';
import InfoHint from './fields/InfoHint';
import { rewardSummary, limitSummary } from '../lib/summary';

const MODES = [
  { value: 'best', label: '擇優' },
  { value: 'pick', label: '自選' },
];

// 擇一節點兩種選法:
//  best(擇優)— 引擎每筆自動取回饋最高一條(現況)
//  pick(自選)— 使用者宣告採用「哪一條」(像會員等級 L1/L2),其餘停用(設 is_active:false)
// 切到 自選 預設全部停用(none → 警示);選一條才啟用它。
export default function SelectFields({ data, nodeId }) {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const setSelectMode = useFlowStore((s) => s.setSelectMode);
  const pickSelectMember = useFlowStore((s) => s.pickSelectMember);
  const mode = data.mode; // tri-state: undefined(新建未選) / 'best'(擇優) / 'pick'(自選)

  const members = edges
    .filter((e) => e.target === nodeId)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n) => n && n.type === 'reward');
  const actives = members.filter((m) => m.data?.isActive === true);
  const selectedId = actives.length === 1 ? actives[0].id : '';

  // Store owns the invariant (best=all active for comparison; pick=exactly one).
  const setMode = (m) => setSelectMode(nodeId, m);
  const pick = (id) => pickSelectMember(nodeId, id);

  // Label each option by what distinguishes it: reward + its downstream cap.
  const memberLabel = (mb) => {
    const lim = edges
      .filter((e) => e.source === mb.id)
      .map((e) => nodes.find((n) => n.id === e.target))
      .find((n) => n?.type === 'limit');
    const cap = lim ? limitSummary(lim.data) : '';
    return rewardSummary({ ...mb.data, isActive: true }) + (cap ? ` · ${cap}` : '');
  };

  return (
    <>
      <SegmentedControl
        label="選法"
        value={mode}
        options={MODES}
        onChange={setMode}
        hint="新建時尚未選 → 節點顯示黃點。擇優=引擎每筆自動取回饋最高一條;自選=你宣告採用哪一條(像會員等級 L1/L2),其餘停用。"
      />
      {mode == null && (
        <p className="-mt-1 text-[10px]" style={{ color: 'var(--cf-warn)' }}>尚未選擇選法</p>
      )}
      {mode === 'pick' && (
        <div>
          <span className="cf-field-label">採用哪一條</span>
          {members.length < 2 ? (
            <p className="mt-1 text-[10px] text-[var(--cf-text-faint)]">需連入兩條以上回饋</p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {members.map((mb) => (
                <label key={mb.id} className="flex cursor-pointer items-center gap-2 text-xs text-[var(--cf-text-dim)]">
                  <input type="radio" name={`pick-${nodeId}`} checked={selectedId === mb.id} onChange={() => pick(mb.id)} />
                  <span className="min-w-0 flex-1 truncate">{memberLabel(mb)}</span>
                  {mb.data?.note && <InfoHint text={mb.data.note} />}
                </label>
              ))}
              {!selectedId && <p className="mt-1 text-[10px]" style={{ color: 'var(--cf-warn)' }}>尚未選擇採用哪一條</p>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
