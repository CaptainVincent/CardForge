import SelectField from './fields/SelectField';
import NumberField from './fields/NumberField';
import { CYCLES } from '../lib/options';

export default function LimitFields({ data, update, parentRate = 0 }) {
  return (
    <>
      <SelectField label="週期" value={data.cycle || 'monthly'} options={CYCLES} onChange={(v) => update({ cycle: v })} />

      <div>
        <NumberField
          label="單期回饋上限（TWD）"
          value={data.maxRewardPerPeriod}
          placeholder="不限"
          onChange={(v) => update({ maxRewardPerPeriod: v })}
        />
        {data.maxRewardPerPeriod && parentRate > 0 && (
          <div className="mt-1 text-[10px] text-amber-500/80">
            ≈ 消費 ${Math.round(data.maxRewardPerPeriod / parentRate).toLocaleString()} 封頂
          </div>
        )}
      </div>

      <NumberField
        label="總上限（TWD）"
        value={data.maxRewardTotal}
        placeholder="不限"
        onChange={(v) => update({ maxRewardTotal: v })}
      />

      <NumberField
        label="單筆回饋上限（TWD）"
        value={data.maxRewardPerTxn}
        placeholder="不限"
        onChange={(v) => update({ maxRewardPerTxn: v })}
      />
    </>
  );
}
