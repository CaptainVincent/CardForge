// 規則 → 條列(緊湊對照表)的純函式。吃 exportCards 產出的「JSON 規則」
// (與引擎/稽核同一份結構,rate 為小數),輸出每列的 條件/回饋/上限/資格 字串。
// 給「畫布:清單檢視」用,讓一般使用者不必讀節點圖即可條列閱讀整張卡。
import { CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, CYCLES, WEEKDAY_OPTIONS, labelOf } from './options';

const num = (v) => Number(v).toLocaleString();
const listLabel = (arr) => (arr.length <= 2 ? arr.join('、') : `${arr[0]} 等 ${arr.length} 個`);
const pctNum = (r) => +(((r || 0) * 100).toFixed(2)); // 0.06 → 6,小數→百分數(去尾零)

function matchParts(m = {}) {
  const p = [];
  if (m.is_overseas === true) p.push('海外');
  else if (m.is_overseas === false) p.push('國內');
  if (m.countries?.length) p.push(m.countries.join('/'));
  if (m.currencies?.length) p.push(m.currencies.join('/'));
  if (m.channels?.length) p.push(m.channels.map((c) => labelOf(CHANNEL_OPTIONS, c)).join('/'));
  if (m.categories?.length) p.push(m.categories.map((c) => labelOf(CATEGORY_OPTIONS, c)).join('/'));
  if (m.merchants?.length) p.push(listLabel(m.merchants));
  if (m.payment_methods?.length) p.push(m.payment_methods.map((x) => labelOf(PM_OPTIONS, x)).join('/'));
  if (m.mcc?.length) p.push('MCC ' + m.mcc.join('/'));
  if (m.day_of_week?.length) p.push(m.day_of_week.map((w) => labelOf(WEEKDAY_OPTIONS, w)).join('/'));
  if (m.day_of_month?.length) p.push('每月' + m.day_of_month.join('/') + '號');
  if (m.min_amount_twd) p.push(`單筆≥$${num(m.min_amount_twd)}`);
  for (const c of m.custom || []) if (c.field) p.push(`${c.field}=${Array.isArray(c.value) ? c.value.join('/') : c.value}`);
  for (const g of m.or_groups || []) {
    const alts = (g || []).map((s) => matchParts(s).join('+')).filter(Boolean);
    if (alts.length) p.push('(' + alts.join(' 或 ') + ')');
  }
  return p;
}

function conditionText(rule) {
  let s = matchParts(rule.match).join(' · ') || '一般消費';
  const ex = rule.match?.exclude ? matchParts(rule.match.exclude) : [];
  if (ex.length) s += `(排除 ${ex.join('/')})`;
  return s;
}

function rewardText(rule) {
  const r = rule.reward || {};
  const t = rule.tiers || {};
  const isPts = r.type === 'points' || !!r.point_name;
  const unit = r.point_name || '點';
  let v;
  if (r.method === 'fixed') {
    v = `$${num(r.fixed_amount ?? 0)}`;
  } else if (r.method === 'per_dollar') {
    v = `每$${num(r.per_dollar || 0)}送${r.points_per_unit ?? 1}${unit}`;
  } else if (t.mode === 'distinct_count' && t.bands?.length) {
    const rs = t.bands.map((b) => b.rate).filter((x) => x != null).map(pctNum);
    v = `${t.count_label || '計數'}${rs.length ? ` +${Math.min(...rs)}~${Math.max(...rs)}%` : ''}`;
    if (isPts) v += `（${unit}）`;
  } else if ((t.mode === 'spend' || t.mode === 'marginal') && t.bands?.length) {
    const rs = t.bands.map((b) => b.rate).filter((x) => x != null).map(pctNum);
    const word = t.mode === 'marginal' ? '累進' : '級距';
    v = rs.length ? `${word} ${Math.min(...rs)}~${Math.max(...rs)}%` : word;
    if (isPts) v += `（${unit}）`;
  } else {
    v = `${pctNum(r.rate)}%`;
    if (isPts) v += `（${unit}）`;
  }
  return (rule.stacking?.layer === 'bonus' ? '+' : '') + v;
}

function capText(rule) {
  const parts = [];
  for (const c of rule.limits?.caps || []) {
    const scope = c.window === 'period' ? labelOf(CYCLES, c.cycle || 'monthly') : c.window === 'total' ? '整段' : '單筆';
    if (c.metric === 'spend') parts.push(`${scope}前$${num(c.max)}消費`);
    else if (c.metric === 'count') parts.push(`${scope}前${num(c.max)}筆`);
    else parts.push(`${scope} $${num(c.max)}`);
  }
  if (rule.settlement === 'once') parts.unshift('一次性');
  return parts.join(' · ') || '—';
}

function eligText(rule) {
  const e = rule.eligibility || {};
  const p = [...(e.flags || [])];
  const ms = e.min_spending;
  if (ms?.amount) p.push(ms.metric === 'count' ? `滿${num(ms.amount)}筆` : `滿$${num(ms.amount)}`);
  return p.join('・') || '—';
}

// 一張卡 → 條列(基本→加碼→一次性 排序;停用規則標 dimmed)。
export function cardRows(card) {
  const rows = Object.values(card?.rules || {}).map((rule) => ({
    id: rule.id,
    condition: conditionText(rule),
    reward: rewardText(rule),
    cap: capText(rule),
    eligibility: eligText(rule),
    dimmed: rule.is_active === false,
    order: rule.settlement === 'once' ? 2 : rule.stacking?.layer === 'bonus' ? 1 : 0,
  }));
  return rows.sort((a, b) => a.order - b.order);
}
