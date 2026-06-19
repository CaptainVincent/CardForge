// Reward engine — evaluates an exported rule set against one transaction.
// This is the runtime that makes the rules executable (records → 回饋金額).

const resolveLimits = (rule, json) =>
  rule.limits?.pool ? json.limit_pools?.[rule.limits.pool] || {} : rule.limits || {};

const resolveMinSpending = (rule, json) => {
  const e = rule.eligibility || {};
  return e.pool ? json.eligibility_pools?.[e.pool]?.min_spending : e.min_spending;
};

function evalPredicate(p, custom = {}) {
  const v = custom[p.field];
  const val = p.value;
  switch (p.op) {
    case 'is': return String(v) === String(val);
    case 'is_not': return String(v) !== String(val);
    case 'in': return (Array.isArray(val) ? val : [val]).map(String).includes(String(v));
    case 'not_in': return !(Array.isArray(val) ? val : [val]).map(String).includes(String(v));
    case 'gte': return Number(v) >= Number(val);
    case 'lte': return Number(v) <= Number(val);
    case 'contains': return String(v ?? '').includes(String(val));
    default: return true;
  }
}

// Does a transaction satisfy a match clause (AND across fields, OR within each)?
function matchClause(m, tx) {
  if (!m) return true;
  if (m.is_overseas != null && tx.isOverseas !== m.is_overseas) return false;
  if (m.currencies?.length && !m.currencies.includes(tx.currency)) return false;
  if (m.channels?.length && !m.channels.some((c) => tx.channels?.includes(c))) return false;
  if (m.categories?.length && !m.categories.some((c) => tx.categories?.includes(c))) return false;
  if (m.payment_methods?.length && !m.payment_methods.includes(tx.paymentMethod)) return false;
  if (m.min_amount_twd && Number(tx.amount) < m.min_amount_twd) return false;
  if (m.custom?.length && !m.custom.every((p) => evalPredicate(p, tx.custom))) return false;
  // Cross-field OR groups (CNF clauses): each group must have ≥1 matching alt.
  if (m.or_groups?.length && !m.or_groups.every((g) => g.some((sub) => matchClause(sub, tx)))) return false;
  return true;
}

function ruleMatches(rule, tx) {
  if (!matchClause(rule.match, tx)) return false;
  const ex = rule.match?.exclude;
  if (ex && matchClause(ex, tx)) return false; // NOT: hitting the exclude clause disqualifies
  return true;
}

function applyRounding(v, mode) {
  if (mode === 'round') return Math.round(v);
  if (mode === 'ceil') return Math.ceil(v);
  return Math.floor(v); // 'floor' (無條件捨去) is the default
}

function rewardFor(rule, tx, json) {
  const r = rule.reward || {};
  const method = r.method || 'percentage';
  const amount = Number(tx.amount) || 0;
  const round = (v) => applyRounding(v, json?.rounding);

  if (method === 'fixed') {
    return { kind: 'cash', value: round(r.fixed_amount || 0), capped: false };
  }
  if (method === 'per_dollar') {
    const pts = Math.floor(amount / (r.per_dollar || 1)) * (r.points_per_unit ?? 1);
    return { kind: 'points', value: pts, name: r.point_name || '點數', capped: false };
  }

  // percentage (with optional spend tiers)
  let rate = r.rate || 0;
  if (rule.tiers?.mode === 'spend' && rule.tiers.bands?.length) {
    const spend = Number(tx.periodSpend) || amount;
    const band = rule.tiers.bands
      .filter((b) => spend >= (b.min_amount || 0))
      .sort((a, b) => (b.min_amount || 0) - (a.min_amount || 0))[0];
    if (band) rate = band.rate;
  }
  let value = amount * rate;
  let capped = false;
  const lim = resolveLimits(rule, json);
  if (lim.max_reward_per_txn && value > lim.max_reward_per_txn) { value = lim.max_reward_per_txn; capped = true; }
  value = round(value);
  if (r.type === 'points') return { kind: 'points', value, name: r.point_name || '點數', capped };
  return { kind: 'cash', value, capped };
}

function eligibility(rule, tx, json) {
  const ms = resolveMinSpending(rule, json);
  if (!ms?.amount) return { ok: true };
  const spend = Number(tx.periodSpend) || Number(tx.amount) || 0;
  return { ok: spend >= ms.amount, need: ms.amount };
}

