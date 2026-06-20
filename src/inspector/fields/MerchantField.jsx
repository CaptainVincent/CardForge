import { useState } from 'react';
import ChipMultiSelect from './ChipMultiSelect';

// 指定特店 — a progressive-disclosure peer of 類別 within 消費對象 (finer grain:
// type → instance). Hidden by default (a quiet "＋ 限定特店" link) so the common
// case stays light; can be used on its own (no category needed) once revealed.
export default function MerchantField({ values = [], custom = [], onChange, onAddCustom }) {
  const [open, setOpen] = useState((values?.length || 0) > 0);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block text-[11px] text-[var(--cf-text-faint)] transition-colors hover:text-[var(--cf-text-dim)]"
      >
        ＋ 限定特店
      </button>
    );
  }

  return (
    <ChipMultiSelect
      label="指定特店（特定商家）"
      hint="比「類別」更細的特定商家(例:7-11、星巴克、蝦皮);可單獨使用,不必先選類別。"
      values={values}
      options={[]}
      custom={custom}
      onChange={onChange}
      onAddCustom={onAddCustom}
    />
  );
}
