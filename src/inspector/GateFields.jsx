import SegmentedControl from './fields/SegmentedControl';
import SelectField from './fields/SelectField';
import InfoHint from './fields/InfoHint';
import { CYCLES, REWARD_CURRENCIES, parseNumInput } from '../lib/options';

const METRICS = [
  { value: 'spend', label: '金額' },
  { value: 'count', label: '筆數' },
];

// A gate unlocks its downstream reward(s) once the period cumulative reaches a
// threshold — by 金額 (累計消費) or 筆數 (當月滿 N 筆). Shared (one gate → many
// rewards) = a pooled unlock.
export default function GateFields({ data, update }) {
  const metric = data.metric || 'spend';
  const count = metric === 'count';
  return (
    <>
      <SegmentedControl label="門檻種類" value={metric} options={METRICS} onChange={(v) => update({ metric: v })} />
      <SelectField label="累計週期" value={data.cycle || 'monthly'} options={CYCLES} onChange={(v) => update({ cycle: v })} />
      <div>
        <span className="cf-field-label">{count ? '解鎖門檻（累計筆數達標）' : '解鎖門檻（累計消費達標）'}<InfoHint text="接到多個回饋＝共用同一道門檻" /></span>
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            step={count ? '1' : undefined}
            className="cf-input"
            value={data.threshold ?? ''}
            placeholder={count ? '例：3' : '例：5000'}
            onChange={(e) => update({ threshold: parseNumInput(e.target.value) })}
          />
          {count ? (
            <span className="flex-none self-center text-[11px] text-[var(--cf-text-faint)]">筆 / 期</span>
          ) : (
            <select
              className="cf-select !w-auto"
              value={data.currency || 'TWD'}
              onChange={(e) => update({ currency: e.target.value })}
            >
              {REWARD_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </>
  );
}
