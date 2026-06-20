import SegmentedControl from './fields/SegmentedControl';
import ChipMultiSelect from './fields/ChipMultiSelect';
import MerchantField from './fields/MerchantField';
import NumberField from './fields/NumberField';
import CustomPredicateEditor from './fields/CustomPredicateEditor';
import { CURRENCY_OPTIONS, CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, REGION_OPTIONS } from '../lib/options';
import { useFlowStore } from '../store/flowStore';

const blankAlt = () => ({ isOverseas: null, currencies: [], channels: [], categories: [], merchants: [], paymentMethods: [], minAmountTwd: null, custom: [] });

// The 任一 (OR-group) node:符合任一替代條件即通過。Each alternative is an
// AND-clause across fields, OR'd together. Chaining this node with other
// conditions stays AND — full CNF without branch explosion.
export default function AnyFields({ data, update }) {
  const customOptions = useFlowStore((s) => s.customOptions);
  const addCustomOption = useFlowStore((s) => s.addCustomOption);

  const alts = data.alternatives?.length ? data.alternatives : [blankAlt(), blankAlt()];
  const setAlt = (i, patch) => update({ alternatives: alts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const addAlt = () => update({ alternatives: [...alts, blankAlt()] });
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
              <button type="button" className="text-[var(--cf-text-faint)] hover:text-[#d4503a]" onClick={() => removeAlt(i)}>✕</button>
            )}
          </div>
          {/* same axis order as ConditionFields: 消費對象 → 支付與通路 → 情境 */}
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

      <button type="button" className="cf-btn cf-btn--quiet w-full justify-center" onClick={addAlt}>＋ 新增替代條件</button>
    </>
  );
}
