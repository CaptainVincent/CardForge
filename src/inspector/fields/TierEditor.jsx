import { parseNumInput } from '../../lib/options';

// Repeatable tier rows shared by three modes (threshold lives in `minSpend`
// generically — 金額 for spend/marginal, 家數 for distinct_count):
//  spend          — cumulative spend ≥ N → single rate (取最高符合;滿1萬→10%)
//  marginal       — 超過 N 的金額才套該段費率 (超額累進;各段分別計)
//  distinct_count — 當期不同品牌數 ≥ N → 加碼費率 (踩點;分析給家數、取最高符合)
const LABELS = {
  spend: '消費級距（累計達標套用，取最高符合）',
  marginal: '超額累進（每段金額各套自己的費率）',
  distinct_count: '計數級距（當期計數達 N → 加碼，取最高符合）',
};
export default function TierEditor({ tiers = [], onChange, mode = 'spend', unit = '' }) {
  const update = (i, patch) => onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const add = () => onChange([...tiers, { minSpend: null, rate: null }]);
  const remove = (i) => onChange(tiers.filter((_, idx) => idx !== i));
  const count = mode === 'distinct_count';
  const prefix = mode === 'marginal' ? '超過' : count ? '達' : '累計≥';

  return (
    <div>
      <span className="cf-field-label">{LABELS[mode] || LABELS.spend}</span>
      <div className="mt-1.5 space-y-2">
        {tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--cf-text-faint)]">{prefix}</span>
            <input
              type="number"
              step={count ? '1' : undefined}
              className="cf-input !mt-0"
              placeholder={count ? (unit || '計數') : '金額'}
              value={t.minSpend ?? ''}
              onChange={(e) => update(i, { minSpend: parseNumInput(e.target.value) })}
            />
            {count && <span className="text-[11px] text-[var(--cf-text-faint)]">{unit || '個'}</span>}
            <span className="text-[11px] text-[var(--cf-text-faint)]">→</span>
            <input
              type="number"
              step="0.1"
              className="cf-input !mt-0 !w-20"
              placeholder="%"
              value={t.rate ?? ''}
              onChange={(e) => update(i, { rate: parseNumInput(e.target.value) })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="px-1 text-[var(--cf-text-faint)] hover:text-[var(--cf-danger)]"
              title="移除"
            >×</button>
          </div>
        ))}
        <button type="button" onClick={add} className="cf-btn cf-btn--ghost w-full justify-center">+ 新增級距</button>
      </div>
    </div>
  );
}
