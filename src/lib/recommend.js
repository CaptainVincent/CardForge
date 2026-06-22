// Recommendation engine — given the fields the user fixed, find how to pay for
// the BEST reward. Reverse-derives a triggering transaction per rule (bounded by
// rule count, no cartesian blow-up), simulates it, and ranks.
import { simulate, netScore } from './simulate';
import { CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, labelOf } from './options';

// Does a custom predicate currently hold against a {field: value} bag?
function customHolds(c, bag = {}) {
  const v = bag[c.field];
  if (v == null) return false;
  const arr = Array.isArray(c.value) ? c.value : [c.value];
  switch (c.op) {
    case 'is': return String(v) === String(c.value);
    case 'is_not': return String(v) !== String(c.value);
    case 'in': return arr.map(String).includes(String(v));
    case 'not_in': return !arr.map(String).includes(String(v));
    case 'gte': return Number(v) >= Number(c.value);
    case 'lte': return Number(v) <= Number(c.value);
    case 'contains': return String(v).includes(String(c.value));
    default: return true;
  }
}

// Build a transaction that triggers `rule`, consistent with the user's fixed
// fields. Returns { tx, how[], note } or null if it conflicts with a fixed field.
function triggerTx(rule, fixed) {
  const m = rule.match || {};
  const tx = {
    amount: Number(fixed.amount) || 0,
    periodSpend: fixed.periodSpend,
    isOverseas: fixed.isOverseas ?? null,
    hasFee: fixed.hasFee,
    currency: fixed.currency || null,
    channels: fixed.channels?.length ? [...fixed.channels] : [],
    categories: fixed.categories?.length ? [...fixed.categories] : [],
    merchant: fixed.merchant || null,
    paymentMethod: fixed.paymentMethod || null,
    custom: { ...(fixed.custom || {}) },
  };
  const how = [];
  let note = null;

  if (m.is_overseas != null) {
    if (tx.isOverseas != null && tx.isOverseas !== m.is_overseas) return null;
    if (tx.isOverseas == null) { tx.isOverseas = m.is_overseas; how.push(m.is_overseas ? '海外' : '國內'); }
  }
  if (m.currencies?.length) {
    if (tx.currency && !m.currencies.includes(tx.currency)) return null;
    if (!tx.currency) { tx.currency = m.currencies[0]; how.push(m.currencies[0]); }
  }
  if (m.channels?.length && !tx.channels.some((c) => m.channels.includes(c))) {
    if (fixed.channels?.length) return null; // fixed to channels that exclude the requirement
    tx.channels.push(m.channels[0]); how.push(labelOf(CHANNEL_OPTIONS, m.channels[0]));
  }
  if (m.categories?.length && !tx.categories.some((c) => m.categories.includes(c))) {
    if (fixed.categories?.length) return null;
    tx.categories.push(m.categories[0]); how.push(labelOf(CATEGORY_OPTIONS, m.categories[0]));
  }
  if (m.merchants?.length) {
    if (tx.merchant && !m.merchants.includes(tx.merchant)) return null;
    if (!tx.merchant) { tx.merchant = m.merchants[0]; how.push(m.merchants[0]); }
  }
  if (m.payment_methods?.length) {
    if (tx.paymentMethod && !m.payment_methods.includes(tx.paymentMethod)) return null;
    if (!tx.paymentMethod) { tx.paymentMethod = m.payment_methods[0]; how.push(labelOf(PM_OPTIONS, m.payment_methods[0])); }
  }
  if (m.min_amount_twd && tx.amount < m.min_amount_twd) note = `需單筆滿 $${m.min_amount_twd.toLocaleString()}`;

  for (const p of m.custom || []) {
    const cur = tx.custom[p.field];
    if (p.op === 'is') {
      if (cur != null && String(cur) !== String(p.value)) return null;
      if (cur == null) { tx.custom[p.field] = p.value; how.push(`${p.field}=${p.value}`); }
    } else if (p.op === 'in') {
      const arr = Array.isArray(p.value) ? p.value : [p.value];
      if (cur != null && !arr.map(String).includes(String(cur))) return null;
      if (cur == null) { tx.custom[p.field] = arr[0]; how.push(`${p.field}=${arr[0]}`); }
    } else {
      note = (note ? note + '；' : '') + `需 ${p.field} ${p.op} ${p.value}`;
    }
  }

  // Cross-field OR groups (任一): each group needs ≥1 alternative satisfied,
  // honoring the user's fixed fields. Pick the first compatible alternative.
  for (const group of m.or_groups || []) {
    const holds = (s) =>
      (s.is_overseas == null || tx.isOverseas === s.is_overseas) &&
      (!s.currencies?.length || (tx.currency && s.currencies.includes(tx.currency))) &&
      (!s.channels?.length || tx.channels.some((c) => s.channels.includes(c))) &&
      (!s.categories?.length || tx.categories.some((c) => s.categories.includes(c))) &&
      (!s.merchants?.length || (tx.merchant && s.merchants.includes(tx.merchant))) &&
      (!s.payment_methods?.length || (tx.paymentMethod && s.payment_methods.includes(tx.paymentMethod))) &&
      (s.custom || []).every((c) => customHolds(c, tx.custom));
    if (group.some(holds)) continue;

    const conflictsFixed = (s) =>
      (s.is_overseas != null && fixed.isOverseas != null && fixed.isOverseas !== s.is_overseas) ||
      (s.currencies?.length && fixed.currency && !s.currencies.includes(fixed.currency)) ||
      (s.channels?.length && fixed.channels?.length && !tx.channels.some((c) => s.channels.includes(c))) ||
      (s.categories?.length && fixed.categories?.length && !tx.categories.some((c) => s.categories.includes(c))) ||
      (s.merchants?.length && fixed.merchant && !s.merchants.includes(fixed.merchant)) ||
      (s.payment_methods?.length && fixed.paymentMethod && !s.payment_methods.includes(fixed.paymentMethod)) ||
      (s.custom || []).some((c) => fixed.custom?.[c.field] != null && !customHolds(c, fixed.custom));

    const sub = group.find((s) => !conflictsFixed(s));
    if (!sub) return null; // fixed fields exclude every alternative
    if (sub.is_overseas != null && tx.isOverseas == null) { tx.isOverseas = sub.is_overseas; how.push(sub.is_overseas ? '海外' : '國內'); }
    if (sub.currencies?.length && !tx.currency) { tx.currency = sub.currencies[0]; how.push(sub.currencies[0]); }
    if (sub.channels?.length && !tx.channels.some((c) => sub.channels.includes(c))) { tx.channels.push(sub.channels[0]); how.push(labelOf(CHANNEL_OPTIONS, sub.channels[0])); }
    if (sub.categories?.length && !tx.categories.some((c) => sub.categories.includes(c))) { tx.categories.push(sub.categories[0]); how.push(labelOf(CATEGORY_OPTIONS, sub.categories[0])); }
    if (sub.merchants?.length && !tx.merchant) { tx.merchant = sub.merchants[0]; how.push(sub.merchants[0]); }
    if (sub.payment_methods?.length && !tx.paymentMethod) { tx.paymentMethod = sub.payment_methods[0]; how.push(labelOf(PM_OPTIONS, sub.payment_methods[0])); }
    for (const c of sub.custom || []) {
      if (tx.custom[c.field] != null) continue;
      if (c.op === 'is') { tx.custom[c.field] = c.value; how.push(`${c.field}=${c.value}`); }
      else if (c.op === 'in') { const a = Array.isArray(c.value) ? c.value : [c.value]; tx.custom[c.field] = a[0]; how.push(`${c.field}=${a[0]}`); }
    }
  }

  return { tx, how, note };
}

