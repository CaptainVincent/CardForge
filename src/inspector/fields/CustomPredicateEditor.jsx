import { PREDICATE_OPS } from '../../lib/options';

// Open-world escape hatch: field + operator + value rows. Lets users author
// atoms we never built in (星期 / 商戶 / 首刷 …). Composes with AND/OR/NOT.
export default function CustomPredicateEditor({ rules = [], onChange }) {
  const update = (i, patch) => onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rules, { field: '', op: 'is', value: '' }]);
  const remove = (i) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <div>
      <span className="cf-field-label">自訂條件（進階）</span>
      <div className="mt-1.5 space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              className="cf-input !mt-0"
              placeholder="欄位 (如 星期)"
              value={r.field ?? ''}
              onChange={(e) => update(i, { field: e.target.value })}
            />
            <select
              className="cf-select !mt-0 !w-auto"
              value={r.op || 'is'}
              onChange={(e) => update(i, { op: e.target.value })}
            >
              {PREDICATE_OPS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              className="cf-input !mt-0"
              placeholder="值 (多值用逗號)"
              value={r.value ?? ''}
              onChange={(e) => update(i, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="px-1 text-[var(--cf-text-faint)] hover:text-[var(--cf-danger)]"
              title="移除"
            >×</button>
          </div>
        ))}
        <button type="button" onClick={add} className="cf-btn cf-btn--ghost w-full justify-center">+ 新增自訂條件</button>
      </div>
    </div>
  );
}
