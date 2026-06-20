import { useState, useRef } from 'react';
import { useDismiss } from '../hooks/useDismiss';

// A named dropdown menu (trigger + popover). Closes on Esc or outside click.
// Items: { label, onClick, dot?, hint?, danger? }
export default function OverflowMenu({ trigger, title, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useDismiss(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button className="cf-btn cf-btn--quiet" title={title} onClick={() => setOpen((o) => !o)}>
        {trigger}<span className="cf-caret">▾</span>
      </button>
      {open && (
        <div className={`cf-menu${align === 'left' ? ' cf-menu--left' : ''}`}>
          {items.map((it, i) =>
            it.header ? (
              <div key={`h${i}`} className="cf-menu__header">{it.header}</div>
            ) : (
              <button
                key={it.label}
                className={`cf-menu__item${it.danger ? ' cf-menu__item--danger' : ''}`}
                onClick={() => { setOpen(false); it.onClick(); }}
              >
                {it.icon ? <span className="flex" style={{ color: it.dot }}>{it.icon}</span>
                  : it.dot && <span className="cf-dot" style={{ background: it.dot }} />}
                <span className="flex-1">{it.label}</span>
                {it.hint && <kbd className="cf-menu__hint">{it.hint}</kbd>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
