/**
 * Convert ChristianWolff JSON → React Flow nodes + edges
 */

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

// Build ONE card's subtree into the shared nodes/edges arrays, offset by yBase.
// Returns the bottom Y used so the next card can stack below it.
function importOneCard(json, nodes, edges, yBase) {
  const cardName = json.card || 'Unknown';
  const rules = json.rules || {};
  const ruleList = Object.values(rules);
  const limitPools = json.limit_pools || {};
  const eligPools = json.eligibility_pools || {};
  // Resolve pooled refs back to their values (round-trip preserves data; the
  // "shared" structure collapses to per-rule nodes, which is acceptable).
  const resolveLimits = (rule) => (rule.limits?.pool ? limitPools[rule.limits.pool] || {} : rule.limits || {});
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
    data: { cardName, account, rounding: json.rounding || 'floor', fxFeeRate: json.fx_fee_rate ?? 1.5 },
  });
  if (ruleList.length === 0) return yBase + 200;

  // Group rules by match_key to create shared condition nodes
  const byMatch = {};
  for (const rule of ruleList) {
    const m = rule.match || {};
    const parts = [];
    if (m.currencies) parts.push('cur:' + m.currencies.sort().join(','));
    if (m.is_overseas === true) parts.push('overseas');
    if (m.is_overseas === false) parts.push('domestic');
    if (m.channels) parts.push('ch:' + m.channels.sort().join(','));
    if (m.categories) parts.push('cat:' + m.categories.sort().join(','));
    if (m.payment_methods) parts.push('pm:' + m.payment_methods.sort().join(','));
    if (m.custom) parts.push('cu:' + JSON.stringify(m.custom));
    if (m.exclude) parts.push('ex:' + JSON.stringify(m.exclude));
    if (m.or_groups) parts.push('or:' + JSON.stringify(m.or_groups));
    const key = parts.join('|') || '_general';
    if (!byMatch[key]) byMatch[key] = { match: m, rules: [] };
    byMatch[key].rules.push(rule);
  }

  let groupY = yBase + 40;
  const selectGroups = {}; // select_group id → [rewardId, ...]

  for (const group of Object.values(byMatch)) {
    const m = group.match;

    // Condition node
    const condId = nextId();
    nodes.push({
      id: condId,
      type: 'condition',
      position: { x: 350, y: groupY },
      data: {
        isOverseas: m.is_overseas ?? null,
        currencies: m.currencies || [],
        channels: m.channels || [],
        categories: m.categories || [],
        paymentMethods: m.payment_methods || [],
        minAmountTwd: m.min_amount_twd || null,
        custom: importCustom(m.custom),
      },
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
        data: {
          negate: true,
          isOverseas: ex.is_overseas ?? null,
          currencies: ex.currencies || [],
          channels: ex.channels || [],
          categories: ex.categories || [],
          paymentMethods: ex.payment_methods || [],
          minAmountTwd: ex.min_amount_twd || null,
          custom: importCustom(ex.custom),
        },
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
          alternatives: (groupAlts || []).map((sub) => ({
            isOverseas: sub.is_overseas ?? null,
            currencies: sub.currencies || [],
            channels: sub.channels || [],
            categories: sub.categories || [],
            paymentMethods: sub.payment_methods || [],
            minAmountTwd: sub.min_amount_twd || null,
            custom: importCustom(sub.custom),
          })),
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
      const lim = resolveLimits(rule);
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
          tierMode: rule.tiers?.mode === 'spend' ? 'spend' : 'flat',
          tiers: rule.tiers?.mode === 'spend'
            ? (rule.tiers.bands || []).map((b) => ({
                minSpend: b.min_amount || 0,
                rate: parseFloat(((b.rate || 0) * 100).toFixed(6)),
              }))
            : [],
          rewardType: r.type || 'cashback',
          pointName: r.point_name || '',
          layer: rule.stacking?.layer || 'base',
          settlement: rule.settlement === 'once' ? 'once' : 'recurring',
          startDate: rule.period?.start || null,
          endDate: rule.period?.end || null,
          requiresActivation: !!rule.requires_activation,
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

      // Limit node — caps only
      const hasCaps = lim.max_reward_per_period || lim.max_reward_total || lim.max_reward_per_txn;
      if (hasCaps) {
        const limitId = nextId();
        nodes.push({
          id: limitId,
          type: 'limit',
          position: { x: 1080 + dx, y: ruleY },
          data: {
            cycle: lim.period?.cycle || rule.period?.cycle || 'monthly',
            maxRewardPerPeriod: lim.max_reward_per_period || null,
            maxRewardTotal: lim.max_reward_total || null,
            maxRewardPerTxn: lim.max_reward_per_txn || null,
          },
        });
        edges.push(edge(rewardId, limitId));
      }

      // 擇優 group membership (rebuilt into a select node after the loop).
      const sg = rule.stacking?.select_group;
      if (sg) (selectGroups[sg] = selectGroups[sg] || []).push(rewardId);

      ruleY += 200;
    }

    groupY = ruleY + 50;
  }

  // Rebuild one 擇優 (select) node per group; member rewards connect into it.
  let selY = yBase + 40;
  for (const rewardIds of Object.values(selectGroups)) {
    const selId = nextId();
    nodes.push({ id: selId, type: 'select', position: { x: 1320, y: selY }, data: {} });
    for (const rid of rewardIds) edges.push(edge(rid, selId));
    selY += 160;
  }

  return Math.max(groupY, selY, yBase + 360);
}

// Accepts a single ChristianWolff card ({card, rules}) or a database ({cards:[...]}).
export function importFromJson(json) {
  _id = 0;
  const nodes = [];
  const edges = [];
  // Point-program valuations restored into app settings (dated rate history).
  const pointPrograms = {};
  for (const [name, v] of Object.entries(json?.point_programs || {})) {
    if (Array.isArray(v?.prices)) {
      pointPrograms[name] = { basis: v.basis || 'fixed', rates: v.prices.map((p) => ({ from: p.from ?? null, rate: p.twd_per_point ?? 1 })) };
    } else {
      // back-compat: earlier single-rate export ({ twd_per_point, basis, as_of })
      pointPrograms[name] = { basis: v?.basis || 'fixed', rates: [{ from: v?.as_of ?? null, rate: v?.twd_per_point ?? 1 }] };
    }
  }
  const list = Array.isArray(json?.cards) ? json.cards : (json?.card || json?.rules ? [json] : []);
  if (list.length === 0) return { nodes: [], edges: [], pointPrograms };

  let yBase = 0;
  for (const card of list) {
    yBase = importOneCard(card, nodes, edges, yBase) + 160; // gap between cards
  }
  return { nodes, edges, pointPrograms };
}
