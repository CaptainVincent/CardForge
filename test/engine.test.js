import { describe, it, expect } from 'vitest';
import { simulate, simulateMonth } from '../src/lib/simulate.js';
import { importFromJson } from '../src/lib/importJson.js';
import { exportToJson } from '../src/lib/exportJson.js';
import { recommend, compareCards, usedPointNames } from '../src/lib/recommend.js';
import { nodeIssues } from '../src/lib/validate.js';
import { lintGraph } from '../src/lib/lint.js';
import { inactiveNodeIds } from '../src/lib/decorate.js';

// Helpers — build a simulate-ready json (rules keyed map, no rounding noise).
const cash = (rate, over = {}) => ({ type: 'cashback', method: 'percentage', rate, ...over });
const rule = (over) => ({ match: {}, reward: cash(0.01), tiers: { mode: 'flat' }, limits: {}, stacking: { layer: 'base' }, ...over });
// Inject id = key for every rule (the engine keys per-rule accumulators by id).
const db = (rules, extra = {}) => ({
  rounding: 'none',
  rules: Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, { id: k, ...v }])),
  ...extra,
});

describe('reward formula', () => {
  it('flat percentage', () => {
    expect(simulate(db({ r: rule({ reward: cash(0.03) }) }), { amount: 1000 }).cashback).toBe(30);
  });

  it('marginal tiers (rate on the portion above each threshold)', () => {
    const j = db({ r: rule({ reward: cash(0), tiers: { mode: 'marginal', bands: [{ min_amount: 0, rate: 0.01 }, { min_amount: 10000, rate: 0.05 }] } }) });
    expect(simulate(j, { amount: 8000 }).cashback).toBe(80);
    expect(simulate(j, { amount: 15000 }).cashback).toBe(350); // 10000*1% + 5000*5%
  });

  it('spend tiers (single rate by cumulative spend)', () => {
    const j = db({ r: rule({ reward: cash(0.01), tiers: { mode: 'spend', bands: [{ min_amount: 0, rate: 0.01 }, { min_amount: 10000, rate: 0.05 }] } }) });
    expect(simulate(j, { amount: 15000, periodSpend: 15000 }).cashback).toBe(750);
  });

  it('fixed amount', () => {
    expect(simulate(db({ r: rule({ reward: { type: 'cashback', method: 'fixed', fixed_amount: 100 } }) }), { amount: 9999 }).cashback).toBe(100);
  });

  it('per-dollar points (floored)', () => {
    const res = simulate(db({ r: rule({ reward: { type: 'points', method: 'per_dollar', per_dollar: 30, points_per_unit: 1, point_name: '哩' } }) }), { amount: 1000 });
    expect(res.points['哩']).toBe(33); // floor(1000/30)
  });
});

describe('caps (metric × window)', () => {
  it('txn reward cap truncates a single transaction', () => {
    const j = db({ r: rule({ reward: cash(0.05), limits: { caps: [{ metric: 'reward', window: 'txn', max: 50 }] } }) });
    expect(simulate(j, { amount: 2000 }).cashback).toBe(50); // 100 → 50
  });

  it('period reward cap accumulates across txns', () => {
    const j = db({ r: rule({ reward: cash(0.05), limits: { caps: [{ metric: 'reward', window: 'period', max: 300 }] } }) });
    const txns = [{ amount: 3000 }, { amount: 3000 }, { amount: 3000 }]; // 150 each, capped at 300
    expect(simulateMonth(j, txns).totals.cashback).toBe(300);
  });

  it('spend cap = only the first $X of spend earns', () => {
    const j = db({ r: rule({ reward: cash(0.05), limits: { caps: [{ metric: 'spend', window: 'period', max: 1500 }] } }) });
    expect(simulateMonth(j, [{ amount: 3000 }]).totals.cashback).toBe(75); // 1500*5%
  });

  it('count cap = only the first N txns earn', () => {
    const j = db({ r: rule({ match: { categories: ['convenience'] }, reward: cash(0.1), limits: { caps: [{ metric: 'count', window: 'period', max: 2 }] } }) });
    const txns = [0, 1, 2].map(() => ({ amount: 500, categories: ['convenience'] }));
    expect(simulateMonth(j, txns).totals.cashback).toBe(100); // 50 + 50 + 0
  });
});

