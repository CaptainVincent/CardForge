import { describe, it, expect } from 'vitest';
import { simulate, simulateMonth } from '../src/lib/simulate.js';
import { importFromJson } from '../src/lib/importJson.js';
import { exportToJson } from '../src/lib/exportJson.js';
import { recommend } from '../src/lib/recommend.js';
import { nodeIssues } from '../src/lib/validate.js';

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

describe('validate (completeness)', () => {
  const N = (type, data = {}) => ({ id: type, type, data });
  it('擇優/取高 need ≥2 inputs', () => {
    const sel = N('select');
    const edges = [{ source: 'r1', target: 'select' }];
    expect(nodeIssues(sel, edges).some((m) => m.includes('擇優'))).toBe(true);
    const top = N('top');
    expect(nodeIssues(top, [{ source: 'r1', target: 'top' }]).some((m) => m.includes('取高'))).toBe(true);
  });
  it('a percentage reward with no rate is incomplete', () => {
    const r = N('reward', { method: 'percentage' });
    expect(nodeIssues(r, [{ source: 'c', target: 'reward' }]).some((m) => m.includes('回饋率'))).toBe(true);
  });
});
