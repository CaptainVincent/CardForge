/**
 * Convert React Flow nodes + edges → CardForge-compatible JSON.
 *
 * Topology model (matches the free-form editor):
 *  - A reward is gated by the chain of conditions on each path from the card.
 *    Conditions in SERIES (cond→cond→…→reward) are merged with AND.
 *  - Multiple independent paths into one reward = separate rules (OR).
 *  - When several rewards feed the SAME limit node (PARALLEL / fan-in), that
 *    cap is POOLED: emitted once under `limit_pools` and referenced by each
 *    member rule via `limits.pool`.
 */

import { incomingMap, outgoingMap, forwardReachable, ancestorsByType } from './graph.js';
import { MATCH_LIST_FIELDS } from './matchFields.js';

const slug = (s) => (s || '').toLowerCase().replace(/\s+/g, '-');

// Constraint-family ancestor scans (see exportCard): collect vs pass-through.
const GATE_COLLECT = new Set(['gate']);
const GATE_THROUGH = new Set(['condition', 'any']);
const ELIG_COLLECT = new Set(['eligibility']);
const ELIG_THROUGH = new Set(['condition', 'any', 'gate']);

// Export ONE card (the cardNode) and its downstream rule subtree.
export function exportCard(cardNode, nodes, edges) {
  if (!cardNode) return null;
  const cardId = cardNode.id;
  const cardName = cardNode.data.cardName || 'Unnamed Card';
  const account = cardNode.data.account || '';
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inMap = incomingMap(edges);
  const outMap = outgoingMap(edges);
  const incoming = (id) => (inMap.get(id) || []).map((e) => byId.get(e.source)).filter(Boolean);
  const outgoing = (id) => (outMap.get(id) || []).map((e) => byId.get(e.target)).filter(Boolean);

  // Nodes reachable downstream of this card — its own rule subtree.
  const scope = forwardReachable([cardId], edges, outMap);

  // All condition-chains gating a node, walking backwards through condition/card
  // predecessors. Only paths reaching THIS card count. Returns AND-groups.
  function chainsInto(node, seen = new Set()) {
    if (seen.has(node.id)) return []; // guard against cycles
    seen.add(node.id);
    const preds = incoming(node.id);
    if (preds.length === 0) return node.type === 'reward' ? [] : [[]];
    const out = [];
    let constraintToCard = false; // a gate/資格 routes to the card with no conditions of its own
    for (const p of preds) {
      if (p.type === 'card') {
        if (p.id === cardId) out.push([]); // only this card's paths
      } else if (p.type === 'condition') {
        const sub = chainsInto(p, new Set(seen));
        const base = sub.length ? sub : [[]];
        for (const s of base) out.push([...s, p]);
      } else if (p.type === 'any') {
        // 任一 = OR 閘。新模型(無內部 alternatives):它的「替代」是連入它的條件鏈,
        // 留待 mergeConditions 從圖解析,不折進這條 AND 鏈 → 只放 [p] 當標記。
        // 舊模型(data.alternatives):仍把它當鏈上節點(沿用其 include 前綴)以相容。
        if (p.data?.alternatives?.length) {
          const sub = chainsInto(p, new Set(seen));
          const base = sub.length ? sub : [[]];
          for (const s of base) out.push([...s, p]);
        } else {
          out.push([p]);
        }
      } else if (p.type === 'gate' || p.type === 'eligibility') {
        // gate / 資格 are CONSTRAINTS (AND), not alternative paths (OR). Pass
        // through ONLY the condition chains routed through them in series; a bare
        // empty pass-through (e.g. a shared 資格 rooted at the card and fanning
        // out to a reward that already has its own conditions) must NOT add a
        // spurious unconditional rule. Collect them separately via ancestor*().
        const sub = chainsInto(p, new Set(seen));
        for (const s of sub) { if (s.length) out.push([...s]); else constraintToCard = true; }
      } else {
        out.push([]); // reward/limit feeding back in — no condition contribution
      }
    }
    // Reachable only through a constraint-to-card (no conditions anywhere) → one
    // unconditional rule; the gate/資格 itself is applied as a constraint.
    if (out.length === 0 && constraintToCard) out.push([]);
    return out;
  }

  // 約束家族的祖先掃描:gate / 資格 都是「掛在路徑上的約束」,只差收集型別與
  // 可穿越型別。共用 graph.ancestorsByType,不再各刻一份遞迴。
  //  - 門檻(gate):收集 gate,穿越 condition/any。
  //  - 資格(eligibility):收集 eligibility,穿越 condition/any/gate。
  const ancestorGates = (node) => ancestorsByType(node.id, GATE_COLLECT, GATE_THROUGH, byId, inMap);
  const ancestorEligibility = (node) => ancestorsByType(node.id, ELIG_COLLECT, ELIG_THROUGH, byId, inMap);

  // Rewards reachable downstream of a gate (to detect shared/pooled gates).
  const downstreamRewards = (gate) => {
    const found = new Set();
    for (const id of forwardReachable([gate.id], edges, outMap)) if (byId.get(id)?.type === 'reward') found.add(id);
    return found;
  };

  // Merge condition nodes with AND semantics, splitting positive vs negated
  // (NOT) nodes into include / exclude criteria sets. `any` nodes contribute
  // one cross-field OR group each (a CNF clause: at least one alternative must
  // match). Returns { include, exclude, orGroups }.
  function mergeConditions(conds) {
    const blank = () => {
      const o = { isOverseas: null, minAmountTwd: null, custom: [] };
      for (const f of MATCH_LIST_FIELDS) o[f.node] = new Set();
      return o;
    };
    const inc = blank();
    const exc = blank();
    const orGroups = [];
    for (const c of conds) {
      if (c.type === 'any') {
        // 替代來源:舊=內部 data.alternatives;新(閘)=連入此任一的條件鏈各成一個替代。
        const alts = c.data?.alternatives?.length
          ? c.data.alternatives.map(buildMatchFromData).filter((o) => Object.keys(o).length)
          : chainsInto(c).map(altMatch).filter((o) => Object.keys(o).length);
        if (alts.length) orGroups.push(alts);
        continue;
      }
      const d = c.data || {};
      const t = d.negate ? exc : inc;
      if (d.isOverseas != null) t.isOverseas = d.isOverseas;
      for (const f of MATCH_LIST_FIELDS) (d[f.node] || []).forEach((x) => t[f.node].add(x));
      (d.custom || []).forEach((p) => t.custom.push(p));
      if (d.minAmountTwd) t.minAmountTwd = Math.max(t.minAmountTwd || 0, d.minAmountTwd);
    }
    const flat = (s) => {
      const o = { isOverseas: s.isOverseas, minAmountTwd: s.minAmountTwd, custom: s.custom };
      for (const f of MATCH_LIST_FIELDS) o[f.node] = [...s[f.node]];
      return o;
    };
    return { include: flat(inc), exclude: flat(exc), orGroups };
  }

  // 一條「替代鏈」(連入某個任一閘的條件鏈)→ 一個 match 子句(供 or_groups 用)。
  // 與規則主 match 同一套 buildMatch,確保 round-trip 一致。
  function altMatch(chain) {
    const cd = mergeConditions(chain);
    const m = buildMatch(cd.include);
    const ex = buildMatch(cd.exclude);
    if (Object.keys(ex).length) m.exclude = ex;
    if (cd.orGroups.length) m.or_groups = cd.orGroups;
    return m;
  }

  // Normalize a generic predicate's value by operator.
  function normPredValue(op, value) {
    if (op === 'in' || op === 'not_in') return String(value).split(',').map((s) => s.trim()).filter(Boolean);
    if (op === 'gte' || op === 'lte') { const n = Number(value); return Number.isNaN(n) ? value : n; }
    return value;
  }

  // Build a match object (used for both include and the nested exclude).
  function buildMatch(m) {
    const o = {};
    if (m.isOverseas != null) o.is_overseas = m.isOverseas;
    for (const f of MATCH_LIST_FIELDS) if (m[f.node]?.length) o[f.json] = m[f.node];
    if (m.minAmountTwd) o.min_amount_twd = m.minAmountTwd;
    const customs = (m.custom || [])
      .filter((p) => p.field && p.value !== '' && p.value != null)
      .map((p) => ({ field: p.field, op: p.op || 'is', value: normPredValue(p.op || 'is', p.value) }));
    if (customs.length) o.custom = customs;
    return o;
  }

  // Build a match object from raw condition-like node data (an `any` alternative).
  // buildMatch reads node-keyed fields with optional chaining, so raw node data
  // (currencies/channels/… arrays, isOverseas, minAmountTwd, custom) works直接.
  const buildMatchFromData = (d = {}) => buildMatch(d);

  // Short label for one OR-group alternative (for human-readable rule names).
  function subLabel(sub) {
    const p = [];
    if (sub.is_overseas === true) p.push('海外');
    if (sub.is_overseas === false) p.push('國內');
    if (sub.currencies) p.push(sub.currencies.join('/'));
    if (sub.channels) p.push(sub.channels.join('/'));
    if (sub.categories) p.push(sub.categories.join('/'));
    if (sub.merchants) p.push(sub.merchants.join('/'));
    if (sub.payment_methods) p.push(sub.payment_methods.join('/'));
    return p.join('+');
  }

  // A limit node → its caps. metric (reward|spend|count) defaults to reward;
  // window comes from which ceiling is set. New maxPer* fields preferred; legacy
  // maxReward* read for back-compat (old graphs default to reward metric).
  function nodeCaps(d) {
    const metric = d.metric || 'reward';
    const out = [];
    const txn = d.maxPerTxn ?? d.maxRewardPerTxn;
    const per = d.maxPerPeriod ?? d.maxRewardPerPeriod;
    const tot = d.maxTotal ?? d.maxRewardTotal;
    if (txn) out.push({ metric, window: 'txn', max: txn });
    if (per) out.push({ metric, window: 'period', max: per });
    if (tot) out.push({ metric, window: 'total', max: tot });
    return out;
  }

  // Identify pooled limits: a limit node fed by >1 reward.
  const limitFeeders = new Map(); // limitId -> count of reward feeders
  for (const n of nodes) {
    if (n.type !== 'limit') continue;
    const rewardFeeders = incoming(n.id).filter((p) => p.type === 'reward').length;
    limitFeeders.set(n.id, rewardFeeders);
  }
  const limitPools = {};
  const eligibilityPools = {};
  const eligibilityFlags = {}; // flag name → { default } (新戶/登錄…); shared by NAME
  const selectGroups = {}; // select node id → { mode } ('best'=取最高 / 'pick'=自選擇一)

  const rules = {};
  let ruleIndex = 0;

  for (const reward of nodes.filter((n) => n.type === 'reward' && scope.has(n.id))) {
    const chains = chainsInto(reward);
    if (chains.length === 0) continue; // unreachable from the card

    const limitNodes = outgoing(reward.id).filter((n) => n.type === 'limit');
    const selectNode = outgoing(reward.id).find((n) => n.type === 'select');
    if (selectNode && !selectGroups[selectNode.id]) { const md = (selectNode.data || {}).mode; selectGroups[selectNode.id] = md ? { mode: md } : {}; }

    // Each limit node → a set of caps; pooled when fed by >1 reward (shared
    // accumulator). A reward may carry several limit nodes (independent caps).
    const limitInfos = limitNodes.map((ln) => {
      const pool = (limitFeeders.get(ln.id) || 0) > 1 ? `${slug(cardName)}-pool-${ln.id}` : null;
      if (pool && !limitPools[pool]) limitPools[pool] = { period: { cycle: (ln.data || {}).cycle || 'monthly' }, members: [] };
      return { pool, caps: nodeCaps(ln.data || {}) };
    });

    // Eligibility flags (資格:新戶/登錄…) gating this reward — shared by NAME:
    // same name = same flag (one ✓/✗ toggle controls every rule that names it).
    const eligNodes = ancestorEligibility(reward);
    const flagNames = [...new Set(eligNodes.map((e) => (e.data?.name || '').trim()).filter(Boolean))];
    for (const e of eligNodes) {
      const name = (e.data?.name || '').trim();
      if (!name) continue;
      const entry = {};
      if (e.data?.default != null) entry.default = e.data.default === true; // 省略 = 未選
      if (e.data?.cycle && e.data.cycle !== 'once') entry.cycle = e.data.cycle; // 省略 = 一次性
      eligibilityFlags[name] = entry;
    }

    // Unlock gate(s) for this reward; shared gate (→ >1 reward) becomes a pool.
    const gate = ancestorGates(reward)[0];
    let eligPoolId = null;
    if (gate && downstreamRewards(gate).size > 1) {
      eligPoolId = `${slug(cardName)}-elig-${gate.id}`;
      if (!eligibilityPools[eligPoolId]) {
        const gd = gate.data || {};
        eligibilityPools[eligPoolId] = {
          min_spending: { amount: gd.threshold || 0, ...(gd.metric === 'count' ? { metric: 'count' } : { currency: gd.currency || 'TWD' }), period: gd.cycle || 'monthly' },
          members: [],
        };
      }
    }

    for (const chain of chains) {
      const cd = mergeConditions(chain);
      const rd = reward.data || {};
      const ld = limitNodes[0]?.data || {};
      ruleIndex++;
      const id = `${slug(cardName)}-rule-${ruleIndex}`;

      const rule = {
        id,
        name: id,
        card: cardName,
        account,
        account_match: 'exact',
        is_active: rd.isActive !== false,
        period: { cycle: ld.cycle || 'monthly' },
        match: {},
        eligibility: {},
        reward: {
          type: rd.rewardType || 'cashback',
          method: rd.method || 'percentage',
          rate: (rd.method || 'percentage') === 'percentage' ? (rd.rate || 0) / 100 : 0,
        },
        tiers:
          rd.method === 'percentage' && (rd.tierMode === 'spend' || rd.tierMode === 'marginal' || rd.tierMode === 'distinct_count') && rd.tiers?.length
            ? {
                mode: rd.tierMode,
                // distinct_count 的門檻是「計數」→ min_count;金額級距 → min_amount。
                // count_label = 這個計數代表什麼(品牌數/天數/筆數…),純顯示用。
                ...(rd.tierMode === 'distinct_count' && rd.countLabel ? { count_label: rd.countLabel } : {}),
                bands: rd.tiers
                  .filter((t) => t.minSpend != null || t.rate != null)
                  .map((t) => (rd.tierMode === 'distinct_count'
                    ? { min_count: t.minSpend || 0, rate: (t.rate || 0) / 100 }
                    : { min_amount: t.minSpend || 0, rate: (t.rate || 0) / 100 })),
              }
            : { mode: 'flat' },
        limits: {},
        stacking: { layer: rd.layer || 'base', group: slug(cardName), ...(selectNode ? { select_group: selectNode.id } : {}) },
        reward_posting: { account: `Income:CreditCard:Reward:${account.split(':').slice(-2).join(':')}` },
        provenance: { generated_by: 'cardforge' },
      };

      // Match (AND-merged include) + exclude (NOT)
      rule.match = buildMatch(cd.include);
      const exc = buildMatch(cd.exclude);
      if (Object.keys(exc).length) rule.match.exclude = exc;
      if (cd.orGroups?.length) rule.match.or_groups = cd.orGroups;

      // Reward specifics
      if (rd.method === 'fixed') {
        rule.reward.fixed_amount = rd.fixedAmount || 0;
        rule.reward.reward_currency = rd.rewardCurrency || 'TWD';
      }
      if (rd.method === 'per_dollar') {
        rule.reward.per_dollar = rd.perDollar || 0;
        rule.reward.points_per_unit = rd.pointsPerUnit ?? 1;
      }
      // Point identity only — valuation (TWD-per-point) is intentionally NOT
      // exported: it's time-varying and belongs in the consuming ledger
      // (Beancount price db / commodity meta), not in the engine-agnostic rules.
      if (rd.pointName) {
        rule.reward.point_name = rd.pointName;
      }

      // Limits (caps) — one entry per (limit node × set window); pooled caps
      // carry `pool` so a shared accumulator spans member rules.
      const caps = [];
      for (const li of limitInfos) {
        for (const c of li.caps) caps.push(li.pool ? { ...c, pool: li.pool } : c);
        if (li.pool) limitPools[li.pool].members.push(id);
      }
      if (caps.length) rule.limits.caps = caps;

      // Eligibility (unlock gate) — pooled or inline
      if (gate) {
        if (eligPoolId) {
          rule.eligibility.pool = eligPoolId;
          eligibilityPools[eligPoolId].members.push(id);
        } else {
          const gd = gate.data || {};
          rule.eligibility.min_spending = {
            amount: gd.threshold || 0,
            ...(gd.metric === 'count' ? { metric: 'count' } : { currency: gd.currency || 'TWD' }),
            period: gd.cycle || 'monthly',
          };
        }
      }
      if (flagNames.length) rule.eligibility.flags = flagNames;

      // Free-text caveat (engine-agnostic; 細則/備註 the model can't express precisely)
      if (rd.note?.trim()) rule.note = rd.note.trim();

      // One-time settlement (首刷禮 / 里程碑)
      if (rd.settlement === 'once') rule.settlement = 'once';

      // Period dates (promo / rotating). 登錄/註冊活動 is now expressed as a
      // 資格 flag (eligibility node), not the legacy requires_activation field.
      if (rd.startDate) rule.period.start = rd.startDate;
      if (rd.endDate) rule.period.end = rd.endDate;
      if (rd.fromOpeningDays) rule.period.from_opening_days = rd.fromOpeningDays; // 相對開卡日窗(SUB)

      // Human-readable name
      const inc = cd.include;
      const parts = [];
      if (inc.isOverseas === true) parts.push('海外');
      if (inc.isOverseas === false) parts.push('國內');
      if (inc.currencies.length) parts.push(inc.currencies.join('/'));
      if (inc.channels.length) parts.push(inc.channels.join('/'));
      if (inc.categories.length) parts.push(inc.categories.join('/'));
      if (inc.merchants.length) parts.push(inc.merchants.join('/'));
      if (inc.paymentMethods.length) parts.push(inc.paymentMethods.join('/'));
      for (const g of cd.orGroups || []) {
        const lbls = g.map(subLabel).filter(Boolean);
        if (lbls.length) parts.push(`(${lbls.join('或')})`);
      }
      if (parts.length === 0) parts.push('一般消費');
      if (cd.exclude && Object.keys(buildMatch(cd.exclude)).length) {
        const ex = [...cd.exclude.categories, ...cd.exclude.merchants, ...cd.exclude.channels, ...cd.exclude.paymentMethods];
        if (ex.length) parts.push(`排除${ex.join('/')}`);
      }

      const ratePart = rd.method === 'fixed'
        ? `${rd.rewardCurrency || 'TWD'} ${rd.fixedAmount?.toLocaleString() || '?'}`
        : rd.method === 'per_dollar'
          ? `每${rd.perDollar || '?'}元送${rd.pointsPerUnit ?? 1}`
          : `${rd.rate || 0}%`;
      const layerPart = rd.layer === 'bonus' ? '+' : '';
      rule.name = `${cardName} ${parts.join(' · ')} ${layerPart}${ratePart}`;

      rules[id] = rule;
    }
  }

  const result = {
    card: cardName,
    rounding: cardNode.data.rounding || 'floor',
    fx_fee_rate: cardNode.data.fxFeeRate ?? 1.5,
    rules,
    card_profile: {},
    generations: [],
  };
  if (cardNode.data.statementDay) result.statement_day = cardNode.data.statementDay;
  if (cardNode.data.opened) result.opened = cardNode.data.opened;
  if (Object.keys(limitPools).length) result.limit_pools = limitPools;
  if (Object.keys(eligibilityPools).length) result.eligibility_pools = eligibilityPools;
  if (Object.keys(eligibilityFlags).length) result.eligibility_flags = eligibilityFlags;
  if (Object.keys(selectGroups).length) result.select_groups = selectGroups;
  return result;
}

