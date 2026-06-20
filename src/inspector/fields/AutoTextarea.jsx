import { useRef, useLayoutEffect } from 'react';

// A textarea that grows to fit its content (no inner scrollbar). Height is reset
// then set to scrollHeight on every value change (incl. mount / node switch).
export default function AutoTextarea({ value = '', onChange, className = '', ...rest }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // scrollHeight excludes borders; add them so a border-box textarea fits
    // exactly (no residual inner scrollbar).
    const cs = getComputedStyle(el);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    el.style.height = `${el.scrollHeight + border}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      style={{ overflow: 'hidden', resize: 'none', minHeight: '3.2em' }}
      value={value}
      onChange={onChange}
      {...rest}
    />
  );
}
