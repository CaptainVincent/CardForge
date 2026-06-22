// Shared option definitions used by both the Inspector fields and node summaries.

export const CURRENCY_OPTIONS = ['JPY', 'KRW', 'THB', 'USD', 'EUR', 'CNY', 'HKD', 'SGD', 'GBP', 'AUD'];

export const CHANNEL_OPTIONS = [
  { value: 'online', label: '網購' },
  { value: 'mobile_pay', label: '行動支付' },
  { value: 'contactless', label: '感應' },
  { value: 'overseas', label: '海外' },
];

// 類別 / MCC — what is bought (distinct axis from channel = how it's paid).
export const CATEGORY_OPTIONS = [
  { value: 'dining', label: '餐飲' },
  { value: 'supermarket', label: '超市' },
  { value: 'convenience', label: '超商' },
  { value: 'gas', label: '加油' },
  { value: 'travel', label: '旅遊' },
  { value: 'streaming', label: '影音' },
  { value: 'department', label: '百貨' },
  { value: 'drugstore', label: '藥妝' },
];

export const PM_OPTIONS = [
  { value: 'apple_pay', label: 'Apple Pay' },
  { value: 'google_pay', label: 'Google Pay' },
  { value: 'samsung_pay', label: 'Samsung Pay' },
  { value: 'line_pay', label: 'LINE Pay' },
  { value: 'jkopay', label: '街口' },
  { value: 'pxpay', label: '全支付' },
  { value: 'easywallet', label: '悠遊付' },
  { value: 'ipass_money', label: '一卡通MONEY' },
  { value: 'taiwan_pay', label: '台灣Pay' },
  { value: 'pi_wallet', label: 'Pi錢包' },
  { value: 'easycard', label: '悠遊卡' },
  { value: 'ipass', label: '一卡通' },
];

export const REWARD_METHODS = [
  { value: 'percentage', label: '百分比 (%)' },
  { value: 'fixed', label: '固定金額' },
  { value: 'per_dollar', label: '每 N 元送點' },
];

export const REWARD_TYPES = [
  { value: 'cashback', label: '現金回饋' },
  { value: 'points', label: '點數' },
];

// 疊加層級僅供「顯示/分類」(基本 vs 加碼)—— 引擎不依它改變行為。
// 真正的「互斥/擇一」請用「擇一」節點(select_group),不要用層級表達。
export const LAYERS = [
  { value: 'base', label: '基本' },
  { value: 'bonus', label: '加碼' },
];

export const CYCLES = [
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'yearly', label: '每年' },
  { value: 'billing_cycle', label: '帳單週期' },
  { value: 'once', label: '一次性' },
];

export const REWARD_CURRENCIES = ['TWD', 'JPY', 'USD'];

// 消費地區 (shared by condition + any-alternative fields).
export const REGION_OPTIONS = [
  { value: null, label: '不限' },
  { value: true, label: '海外' },
  { value: false, label: '國內' },
];

// 點值比值基準 (shared by RewardFields + AnalyzePanel). 固定=官方、估算=最佳兌換。
export const BASIS_OPTIONS = [
  { value: 'fixed', label: '固定' },
  { value: 'estimate', label: '估算' },
];

// Chronological comparator for dated rate entries (baseline from===null first).
export const sortByFrom = (a, b) => (a.from || '').localeCompare(b.from || '');

// 上限度量:回饋金額 / 消費金額(前 $X) / 筆數(前 N 筆)。
export const LIMIT_METRICS = [
  { value: 'reward', label: '回饋' },
  { value: 'spend', label: '消費' },
  { value: 'count', label: '筆數' },
];

export const TIER_MODES = [
  { value: 'flat', label: '單一比率' },
  { value: 'spend', label: '消費級距' },
  { value: 'marginal', label: '超額累進' },
  { value: 'distinct_count', label: '品牌數級距' },
];

// Generic predicate operators — the "command block" that lets users author
// atoms we never hard-coded (day_of_week, merchant, is_first_purchase, …).
export const PREDICATE_OPS = [
  { value: 'is', label: '是 (=)' },
  { value: 'is_not', label: '不是 (≠)' },
  { value: 'in', label: '屬於 (∈)' },
  { value: 'not_in', label: '不屬於 (∉)' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: '包含' },
];

export const PREDICATE_OP_SYMBOL = {
  is: '=', is_not: '≠', in: '∈', not_in: '∉', gte: '≥', lte: '≤', contains: '⊇',
};

export const labelOf = (opts, value) =>
  opts.find((o) => o.value === value)?.label ?? value;

// A string option → {value,label}; an object passes through. (Shared by the
// select / chip field components so the coercion lives in one place.)
export const normalizeOption = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

// Parse a number <input> value: '' → null; non-finite (中間態如 "1e"、"-") → null.
// Never lets NaN reach the store (which would corrupt export/lint/simulate).
export const parseNumInput = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
