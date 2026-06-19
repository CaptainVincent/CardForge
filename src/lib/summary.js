// One-line summaries for nodes. Shared by the canvas cards and Inspector header.
// Title / accent now come from the node registry (single source of truth).

import { CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, CYCLES, LAYERS, PREDICATE_OP_SYMBOL, labelOf } from './options';

export { nodeTitle, nodeAccent } from '../nodes/registry';

const num = (v) => Number(v).toLocaleString();

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
  if (d.paymentMethods?.length) parts.push(d.paymentMethods.map((p) => labelOf(PM_OPTIONS, p)).join('/'));
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
  if (a.paymentMethods?.length) p.push(a.paymentMethods.map((m) => labelOf(PM_OPTIONS, m)).join('/'));
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
  } else if (d.tierMode === 'spend' && d.tiers?.length) {
    const rates = d.tiers.map((t) => t.rate).filter((r) => r != null);
    value = rates.length ? `級距 ${Math.min(...rates)}–${Math.max(...rates)}%` : '級距';
  } else {
    value = `${d.rate ?? 0}%`;
  }
  const layer = d.layer && d.layer !== 'base' ? `${labelOf(LAYERS, d.layer)} ` : '';
  const type = d.rewardType === 'points' ? `${d.pointName || '點數'} ` : '';
  const once = d.settlement === 'once' ? ' · 一次性' : '';
  return `${layer}${type}${value}${once}`.trim();
}

export function limitSummary(d = {}) {
  const parts = [];
  if (d.maxRewardPerPeriod) parts.push(`${labelOf(CYCLES, d.cycle || 'monthly')}上限 $${num(d.maxRewardPerPeriod)}`);
  if (d.maxRewardTotal) parts.push(`總上限 $${num(d.maxRewardTotal)}`);
  if (d.maxRewardPerTxn) parts.push(`單筆上限 $${num(d.maxRewardPerTxn)}`);
  return parts.length ? parts.join(' · ') : '尚未設定';
}

export function gateSummary(d = {}) {
  if (!d.threshold) return '尚未設定門檻';
  return `${labelOf(CYCLES, d.cycle || 'monthly')}滿 ${d.currency || 'TWD'} ${num(d.threshold)}`;
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
    case 'select': return '擇優（取最高一個）';
    default: return '';
  }
}
