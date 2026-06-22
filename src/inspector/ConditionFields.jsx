import SegmentedControl from './fields/SegmentedControl';
import ChipMultiSelect from './fields/ChipMultiSelect';
import MerchantField from './fields/MerchantField';
import NumberField from './fields/NumberField';
import CustomPredicateEditor from './fields/CustomPredicateEditor';
import FieldGroup from './fields/FieldGroup';
import { CURRENCY_OPTIONS, CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, REGION_OPTIONS, WEEKDAY_OPTIONS } from '../lib/options';
import { useFlowStore } from '../store/flowStore';

const POLARITY_OPTIONS = [
  { value: false, label: '包含' },
  { value: true, label: '排除 (NOT)' },
];

// Fields grouped by the axis they describe, so the structure reads at a glance
// and new conditions have an obvious home (vs a flat list). 消費對象 = 買什麼/在哪買
// (類別=類型、特店=實例);支付與通路 = 怎麼付;情境 = 其他限定。
export default function ConditionFields({ data, update }) {
  const customOptions = useFlowStore((s) => s.customOptions);
  const addCustomOption = useFlowStore((s) => s.addCustomOption);

  return (
    <>
      <SegmentedControl
        label="條件極性"
        value={!!data.negate}
        options={POLARITY_OPTIONS}
        onChange={(v) => update({ negate: v })}
      />

      <FieldGroup title="消費對象">
        <ChipMultiSelect
          label="類別"
          values={data.categories || []}
          options={CATEGORY_OPTIONS}
          custom={customOptions.categories}
          onChange={(v) => update({ categories: v })}
          onAddCustom={(l) => addCustomOption('categories', l)}
        />
        <label className="block">
          <span className="cf-field-label">MCC<span className="text-[var(--cf-text-faint)]">(碼或範圍,逗號分隔。例:5812, 5811-5814)</span></span>
          <input
            className="cf-input font-mono"
            value={(data.mcc || []).join(', ')}
            placeholder="不限"
            onChange={(e) => update({ mcc: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
        </label>
        <MerchantField
          values={data.merchants || []}
          custom={customOptions.merchants}
          onChange={(v) => update({ merchants: v })}
          onAddCustom={(l) => addCustomOption('merchants', l)}
        />
      </FieldGroup>

      <FieldGroup title="支付與通路">
        <ChipMultiSelect
          label="通路"
          values={data.channels || []}
          options={CHANNEL_OPTIONS}
          custom={customOptions.channels}
          onChange={(v) => update({ channels: v })}
          onAddCustom={(l) => addCustomOption('channels', l)}
        />
        <ChipMultiSelect
          label="支付方式"
          values={data.paymentMethods || []}
          options={PM_OPTIONS}
          custom={customOptions.paymentMethods}
          onChange={(v) => update({ paymentMethods: v })}
          onAddCustom={(l) => addCustomOption('paymentMethods', l)}
        />
      </FieldGroup>

      <FieldGroup title="情境">
        <SegmentedControl
          label="消費地區"
          value={data.isOverseas ?? null}
          options={REGION_OPTIONS}
          // 切到「國內」隱含發卡國,清掉國別避免「國內+日本」這種矛盾規則
          onChange={(v) => update(v === false ? { isOverseas: v, countries: [] } : { isOverseas: v })}
        />
        {/* 國別只對「海外/不限」有意義;國內 = 發卡國,不需也不該再選國別 */}
        {data.isOverseas !== false && (
          <label className="block">
            <span className="cf-field-label">國別<span className="text-[var(--cf-text-faint)]">(消費地,逗號分隔。例:日本, 韓國)</span></span>
            <input
              className="cf-input"
              value={(data.countries || []).join(', ')}
              placeholder="不限"
              onChange={(e) => update({ countries: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
          </label>
        )}
        <ChipMultiSelect
          label="幣別（多選）"
          values={data.currencies || []}
          options={CURRENCY_OPTIONS}
          custom={customOptions.currencies}
          onChange={(v) => update({ currencies: v })}
          onAddCustom={(l) => addCustomOption('currencies', l)}
        />
        <NumberField
          label="單筆最低（TWD）"
          value={data.minAmountTwd}
          placeholder="不限"
          onChange={(v) => update({ minAmountTwd: v })}
        />
        <ChipMultiSelect
          label="星期（卡友日／週幾限定,多選）"
          values={data.dayOfWeek || []}
          options={WEEKDAY_OPTIONS}
          onChange={(v) => update({ dayOfWeek: v })}
        />
        <label className="block">
          <span className="cf-field-label">每月日期<span className="text-[var(--cf-text-faint)]">(號,逗號分隔。例:1, 20)</span></span>
          <input
            className="cf-input"
            value={(data.dayOfMonth || []).join(', ')}
            placeholder="不限"
            onChange={(e) => update({ dayOfMonth: e.target.value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 31) })}
          />
        </label>
        <CustomPredicateEditor
          rules={data.custom || []}
          onChange={(v) => update({ custom: v })}
        />
      </FieldGroup>
    </>
  );
}
