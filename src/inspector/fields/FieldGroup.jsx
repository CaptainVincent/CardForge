// A titled section inside the Inspector — one consistent header style + spacing
// rhythm so every panel reads with the same hierarchy (avoids ad-hoc gaps).
export default function FieldGroup({ title, children }) {
  return (
    <section className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cf-text-faint)]">{title}</div>
      {children}
    </section>
  );
}
