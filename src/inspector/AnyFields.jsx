import SegmentedControl from './fields/SegmentedControl';
import ChipMultiSelect from './fields/ChipMultiSelect';
import MerchantField from './fields/MerchantField';
import NumberField from './fields/NumberField';
import CustomPredicateEditor from './fields/CustomPredicateEditor';
import { CURRENCY_OPTIONS, CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, REGION_OPTIONS } from '../lib/options';
import { useFlowStore } from '../store/flowStore';

const blankAlt = () => ({ isOverseas: null, currencies: [], channels: [], categories: [], merchants: [], paymentMethods: [], minAmountTwd: null, custom: [] });

// 任一 = OR 邏輯閘。新模型:把要「任一成立」的『配對條件』連進來(card → 配對條件
// → 任一),OR 它的輸入、單一輸出、命中幾個都只算一次;與下游串接仍是 AND(完整
// CNF)。舊模型(節點內部 alternatives)仍可編輯以相容既有畫布。
export default function AnyFields({ data, update, nodeId }) {
  const customOptions = useFlowStore((s) => s.customOptions);
  const addCustomOption = useFlowStore((s) => s.addCustomOption);
  const inCount = useFlowStore((s) => s.edges.filter((e) => e.target === nodeId).length);

  // ── 新模型:純 OR 閘(無內部欄位) ──
  if (!data.alternatives?.length) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-[var(--cf-surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--cf-text-dim)]">
          <strong className="text-[var(--cf-text)]">OR 邏輯閘</strong>:把要「<strong className="text-[var(--cf-text)]">任一成立即可</strong>」的<strong>配對條件</strong>連進這個節點(卡片 → 配對條件 → 此任一)。各條件之間是「或」;此節點往下接,與下游仍是「且」。<strong className="text-[var(--cf-text)]">單一輸出、命中幾個都只算一次</strong>。
        </p>
        <p className="px-1 text-[11px] text-[var(--cf-text-faint)]">
          目前連入 <strong className={inCount < 2 ? 'text-[var(--cf-warn)]' : 'text-[var(--cf-text)]'}>{inCount}</strong> 個配對條件{inCount < 2 ? '(需 ≥2 個才成立)' : ''}。
        </p>
      </div>
    );
  }

  // ── 舊模型:內部替代(相容既有畫布,可繼續編輯) ──
  const alts = data.alternatives;
  const setAlt = (i, patch) => update({ alternatives: alts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const removeAlt = (i) => update({ alternatives: alts.filter((_, j) => j !== i) });

  return (
    <>
      <p className="rounded-lg bg-[var(--cf-surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--cf-text-dim)]">
        符合下列<strong className="text-[var(--cf-text)]">任一</strong>替代條件即通過(跨欄位的「或」)。替代之間是 OR;此節點與串接的其他條件之間仍是 AND。
      </p>
      {alts.map((a, i) => (
        <div key={i} className="space-y-2.5 rounded-lg border border-[var(--cf-border)] p-2.5">
          <div className="flex items-center justify-between">
            <span className="cf-field-label !mb-0">替代 {i + 1}</span>
            {alts.length > 1 && (
              <button type="button" className="text-[var(--cf-text-faint)] hover:text-[var(--cf-danger)]" onClick={() => removeAlt(i)}>✕</button>
            )}
          </div>
          <ChipMultiSelect label="類別 / MCC" values={a.categories || []} options={CATEGORY_OPTIONS} custom={customOptions.categories} onChange={(v) => setAlt(i, { categories: v })} onAddCustom={(l) => addCustomOption('categories', l)} />
          <MerchantField values={a.merchants || []} custom={customOptions.merchants} onChange={(v) => setAlt(i, { merchants: v })} onAddCustom={(l) => addCustomOption('merchants', l)} />
          <ChipMultiSelect label="通路" values={a.channels || []} options={CHANNEL_OPTIONS} custom={customOptions.channels} onChange={(v) => setAlt(i, { channels: v })} onAddCustom={(l) => addCustomOption('channels', l)} />
          <ChipMultiSelect label="支付方式" values={a.paymentMethods || []} options={PM_OPTIONS} custom={customOptions.paymentMethods} onChange={(v) => setAlt(i, { paymentMethods: v })} onAddCustom={(l) => addCustomOption('paymentMethods', l)} />
          <SegmentedControl label="消費地區" value={a.isOverseas ?? null} options={REGION_OPTIONS} onChange={(v) => setAlt(i, { isOverseas: v })} />
          <ChipMultiSelect label="幣別" values={a.currencies || []} options={CURRENCY_OPTIONS} custom={customOptions.currencies} onChange={(v) => setAlt(i, { currencies: v })} onAddCustom={(l) => addCustomOption('currencies', l)} />
          <NumberField label="單筆最低（TWD）" value={a.minAmountTwd} placeholder="不限" onChange={(v) => setAlt(i, { minAmountTwd: v })} />
          <CustomPredicateEditor rules={a.custom || []} onChange={(v) => setAlt(i, { custom: v })} />
        </div>
      ))}
      <button type="button" className="cf-btn cf-btn--quiet w-full justify-center" onClick={() => update({ alternatives: [...alts, blankAlt()] })}>＋ 新增替代條件(舊式)</button>
    </>
  );
}