describe('relational', () => {
  it('擇優 (select_group) keeps only the highest-valued reward', () => {
    const j = db({
      a: rule({ reward: cash(0.02), stacking: { layer: 'base', select_group: 'g' } }),
      b: rule({ reward: cash(0.05), stacking: { layer: 'base', select_group: 'g' } }),
    });
    expect(simulate(j, { amount: 1000 }).cashback).toBe(50); // not 70
  });

  it('取高 (top_group) rewards only the top-K spend categories', () => {
    const mk = (k) => db({
      din: rule({ match: { categories: ['dining'] }, reward: cash(0.05), stacking: { layer: 'bonus', top_group: 't' } }),
      trv: rule({ match: { categories: ['travel'] }, reward: cash(0.05), stacking: { layer: 'bonus', top_group: 't' } }),
    }, { top_groups: { t: { k } } });
    const txns = [{ amount: 1000, categories: ['dining'] }, { amount: 3000, categories: ['travel'] }, { amount: 500, categories: ['dining'] }];
    expect(simulateMonth(mk(1), txns).totals.cashback).toBe(200); // dining(50)+travel(150)+excluded(0)
    expect(simulateMonth(mk(2), txns).totals.cashback).toBe(225); // both active
  });

  it('gate (min_spending) unlocks only once cumulative spend clears the threshold', () => {
    const j = db({ r: rule({ reward: cash(0.04), eligibility: { min_spending: { amount: 3000, currency: 'TWD', period: 'monthly' } } }) });
    const txns = [{ amount: 2000 }, { amount: 2000 }]; // cum 2000 (locked), cum 4000 (unlocked → 80)
    expect(simulateMonth(j, txns).totals.cashback).toBe(80);
  });
});

describe('match axis', () => {
  it('merchant matching (single-valued tx.merchant ∈ rule.merchants)', () => {
    const j = db({ m: rule({ match: { merchants: ['7-11', '全家'] }, reward: cash(0.05) }) });
    expect(simulate(j, { amount: 1000, merchant: '7-11' }).cashback).toBe(50);
    expect(simulate(j, { amount: 1000, merchant: '萊爾富' }).cashback).toBe(0);
  });

  it('exclude (NOT) disqualifies matching txns', () => {
    const j = db({ r: rule({ match: { categories: ['dining'], exclude: { channels: ['online'] } }, reward: cash(0.05) }) });
    expect(simulate(j, { amount: 1000, categories: ['dining'] }).cashback).toBe(50);
    expect(simulate(j, { amount: 1000, categories: ['dining'], channels: ['online'] }).cashback).toBe(0);
  });
});

describe('is_active', () => {
  it('a disabled rule is excluded from simulation', () => {
    expect(simulate(db({ r: rule({ reward: cash(0.05), is_active: false }) }), { amount: 1000 }).cashback).toBe(0);
    expect(simulate(db({ r: rule({ reward: cash(0.05), is_active: true }) }), { amount: 1000 }).cashback).toBe(50);
  });

  it('a disabled rule is not recommended', () => {
    const j = db({ r: rule({ match: { categories: ['dining'] }, reward: cash(0.05), is_active: false }) });
    expect(recommend(j, { amount: 1000 }).best.result.cashback).toBe(0);
  });
});

describe('round-trip (import → export preserves every construct)', () => {
  const ACC = 'Liabilities:CreditCard:RT';
  const base = (over) => ({ card: 'RT', account: ACC, ...over });
  const source = {
    cards: [{
      card: 'RT', account: ACC, rounding: 'floor', fx_fee_rate: 1.5,
      top_groups: { tg: { k: 1 } },
      rules: {
        marg: base({ id: 'marg', name: 'm', match: { merchants: ['喬山'], channels: ['實體門市'] }, reward: cash(0), tiers: { mode: 'marginal', bands: [{ min_amount: 0, rate: 0.01 }, { min_amount: 10000, rate: 0.05 }] }, limits: { caps: [{ metric: 'reward', window: 'period', max: 300 }] }, stacking: { layer: 'bonus', group: 'rt', top_group: 'tg' }, note: '喬山限實體門市', is_active: false }),
        cnt: base({ id: 'cnt', name: 'c', match: { categories: ['convenience'] }, reward: cash(0.1), tiers: { mode: 'flat' }, limits: { caps: [{ metric: 'count', window: 'period', max: 3 }] }, stacking: { layer: 'bonus', group: 'rt', top_group: 'tg' } }),
      },
    }],
  };

  it('preserves tiers / caps / merchants / top / note / is_active', () => {
    const { nodes, edges } = importFromJson(source);
    const out = exportToJson(nodes, edges);
    const rules = Object.values(out.cards[0].rules);
    const marg = rules.find((r) => r.tiers?.mode === 'marginal');
    expect(marg).toBeTruthy();
    expect(marg.match.merchants).toEqual(['喬山']);
    expect(marg.match.channels).toEqual(['實體門市']);
    expect(marg.note).toBe('喬山限實體門市');
    expect(marg.is_active).toBe(false);
    expect(rules.some((r) => r.limits?.caps?.some((c) => c.metric === 'count'))).toBe(true);
    expect(Object.keys(out.cards[0].top_groups)).toHaveLength(1);
  });

  it('pooled caps share one pool id across member rules', () => {
    const src = { cards: [{ card: 'P', account: 'Liabilities:CreditCard:P', rounding: 'floor', fx_fee_rate: 1.5,
      rules: {
        a: { id: 'a', name: 'a', card: 'P', account: 'Liabilities:CreditCard:P', match: { channels: ['mobile_pay'] }, reward: cash(0.05), tiers: { mode: 'flat' }, limits: { caps: [{ metric: 'reward', window: 'period', max: 300, pool: 'pp' }] }, stacking: { layer: 'bonus', group: 'p' } },
        b: { id: 'b', name: 'b', card: 'P', account: 'Liabilities:CreditCard:P', match: { channels: ['contactless'] }, reward: cash(0.05), tiers: { mode: 'flat' }, limits: { caps: [{ metric: 'reward', window: 'period', max: 300, pool: 'pp' }] }, stacking: { layer: 'bonus', group: 'p' } },
      },
      limit_pools: { pp: { period: { cycle: 'monthly' }, members: ['a', 'b'] } } }] };
    const { nodes, edges } = importFromJson(src);
    const rules = Object.values(exportToJson(nodes, edges).cards[0].rules);
    const pools = rules.map((r) => r.limits.caps[0].pool);
    expect(pools[0]).toBeTruthy();
    expect(pools[0]).toBe(pools[1]); // both members reference the same shared accumulator
  });

  it('re-export is stable (construct fingerprint unchanged)', () => {
    const fp = (out) => {
      const rs = Object.values(out.cards[0].rules);
      return {
        n: rs.length,
        marginal: rs.filter((r) => r.tiers?.mode === 'marginal').length,
        count: rs.filter((r) => r.limits?.caps?.some((c) => c.metric === 'count')).length,
        tops: Object.keys(out.cards[0].top_groups || {}).length,
      };
    };
    const g1 = importFromJson(source); const o1 = exportToJson(g1.nodes, g1.edges);
    const g2 = importFromJson(o1); const o2 = exportToJson(g2.nodes, g2.edges);
    expect(fp(o2)).toEqual(fp(o1));
  });
});

