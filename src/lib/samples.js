// Built-in demo content. Authored in the exported CardForge JSON shape so
// importFromJson rebuilds them into node graphs — no hand-placed nodes needed.
// Each sample showcases distinct features; collectively they exercise every
// node type (condition / any / gate / limit / select / top) and reward shape
// (flat / spend / marginal tiers, reward/spend/count caps).

// Each demo card is a distinct (fictional) bank product with its own ledger
// account — not a spending category. Its character shows through its rules.
const ACCT = {
  mobile: 'Liabilities:CreditCard:Nebula',
  travel: 'Liabilities:CreditCard:Ocean',
  points: 'Liabilities:CreditCard:Forest',
  advanced: 'Liabilities:CreditCard:Obsidian',
  gate: 'Liabilities:CreditCard:Summit',
  top: 'Liabilities:CreditCard:Aurora',
  tiered: 'Liabilities:CreditCard:Tide',
  cap: 'Liabilities:CreditCard:Granite',
  merchant: 'Liabilities:CreditCard:Skyline',
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

// 6) 取高：自動取「當期消費最高的類別」加碼（國泰 CUBE 自選 / Citi Custom Cash 風格）
const topCard = {
  card: '極光銀行 自選卡',
  account: ACCT.top,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  top_groups: { rotate: { k: 1 } },
  rules: {
    r1: { id: 'tdin', name: '取高·餐飲 5%', account: ACCT.top, match: { categories: ['dining'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.05 }, stacking: { layer: 'bonus', top_group: 'rotate' }, limits: {} },
    r2: { id: 'ttrv', name: '取高·旅遊 5%', account: ACCT.top, match: { categories: ['travel'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.05 }, stacking: { layer: 'bonus', top_group: 'rotate' }, limits: {} },
    r3: { id: 'tsup', name: '取高·超市 5%', account: ACCT.top, match: { categories: ['supermarket'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.05 }, stacking: { layer: 'bonus', top_group: 'rotate' }, limits: {} },
    r4: { id: 'tbase', name: '一般 1%', account: ACCT.top, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.01 }, limits: {} },
  },
};

// 7) 超額累進 + 前 $X 消費（marginal tiers + 消費金額上限）
const tieredCard = {
  card: '潮汐銀行 躍升卡',
  account: ACCT.tiered,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 'mdep', name: '百貨 超額累進（前1萬1%·超過5%）', account: ACCT.tiered, match: { categories: ['department'] }, reward: { type: 'cashback', method: 'percentage', rate: 0 }, tiers: { mode: 'marginal', bands: [{ min_amount: 0, rate: 0.01 }, { min_amount: 10000, rate: 0.05 }] }, limits: {} },
    r2: { id: 'mstream', name: '影音 前 $1,500 享 5%', account: ACCT.tiered, match: { categories: ['streaming'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.05 }, limits: { caps: [{ metric: 'spend', window: 'period', max: 1500 }] }, stacking: { layer: 'bonus' } },
    r3: { id: 'mbase', name: '一般 1%', account: ACCT.tiered, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.01 }, limits: {} },
  },
};

// 8) 多重上限 + 筆數上限（一回饋多道上限、前 N 筆）
const capCard = {
  card: '磐石銀行 穩健卡',
  account: ACCT.cap,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 'cmob', name: '行動支付 5%（單筆 $50·每月 $300）', account: ACCT.cap, match: { channels: ['mobile_pay'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.05 }, limits: { caps: [{ metric: 'reward', window: 'txn', max: 50 }, { metric: 'reward', window: 'period', max: 300 }] }, stacking: { layer: 'bonus' } },
    r2: { id: 'ccon', name: '超商 前 3 筆 10%', account: ACCT.cap, match: { categories: ['convenience'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.1 }, limits: { caps: [{ metric: 'count', window: 'period', max: 3 }] }, stacking: { layer: 'bonus' } },
    r3: { id: 'cbase', name: '一般 1%', account: ACCT.cap, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.01 }, limits: {} },
  },
};

// 9) 指定特店（merchant）— 把範圍從「類別」縮到「特定商家」,常與類別/通路併用
const merchantCard = {
  card: '晴空銀行 指定卡',
  account: ACCT.merchant,
  rounding: 'floor',
  fx_fee_rate: 1.5,
  rules: {
    r1: { id: 'sc', name: '超商限 7-11／全家 5%', account: ACCT.merchant, match: { categories: ['convenience'], merchants: ['7-11', '全家'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.05 }, stacking: { layer: 'bonus' }, limits: {} },
    r2: { id: 'shop', name: '網購限蝦皮／momo 4%', account: ACCT.merchant, match: { channels: ['online'], merchants: ['蝦皮', 'momo'] }, reward: { type: 'cashback', method: 'percentage', rate: 0.04 }, stacking: { layer: 'bonus' }, limits: {} },
    r3: { id: 'mbase', name: '一般 1%', account: ACCT.merchant, match: {}, reward: { type: 'cashback', method: 'percentage', rate: 0.01 }, limits: {} },
  },
};

// The combined database loaded on first visit / via 「綜合範例」.
export const DEMO_DB = { cards: [mobileCard, travelCard, pointsCard, advancedCard, gateCard] };

// Gallery entries (工具列 → 範例). Distilled to「綜合(廣度)+ 各軸一個代表(深度)」:
// 綜合 already contains 通路/上限·類別/海外·點數/首刷·任一/擇優·門檻 — so those need
// no standalone spotlight. The rest spotlight one distinctive mechanic each.
export const SAMPLES = [
  { name: '綜合範例（5 張卡）', hint: '全功能', desc: '通路加碼/月上限、類別+海外+外幣費、點數+首刷禮、任一+擇優、門檻解鎖 — 一次看常用功能。', db: DEMO_DB },
  { name: '取高：自動最高消費類別', hint: 'top', desc: '餐飲/旅遊/超市,系統依當期累積消費自動只給「最高那一類」5% 加碼(CUBE 自選 / Custom Cash 風格);配「分析 → 月度」最有感。', db: { cards: [topCard] } },
  { name: '超額累進 + 前 $X 消費', hint: 'tiers', desc: '百貨「超過 1 萬的部分才 5%」(超額累進),影音「每月前 $1,500 消費享 5%」(消費金額上限)。', db: { cards: [tieredCard] } },
  { name: '多重上限 + 筆數上限', hint: 'caps', desc: '行動支付同時受「單筆 $50」與「每月 $300」兩道上限;超商「每月前 3 筆」享 10%(筆數上限)。', db: { cards: [capCard] } },
  { name: '指定特店', hint: 'merchant', desc: '把範圍從「類別」縮到特定商家:超商限 7-11/全家、網購限蝦皮/momo;示範特店與類別/通路併用。', db: { cards: [merchantCard] } },
];
