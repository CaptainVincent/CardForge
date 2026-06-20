import { useState } from 'react';
import InfoHint from './InfoHint';

const normalize = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

export default function ChipMultiSelect({ label, values = [], options = [], custom = [], onChange, onAddCustom, hint }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  const opts = [...options, ...custom].map(normalize);
  // Surface any selected values not in presets/custom (e.g. imported) as chips.
  const known = new Set(opts.map((o) => o.value));
  const extra = values.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v }));
  const all = [...opts, ...extra];

  const toggle = (v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  const submit = () => {
    const t = text.trim();
    setText('');
    setAdding(false);
    if (!t) return;
    onAddCustom?.(t);
    if (!values.includes(t)) onChange([...values, t]);
  };

  return (
    <div>
      <span className="cf-field-label">{label}<InfoHint text={hint} /></span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {all.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`cf-chip${values.includes(o.value) ? ' is-active' : ''}`}
            onClick={() => toggle(o.value)}
          >
            {o.label}
          </button>
        ))}
        {adding ? (
          <input
            autoFocus
            className="cf-input !mt-0 !w-24"
            value={text}
            placeholder="自訂…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') { setText(''); setAdding(false); }
            }}
            onBlur={submit}
          />
        ) : (
          onAddCustom && (
            <button type="button" className="cf-chip cf-chip--add" onClick={() => setAdding(true)} title="新增自訂選項">＋</button>
          )
        )}
      </div>
    </div>
  );
}