describe('select 自選方案 (pick mode)', () => {
  const src = {
    cards: [{
      card: 'P', account: 'L:CC:P', rounding: 'none', fx_fee_rate: 1.5,
      select_groups: { g: { mode: 'pick' } },
      rules: {
        a: { id: 'a', name: '1%', card: 'P', account: 'L:CC:P', match: {}, reward: cash(0.01), tiers: { mode: 'flat' }, limits: {}, is_active: false, stacking: { layer: 'base', group: 'p', select_group: 'g' } },
        b: { id: 'b', name: '3%', card: 'P', account: 'L:CC:P', match: {}, reward: cash(0.03), tiers: { mode: 'flat' }, limits: {}, is_active: true, stacking: { layer: 'base', group: 'p', select_group: 'g' } },
      },
    }],
  };
  it('round-trips select_groups.mode and only the adopted member earns', () => {
    const { nodes, edges } = importFromJson(src);
    expect(nodes.find((n) => n.type === 'select')?.data.mode).toBe('pick');
    const out = exportToJson(nodes, edges);
    expect(Object.values(out.cards[0].select_groups)[0].mode).toBe('pick');
    // b (3%) is adopted, a (1%) disabled → 30, not 10/40
    expect(simulate(out.cards[0], { amount: 1000 }).cashback).toBe(30);
  });
});

