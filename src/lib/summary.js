// One-line summaries for nodes. Shared by the canvas cards and Inspector header.
// Title / accent now come from the node registry (single source of truth).

import { CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, CYCLES, LAYERS, WEEKDAY_OPTIONS, PREDICATE_OP_SYMBOL, labelOf } from './options';

const dayParts = (d) => {
  const p = [];
  if (d.dayOfWeek?.length) p.push(d.dayOfWeek.map((w) => labelOf(WEEKDAY_OPTIONS, w)).join('/'));
  if (d.dayOfMonth?.length) p.push(`每月${d.dayOfMonth.join('/')}號`);
  return p;
};

export { nodeTitle, nodeAccent } from '../nodes/registry';

const num = (v) => Number(v).toLocaleString();

// Compact a possibly-long value list for one-line summaries: show a couple of
// concrete examples, then "等 N 個" so a 26-merchant list doesn't blow up the card.
const listLabel = (arr) => (arr.length <= 2 ? arr.join('、') : `${arr[0]} 等 ${arr.length} 個`);

export function cardSummary(d = {}) {
  return d.cardName?.trim() || '未命名卡片';
}

export function conditionSummary(d = {}) {
  const parts = [];
  if (d.isOverseas === true) parts.push('海外');
  if (d.isOverseas === false) parts.push('國內');
  if (d.currencies?.length) parts.push(d.currencies.join('/'));
  if (d.channels?.length) parts.push(d.channels.map((c) => labelOf(CHANNEL_OPTIONS, c)).join('/'));
  if (d.categories?.length) parts.push(d.categories.map((c) => labelOf(CATEGORY_OPTIONS, c)).join('/'));
  if (d.merchants?.length) parts.push(`特店 ${listLabel(d.merchants)}`);
  if (d.paymentMethods?.length) parts.push(d.paymentMethods.map((p) => labelOf(PM_OPTIONS, p)).join('/'));
  parts.push(...dayParts(d));
  if (d.minAmountTwd) parts.push(`≥$${num(d.minAmountTwd)}`);
  for (const c of d.custom || []) {
    if (c.field && c.value !== '' && c.value != null) {
      parts.push(`${c.field}${PREDICATE_OP_SYMBOL[c.op] || '='}${c.value}`);
    }
  }
  if (!parts.length) return d.negate ? '（空排除）' : '一般消費';
  return (d.negate ? '排除：' : '') + parts.join(' · ');
}

const altLabel = (a = {}) => {
  const p = [];
  if (a.isOverseas === true) p.push('海外');
  if (a.isOverseas === false) p.push('國內');
  if (a.currencies?.length) p.push(a.currencies.join('/'));
  if (a.channels?.length) p.push(a.channels.map((c) => labelOf(CHANNEL_OPTIONS, c)).join('/'));
  if (a.categories?.length) p.push(a.categories.map((c) => labelOf(CATEGORY_OPTIONS, c)).join('/'));
  if (a.merchants?.length) p.push(`特店 ${listLabel(a.merchants)}`);
  if (a.paymentMethods?.length) p.push(a.paymentMethods.map((m) => labelOf(PM_OPTIONS, m)).join('/'));
  p.push(...dayParts(a));
  if (a.minAmountTwd) p.push(`≥$${num(a.minAmountTwd)}`);
  for (const c of a.custom || []) {
    if (c.field && c.value !== '' && c.value != null) p.push(`${c.field}${PREDICATE_OP_SYMBOL[c.op] || '='}${c.value}`);
  }
  return p.join('+');
};

export function anySummary(d = {}) {
  const alts = (d.alternatives || []).map(altLabel).filter(Boolean);
  if (!alts.length) return '任一（尚未設定）';
  return alts.join(' 或 ');
}

