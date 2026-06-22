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
    isOverseas: fixed.isOverseas ?? false, // 推薦預設國內;不假設「出國」這種給定情境
    hasFee: fixed.hasFee,
    currency: fixed.currency || null,
    mcc: fixed.mcc || null,
    channels: fixed.channels?.length ? [...fixed.channels] : [],
    categories: fixed.categories?.length ? [...fixed.categories] : [],
    merchant: fixed.merchant || null,
    paymentMethod: fixed.paymentMethod || null,
    custom: { ...(fixed.custom || {}) },
    country: fixed.country || null,
    date: fixed.date,
    flags: fixed.flags || {},
    ...(fixed.distinctCount != null ? { distinctCount: fixed.distinctCount } : {}),
  };
  const how = [];
  let note = null;

  // 給定情境(買什麼/在哪買/何時買:海外/國別/幣別/類別/特店/MCC/日期)—— 推薦
  // 「不發明」,只沿用使用者已指定的;不符即此規則不屬當前情境,不列為選項。否則
  // 會把不可比的情境拿來排名(例:國內 0.5% vs 海外 2.5%,根本不是二選一)。
  if (m.is_overseas != null && tx.isOverseas !== m.is_overseas) return null;
  if (m.countries?.length && !(tx.country && m.countries.includes(tx.country))) return null;
  if (m.currencies?.length && !(tx.currency && m.currencies.includes(tx.currency))) return null;
  if (m.categories?.length && !tx.categories.some((c) => m.categories.includes(c))) return null;
  if (m.merchants?.length && !(tx.merchant && m.merchants.includes(tx.merchant))) return null;
  if (m.mcc?.length && !tx.mcc) return null; // 有 MCC 才交給引擎判定(含級距);不發明
  for (const p of m.custom || []) if (!customHolds(p, tx.custom)) return null;

  // 可控(怎麼刷:付款方式 / 通路)—— 這才是推薦真正能「建議」的選擇。
  if (m.payment_methods?.length) {
    if (tx.paymentMethod && !m.payment_methods.includes(tx.paymentMethod)) return null;
    if (!tx.paymentMethod) { tx.paymentMethod = m.payment_methods[0]; how.push(labelOf(PM_OPTIONS, m.payment_methods[0])); }
  }
  if (m.channels?.length && !tx.channels.some((c) => m.channels.includes(c))) {
    if (fixed.channels?.length) return null;
    tx.channels.push(m.channels[0]); how.push(labelOf(CHANNEL_OPTIONS, m.channels[0]));
  }
  if (m.min_amount_twd && tx.amount < m.min_amount_twd) note = `需單筆滿 $${m.min_amount_twd.toLocaleString()}`;

  // 任一(OR):某組需有一替代成立。給定情境的替代必須已由 fixed 滿足;只用可控的
  // (付款/通路)自動補。都不成立 → 此規則不屬當前情境。
  for (const group of m.or_groups || []) {
    const givenOk = (s) =>
      (s.is_overseas == null || tx.isOverseas === s.is_overseas) &&
      (!s.currencies?.length || (tx.currency && s.currencies.includes(tx.currency))) &&
      (!s.categories?.length || tx.categories.some((c) => s.categories.includes(c))) &&
      (!s.merchants?.length || (tx.merchant && s.merchants.includes(tx.merchant))) &&
      (!s.countries?.length || (tx.country && s.countries.includes(tx.country))) &&
      (!s.mcc?.length || !!tx.mcc) &&
      (s.custom || []).every((c) => customHolds(c, tx.custom));
    const holds = (s) => givenOk(s)
      && (!s.channels?.length || tx.channels.some((c) => s.channels.includes(c)))
      && (!s.payment_methods?.length || (tx.paymentMethod && s.payment_methods.includes(tx.paymentMethod)));
    if (group.some(holds)) continue;
    const sub = group.find(givenOk); // 給定已滿足、只差可控的替代
    if (!sub) return null;
    if (sub.channels?.length && !tx.channels.some((c) => sub.channels.includes(c))) { tx.channels.push(sub.channels[0]); how.push(labelOf(CHANNEL_OPTIONS, sub.channels[0])); }
    if (sub.payment_methods?.length && !tx.paymentMethod) { tx.paymentMethod = sub.payment_methods[0]; how.push(labelOf(PM_OPTIONS, sub.payment_methods[0])); }
  }

  return { tx, how, note };
}

export function recommend(json, fixed, rates = {}) {
  const rules = Object.values(json?.rules || {});
  const seen = new Set();
  const options = [];

  // Baseline: pay with only the fixed fields (no extra choice). 未指定地區 → 國內。
  const baseTx = {
    amount: Number(fixed.amount) || 0,
    periodSpend: fixed.periodSpend,
    isOverseas: fixed.isOverseas ?? false,
    hasFee: fixed.hasFee,
    currency: fixed.currency || null,
    mcc: fixed.mcc || null,
    channels: fixed.channels || [],
    categories: fixed.categories || [],
    merchant: fixed.merchant || null,
    paymentMethod: fixed.paymentMethod || null,
    custom: fixed.custom || {},
    country: fixed.country || null,
    date: fixed.date,
    flags: fixed.flags || {},
    ...(fixed.distinctCount != null ? { distinctCount: fixed.distinctCount } : {}),
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