describe('eligibility flags (資格:新戶/登錄)', () => {
  const j = db(
    { promo: rule({ reward: cash(0.2), eligibility: { flags: ['新戶'] } }) },
    { eligibility_flags: { 新戶: { default: false } } }
  );

  it('default-false flag: skipped until the scenario opts in', () => {
    expect(simulate(j, { amount: 1000 }).cashback).toBe(0);
    expect(simulate(j, { amount: 1000 }).skipped[0].reason).toContain('新戶');
  });

  it('qualifies when the scenario flag is true', () => {
    expect(simulate(j, { amount: 1000, flags: { 新戶: true } }).cashback).toBe(200);
  });

  it('default-true flag fires without an explicit scenario', () => {
    const j2 = db({ r: rule({ reward: cash(0.05), eligibility: { flags: ['會員'] } }) }, { eligibility_flags: { 會員: { default: true } } });
    expect(simulate(j2, { amount: 1000 }).cashback).toBe(50);
  });

  it('simulateMonth honors per-txn flags', () => {
    const res = simulateMonth(j, [{ amount: 1000 }, { amount: 1000, flags: { 新戶: true } }]);
    expect(res.totals.cashback).toBe(200); // only the qualified transaction earns
  });

  it('round-trips through import/export, shared by name, controlling many rewards', () => {
    const src = { cards: [{
      card: 'E', account: 'Liabilities:CreditCard:E', rounding: 'none', fx_fee_rate: 1.5,
      eligibility_flags: { 新戶: { default: false } },
      rules: {
        a: { id: 'a', name: 'a', card: 'E', account: 'Liabilities:CreditCard:E', match: { channels: ['mobile_pay'] }, reward: cash(0.2), tiers: { mode: 'flat' }, limits: {}, eligibility: { flags: ['新戶'] }, stacking: { layer: 'bonus', group: 'e' } },
        b: { id: 'b', name: 'b', card: 'E', account: 'Liabilities:CreditCard:E', match: { channels: ['contactless'] }, reward: cash(0.1), tiers: { mode: 'flat' }, limits: {}, eligibility: { flags: ['新戶'] }, stacking: { layer: 'bonus', group: 'e' } },
      },
    }] };
    const { nodes, edges } = importFromJson(src);
    // one shared 資格 node controls both rewards (fan-out)
    const elig = nodes.filter((n) => n.type === 'eligibility');
    expect(elig).toHaveLength(1);
    expect(edges.filter((e) => e.source === elig[0].id)).toHaveLength(2);
    const out = exportToJson(nodes, edges).cards[0];
    expect(out.eligibility_flags['新戶'].default).toBe(false);
    expect(Object.values(out.rules).every((r) => r.eligibility?.flags?.includes('新戶'))).toBe(true);
    // both rules gated off by default; both unlock together when the flag is set
    expect(simulate(out, { amount: 1000, channels: ['mobile_pay'] }).cashback).toBe(0);
    expect(simulate(out, { amount: 1000, channels: ['mobile_pay'], flags: { 新戶: true } }).cashback).toBe(200);
  });

  it('migrates legacy requires_activation → 已登錄 flag (default 未選 → 待使用者選)', () => {
    const src = { cards: [{
      card: 'A', account: 'Liabilities:CreditCard:A', rounding: 'none', fx_fee_rate: 1.5,
      rules: { r: { id: 'r', name: 'r', card: 'A', account: 'Liabilities:CreditCard:A', match: {}, reward: cash(0.03), tiers: { mode: 'flat' }, limits: {}, eligibility: {}, requires_activation: true, stacking: { layer: 'bonus', group: 'a' } } },
    }] };
    const { nodes, edges } = importFromJson(src);
    expect(nodes.find((n) => n.type === 'eligibility')?.data.default).toBeUndefined(); // 未寫 default → 未選
    const out = exportToJson(nodes, edges).cards[0];
    const r0 = Object.values(out.rules)[0];
    expect(r0.eligibility.flags).toContain('已登錄');
    expect(out.eligibility_flags['已登錄'].default).toBeUndefined(); // 匯出省略(未選)
    expect('requires_activation' in r0).toBe(false); // field retired
    expect(simulate(out, { amount: 1000 }).cashback).toBe(0); // 未選 → 引擎當未符合 → skipped
    expect(simulate(out, { amount: 1000, flags: { 已登錄: true } }).cashback).toBe(30); // toggle on
  });

  it('round-trips an UNSET default/mode as unset (no coercion to false/best)', () => {
    const src = { cards: [{
      card: 'U', account: 'L:CC:U', rounding: 'none', fx_fee_rate: 1.5,
      eligibility_flags: { 新戶: {} }, // 未選
      select_groups: { g: {} },         // 未選
      rules: {
        a: { id: 'a', name: 'a', card: 'U', account: 'L:CC:U', match: { channels: ['x'] }, reward: cash(0.02), tiers: { mode: 'flat' }, limits: {}, eligibility: { flags: ['新戶'] }, stacking: { layer: 'base', select_group: 'g' } },
        b: { id: 'b', name: 'b', card: 'U', account: 'L:CC:U', match: { channels: ['y'] }, reward: cash(0.01), tiers: { mode: 'flat' }, limits: {}, stacking: { layer: 'base', select_group: 'g' } },
      },
    }] };
    const { nodes, edges } = importFromJson(src);
    expect(nodes.find((n) => n.type === 'eligibility').data.default).toBeUndefined();
    expect(nodes.find((n) => n.type === 'select').data.mode).toBeUndefined();
    const out = exportToJson(nodes, edges).cards[0];
    expect(out.eligibility_flags['新戶'].default).toBeUndefined();
    expect(Object.values(out.select_groups)[0].mode).toBeUndefined();
  });
});

describe('rounding modes', () => {
  const j = (mode) => ({ rounding: mode, rules: { r: { id: 'r', match: {}, reward: cash(0.001), tiers: { mode: 'flat' }, limits: {}, stacking: { layer: 'base' } } } });
  const cb = (mode) => simulate(j(mode), { amount: 1500 }).cashback; // 1500 × 0.1% = 1.5
  it('none keeps the exact fractional value (previously floored by mistake)', () => {
    expect(cb('none')).toBe(1.5);
  });
  it('floor / round / ceil behave as named', () => {
    expect(cb('floor')).toBe(1);
    expect(cb('round')).toBe(2);
    expect(cb('ceil')).toBe(2);
  });
});

describe('擇優 values cash vs points via rates', () => {
  const j = db(
    {
      cashR: rule({ reward: cash(0.01), stacking: { layer: 'base', select_group: 'g' } }),
      ptsR: rule({ reward: { type: 'points', method: 'per_dollar', per_dollar: 1, points_per_unit: 1, point_name: 'X' }, stacking: { layer: 'base', select_group: 'g' } }),
    },
    { select_groups: { g: { mode: 'best' } } }
  );
  it('picks cash when the point rate makes points worth less', () => {
    const r = simulate(j, { amount: 1000 }, { X: 0.005 }); // 1000pt×0.005=5 < cash 10
    expect(r.cashback).toBe(10);
    expect(r.points.X).toBeUndefined();
  });
  it('picks points when the rate makes them worth more', () => {
    const r = simulate(j, { amount: 1000 }, { X: 0.02 }); // 1000pt×0.02=20 > cash 10
    expect(r.points.X).toBe(1000);
    expect(r.cashback).toBe(0);
  });
});