export function simulate(json, tx, rates = {}) {
  const rules = Object.values(json?.rules || {});
  const fired = [];
  const skipped = [];

  for (const rule of rules) {
    if (!ruleMatches(rule, tx)) continue;
    const el = eligibility(rule, tx, json);
    if (!el.ok) { skipped.push({ id: rule.id, name: rule.name, reason: `未達當期門檻 $${el.need?.toLocaleString?.() ?? el.need}` }); continue; }
    fired.push({
      id: rule.id, name: rule.name,
      layer: rule.stacking?.layer || 'base',
      selectGroup: rule.stacking?.select_group || null,
      once: rule.settlement === 'once',
      reward: rewardFor(rule, tx, json),
    });
  }

  // One-time bonuses (首刷/里程碑) are reported separately, not per-transaction.
  const recurring = fired.filter((f) => !f.once);
  const oneTime = fired.filter((f) => f.once).map((f) => ({ name: f.name, kind: f.reward.kind, value: f.reward.value, pointName: f.reward.name }));

  // 擇優 (XOR): within each select group keep only the highest-valued reward
  // (現金 vs 點數 compared via rates); everything else stacks.
  const valued = (f) => (f.reward.kind === 'cash' ? f.reward.value : f.reward.value * (rates[f.reward.name] ?? 1));
  const groups = {};
  const effective = [];
  for (const f of recurring) {
    if (f.selectGroup) {
      if (!groups[f.selectGroup] || valued(f) > valued(groups[f.selectGroup])) groups[f.selectGroup] = f;
    } else {
      effective.push(f);
    }
  }
  effective.push(...Object.values(groups));

  let cashback = 0;
  const points = {};
  for (const f of effective) {
    if (f.reward.kind === 'cash') cashback += f.reward.value;
    else points[f.reward.name] = (points[f.reward.name] || 0) + f.reward.value;
  }

  return {
    cashback: Math.round(cashback * 100) / 100,
    points,
    fired: effective,
    oneTime,
    skipped,
    selectApplied: Object.keys(groups).length > 0,
  };
}

// Convert a result to a single TWD value using point exchange rates.
export function valueOf(result, rates = {}) {
  if (!result) return 0;
  const pts = Object.entries(result.points || {}).reduce((sum, [name, v]) => sum + v * (rates[name] ?? 1), 0);
  return (result.cashback || 0) + pts;
}

// Decision value = estimated value minus the overseas FX fee (a cost), when the
// transaction is overseas and carries a fee. Used for recommend/compare ranking.
export function netScore(result, json, tx, rates = {}) {
  const gross = valueOf(result, rates);
  const fee = tx?.isOverseas && tx?.hasFee !== false ? (Number(tx.amount) || 0) * ((json?.fx_fee_rate ?? 0) / 100) : 0;
  return gross - fee;
}

