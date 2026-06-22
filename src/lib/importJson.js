/**
 * Convert CardForge JSON → React Flow nodes + edges
 */

import { MATCH_LIST_FIELDS } from './matchFields.js';

let _id = 0;
const nextId = () => `node_${++_id}`;

const edge = (source, target) => ({
  id: `e-${source}-${target}`,
  source,
  target,
  type: 'default',
});

// Restore generic predicates: normalized value (array/number) → editable string.
const importCustom = (list) =>
  (list || []).map((p) => ({
    field: p.field || '',
    op: p.op || 'is',
    value: Array.isArray(p.value) ? p.value.join(',') : (p.value == null ? '' : String(p.value)),
  }));

// JSON match object → canvas node data (shared by condition / exclude / 任一
// alternative). List fields driven by MATCH_LIST_FIELDS so the three sites can't
// drift; scalars + custom handled explicitly. `extra` adds e.g. { negate:true }.
const jsonMatchToNodeData = (m = {}, extra = {}) => {
  const d = { isOverseas: m.is_overseas ?? null, minAmountTwd: m.min_amount_twd || null, custom: importCustom(m.custom), ...extra };
  for (const f of MATCH_LIST_FIELDS) d[f.node] = m[f.json] || [];
  return d;
};

// Fingerprint grouping rules with identical match → one shared condition node.
// Same field set as before (min_amount_twd intentionally excluded, preserving
// prior grouping); only compared within a single import run.
const matchFingerprint = (m = {}) => {
  const parts = [];
  if (m.is_overseas === true) parts.push('overseas');
  if (m.is_overseas === false) parts.push('domestic');
  for (const f of MATCH_LIST_FIELDS) if (m[f.json]) parts.push(`${f.json}:${[...m[f.json]].sort().join(',')}`);
  if (m.custom) parts.push('cu:' + JSON.stringify(m.custom));
  if (m.exclude) parts.push('ex:' + JSON.stringify(m.exclude));
  if (m.or_groups) parts.push('or:' + JSON.stringify(m.or_groups));
  return parts.join('|') || '_general';
};