describe('compareCards / usedPointNames / multi-card round-trip', () => {
  const cardOf = (name, rate) => ({ card: name, rounding: 'none', rules: { r: { id: 'r', card: name, account: `L:CC:${name}`, match: {}, reward: cash(rate), tiers: { mode: 'flat' }, limits: {}, stacking: { layer: 'base' } } } });

  it('compareCards ranks by best net reward', () => {
    const rows = compareCards([cardOf('A', 0.01), cardOf('B', 0.05)], { amount: 1000 }, {});
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
    expect(rows[0].net).toBe(50);
  });

  it('usedPointNames collects distinct point names', () => {
    const c = { card: 'P', rules: { r: { reward: { type: 'points', point_name: '哩' } }, s: { reward: { type: 'points', point_name: '哩' } } } };
    expect(usedPointNames([c])).toEqual(['哩']);
  });

  it('round-trips a 2-card database (both cards, unique node ids)', () => {
    const src = { cards: [cardOf('A', 0.01), cardOf('B', 0.05)] };
    const { nodes, edges } = importFromJson(src);
    expect(nodes.filter((n) => n.type === 'card')).toHaveLength(2);
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length); // no id collisions across cards
    const out = exportToJson(nodes, edges);
    expect(out.cards.map((c) => c.card).sort()).toEqual(['A', 'B']);
  });
});

describe('recommend (reverse-derive best payment)', () => {
  it('suggests the bonus channel over the base rate', () => {
    const j = db({
      base: rule({ reward: cash(0.01) }),
      pay: rule({ match: { channels: ['mobile_pay'] }, reward: cash(0.05), stacking: { layer: 'bonus' } }),
    });
    const best = recommend(j, { amount: 1000 }, {}).best;
    expect(best.how.join(' ')).toMatch(/mobile_pay|行動支付|Pay/i);
    expect(best.result.cashback).toBe(60); // base 10 + bonus 50 stack
  });
});

describe('multi-period engine (Freedom Flex: 輪動 5% + 每季 $1,500 + 需登錄)', () => {
  const j = db({
    base:  rule({ reward: cash(0.01) }), // 1% 全站,每期都在
    rotQ1: rule({ match: { categories: ['groceries'] }, reward: cash(0.05), eligibility: { flags: ['已登錄'] }, limits: { caps: [{ metric: 'spend', window: 'period', max: 1500 }] }, period: { cycle: 'quarterly', start: '2026-01-01', end: '2026-03-31' }, stacking: { layer: 'bonus' } }),
    rotQ2: rule({ match: { categories: ['gas'] }, reward: cash(0.05), eligibility: { flags: ['已登錄'] }, limits: { caps: [{ metric: 'spend', window: 'period', max: 1500 }] }, period: { cycle: 'quarterly', start: '2026-04-01', end: '2026-06-30' }, stacking: { layer: 'bonus' } }),
  }, { eligibility_flags: { 已登錄: { default: false } } });

  const txns = (flag) => [
    { date: '2026-01-15', amount: 1000, categories: ['groceries'], flags: { 已登錄: flag } },
    { date: '2026-02-15', amount: 1000, categories: ['groceries'], flags: { 已登錄: flag } },
    { date: '2026-04-20', amount: 1000, categories: ['groceries'], flags: { 已登錄: flag } },
    { date: '2026-04-25', amount: 1000, categories: ['gas'], flags: { 已登錄: flag } },
  ];

  it('登錄後:輪動依日期生效、每季 $1,500 上限各自重置', () => {
    const r = simulateMonth(j, txns(true));
    expect(r.perTxn[0].cashback).toBe(60); // Q1 雜貨 5%×1000 + base 1%×1000
    expect(r.perTxn[1].cashback).toBe(35); // Q1 雜貨達季上限:5%×剩500 + base 10
    expect(r.perTxn[2].cashback).toBe(10); // 4月雜貨:rotQ1 過檔期 → 只剩 base(日期生效)
    expect(r.perTxn[3].cashback).toBe(60); // Q2 加油:全新季度 $1,500 額度 → 5%×1000 + base(重置)
    expect(r.totals.cashback).toBe(165);
  });

  it('未登錄:輪動全不生效,全年只有 base 1%', () => {
    expect(simulateMonth(j, txns(false)).totals.cashback).toBe(40); // 4 × 1%×1000
  });

  it('無日期 = 維持單期行為(向後相容)', () => {
    // 同樣交易但不帶日期 → 不分季、cap 共用一桶:Q1+Q2 雜貨/加油都算同一期
    const undated = [
      { amount: 1000, categories: ['groceries'], flags: { 已登錄: true } },
      { amount: 1000, categories: ['gas'], flags: { 已登錄: true } },
    ];
    // 兩條輪動規則都有 period.start/end,但無日期 → inEffect 一律 true → 都可命中
    const r = simulateMonth(j, undated);
    // grocery: base10 + rotQ1 50 = 60;gas: base10 + rotQ2 50 = 60
    expect(r.totals.cashback).toBe(120);
  });
});

