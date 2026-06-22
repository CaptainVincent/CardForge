// Single source for the LIST-valued MATCH fields: the JSON key ↔ canvas node-
// data key mapping. Import (condition/exclude/任一 node data + the group-merge
// fingerprint) and export (buildMatch + mergeConditions) all iterate THIS list,
// so adding a list field is ONE line here instead of shotgun edits across files
// (a missing fingerprint entry used to silently merge distinct rules).
//
// Deliberately NOT here: scalar/bespoke fields whose logic differs per site —
// is_overseas (nullable bool), min_amount_twd (number), custom (predicate array),
// or_groups (nested) — plus the engine's per-field MATCH semantics (matchClause)
// and human labels (summary), which genuinely vary by field.
export const MATCH_LIST_FIELDS = [
  { json: 'currencies', node: 'currencies' },
  { json: 'channels', node: 'channels' },
  { json: 'categories', node: 'categories' },
  { json: 'mcc', node: 'mcc' },
  { json: 'merchants', node: 'merchants' },
  { json: 'payment_methods', node: 'paymentMethods' },
  // 時間條件(卡友日/週幾、每月某號)— 交易日期屬性,引擎由 tx.date 推算。
  { json: 'day_of_week', node: 'dayOfWeek' },   // ['mon'..'sun']
  { json: 'day_of_month', node: 'dayOfMonth' }, // [1..31]
  // 消費國別/地區(travel/雙幣卡:日本/韓國…)— 交易屬性 tx.country。
  { json: 'countries', node: 'countries' },     // ['日本','韓國',…]
];