// One exported object per card node on the canvas.
export function exportCards(nodes, edges) {
  return nodes.filter((n) => n.type === 'card').map((c) => exportCard(c, nodes, edges)).filter(Boolean);
}

// Valuation for the point programs actually used by these cards' rules.
// `programs` = settings shape { name: { basis, rate } }. Emits ONE current value
// per program (no time axis — rate history is the bookkeeping ledger's concern):
//   point_programs: { "小樹點": { basis:"fixed", twd_per_point:0.1 } }
function buildPointPrograms(cards, programs) {
  const used = new Set();
  for (const c of cards) {
    for (const r of Object.values(c.rules)) if (r.reward?.point_name) used.add(r.reward.point_name);
  }
  const out = {};
  for (const name of used) {
    const p = programs[name];
    if (p?.rate == null || Number.isNaN(Number(p.rate))) continue; // only export configured programs
    out[name] = { basis: p.basis || 'fixed', twd_per_point: Number(p.rate) };
  }
  return Object.keys(out).length ? out : null;
}

// The whole database: every card's rules under { cards: [...] }, plus the single
// current valuation of any point programs they use (opts.pointPrograms = settings).
export function exportToJson(nodes, edges, opts = {}) {
  const cards = exportCards(nodes, edges);
  if (cards.length === 0) return null;
  const result = { cards };
  const programs = buildPointPrograms(cards, opts.pointPrograms || {});
  if (programs) result.point_programs = programs;
  return result;
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