describe('billing_cycle (依結帳日切期)', () => {
  const mk = (extra) => db({ r: rule({ reward: cash(0.1), limits: { caps: [{ metric: 'reward', window: 'period', max: 50 }] }, period: { cycle: 'billing_cycle' } }) }, extra);
  const txns = [{ date: '2026-03-03', amount: 1000 }, { date: '2026-03-20', amount: 1000 }];
  it('結帳日 5:跨結帳日的兩筆落在不同帳單期,上限各自重置', () => {
    // 03-03 ≤ 5 → 3月帳單;03-20 > 5 → 4月帳單 → 各自 cap 50 → 共 100
    expect(simulateMonth(mk({ statement_day: 5 }), txns).totals.cashback).toBe(100);
  });
  it('未設結帳日:billing_cycle 退回月 → 同月共用一桶,第二筆封頂', () => {
    expect(simulateMonth(mk({}), txns).totals.cashback).toBe(50); // 50 + 0
  });
});

describe('SUB 首刷禮(開卡後 N 天 + 窗內累計門檻)', () => {
  const j = db({
    sub: rule({ reward: { type: 'cashback', method: 'fixed', fixed_amount: 200 }, eligibility: { min_spending: { amount: 4000, period: 'total' } }, period: { from_opening_days: 90 }, settlement: 'once' }),
  }, { opened: '2026-01-10' });

  it('窗內累計達標 → 發一次固定獎勵;窗外消費不算', () => {
    const r = simulateMonth(j, [
      { date: '2026-01-15', amount: 2000 }, // 窗內累計 2000
      { date: '2026-02-15', amount: 2500 }, // 窗內累計 4500 ≥ 4000 → 觸發
      { date: '2026-03-15', amount: 1000 }, // 已領,不重複
      { date: '2026-05-15', amount: 9000 }, // 開卡 90 天後(>04-10)→ 窗外,不算
    ]);
    expect(r.oneTime).toHaveLength(1);
    expect(r.oneTime[0].value).toBe(200);
    expect(r.oneTime[0].claimedAtTxn).toBe(1); // 第 2 筆(Feb)達標
    expect(r.totals.cashback).toBe(0); // SUB 走 oneTime,不計入每筆
  });

  it('窗內累計未達標 → 不發', () => {
    const r = simulateMonth(j, [
      { date: '2026-02-01', amount: 1000 },
      { date: '2026-05-15', amount: 9000 }, // 窗外
    ]);
    expect(r.oneTime).toHaveLength(0);
  });
});

describe('MCC 一級配對(單碼 + 範圍)', () => {
  const j = db({ r: rule({ match: { mcc: ['5812', '5811-5814'] }, reward: cash(0.05) }) });
  it('命中單碼 / 範圍 / 數字;未命中或未提供則不算', () => {
    expect(simulate(j, { amount: 1000, mcc: '5812' }).cashback).toBe(50);
    expect(simulate(j, { amount: 1000, mcc: 5813 }).cashback).toBe(50); // 範圍 + 數字型
    expect(simulate(j, { amount: 1000, mcc: '5999' }).cashback).toBe(0);
    expect(simulate(j, { amount: 1000 }).cashback).toBe(0);
  });
  it('round-trips match.mcc', () => {
    const src = { cards: [{ card: 'M', account: 'L:CC:M', rounding: 'none', fx_fee_rate: 1.5, rules: { r: { id: 'r', card: 'M', account: 'L:CC:M', match: { mcc: ['5812', '5811-5814'] }, reward: cash(0.05), tiers: { mode: 'flat' }, limits: {}, stacking: { layer: 'base' } } } }] };
    const { nodes, edges } = importFromJson(src);
    expect(Object.values(exportToJson(nodes, edges).cards[0].rules)[0].match.mcc).toEqual(['5812', '5811-5814']);
  });
});

describe('inactiveNodeIds (統一「無用路徑」)', () => {
  const nodes = [
    { id: 'c', type: 'card', data: {} },
    { id: 'rOff', type: 'reward', data: { isActive: false } },
    { id: 'limOff', type: 'limit', data: {} },
    { id: 'eNo', type: 'eligibility', data: { name: '新戶', default: false } },
    { id: 'rGated', type: 'reward', data: {} },
    { id: 'limGated', type: 'limit', data: {} },
    { id: 'eYes', type: 'eligibility', data: { name: '會員', default: true } },
    { id: 'rOk', type: 'reward', data: {} },
    { id: 'rA', type: 'reward', data: {} },
    { id: 'rB', type: 'reward', data: { isActive: false } },
    { id: 'sel', type: 'select', data: {} },
  ];
  const e = (s, t) => ({ id: `${s}-${t}`, source: s, target: t });
  const edges = [e('c', 'rOff'), e('rOff', 'limOff'), e('c', 'eNo'), e('eNo', 'rGated'), e('rGated', 'limGated'), e('c', 'eYes'), e('eYes', 'rOk'), e('c', 'rA'), e('c', 'rB'), e('rA', 'sel'), e('rB', 'sel')];
  it('停用 + 資格未符合 的下游皆無用;啟用/符合/混合餵入的擇一 保持有效', () => {
    const ids = inactiveNodeIds(nodes, edges);
    expect([...ids].sort()).toEqual(['limGated', 'limOff', 'rB', 'rGated', 'rOff'].sort());
    for (const id of ['rOk', 'rA', 'sel', 'eNo', 'eYes', 'c']) expect(ids.has(id)).toBe(false);
  });
});

