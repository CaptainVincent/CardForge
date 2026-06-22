import { normalizeOption } from '../../lib/options';

export default function SelectField({ label, value, onChange, options }) {
  const opts = options.map(normalizeOption);
  return (
    <label className="block">
      <span className="cf-field-label">{label}</span>
      <select className="cf-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
