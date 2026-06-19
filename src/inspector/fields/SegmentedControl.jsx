// Options can carry non-string values (null / boolean), so compare by value
// and key by a stringified form.
export default function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div>
      {label && <span className="cf-field-label">{label}</span>}
      <div className="cf-seg">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={value === o.value ? 'is-active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
