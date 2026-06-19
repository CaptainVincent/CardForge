export default function NumberField({ label, value, onChange, placeholder, step }) {
  return (
    <label className="block">
      <span className="cf-field-label">{label}</span>
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
