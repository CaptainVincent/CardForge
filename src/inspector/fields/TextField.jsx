export default function TextField({ label, value, onChange, placeholder, mono }) {
  return (
    <label className="block">
      <span className="cf-field-label">{label}</span>
      <input
        className={`cf-input${mono ? ' font-mono' : ''}`}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
