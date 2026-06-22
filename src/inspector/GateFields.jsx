import NumberField from './fields/NumberField';
import SelectField from './fields/SelectField';
import InfoHint from './fields/InfoHint';
import { CYCLES, REWARD_CURRENCIES, parseNumInput } from '../lib/options';

// A gate unlocks its downstream reward(s) once cumulative spend hits a threshold
// within the period. Shared (one gate → many rewards) = a pooled unlock.
export default function GateFields({ data, update }) {
  return (
    <>
      <SelectField label="累計週期" value={data.cycle || 'monthly'} options={CYCLES} onChange={(v) => update({ cycle: v })} />
      <div>
        <span className="cf-field-label">解鎖門檻（累計消費達標）<InfoHint text="接到多個回饋＝共用同一道門檻" /></span>
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            className="cf-input"
            value={data.threshold ?? ''}
            placeholder="例：5000"
            onChange={(e) => update({ threshold: parseNumInput(e.target.value) })}
          />
          <select
            className="cf-select !w-auto"
            value={data.currency || 'TWD'}
            onChange={(e) => update({ currency: e.target.value })}
          >
            {REWARD_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