// Build ONE card's subtree into the shared nodes/edges arrays, offset by yBase.
// Returns the bottom Y used so the next card can stack below it.
function importOneCard(json, nodes, edges, yBase) {
  const cardName = json.card || 'Unknown';
  const rules = json.rules || {};
  const ruleList = Object.values(rules);
  const limitPools = json.limit_pools || {};
  const eligPools = json.eligibility_pools || {};
  // Resolve a pooled eligibility (門檻) ref back to its value (round-trip
  // preserves data; the "shared" structure collapses to per-rule nodes).
  const resolveMinSpending = (rule) => {
    const e = rule.eligibility || {};
    return e.pool ? eligPools[e.pool]?.min_spending || null : e.min_spending || null;
  };

  // Card node (always created, even with no rules).
  const cardId = nextId();
  const account = ruleList[0]?.account || '';
  nodes.push({
    id: cardId,
    type: 'card',
    position: { x: 50, y: yBase + 40 },
    data: { cardName, account, rounding: json.rounding || 'floor', fxFeeRate: json.fx_fee_rate ?? 1.5, statementDay: json.statement_day ?? null, opened: json.opened ?? null },
  });
  if (ruleList.length === 0) return yBase + 200;

  // Group rules by match fingerprint to create shared condition nodes.
  const byMatch = {};
  for (const rule of ruleList) {
    const m = rule.match || {};
    const key = matchFingerprint(m);
    if (!byMatch[key]) byMatch[key] = { match: m, rules: [] };
    byMatch[key].rules.push(rule);
  }

  let groupY = yBase + 40;
  const selectGroups = {}; // select_group id → [rewardId, ...]
  const topGroups = {}; // top_group id → [rewardId, ...]
  const topGroupConf = json.top_groups || {}; // top_group id → { k }
  const poolLimitNodes = {}; // limit pool id → shared limit node id
  const flagRegistry = json.eligibility_flags || {}; // flag name → { default }
  const flagNodes = {}; // flag name → shared 資格 node id (one node controls many rewards)

  for (const group of Object.values(byMatch)) {
    const m = group.match;

    // Condition node
    const condId = nextId();
    nodes.push({
      id: condId,
      type: 'condition',
      position: { x: 350, y: groupY },
      data: jsonMatchToNodeData(m),
    });
    edges.push(edge(cardId, condId));

    // Exclusion (NOT) → a negated condition node chained after the include one.
    let condSource = condId;
    if (m.exclude && Object.keys(m.exclude).length) {
      const ex = m.exclude;
      const exId = nextId();
      nodes.push({
        id: exId,
        type: 'condition',
        position: { x: 545, y: groupY },
        data: jsonMatchToNodeData(ex, { negate: true }),
      });
      edges.push(edge(condId, exId));
      condSource = exId;
    }

    // Cross-field OR groups → a chained `任一` node per group.
    (m.or_groups || []).forEach((groupAlts, gi) => {
      const anyId = nextId();
      nodes.push({
        id: anyId,
        type: 'any',
        position: { x: 545 + (gi + 1) * 170, y: groupY },
        data: {
          alternatives: (groupAlts || []).map((sub) => jsonMatchToNodeData(sub)),
        },
      });
      edges.push(edge(condSource, anyId));
      condSource = anyId;
    });

    // Push downstream nodes right to make room for any inserted 任一 nodes.
    const dx = (m.or_groups?.length || 0) * 170;

    let ruleY = groupY;
    for (const rule of group.rules) {
      const r = rule.reward || {};
      const ms = resolveMinSpending(rule);

      // Reward node
      const rewardId = nextId();
      nodes.push({
        id: rewardId,
        type: 'reward',
        position: { x: 760 + dx, y: ruleY },
        data: {
          method: r.method || 'percentage',
          // ×100 reintroduces float error (0.035→3.5000000000000004); round it out.
          rate: r.method === 'percentage' ? parseFloat(((r.rate || 0) * 100).toFixed(6)) : null,
          fixedAmount: r.fixed_amount || null,
          rewardCurrency: r.reward_currency || 'TWD',
          perDollar: r.per_dollar || null,
          pointsPerUnit: r.points_per_unit ?? null,
          tierMode: ['spend', 'marginal', 'distinct_count'].includes(rule.tiers?.mode) ? rule.tiers.mode : 'flat',
          tiers: ['spend', 'marginal', 'distinct_count'].includes(rule.tiers?.mode)
            ? (rule.tiers.bands || []).map((b) => ({
                // minSpend holds the tier threshold (家數 for distinct_count, else 金額).
                minSpend: (rule.tiers.mode === 'distinct_count' ? b.min_count : b.min_amount) || 0,
                rate: parseFloat(((b.rate || 0) * 100).toFixed(6)),
              }))
            : [],
          countLabel: rule.tiers?.count_label || '',
          rewardType: r.type || 'cashback',
          pointName: r.point_name || '',
          layer: rule.stacking?.layer || 'base',
          settlement: rule.settlement === 'once' ? 'once' : 'recurring',
          startDate: rule.period?.start || null,
          endDate: rule.period?.end || null,
          fromOpeningDays: rule.period?.from_opening_days ?? null,
          isActive: rule.is_active !== false,
          note: rule.note || '',
        },
      });

      // Gate node (unlock threshold) sits between the condition and the reward.
      if (ms?.amount) {
        const gateId = nextId();
        nodes.push({
          id: gateId,
          type: 'gate',
          position: { x: 600 + dx, y: ruleY },
          data: {
            metric: ms.metric === 'count' ? 'count' : 'spend',
            threshold: ms.amount || null,
            currency: ms.currency || 'TWD',
            cycle: ms.period && ms.period !== 'promotion' ? ms.period : 'monthly',
          },
        });
        edges.push(edge(condSource, gateId));
        edges.push(edge(gateId, rewardId));
      } else {
        edges.push(edge(condSource, rewardId));
      }

      // Eligibility flags (資格:新戶/登錄…) — one shared node per flag NAME,
      // rooted at the card, fanning out to every reward that requires it.
      // Legacy requires_activation migrates to a 活動登錄 flag. `default` is
      // tri-state: true / false explicitly written, or undefined when the card
      // leaves it for the user to pick (節點顯示未選 + 黃點).
      const flagList = [...(rule.eligibility?.flags || [])];
      if (rule.requires_activation && !flagList.includes('活動登錄')) flagList.push('活動登錄');
      for (const name of flagList) {
        let fid = flagNodes[name];
        if (!fid) {
          fid = nextId();
          const dflt = flagRegistry[name]?.default;
          nodes.push({
            id: fid,
            type: 'eligibility',
            position: { x: 360 + dx, y: yBase + 40 - 110 - Object.keys(flagNodes).length * 80 },
            data: { name, default: dflt === true ? true : dflt === false ? false : undefined },
          });
          flagNodes[name] = fid;
          edges.push(edge(cardId, fid));
        }
        edges.push(edge(fid, rewardId));
      }

      // Limit nodes — from caps[]. Group by pool|metric → one limit node each
      // (pooled nodes shared across rules).
      const ruleCaps = Array.isArray(rule.limits?.caps) ? rule.limits.caps : [];
      const capGroups = {};
      for (const c of ruleCaps) {
        const metric = c.metric || 'reward';
        const key = c.pool ? `pool:${c.pool}` : `inline:${metric}`;
        const g = (capGroups[key] = capGroups[key] || { pool: c.pool || null, metric, windows: {} });
        g.windows[c.window || 'period'] = c.max;
      }
      let li = 0;
      for (const g of Object.values(capGroups)) {
        let limitId = g.pool ? poolLimitNodes[g.pool] : null;
        if (!limitId) {
          limitId = nextId();
          nodes.push({
            id: limitId,
            type: 'limit',
            position: { x: 1080 + dx + li * 40, y: ruleY + li * 12 },
            data: {
              metric: g.metric,
              cycle: (g.pool && limitPools[g.pool]?.period?.cycle) || rule.period?.cycle || 'monthly',
              maxPerTxn: g.windows.txn ?? null,
              maxPerPeriod: g.windows.period ?? null,
              maxTotal: g.windows.total ?? null,
            },
          });
          if (g.pool) poolLimitNodes[g.pool] = limitId;
          li++;
        }
        edges.push(edge(rewardId, limitId));
      }

      // 擇優 group membership (rebuilt into a select node after the loop).
      const sg = rule.stacking?.select_group;
      if (sg) (selectGroups[sg] = selectGroups[sg] || []).push(rewardId);

      // 取高 group membership (rebuilt into a top node after the loop).
      const tg = rule.stacking?.top_group;
      if (tg) (topGroups[tg] = topGroups[tg] || []).push(rewardId);

      ruleY += 200;
    }

    groupY = ruleY + 50;
  }

  // Rebuild one 擇優 (select) node per group; member rewards connect into it.
  // mode: 'best'(取最高,預設) or 'pick'(自選擇一) carried from select_groups.
  const selectGroupConf = json.select_groups || {};
  let selY = yBase + 40;
  for (const [gid, rewardIds] of Object.entries(selectGroups)) {
    const selId = nextId();
    nodes.push({ id: selId, type: 'select', position: { x: 1320, y: selY }, data: { mode: selectGroupConf[gid]?.mode } }); // mode: 'best'/'pick'/undefined(未選)
    for (const rid of rewardIds) edges.push(edge(rid, selId));
    selY += 160;
  }

  // Rebuild one 取高 (top) node per group; K carried from top_groups config.
  let topY = yBase + 40;
  for (const [tgId, rewardIds] of Object.entries(topGroups)) {
    const topId = nextId();
    nodes.push({ id: topId, type: 'top', position: { x: 1500, y: topY }, data: { k: Math.max(1, Number(topGroupConf[tgId]?.k) || 1) } });
    for (const rid of rewardIds) edges.push(edge(rid, topId));
    topY += 160;
  }

  return Math.max(groupY, selY, topY, yBase + 360);
}

// Accepts a single CardForge card ({card, rules}) or a database ({cards:[...]}).
export function importFromJson(json) {
  _id = 0;
  const nodes = [];
  const edges = [];
  // Point-program valuation → ONE current value (no time axis). Accept single
  // { twd_per_point } / { rate }, or legacy dated `prices[]` (take the initial /
  // baseline entry). Rate history over time belongs to the bookkeeping ledger.
  const pointPrograms = {};
  for (const [name, v] of Object.entries(json?.point_programs || {})) {
    let rate = 1;
    if (Array.isArray(v?.prices) && v.prices.length) rate = v.prices[0].twd_per_point ?? 1;
    else if (v?.twd_per_point != null) rate = v.twd_per_point;
    else if (v?.rate != null) rate = v.rate;
    pointPrograms[name] = { basis: v?.basis || 'fixed', rate };
  }
  const list = Array.isArray(json?.cards) ? json.cards : (json?.card || json?.rules ? [json] : []);
  if (list.length === 0) return { nodes: [], edges: [], pointPrograms };

  let yBase = 0;
  for (const card of list) {
    yBase = importOneCard(card, nodes, edges, yBase) + 160; // gap between cards
  }
  return { nodes, edges, pointPrograms };
}
