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
];
