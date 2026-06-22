// Vertical timeline editor for a point's value-over-time. Renders a left rail
// with dots: 起始 (no date, covers card-activation) then dated changes, newest
// dot filled = current value. `onChange` receives the full new rates array.
import { sortByFrom, parseNumInput } from '../../lib/options';

export default function RateTimeline({ rates, onChange, today }) {
  const list = [...(rates?.length ? rates : [{ from: null, rate: 1 }])].sort(sortByFrom);
  const update = (i, patch) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  const add = () => onChange([...list, { from: today, rate: list[list.length - 1]?.rate ?? 1 }]);
  const last = list.length - 1;

  return (
    <div className="relative">
      <div className="absolute left-[6px] top-3 bottom-4 w-px bg-[var(--cf-border-strong)]" />
      <div className="space-y-1.5">
        {list.map((r, i) => (
          <div key={i} className="relative flex items-center gap-2 pl-5">
            <span
              className={`absolute left-[6px] top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--cf-surface)] ${
                i === last ? 'bg-[var(--cf-accent)]' : 'border border-[var(--cf-border-strong)] bg-[var(--cf-surface)]'
              }`}
            />
            {r.from == null
              ? <span className="flex-1 text-[11px] text-[var(--cf-text-faint)]" title="第一筆涵蓋到卡片啟用日">起始</span>
              : <input type="date" className="cf-input !mt-0 flex-1 !py-1 !text-[11px]" value={r.from} onChange={(e) => update(i, { from: e.target.value || today })} />}
            <span className="text-[11px] text-[var(--cf-text-faint)]">$</span>
            <input type="number" step="0.1" className="cf-input !mt-0 !w-16 flex-none !py-1" value={r.rate ?? ''} onChange={(e) => update(i, { rate: parseNumInput(e.target.value) })} />
            {r.from != null
              ? <button type="button" className="flex-none text-[var(--cf-text-faint)] hover:text-[var(--cf-danger)]" onClick={() => remove(i)}>✕</button>
              : <span className="w-3 flex-none" />}
          </div>
        ))}
        <div className="relative flex items-center pl-5">
          <span className="absolute left-[6px] top-1/2 grid h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-dashed border-[var(--cf-border-strong)] bg-[var(--cf-surface)] text-[9px] leading-none text-[var(--cf-text-faint)]">＋</span>
          <button type="button" className="text-[11px] text-[var(--cf-accent)] hover:underline" title="銀行日後調整點值時加一筆(填生效日)" onClick={add}>異動</button>
        </div>
      </div>
    </div>
  );
}