export function rewardSummary(d = {}) {
  const method = d.method || 'percentage';
  let value;
  if (method === 'fixed') {
    value = `${d.rewardCurrency || 'TWD'} ${d.fixedAmount != null ? num(d.fixedAmount) : '?'}`;
  } else if (method === 'per_dollar') {
    value = d.perDollar ? `每 $${num(d.perDollar)} 送 ${d.pointsPerUnit ?? 1}` : '每 N 元送點';
  } else if (d.tierMode === 'distinct_count' && d.tiers?.length) {
    const counts = d.tiers.map((t) => t.minSpend).filter((v) => v != null);
    const rates = d.tiers.map((t) => t.rate).filter((r) => r != null);
    const unit = d.countLabel?.trim() || '計數';
    value = `${unit}${counts.length ? ` ${Math.min(...counts)}–${Math.max(...counts)}` : ''} +${rates.length ? `${Math.min(...rates)}~${Math.max(...rates)}` : '?'}%`;
  } else if ((d.tierMode === 'spend' || d.tierMode === 'marginal') && d.tiers?.length) {
    const rates = d.tiers.map((t) => t.rate).filter((r) => r != null);
    const word = d.tierMode === 'marginal' ? '累進' : '級距';
    value = rates.length ? `${word} ${Math.min(...rates)}–${Math.max(...rates)}%` : word;
  } else {
    value = `${d.rate ?? 0}%`;
  }
  const layer = d.layer && d.layer !== 'base' ? `${labelOf(LAYERS, d.layer)} ` : '';
  const type = d.rewardType === 'points' ? `${d.pointName || '點數'} ` : '';
  const once = d.settlement === 'once' ? ' · 里程碑' : '';
  const off = d.isActive === false ? '（停用）' : '';
  return `${off}${layer}${type}${value}${once}`.trim();
}

export function limitSummary(d = {}) {
  const metric = d.metric || 'reward';
  const per = d.maxPerPeriod ?? d.maxRewardPerPeriod;
  const tot = d.maxTotal ?? d.maxRewardTotal;
  const txn = d.maxPerTxn ?? d.maxRewardPerTxn;
  const cyc = labelOf(CYCLES, d.cycle || 'monthly');
  const label = (max, scope) =>
    metric === 'spend' ? `${scope}前 $${num(max)} 消費`
      : metric === 'count' ? `${scope}前 ${num(max)} 筆`
        : `${scope}回饋上限 $${num(max)}`;
  const parts = [];
  if (per) parts.push(label(per, cyc));
  if (tot) parts.push(label(tot, '整段'));
  if (txn && metric === 'reward') parts.push(`單筆 $${num(txn)}`);
  return parts.length ? parts.join(' · ') : '尚未設定';
}

export function gateSummary(d = {}) {
  if (!d.threshold) return '尚未設定門檻';
  const cyc = labelOf(CYCLES, d.cycle || 'monthly');
  if (d.metric === 'count') return `${cyc}滿 ${num(d.threshold)} 筆`;
  return `${cyc}滿 ${d.currency || 'TWD'} ${num(d.threshold)}`;
}

export function eligibilitySummary(d = {}) {
  if (!d.name?.trim()) return '尚未命名資格';
  const state = d.default === true ? '符合' : d.default === false ? '未符合' : '未選';
  return `${d.name.trim()}（預設${state}）`;
}

export function nodeSummary(node) {
  const d = node?.data || {};
  switch (node?.type) {
    case 'card': return cardSummary(d);
    case 'condition': return conditionSummary(d);
    case 'any': return anySummary(d);
    case 'reward': return rewardSummary(d);
    case 'limit': return limitSummary(d);
    case 'gate': return gateSummary(d);
    case 'eligibility': return eligibilitySummary(d);
    case 'select': return d.mode === 'pick' ? '自選（指定一條）' : d.mode === 'best' ? '擇優（自動取最高）' : '尚未選擇選法';
    case 'top': return `取高（當期消費最高 ${Math.max(1, Number(d.k) || 1)} 類）`;
    default: return '';
  }
}
