import SelectField from './fields/SelectField';
import SegmentedControl from './fields/SegmentedControl';
import NumberField from './fields/NumberField';
import TextField from './fields/TextField';
import TierEditor from './fields/TierEditor';
import RateTimeline from './fields/RateTimeline';
import { REWARD_METHODS, REWARD_TYPES, LAYERS, REWARD_CURRENCIES, TIER_MODES, BASIS_OPTIONS } from '../lib/options';
import { useSettings, todayISO } from '../store/settings';

export default function RewardFields({ data, update }) {
  const method = data.method || 'percentage';
  const tierMode = data.tierMode || 'flat';
  const pointPrograms = useSettings((s) => s.pointPrograms);
  const setPointRates = useSettings((s) => s.setPointRates);
  const setPointBasis = useSettings((s) => s.setPointBasis);
  const pn = data.pointName?.trim();
  const prog = (pn && pointPrograms[pn]) || {};
  const today = todayISO();
  return (
    <>
      <SelectField label="回饋方式" value={method} options={REWARD_METHODS} onChange={(v) => update({ method: v })} />

      {method === 'percentage' && (
        <>
          <SegmentedControl label="比率模式" value={tierMode} options={TIER_MODES} onChange={(v) => update({ tierMode: v })} />
          {tierMode === 'spend' ? (
            <TierEditor tiers={data.tiers || []} onChange={(v) => update({ tiers: v })} />
          ) : (
            <NumberField label="回饋率 (%)" step="0.1" value={data.rate} placeholder="3.5" onChange={(v) => update({ rate: v })} />
          )}
        </>
      )}

      {method === 'fixed' && (
        <>
          <NumberField label="固定金額" value={data.fixedAmount} placeholder="10000" onChange={(v) => update({ fixedAmount: v })} />
          <SelectField label="幣別" value={data.rewardCurrency || 'TWD'} options={REWARD_CURRENCIES} onChange={(v) => update({ rewardCurrency: v })} />
        </>
      )}

      {method === 'per_dollar' && (
        <>
          <NumberField label="每消費 N 元" value={data.perDollar} placeholder="例：30" onChange={(v) => update({ perDollar: v })} />
          <NumberField label="送點數" value={data.pointsPerUnit} placeholder="例：1" onChange={(v) => update({ pointsPerUnit: v })} />
        </>
      )}

      <SegmentedControl label="回饋類型" value={data.rewardType || 'cashback'} options={REWARD_TYPES} onChange={(v) => update({ rewardType: v })} />

      {data.rewardType === 'points' && (
        <>
          <TextField label="點數名稱" value={data.pointName} placeholder="小樹點 / OPENPOINT" onChange={(v) => update({ pointName: v })} />
          {pn && (
            <div className="space-y-2.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-2.5">
              <span className="cf-field-label !mb-0">點值 <span className="text-[var(--cf-text-faint)]">(全卡共用)</span> <span title="銀行有時會調整點數價值;改了之後我們會記住舊值,讓過去試算仍準確。" className="cursor-help text-[var(--cf-text-faint)]">ⓘ</span></span>
              <SegmentedControl label="比值基準" value={prog.basis ?? 'fixed'} options={BASIS_OPTIONS} onChange={(v) => setPointBasis(pn, v)} />
              <RateTimeline rates={prog.rates} onChange={(next) => setPointRates(pn, next)} today={today} />
              <p className="text-[10px] leading-relaxed text-[var(--cf-text-faint)]">
                「起始」自動涵蓋到卡片啟用日;按「異動」加一筆「生效日 → 新值」隨時間覆蓋。固定=官方比值、估算=彈性點/里程的最佳兌換估值。
              </p>
            </div>
          )}
        </>
      )}

      <SelectField label="疊加層級" value={data.layer || 'base'} options={LAYERS} onChange={(v) => update({ layer: v })} />

      <SegmentedControl
        label="結算方式"
        value={data.settlement || 'recurring'}
        options={[{ value: 'recurring', label: '每筆循環' }, { value: 'once', label: '一次性' }]}
        onChange={(v) => update({ settlement: v })}
      />

      <div>
        <span className="cf-field-label">活動期間（選填）</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="date"
            className="cf-input"
            value={data.startDate || ''}
            onChange={(e) => update({ startDate: e.target.value || null })}
          />
          <span className="text-[11px] text-[var(--cf-text-faint)]">→</span>
          <input
            type="date"
            className="cf-input"
            value={data.endDate || ''}
            onChange={(e) => update({ endDate: e.target.value || null })}
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--cf-text-dim)]">
        <input
          type="checkbox"
          checked={!!data.requiresActivation}
          onChange={(e) => update({ requiresActivation: e.target.checked })}
        />
        需手動登錄活動（activation）
      </label>
    </>
  );
}