describe('validate (completeness)', () => {
  const N = (type, data = {}) => ({ id: type, type, data });
  it('擇一/取高 need ≥2 inputs', () => {
    const sel = N('select');
    const edges = [{ source: 'r1', target: 'select' }];
    expect(nodeIssues(sel, edges).some((i) => i.message.includes('擇一'))).toBe(true);
    const top = N('top');
    expect(nodeIssues(top, [{ source: 'r1', target: 'top' }]).some((i) => i.message.includes('取高'))).toBe(true);
  });
  it('擇一 with ≥2 inputs but no 選法 chosen warns (tri-state)', () => {
    const sel = N('select'); // mode unset
    const edges = [{ source: 'r1', target: 'select' }, { source: 'r2', target: 'select' }];
    expect(nodeIssues(sel, edges).some((i) => i.message.includes('選法'))).toBe(true);
    expect(nodeIssues(N('select', { mode: 'best' }), edges)).toEqual([]); // chosen → clean
  });
  it('a percentage reward with no rate is incomplete', () => {
    const r = N('reward', { method: 'percentage' });
    expect(nodeIssues(r, [{ source: 'c', target: 'reward' }]).some((i) => i.message.includes('回饋率'))).toBe(true);
  });
  it('gate needs a source and a threshold', () => {
    const g = N('gate');
    const msgs = nodeIssues(g, []);
    expect(msgs.some((i) => i.message.includes('來源'))).toBe(true);
    expect(msgs.some((i) => i.message.includes('門檻'))).toBe(true);
  });
  it('eligibility needs a name, a chosen default, and a controlled reward', () => {
    const e = N('eligibility'); // no name, no default, no downstream
    const msgs = nodeIssues(e, [{ source: 'c', target: 'eligibility' }]);
    expect(msgs.some((i) => i.message.includes('命名'))).toBe(true);
    expect(msgs.some((i) => i.message.includes('預設狀態'))).toBe(true); // 尚未選符合/未符合
    expect(msgs.some((i) => i.message.includes('回饋'))).toBe(true);
    // named + default chosen + controlling a reward → clean
    const ok = N('eligibility', { name: '新戶', default: false });
    expect(nodeIssues(ok, [{ source: 'c', target: 'eligibility' }, { source: 'eligibility', target: 'r1' }])).toEqual([]);
  });
  it('limit needs a source and at least one cap', () => {
    const l = N('limit');
    const msgs = nodeIssues(l, []);
    expect(msgs.some((i) => i.message.includes('回饋'))).toBe(true);
    expect(msgs.some((i) => i.message.includes('上限'))).toBe(true);
  });
  it('flags invalid spend-calc configs (date inversion / tier order / cap ≤ 0)', () => {
    const e = [{ source: 'c', target: 'reward' }];
    expect(nodeIssues(N('reward', { method: 'percentage', rate: 1, startDate: '2026-06-01', endDate: '2026-01-01' }), e).some((i) => i.message.includes('起始日晚於'))).toBe(true);
    expect(nodeIssues(N('reward', { method: 'percentage', tierMode: 'spend', tiers: [{ minSpend: 10000, rate: 5 }, { minSpend: 1000, rate: 3 }] }), e).some((i) => i.message.includes('遞增'))).toBe(true);
    expect(nodeIssues(N('limit', { maxPerPeriod: 0 }), [{ source: 'r', target: 'limit' }]).some((i) => i.message.includes('大於 0'))).toBe(true);
  });
});

describe('lint (graph-level multi-period misconfig)', () => {
  it('warns ON THE CARD when 首刷期限 set but card lacks 持卡開始日', () => {
    const nodes = [{ id: 'c', type: 'card', data: { cardName: 'X' } }, { id: 'r', type: 'reward', data: { method: 'percentage', rate: 1, fromOpeningDays: 90 } }];
    const it = lintGraph(nodes, [{ id: 'e', source: 'c', target: 'r' }]).find((x) => x.message.includes('持卡開始日'));
    expect(it).toBeTruthy();
    expect(it.nodeId).toBe('c'); // 跳到卡片(修正處),不是 reward
    expect(it.relatedIds).toEqual(['r']); // 同時點名引入問題的 reward
  });
  it('warns ON THE CARD when billing_cycle limit but card lacks 帳單結帳日', () => {
    const nodes = [{ id: 'c', type: 'card', data: { cardName: 'X' } }, { id: 'r', type: 'reward', data: { method: 'percentage', rate: 1 } }, { id: 'l', type: 'limit', data: { cycle: 'billing_cycle', maxPerPeriod: 100 } }];
    const edges = [{ id: 'e1', source: 'c', target: 'r' }, { id: 'e2', source: 'r', target: 'l' }];
    const it = lintGraph(nodes, edges).find((x) => x.message.includes('帳單結帳日'));
    expect(it).toBeTruthy();
    expect(it.nodeId).toBe('c'); // 跳到卡片(修正處)
    expect(it.relatedIds).toEqual(['l']); // 同時點名引入問題的上限
  });
});