export function recommend(json, fixed, rates = {}) {
  const rules = Object.values(json?.rules || {});
  const seen = new Set();
  const options = [];

  // Baseline: pay with only the fixed fields (no extra choice).
  const baseTx = {
    amount: Number(fixed.amount) || 0,
    periodSpend: fixed.periodSpend,
    isOverseas: fixed.isOverseas ?? null,
    hasFee: fixed.hasFee,
    currency: fixed.currency || null,
    channels: fixed.channels || [],
    categories: fixed.categories || [],
    merchant: fixed.merchant || null,
    paymentMethod: fixed.paymentMethod || null,
    custom: fixed.custom || {},
  };
  const base = simulate(json, baseTx, rates);
  options.push({ how: [], note: null, result: base, tx: baseTx });

  for (const rule of rules) {
    if (rule.is_active === false) continue;
    const t = triggerTx(rule, fixed);
    if (!t) continue;
    const result = simulate(json, t.tx, rates);
    const key = t.how.join('|') + '#' + result.cashback + '#' + JSON.stringify(result.points);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ how: t.how, note: t.note, result, tx: t.tx });
  }

  // Rank by net decision value (estimated value − overseas fee).
  const score = (o) => netScore(o.result, json, o.tx, rates);
  options.sort((a, b) => score(b) - score(a));

  const best = options[0];
  return {
    best,
    options: options.slice(0, 6),
    gainOverBase: best ? score(best) - netScore(base, json, baseTx, rates) : 0,
  };
}

// Rank cards by their best net reward for one transaction (highest first).
export function compareCards(cards, tx, rates = {}) {
  return cards
    .map((c) => {
      const best = recommend(c, tx, rates).best;
      return { name: c.card, best, net: best ? netScore(best.result, c, best.tx, rates) : 0 };
    })
    .sort((a, b) => b.net - a.net);
}

// Distinct point-program names referenced by a set of cards' rules.
export function usedPointNames(cards) {
  return [...new Set(cards.flatMap((c) => Object.values(c.rules || {}).map((r) => r.reward?.point_name).filter(Boolean)))];
}
