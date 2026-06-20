import InfoHint from './InfoHint';

export default function NumberField({ label, value, onChange, placeholder, step, hint }) {
  return (
    <label className="block">
      <span className="cf-field-label">{label}<InfoHint text={hint} /></span>
      <input
        type="number"
        step={step}
        className="cf-input"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );
}
