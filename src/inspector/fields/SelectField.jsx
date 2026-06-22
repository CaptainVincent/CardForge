import { normalizeOption } from '../../lib/options';
import InfoHint from './InfoHint';

export default function SelectField({ label, value, onChange, options, hint }) {
  const opts = options.map(normalizeOption);
  return (
    <label className="block">
      <span className="cf-field-label">{label}<InfoHint text={hint} /></span>
      <select className="cf-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
