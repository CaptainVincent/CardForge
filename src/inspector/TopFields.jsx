import NumberField from './fields/NumberField';

// 取高:連入的多個回饋(各代表一個類別/成員)中,只有當期累積消費最高的 K 個
// 才會實際給回饋(自動取最高消費類別 — Citi Custom Cash、國泰 CUBE 自選)。
export default function TopFields({ data, update }) {
  return (
    <NumberField
      label="取最高 N 類（依當期累積消費）"
      hint="連入兩個以上回饋;每期依累積消費排名,僅最高的 N 個類別享回饋。"
      value={data.k ?? 1}
      placeholder="1"
      onChange={(v) => update({ k: v == null ? 1 : Math.max(1, Math.round(v)) })}
    />
  );
}