describe('lint (impossible match → relatedIds on conflicting conditions)', () => {
  it('points at the condition nodes that both require and exclude a value', () => {
    const nodes = [
      { id: 'c', type: 'card', data: { cardName: 'X' } },
      { id: 'k1', type: 'condition', data: { currencies: ['JPY'] } },
      { id: 'k2', type: 'condition', data: { currencies: ['JPY'], negate: true } },
      { id: 'r', type: 'reward', data: { method: 'percentage', rate: 5 } },
    ];
    const edges = [
      { id: 'e1', source: 'c', target: 'k1' },
      { id: 'e2', source: 'k1', target: 'k2' },
      { id: 'e3', source: 'k2', target: 'r' },
    ];
    const it = lintGraph(nodes, edges).find((x) => x.id.startsWith('imposs-') && x.message.includes('永不命中'));
    expect(it).toBeTruthy();
    expect(it.nodeId).toBeUndefined(); // 無單一修正點 — 靠 relatedIds 定位
    expect(new Set(it.relatedIds)).toEqual(new Set(['k1', 'k2']));
  });
});

describe('時段條件(卡友日:星期/每月某號,由交易日期推算)', () => {
  it('週五規則只在週五命中(tx.date 推算星期;或顯式 dayOfWeek)', () => {
    const fri = db({ r: rule({ match: { day_of_week: ['fri'] }, reward: cash(0.05) }) });
    expect(simulate(fri, { amount: 1000, date: '2026-06-19' }).cashback).toBe(50); // 週五
    expect(simulate(fri, { amount: 1000, date: '2026-06-21' }).cashback).toBe(0);  // 週日
    expect(simulate(fri, { amount: 1000, dayOfWeek: 'fri' }).cashback).toBe(50);   // 顯式情境
    expect(simulate(fri, { amount: 1000 }).cashback).toBe(0);                       // 無日期/星期 → 不命中
  });
  it('每月某號(day_of_month)由日期推算', () => {
    const dom = db({ r: rule({ match: { day_of_month: [1, 20] }, reward: cash(0.05) }) });
    expect(simulate(dom, { amount: 1000, date: '2026-06-01' }).cashback).toBe(50);
    expect(simulate(dom, { amount: 1000, date: '2026-06-20' }).cashback).toBe(50);
    expect(simulate(dom, { amount: 1000, date: '2026-06-15' }).cashback).toBe(0);
  });
});

describe('品牌數級距(踩點 distinct_count;情境給家數,取最高符合檔)', () => {
  const j = db({ r: rule({ reward: cash(0), tiers: { mode: 'distinct_count', bands: [
    { min_count: 2, rate: 0.01 }, { min_count: 3, rate: 0.02 }, { min_count: 5, rate: 0.04 },
  ] } }) });
  it('依 tx.distinctCount 取對應檔位費率', () => {
    expect(simulate(j, { amount: 1000, distinctCount: 1 }).cashback).toBe(0);  // 不足 2 家 → 無加碼
    expect(simulate(j, { amount: 1000, distinctCount: 2 }).cashback).toBe(10); // +1%
    expect(simulate(j, { amount: 1000, distinctCount: 4 }).cashback).toBe(20); // 取 3 家檔 +2%
    expect(simulate(j, { amount: 1000, distinctCount: 6 }).cashback).toBe(40); // 取 5 家檔 +4%
    expect(simulate(j, { amount: 1000 }).cashback).toBe(0);                     // 未給家數 → 無加碼
  });
});

describe('擇一·自選 over 一次性首刷禮(互斥身分:新戶/既有戶)', () => {
  const sub = (id, amt, active) => rule({
    reward: { type: 'cashback', method: 'fixed', fixed_amount: amt },
    settlement: 'once', is_active: active,
    stacking: { layer: 'bonus', group: 'a', select_group: 'sub' },
  });
  it('只認列 is_active 的那一張(恰好一張),無新引擎特例', () => {
    const j = db({ a: sub('a', 500, true), b: sub('b', 100, false) }, { select_groups: { sub: { mode: 'pick' } } });
    const r = simulateMonth(j, [{ amount: 1000 }]);
    expect(r.oneTime.map((o) => o.value)).toEqual([500]); // 既有 is_active+once 處理 → 互斥
  });
  it('皆未選(both is_active:false)→ 不認列任何一張(預設不灌水)', () => {
    const j = db({ a: sub('a', 500, false), b: sub('b', 100, false) }, { select_groups: { sub: { mode: 'pick' } } });
    expect(simulateMonth(j, [{ amount: 1000 }]).oneTime).toEqual([]);
  });
});
