// Repeatable spend-tier rows: cumulative spend ≥ N → rate %.
// Covers 級距 (永豐式 滿1萬→10%) and multipliers (a single row).
export default function TierEditor({ tiers = [], onChange }) {
  const update = (i, patch) => onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const add = () => onChange([...tiers, { minSpend: null, rate: null }]);
  const remove = (i) => onChange(tiers.filter((_, idx) => idx !== i));

  return (
    <div>
      <span className="cf-field-label">消費級距（累計達標套用，取最高符合）</span>
      <div className="mt-1.5 space-y-2">
        {tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--cf-text-faint)]">累計≥</span>
            <input
              type="number"
              className="cf-input !mt-0"
              placeholder="金額"
              value={t.minSpend ?? ''}
              onChange={(e) => update(i, { minSpend: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <span className="text-[11px] text-[var(--cf-text-faint)]">→</span>
            <input
              type="number"
              step="0.1"
              className="cf-input !mt-0 !w-20"
              placeholder="%"
              value={t.rate ?? ''}
              onChange={(e) => update(i, { rate: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="px-1 text-[var(--cf-text-faint)] hover:text-red-400"
              title="移除"
            >×</button>
          </div>
        ))}
        <button type="button" onClick={add} className="cf-btn cf-btn--ghost w-full justify-center">+ 新增級距</button>
      </div>
    </div>
  );
}
