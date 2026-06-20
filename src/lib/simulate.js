// Reward engine — evaluates an exported rule set against one transaction.
// This is the runtime that makes the rules executable (records → 回饋金額).

// Resolve a rule's caps to a flat list: { metric:'reward'|'spend'|'count',
// window:'txn'|'period'|'total', max, bucket }. New `limits.caps[]` is canonical;
// legacy reward-only scalar keys (max_reward_per_txn/period/total, inline or
// pooled) are read for back-compat. `bucket` shares an accumulator across rules
// that point at the same pool.
function resolveCaps(rule, json) {
  const lim = rule.limits || {};
  const bk = (pool, window, metric) => `${pool ? `pool:${pool}` : `rule:${rule.id}`}:${window}:${metric}`;
  if (Array.isArray(lim.caps)) {
    return lim.caps
      .filter((c) => c && c.max != null)
      .map((c) => { const metric = c.metric || 'reward'; const window = c.window || 'period'; return { metric, window, max: c.max, bucket: bk(c.pool, window, metric) }; });
  }
  const src = lim.pool ? (json.limit_pools?.[lim.pool] || {}) : lim;
  const out = [];
  if (src.max_reward_per_txn) out.push({ metric: 'reward', window: 'txn', max: src.max_reward_per_txn, bucket: bk(lim.pool, 'txn', 'reward') });
  if (src.max_reward_per_period) out.push({ metric: 'reward', window: 'period', max: src.max_reward_per_period, bucket: bk(lim.pool, 'period', 'reward') });
  if (src.max_reward_total) out.push({ metric: 'reward', window: 'total', max: src.max_reward_total, bucket: bk(lim.pool, 'total', 'reward') });
  return out;
}

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
  if (m.merchants?.length && !m.merchants.includes(tx.merchant)) return false;
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

  // percentage: flat / spend-tier (single rate by cumulative spend) / marginal
  // (each bracket of the txn amount at its own rate — rate on portion over X).
  const bands = rule.tiers?.bands;
  let value;
  if (rule.tiers?.mode === 'marginal' && bands?.length) {
    const sorted = [...bands].sort((a, b) => (a.min_amount || 0) - (b.min_amount || 0));
    value = 0;
    for (let i = 0; i < sorted.length; i++) {
      const lo = sorted[i].min_amount || 0;
      const hi = i + 1 < sorted.length ? (sorted[i + 1].min_amount || 0) : Infinity;
      value += Math.max(0, Math.min(amount, hi) - lo) * (sorted[i].rate || 0);
    }
  } else {
    let rate = r.rate || 0;
    if (rule.tiers?.mode === 'spend' && bands?.length) {
      const spend = Number(tx.periodSpend) || amount;
      const band = bands.filter((b) => spend >= (b.min_amount || 0)).sort((a, b) => (b.min_amount || 0) - (a.min_amount || 0))[0];
      if (band) rate = band.rate;
    }
    value = amount * rate;
  }
  let capped = false;
  for (const c of resolveCaps(rule, json)) {
    if (c.window === 'txn' && c.metric === 'reward' && value > c.max) { value = c.max; capped = true; }
  }
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
    if (rule.is_active === false) continue;
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
//  • period/total reward caps accumulate and truncate later transactions once
//    the cap is reached (shared per limit pool); caps apply AFTER 擇優 so only
//    the selected winner consumes a shared cap (擇優 之後才套上限);
//  • gate thresholds (min_spending) unlock partway through the month, so only
//    transactions after the cumulative spend crosses the bar earn the bonus;
//  • one-time rewards (settlement:'once') are claimed exactly once.
// Assumption: cumulative card spend (incl. the current txn) drives gate
// eligibility and spend tiers; one-time bonuses don't consume the period cap.
export function simulateMonth(json, txns = [], rates = {}) {
  const rules = Object.values(json?.rules || {});
  const valued = (kind, value, name) => (kind === 'cash' ? value : value * (rates[name] ?? 1));

  const topConf = json?.top_groups || {};
  let cumSpend = 0;
  const capUsed = {};       // bucket → accumulated reward counted against the cap
  const capMeta = {};       // bucket → { name, max, hit, firstHitTxn, lost }
  const topSpend = {};      // top group → { ruleId → 當期累積消費 } (ranking basis)
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

    // Phase 1: gather fired candidates (match + gate ok); reward is per-txn
    // capped + rounded but NOT yet period-capped.
    for (const rule of rules) {
      if (rule.is_active === false) continue;
      if (!ruleMatches(rule, ctx)) continue;

      const ms = resolveMinSpending(rule, json);
      if (ms?.amount) {
        if (cumSpend < ms.amount) { skipped.push({ id: rule.id, name: rule.name, reason: `未達當期門檻 $${ms.amount.toLocaleString()}` }); continue; }
        if (gateUnlock[rule.id] == null) gateUnlock[rule.id] = ti;
      }

      const base = rewardFor(rule, ctx, json); // per-txn capped + rounded

      if (rule.settlement === 'once') {
        if (claimed.has(rule.id)) continue;
        claimed.add(rule.id);
        oneTime.push({ name: rule.name, kind: base.kind, value: base.value, pointName: base.name, claimedAtTxn: ti });
        continue;
      }

      // 取高:該類別本期累積消費(用於排名,含本筆),不論回饋是否最終被取高排除。
      const topGroup = rule.stacking?.top_group || null;
      if (topGroup) {
        topSpend[topGroup] = topSpend[topGroup] || {};
        topSpend[topGroup][rule.id] = (topSpend[topGroup][rule.id] || 0) + (Number(tx.amount) || 0);
      }

      fired.push({
        id: rule.id,
        name: rule.name,
        selectGroup: rule.stacking?.select_group || null,
        topGroup,
        caps: resolveCaps(rule, json).filter((c) => c.window !== 'txn'), // txn caps already applied in rewardFor
        reward: base,
      });
    }

    // Phase 2: 擇優 (XOR) per select group — pick the best BEFORE caps, so only
    // the winner consumes a shared period/total cap (擇優 之後才套上限).
    const groups = {};
    const effective = [];
    for (const f of fired) {
      if (f.selectGroup) {
        const cur = groups[f.selectGroup];
        if (!cur || valued(f.reward.kind, f.reward.value, f.reward.name) > valued(cur.reward.kind, cur.reward.value, cur.reward.name)) groups[f.selectGroup] = f;
      } else effective.push(f);
    }
    effective.push(...Object.values(groups));

    // Phase 2.5: 取高 (top-K by 當期累積消費). Per group, only the members whose
    // category currently ranks in the top K (by cumulative period spend, incl.
    // this txn) stay rewarded; the rest are zeroed for this txn. Models 自動取
    // 最高消費類別 (Citi Custom Cash、CUBE 自選).
    const topActive = {}; // group → Set(ruleId) of currently-active members
    for (const [g, spends] of Object.entries(topSpend)) {
      const k = Math.max(1, Number(topConf[g]?.k) || 1);
      topActive[g] = new Set(
        Object.entries(spends).sort((a, b) => b[1] - a[1]).slice(0, k).map(([rid]) => rid),
      );
    }
    for (const f of effective) {
      if (f.topGroup && !topActive[f.topGroup]?.has(f.id)) {
        f.reward = { ...f.reward, value: 0, topExcluded: true };
      }
    }

    // Phase 3: apply each SELECTED reward's caps (metric-aware). Caps share an
    // accumulator per bucket (pooled across rules); applied to the 擇優 winner
    // only. reward-metric truncates the reward; spend-metric prorates the reward
    // to the portion of spend under the cap (e.g. 5% on first $1,500); count-
    // metric zeroes the reward once N qualifying txns are used (first-N).
    const amount = Number(tx.amount) || 0;
    for (const f of effective) {
      if (f.reward.topExcluded) continue; // 取高排除:不計入任何上限累加器
      let value = f.reward.value;
      let capped = f.reward.capped;
      for (const c of f.caps) {
        if (c.max == null || !Number.isFinite(c.max)) continue;
        const used = capUsed[c.bucket] || 0;
        const noteHit = (lost) => {
          const m = (capMeta[c.bucket] = capMeta[c.bucket] || { name: f.name, max: c.max, metric: c.metric, hit: false, lost: 0 });
          m.lost += lost;
          if (!m.hit) { m.hit = true; m.firstHitTxn = ti; }
        };
        if (c.metric === 'spend') {
          const eligible = Math.max(0, Math.min(amount, c.max - used));
          if (amount > 0 && eligible < amount) { noteHit(value * (1 - eligible / amount)); value *= eligible / amount; capped = true; }
          capUsed[c.bucket] = used + amount;
        } else if (c.metric === 'count') {
          if (used >= c.max) { noteHit(value); value = 0; capped = true; }
          else capUsed[c.bucket] = used + 1;
        } else { // reward
          const remaining = Math.max(0, c.max - used);
          if (value > remaining) { noteHit(value - remaining); value = remaining; capped = true; }
          capUsed[c.bucket] = used + value;
        }
      }
      f.reward = { ...f.reward, value: applyRounding(value, json?.rounding), capped };
    }

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
    bucket, name: m.name, max: m.max, metric: m.metric || 'reward', used: Math.round((capUsed[bucket] || 0) * 100) / 100, firstHitTxn: m.firstHitTxn, lost: Math.round(m.lost * 100) / 100,
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
    merchants: uniq(ms.flatMap((m) => m.merchants || [])),
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
    merchants: uniq(list.flatMap((f) => f.merchants || [])),
    paymentMethods: uniq(list.flatMap((f) => f.paymentMethods)),
    customFields: uniq(list.flatMap((f) => f.customFields)),
    hasGateOrTiers: list.some((f) => f.hasGateOrTiers),
  };
}
