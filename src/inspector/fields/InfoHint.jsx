import { useState, useRef } from 'react';

// A compact "?" beside a label; the explanation shows in a themed tooltip on
// hover. Uses position:fixed (positioned from the icon's rect) so it never gets
// clipped by the Inspector's scroll container, and shows instantly (no native
// title delay). Keeps the panel calm — guidance lives in the tooltip.
export default function InfoHint({ text }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  if (!text) return null;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130);
    setPos({ x, y: r.bottom + 6 });
  };

  return (
    <span
      ref={ref}
      className="cf-hint"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      role="note"
      aria-label={text}
    >
      ?
      {pos && (
        <span className="cf-hint__tip" style={{ left: pos.x, top: pos.y }}>{text}</span>
      )}
    </span>
  );
}
