import TextField from './fields/TextField';
import NumberField from './fields/NumberField';
import SegmentedControl from './fields/SegmentedControl';

const ROUNDING = [
  { value: 'floor', label: '無條件捨去' },
  { value: 'round', label: '四捨五入' },
  { value: 'ceil', label: '無條件進位' },
];

export default function CardFields({ data, update }) {
  return (
    <>
      <TextField
        label="卡片名稱"
        value={data.cardName}
        placeholder="例：國泰 Cube"
        onChange={(v) => update({ cardName: v })}
      />
      <TextField
        label="帳戶"
        mono
        value={data.account}
        placeholder="Liabilities:TW:CreditCard:..."
        onChange={(v) => update({ account: v })}
      />
      <SegmentedControl
        label="回饋捨入"
        value={data.rounding || 'floor'}
        options={ROUNDING}
        onChange={(v) => update({ rounding: v })}
      />
      <NumberField
        label="海外手續費 (%)"
        step="0.1"
        value={data.fxFeeRate ?? 1.5}
        placeholder="1.5"
        onChange={(v) => update({ fxFeeRate: v })}
      />
    </>
  );
}
