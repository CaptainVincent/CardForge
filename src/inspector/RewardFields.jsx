import SelectField from './fields/SelectField';
import SegmentedControl from './fields/SegmentedControl';
import NumberField from './fields/NumberField';
import TextField from './fields/TextField';
import TierEditor from './fields/TierEditor';
import RateTimeline from './fields/RateTimeline';
import FieldGroup from './fields/FieldGroup';
import InfoHint from './fields/InfoHint';
import AutoTextarea from './fields/AutoTextarea';
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
  const active = data.isActive !== false;
  return (
    <>
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] px-3 py-2">
        <span className="text-xs font-medium text-[var(--cf-text-dim)]">啟用此規則（納入試算）<InfoHint text="關閉=保留規則但不參與試算(限時/新戶促銷:存著存查,不灌爆日常回饋估算)" /></span>
        <input type="checkbox" checked={active} onChange={(e) => update({ isActive: e.target.checked })} />
      </label>

      <FieldGroup title="回饋公式">
        <SelectField label="回饋方式" value={method} options={REWARD_METHODS} onChange={(v) => update({ method: v })} />

        {method === 'percentage' && (
          <>
            <SegmentedControl label="比率模式" value={tierMode} options={TIER_MODES} onChange={(v) => update({ tierMode: v })} />
            {tierMode === 'spend' || tierMode === 'marginal' ? (
              <TierEditor mode={tierMode} tiers={data.tiers || []} onChange={(v) => update({ tiers: v })} />
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
      </FieldGroup>

      <FieldGroup title="回饋類型">
        <SegmentedControl label="現金 / 點數" value={data.rewardType || 'cashback'} options={REWARD_TYPES} onChange={(v) => update({ rewardType: v })} />

        {data.rewardType === 'points' && (
          <>
            <TextField label="點數名稱" value={data.pointName} placeholder="小樹點 / OPENPOINT" onChange={(v) => update({ pointName: v })} />
            {pn && (
              <div className="space-y-2.5 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-2.5">
                <span className="cf-field-label !mb-0">點值 <span className="text-[var(--cf-text-faint)]">(全卡共用)</span><InfoHint text="點值全卡共用,且會記住舊值讓過去試算仍準確。「起始」自動涵蓋到卡片啟用日;按「異動」加一筆「生效日→新值」隨時間覆蓋。固定=官方比值、估算=彈性點/里程的最佳兌換估值。" /></span>
                <SegmentedControl label="比值基準" value={prog.basis ?? 'fixed'} options={BASIS_OPTIONS} onChange={(v) => setPointBasis(pn, v)} />
                <RateTimeline rates={prog.rates} onChange={(next) => setPointRates(pn, next)} today={today} />
              </div>
            )}
          </>
        )}
      </FieldGroup>

      <FieldGroup title="進階">
        <SelectField label="疊加層級" value={data.layer || 'base'} options={LAYERS} onChange={(v) => update({ layer: v })} />

        <SegmentedControl
          label="發放方式"
          value={data.settlement || 'recurring'}
          options={[{ value: 'recurring', label: '逐筆回饋' }, { value: 'once', label: '里程碑（達標給一次）' }]}
          onChange={(v) => update({ settlement: v })}
          hint="逐筆回饋=每筆消費都算(可配上限累積);里程碑=完成條件發一筆就結束。限時/新戶活動請用『啟用開關＋整段總額上限』表達,不是這裡。"
        />

        <div>
          <span className="cf-field-label">活動期間（生效 → 截止，選填）</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="date"
              className="cf-input"
              title="生效日期"
              value={data.startDate || ''}
              onChange={(e) => update({ startDate: e.target.value || null })}
            />
            <span className="text-[11px] text-[var(--cf-text-faint)]">→</span>
            <input
              type="date"
              className="cf-input"
              title="截止日期"
              value={data.endDate || ''}
              onChange={(e) => update({ endDate: e.target.value || null })}
            />
          </div>
        </div>

        <NumberField
          label="首刷期限(開卡後 N 天,選填)"
          step="1"
          value={data.fromOpeningDays ?? ''}
          placeholder="例:90(核卡 90 天內)"
          hint="新戶首刷禮:檔期 = 持卡開始日起算 N 天(在卡片設定「持卡開始日」)。常配「門檻(總額)+ 里程碑(達標給一次)」。"
          onChange={(v) => update({ fromOpeningDays: v })}
        />

        <div>
          <span className="cf-field-label">備註（選填）<InfoHint text="純文字附註,隨規則一起匯出/匯入;不參與試算。能用欄位/條件表達的細則請優先結構化,別只寫這裡。" /></span>
          <AutoTextarea
            className="cf-input !text-[11px] leading-relaxed"
            value={data.note || ''}
            placeholder="引擎無法精確表達的細則,例：喬山限街邊門市、不含稅與保費"
            onChange={(v) => update({ note: v })}
          />
        </div>
      </FieldGroup>
    </>
  );
}
