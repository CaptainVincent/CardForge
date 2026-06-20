import SelectField from './fields/SelectField';
import SegmentedControl from './fields/SegmentedControl';
import NumberField from './fields/NumberField';
import { CYCLES, LIMIT_METRICS } from '../lib/options';

// A 上限 node caps a metric over a window. metric: reward (回饋金額,預設) /
// spend (消費金額,"前 $X 享優惠") / count (筆數,"前 N 筆")。
// New maxPer* fields; legacy maxReward* read as fallback (old graphs = reward).
export default function LimitFields({ data, update, parentRate = 0 }) {
  const metric = data.metric || 'reward';
  const word = { reward: '回饋', spend: '消費', count: '筆數' }[metric];
  const unit = metric === 'count' ? '筆' : 'TWD';
  const perPeriod = data.maxPerPeriod ?? data.maxRewardPerPeriod;
  const total = data.maxTotal ?? data.maxRewardTotal;
  const perTxn = data.maxPerTxn ?? data.maxRewardPerTxn;

  return (
    <>
      <SegmentedControl label="上限度量" value={metric} options={LIMIT_METRICS} onChange={(v) => update({ metric: v })} />
      <SelectField label="週期" value={data.cycle || 'monthly'} options={CYCLES} onChange={(v) => update({ cycle: v })} />

      <div>
        <NumberField label={`單期${word}上限（${unit}）`} value={perPeriod} placeholder="不限" onChange={(v) => update({ maxPerPeriod: v })} />
        {metric === 'reward' && perPeriod && parentRate > 0 && (
          <div className="mt-1 text-[10px] text-amber-500/80">
            ≈ 消費 ${Math.round(perPeriod / parentRate).toLocaleString()} 封頂
          </div>
        )}
        {metric === 'spend' && perPeriod && (
          <div className="mt-1 text-[10px] text-[var(--cf-text-faint)]">前 ${Number(perPeriod).toLocaleString()} 消費享此回饋,超過不給</div>
        )}
        {metric === 'count' && perPeriod && (
          <div className="mt-1 text-[10px] text-[var(--cf-text-faint)]">每期前 {perPeriod} 筆享此回饋</div>
        )}
      </div>

      <NumberField label={`整段總額${word}上限（${unit}）`} hint="整段活動累計到此即止(常用於限時/新戶活動的一次性額度)" value={total} placeholder="不限" onChange={(v) => update({ maxTotal: v })} />

      {metric === 'reward' && (
        <NumberField label="單筆回饋上限（TWD）" value={perTxn} placeholder="不限" onChange={(v) => update({ maxPerTxn: v })} />
      )}
    </>
  );
}
