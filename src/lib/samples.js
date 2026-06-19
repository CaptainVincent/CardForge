// Built-in demo content. Authored in the exported ChristianWolff JSON shape so
// importFromJson rebuilds them into node graphs — no hand-placed nodes needed.
// Each sample showcases distinct features; collectively they exercise every
// node type (condition / any / gate / limit / select) and reward shape.

// Each demo card is a distinct (fictional) bank product with its own ledger
// account — not a spending category. Its character shows through its rules.
const ACCT = {
  mobile: 'Liabilities:CreditCard:Nebula',
  travel: 'Liabilities:CreditCard:Ocean',
  points: 'Liabilities:CreditCard:Forest',
  advanced: 'Liabilities:CreditCard:Obsidian',
  gate: 'Liabilities:CreditCard:Summit',
};

// 1) 通路加碼 + 期間上限（封頂）
const mobileCard = {
  card: '星雲銀行 樂Pay卡',
  account: ACCT.mobile,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 'm5', name: '行動支付 5%', account: ACCT.mobile, match: { channels: ['mobile_pay'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.05 }, limits: { max_reward_per_period: 300 } },
    r2: { id: 'm1', name: '一般 1%', account: ACCT.mobile, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.01 }, limits: {} },
  },
};

// 2) 類別加碼 + 海外 + 外幣手續費
const travelCard = {
  card: '遠洋銀行 環旅卡',
  account: ACCT.travel,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 't3', name: '餐廳/旅遊 3%', account: ACCT.travel, match: { categories: ['dining', 'travel'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.03 }, limits: {} },
    r2: { id: 'tov', name: '海外 2%', account: ACCT.travel, match: { is_overseas: true }, reward: { type: 'cashback', method: 'percentage', rate: 0.02 }, limits: {} },
    r3: { id: 't1', name: '一般 1%', account: ACCT.travel, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.01 }, limits: {} },
  },
};

// 3) 點數（每消費 N 元送點）+ 一次性首刷禮
const pointsCard = {
  card: '森林銀行 綠點卡',
  account: ACCT.points,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 'pt', name: '每 $30 送 1 點', account: ACCT.points, match: {}, reward: { type: 'points', method: 'per_dollar', per_dollar: 30, points_per_unit: 1, point_name: '小樹點' }, limits: {} },
    r2: { id: 'welcome', name: '首刷禮 $300', account: ACCT.points, match: {}, reward: { type: 'cashback', method: 'fixed', fixed_amount: 300 }, settlement: 'once', limits: {} },
  },
};

// 4) 進階：任一（跨欄位 OR）+ 擇優（取最高）
const advancedCard = {
  card: '曜石銀行 全能卡',
  account: ACCT.advanced,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 'or4', name: '(線上 或 餐廳) 4%', account: ACCT.advanced, match: { or_groups: [[{ channels: ['online'] }, { categories: ['dining'] }]] }, reward: { type: 'cashback', method: 'percentage', rate: 0.04 }, limits: {} },
    r2: { id: 'bestA', name: '現金 2%', account: ACCT.advanced, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.02 }, stacking: { layer: 'base', select_group: 'best' }, limits: {} },
    r3: { id: 'bestB', name: '點數 每$30送1.5點', account: ACCT.advanced, match: {}, reward: { type: 'points', method: 'per_dollar', per_dollar: 30, points_per_unit: 1.5, point_name: '紅利點' }, stacking: { layer: 'base', select_group: 'best' }, limits: {} },
  },
};

// 5) 門檻解鎖（單月累積滿額才加碼）— 搭配「月度」分頁最有感
const gateCard = {
  card: '登峰銀行 躍級卡',
  account: ACCT.gate,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 'unlock', name: '滿 $3,000 解鎖 4%', account: ACCT.gate, match: {}, eligibility: { min_spending: { amount: 3000, currency: 'TWD', period: 'monthly' } }, reward: { type: 'cashback', method: 'percentage', rate: 0.04 }, limits: {} },
    r2: { id: 'g1', name: '一般 1%', account: ACCT.gate, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.01 }, limits: {} },
  },
};

// The combined database loaded on first visit / via 「綜合範例」.
export const DEMO_DB = { cards: [mobileCard, travelCard, pointsCard, advancedCard, gateCard] };

// Gallery entries (工具列 → 範例).
export const SAMPLES = [
  { name: '綜合範例（5 張卡）', hint: '全功能', desc: '通路加碼/月上限、類別+海外+外幣費、點數+首刷禮、任一+擇優、門檻解鎖 — 一次看全部功能。', db: DEMO_DB },
  { name: '進階：任一 + 擇優', hint: '跨欄位 OR', desc: '示範「(線上 或 餐廳)」這種跨欄位的 OR,以及多個回饋「取最高一個」的擇優。', db: { cards: [advancedCard] } },
  { name: '門檻解鎖（配月度試算）', hint: 'gate', desc: '單月累積滿額才加碼;搭配「分析 → 月度」逐筆累積最有感。', db: { cards: [gateCard] } },
];