// Stateful simulation over an ORDERED list of transactions within one billing
// period — the things a single-transaction simulate() can't express:
//  • period reward caps (max_reward_per_period) accumulate and truncate later
//    transactions once the monthly cap is reached (shared per limit pool);
//  • gate thresholds (min_spending) unlock partway through the month, so only
//    transactions after the cumulative spend crosses the bar earn the bonus;
//  • one-time rewards (settlement:'once') are claimed exactly once.
// Assumption: cumulative card spend (incl. the current txn) drives gate
// eligibility and spend tiers; one-time bonuses don't consume the period cap.
export function simulateMonth(json, txns = [], rates = {}) {
  const rules = Object.values(json?.rules || {});
  const valued = (kind, value, name) => (kind === 'cash' ? value : value * (rates[name] ?? 1));

  let cumSpend = 0;
  const capUsed = {};       // bucket → accumulated reward counted against the cap
  const capMeta = {};       // bucket → { name, max, hit, firstHitTxn, lost }
  const gateUnlock = {};    // ruleId → txn index where it unlocked
  const claimed = new Set();
  const oneTime = [];
  const perTxn = [];
  const totals = { cashback: 0, points: {} };

  txns.forEach((tx, ti) => {
    cumSpend += Number(tx.amount) || 0;
    const ctx = { ...tx, periodSpend: cumSpend };
    const fired = [];
    const skipped = [];

    for (const rule of rules) {
      if (!ruleMatches(rule, ctx)) continue;

      const ms = resolveMinSpending(rule, json);
      if (ms?.amount) {
        if (cumSpend < ms.amount) { skipped.push({ id: rule.id, name: rule.name, reason: `未達當期門檻 $${ms.amount.toLocaleString()}` }); continue; }
        if (gateUnlock[rule.id] == null) gateUnlock[rule.id] = ti;
      }

      const base = rewardFor(rule, ctx, json); // per-txn capped + rounded
      let value = base.value;
      let capped = base.capped;

      // Period / total reward cap (shared across a pool's member rules).
      if (rule.settlement !== 'once') {
        const lim = resolveLimits(rule, json);
        const max = Math.min(lim.max_reward_per_period ?? Infinity, lim.max_reward_total ?? Infinity);
        if (Number.isFinite(max)) {
          const bucket = rule.limits?.pool || rule.id;
          const used = capUsed[bucket] || 0;
          const remaining = Math.max(0, max - used);
          if (value > remaining) {
            const m = (capMeta[bucket] = capMeta[bucket] || { name: rule.name, max, hit: false, lost: 0 });
            m.lost += value - remaining;
            if (!m.hit) { m.hit = true; m.firstHitTxn = ti; }
            value = remaining;
            capped = true;
          }
          capUsed[bucket] = used + value;
        }
      }

      if (rule.settlement === 'once') {
        if (claimed.has(rule.id)) continue;
        claimed.add(rule.id);
        oneTime.push({ name: rule.name, kind: base.kind, value, pointName: base.name, claimedAtTxn: ti });
        continue;
      }

      fired.push({ id: rule.id, name: rule.name, selectGroup: rule.stacking?.select_group || null, reward: { ...base, value, capped } });
    }

    // 擇優 (XOR) within each select group, per transaction.
    const groups = {};
    const effective = [];
    for (const f of fired) {
      if (f.selectGroup) {
        const cur = groups[f.selectGroup];
        if (!cur || valued(f.reward.kind, f.reward.value, f.reward.name) > valued(cur.reward.kind, cur.reward.value, cur.reward.name)) groups[f.selectGroup] = f;
      } else effective.push(f);
    }
    effective.push(...Object.values(groups));

    let cash = 0;
    const pts = {};
    for (const f of effective) {
      if (f.reward.kind === 'cash') cash += f.reward.value;
      else pts[f.reward.name] = (pts[f.reward.name] || 0) + f.reward.value;
    }
    totals.cashback += cash;
    for (const [k, v] of Object.entries(pts)) totals.points[k] = (totals.points[k] || 0) + v;

    perTxn.push({ index: ti, tx, cashback: Math.round(cash * 100) / 100, points: pts, fired: effective.map((f) => ({ name: f.name, ...f.reward })), skipped });
  });

  const caps = Object.entries(capMeta).filter(([, m]) => m.hit).map(([bucket, m]) => ({
    bucket, name: m.name, max: m.max, used: Math.round((capUsed[bucket] || 0) * 100) / 100, firstHitTxn: m.firstHitTxn, lost: Math.round(m.lost * 100) / 100,
  }));
  const gates = Object.entries(gateUnlock).map(([ruleId, ti]) => {
    const rule = rules.find((r) => r.id === ruleId);
    return { ruleId, name: rule?.name, threshold: resolveMinSpending(rule, json)?.amount, unlockedAtTxn: ti };
  });

  totals.cashback = Math.round(totals.cashback * 100) / 100;
  return { perTxn, totals, caps, gates, oneTime };
}

// Tailor the form to a card's actual rules (from its exported JSON).
export function deriveTxFieldsFromJson(json) {
  const rules = Object.values(json?.rules || {});
  // Include each rule's match plus any OR-group alternatives so the form
  // surfaces fields that only appear inside a 任一 node.
  const ms = rules.flatMap((r) => {
    const m = r.match || {};
    return [m, ...(m.or_groups || []).flat()];
  });
  const uniq = (a) => [...new Set(a)];
  return {
    hasRegion: ms.some((m) => m.is_overseas != null),
    currencies: uniq(ms.flatMap((m) => m.currencies || [])),
    channels: uniq(ms.flatMap((m) => m.channels || [])),
    categories: uniq(ms.flatMap((m) => m.categories || [])),
    paymentMethods: uniq(ms.flatMap((m) => m.payment_methods || [])),
    customFields: uniq(ms.flatMap((m) => (m.custom || []).map((p) => p.field)).filter(Boolean)),
    hasGateOrTiers: rules.some((r) => r.tiers?.mode === 'spend' || r.eligibility?.min_spending || r.eligibility?.pool),
  };
}

// Merge several field-descriptors (for cross-card comparison forms).
export function mergeFields(list) {
  const uniq = (a) => [...new Set(a)];
  return {
    hasRegion: list.some((f) => f.hasRegion),
    currencies: uniq(list.flatMap((f) => f.currencies)),
    channels: uniq(list.flatMap((f) => f.channels)),
    categories: uniq(list.flatMap((f) => f.categories)),
    paymentMethods: uniq(list.flatMap((f) => f.paymentMethods)),
    customFields: uniq(list.flatMap((f) => f.customFields)),
    hasGateOrTiers: list.some((f) => f.hasGateOrTiers),
  };
}
