import SegmentedControl from './fields/SegmentedControl';
import ChipMultiSelect from './fields/ChipMultiSelect';
import NumberField from './fields/NumberField';
import CustomPredicateEditor from './fields/CustomPredicateEditor';
import { CURRENCY_OPTIONS, CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, REGION_OPTIONS } from '../lib/options';
import { useFlowStore } from '../store/flowStore';

const POLARITY_OPTIONS = [
  { value: false, label: '包含' },
  { value: true, label: '排除 (NOT)' },
];

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
      <SegmentedControl
        label="消費地區"
        value={data.isOverseas ?? null}
        options={REGION_OPTIONS}
        onChange={(v) => update({ isOverseas: v })}
      />
      <ChipMultiSelect
        label="幣別（多選）"
        values={data.currencies || []}
        options={CURRENCY_OPTIONS}
        custom={customOptions.currencies}
        onChange={(v) => update({ currencies: v })}
        onAddCustom={(l) => addCustomOption('currencies', l)}
      />
      <ChipMultiSelect
        label="通路"
        values={data.channels || []}
        options={CHANNEL_OPTIONS}
        custom={customOptions.channels}
        onChange={(v) => update({ channels: v })}
        onAddCustom={(l) => addCustomOption('channels', l)}
      />
      <ChipMultiSelect
        label="類別 / MCC"
        values={data.categories || []}
        options={CATEGORY_OPTIONS}
        custom={customOptions.categories}
        onChange={(v) => update({ categories: v })}
        onAddCustom={(l) => addCustomOption('categories', l)}
      />
      <ChipMultiSelect
        label="支付方式"
        values={data.paymentMethods || []}
        options={PM_OPTIONS}
        custom={customOptions.paymentMethods}
        onChange={(v) => update({ paymentMethods: v })}
        onAddCustom={(l) => addCustomOption('paymentMethods', l)}
      />
      <NumberField
        label="單筆最低（TWD）"
        value={data.minAmountTwd}
        placeholder="不限"
        onChange={(v) => update({ minAmountTwd: v })}
      />
      <CustomPredicateEditor
        rules={data.custom || []}
        onChange={(v) => update({ custom: v })}
      />
    </>
  );
}
