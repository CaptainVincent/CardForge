// Reward engine — evaluates an exported rule set against one transaction.
// This is the runtime that makes the rules executable (records → 回饋金額).

// ── Multi-period support ──────────────────────────────────────────────────
// The whole multi-period capability is just two derived facts: which calendar
// "cycle instance" a transaction falls in, and whether a dated rule is in
// effect for it. No second engine — single-period behaviour is the special
// case where transactions carry no date (instance = '' → one shared bucket).
const STD_CYCLES = ['monthly', 'quarterly', 'yearly', 'total', 'billing_cycle'];

// A transaction's date → the cycle-instance string at a given granularity.
// '' when undatable or non-resetting (total/once) → collapses to one bucket.
// billing_cycle uses the card's statement-close day (a txn past it rolls into
// the next statement); without a statement day it falls back to monthly.
export function cycleInstanceOf(date, cycle, statementDay) {
  if (!date || cycle === 'total' || cycle === 'once') return '';
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y || !m) return '';
  if (cycle === 'yearly') return String(y);
  if (cycle === 'quarterly') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (cycle === 'billing_cycle' && statementDay) {
    let cy = y, cm = m;
    if (d > statementDay) { cm += 1; if (cm > 12) { cm = 1; cy += 1; } }
    return `${cy}-${String(cm).padStart(2, '0')}S`; // statement closing this month
  }
  return `${y}-${String(m).padStart(2, '0')}`; // monthly + billing_cycle w/o day + unknown
}

const addDays = (iso, n) => {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

// A rule's effective window, resolving a relative SUB window (period.
// from_opening_days) against the card's open date. {start,end} may be undefined.
const effectiveWindow = (rule, opened) => {
  const p = rule.period || {};
  if (p.from_opening_days != null && opened) return { start: opened, end: addDays(opened, p.from_opening_days) };
  return { start: p.start, end: p.end };
};

// Is a rule in effect for a transaction date? Undated tx → always (today's
// behaviour). YYYY-MM-DD compares chronologically as strings.
const inEffect = (rule, date, opened) => {
  if (!date || !rule.period) return true;
  const { start, end } = effectiveWindow(rule, opened);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
};

// Key for per-cycle cumulative spend. Non-standard cycles (billing_cycle…) fold
// to monthly. Undated → instance '' so every cycle holds the whole stream
// (= the old single-period cumulative), keeping legacy behaviour exact.
const normCycle = (c) => (STD_CYCLES.includes(c) ? c : 'monthly');
const spendKey = (date, cycle, statementDay) => `${normCycle(cycle)}:${cycleInstanceOf(date, cycle, statementDay)}`;

// Resolve a rule's caps to a flat list: { metric, window, max, bucket, cycle }.
// `cycle` is the cap's reset granularity (pool's, else the rule's period) — used
// in simulateMonth to suffix the bucket with the cycle instance so period caps
// reset each cycle while total caps span. New `limits.caps[]` is canonical;
// legacy reward-only scalar keys are read for back-compat.
function resolveCaps(rule, json) {
  const lim = rule.limits || {};
  if (!Array.isArray(lim.caps)) return [];
  const bk = (pool, window, metric) => `${pool ? `pool:${pool}` : `rule:${rule.id}`}:${window}:${metric}`;
  const cycleFor = (pool) => (pool ? json.limit_pools?.[pool]?.period?.cycle : rule.period?.cycle) || 'monthly';
  return lim.caps
    .filter((c) => c && c.max != null)
    .map((c) => { const metric = c.metric || 'reward'; const window = c.window || 'period'; return { metric, window, max: c.max, bucket: bk(c.pool, window, metric), cycle: cycleFor(c.pool) }; });
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
// MCC match: each entry is a single code ("5812") or an inclusive range
// ("5811-5819"). Matches the transaction's mcc against any entry.
function mccMatch(list, code) {
  if (code == null || code === '') return false;
  const n = Number(code);
  return list.some((e) => {
    const s = String(e).trim();
    if (s.includes('-')) { const [a, b] = s.split('-').map(Number); return Number.isFinite(a) && Number.isFinite(b) && n >= a && n <= b; }
    return s === String(code) || Number(s) === n;
  });
}

// Time conditions (卡友日/週幾、每月某號) are TRANSACTION ATTRIBUTES: derived
// from the txn's date (explicit tx.dayOfWeek/dayOfMonth wins for date-less 試算).
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function weekdayOf(tx) {
  if (tx.dayOfWeek) return tx.dayOfWeek;
  const [y, m, d] = String(tx.date || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function domOf(tx) {
  if (tx.dayOfMonth != null && tx.dayOfMonth !== '') return Number(tx.dayOfMonth);
  const d = Number(String(tx.date || '').split('-')[2]);
  return Number.isFinite(d) && d > 0 ? d : null;
}

function matchClause(m, tx) {
  if (!m) return true;
  if (m.is_overseas != null && tx.isOverseas !== m.is_overseas) return false;
  if (m.currencies?.length && !m.currencies.includes(tx.currency)) return false;
  if (m.channels?.length && !m.channels.some((c) => tx.channels?.includes(c))) return false;
  if (m.categories?.length && !m.categories.some((c) => tx.categories?.includes(c))) return false;
  if (m.mcc?.length && !mccMatch(m.mcc, tx.mcc)) return false;
  if (m.merchants?.length && !m.merchants.includes(tx.merchant)) return false;
  if (m.payment_methods?.length && !m.payment_methods.includes(tx.paymentMethod)) return false;
  if (m.min_amount_twd && Number(tx.amount) < m.min_amount_twd) return false;
  if (m.day_of_week?.length) { const wd = weekdayOf(tx); if (!wd || !m.day_of_week.includes(wd)) return false; }
  if (m.day_of_month?.length) { const dom = domOf(tx); if (dom == null || !m.day_of_month.map(Number).includes(dom)) return false; }
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
  if (mode === 'none') return v;     // exact (不進位) — schema 承諾的值,先前漏接被 floor
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
    } else if (rule.tiers?.mode === 'distinct_count' && bands?.length) {
      // Rate by 當期不同品牌數 — the count is a SCENARIO input (tx.distinctCount,
      // set in 分析 sandbox), not auto-derived; below the lowest tier → no bonus.
      const count = Number(tx.distinctCount) || 0;
      const band = bands.filter((b) => count >= (b.min_count || 0)).sort((a, b) => (b.min_count || 0) - (a.min_count || 0))[0];
      rate = band ? band.rate : 0;
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

// Required eligibility flags (新戶 / 線上登錄 …): a binary qualification the
// holder either meets or not. Every flag listed on the rule must be satisfied.
// The scenario supplies the value via tx.flags[name]; when the scenario leaves
// it unspecified, fall back to the flag's declared default (限時/新戶 → false,
// so such promos don't inflate the everyday simulation until opted in).
function unmetFlag(rule, tx, json) {
  const flags = rule.eligibility?.flags;
  if (!flags?.length) return null;
  for (const name of flags) {
    const v = tx.flags?.[name];
    const eff = v == null ? !!json?.eligibility_flags?.[name]?.default : v === true;
    if (!eff) return name;
  }
  return null;
}

function eligibility(rule, tx, json) {
  const flag = unmetFlag(rule, tx, json);
  if (flag) return { ok: false, flag };
  const ms = resolveMinSpending(rule, json);
  if (!ms?.amount) return { ok: true };
  const spend = Number(tx.periodSpend) || Number(tx.amount) || 0;
  return { ok: spend >= ms.amount, need: ms.amount };
}

// 擇優 (XOR): within each select group keep only the highest-valued candidate
// (現金 vs 點數 compared via `rates`); ungrouped candidates all pass through.
// The single home for the XOR rule — shared by simulate (single-txn) and
// simulateMonth (per-txn) so the two can't drift. Candidates: { selectGroup,
// reward:{kind,value,name} }. Returns { effective, groupCount }.
function selectBest(candidates, rates) {
  const valued = (f) => (f.reward.kind === 'cash' ? f.reward.value : f.reward.value * (rates[f.reward.name] ?? 1));
  const groups = {};
  const effective = [];
  for (const f of candidates) {
    if (f.selectGroup) {
      if (!groups[f.selectGroup] || valued(f) > valued(groups[f.selectGroup])) groups[f.selectGroup] = f;
    } else effective.push(f);
  }
  effective.push(...Object.values(groups));
  return { effective, groupCount: Object.keys(groups).length };
}

// Single-transaction evaluation (試算/推薦/比較). Shares match/eligibility/reward/
// 擇優 with simulateMonth via the same helpers; INTENTIONALLY omits cross-txn
// constraints (period/total caps, 取高 ranking) — those are undefined for one
// isolated transaction. Use simulateMonth for stateful, multi-period accuracy.
export function simulate(json, tx, rates = {}) {
  const rules = Object.values(json?.rules || {});
  const fired = [];
  const skipped = [];

  for (const rule of rules) {
    if (rule.is_active === false) continue;
    if (!inEffect(rule, tx.date, json?.opened)) continue; // dated rule, txn outside its 檔期
    if (!ruleMatches(rule, tx)) continue;
    const el = eligibility(rule, tx, json);
    if (!el.ok) { skipped.push({ id: rule.id, name: rule.name, reason: el.flag ? `未滿足資格:${el.flag}` : `未達當期門檻 $${el.need?.toLocaleString?.() ?? el.need}` }); continue; }
    fired.push({
      id: rule.id, name: rule.name,
      selectGroup: rule.stacking?.select_group || null,
      once: rule.settlement === 'once',
      reward: rewardFor(rule, tx, json),
    });
  }

  // One-time bonuses (首刷/里程碑) are reported separately, not per-transaction.
  const recurring = fired.filter((f) => !f.once);
  const oneTime = fired.filter((f) => f.once).map((f) => ({ name: f.name, kind: f.reward.kind, value: f.reward.value, pointName: f.reward.name }));

  // 擇優 (XOR) via the shared helper (現金 vs 點數 compared via rates).
  const { effective } = selectBest(recurring, rates);

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

// Stateful simulation over an ORDERED list of transactions. Single-period by
// default; MULTI-period when transactions carry a `date` (YYYY-MM-DD):
//  • a dated rule (period.start/end) only fires for txns inside its 檔期;
//  • period caps & gate/spend-tier cumulatives reset each CYCLE INSTANCE
//    (2026-Q1, 2026-03…), total caps span — all by suffixing the accumulator
//    key with the instance; undated → instance '' → one shared bucket (legacy);
//  • caps apply AFTER 擇優 (only the winner consumes a shared cap);
//  • one-time rewards (settlement:'once') are claimed exactly once.
export function simulateMonth(json, txns = [], rates = {}) {
  const rules = Object.values(json?.rules || {});

  const topConf = json?.top_groups || {};
  const stmtDay = json?.statement_day; // statement-close day for billing_cycle buckets
  const opened = json?.opened;         // card open date — resolves relative SUB windows
  const spendInCycle = {}; // `${cycle}:${instance}` → cumulative spend in that cycle instance
  const windowSpend = {};  // ruleId → in-window cumulative (for dated total-gates: SUB)
  const capUsed = {};       // bucket(@instance) → accumulated reward counted against the cap
  const capMeta = {};       // bucket(@instance) → { name, max, hit, firstHitTxn, lost }
  const topSpend = {};      // top group → { ruleId → 當期累積消費 } (ranking basis)
  const gateUnlock = {};    // ruleId → txn index where it unlocked
  const claimed = new Set();
  const oneTime = [];
  const perTxn = [];
  const totals = { cashback: 0, points: {} };

  // Cycle accumulation assumes chronological order; if every txn is dated, sort
  // so the user can add them in any order. Mixed/undated → keep input order.
  const ordered = txns.every((t) => t.date) ? [...txns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) : txns;

  ordered.forEach((tx, ti) => {
    const amount = Number(tx.amount) || 0;
    // Accrue this txn into every cycle granularity's current instance.
    for (const cy of STD_CYCLES) { const k = spendKey(tx.date, cy, stmtDay); spendInCycle[k] = (spendInCycle[k] || 0) + amount; }
    const fired = [];
    const skipped = [];

    // Phase 1: gather fired candidates (in effect + match + gate ok); reward is
    // per-txn capped + rounded but NOT yet period-capped.
    for (const rule of rules) {
      if (rule.is_active === false) continue;
      if (!inEffect(rule, tx.date, opened)) continue; // dated rule, txn outside its 檔期
      if (!ruleMatches(rule, tx)) continue;

      const unmet = unmetFlag(rule, tx, json);
      if (unmet) { skipped.push({ id: rule.id, name: rule.name, reason: `未滿足資格:${unmet}` }); continue; }

      // periodSpend is THIS rule's cycle cumulative (incl. current txn) — drives
      // its gate threshold and spend tiers, resetting each cycle instance.
      const ctx = { ...tx, periodSpend: spendInCycle[spendKey(tx.date, rule.period?.cycle || 'monthly', stmtDay)] ?? amount };

      const ms = resolveMinSpending(rule, json);
      if (ms?.amount) {
        // A dated rule with a `total` threshold = cumulative WITHIN its window
        // (SUB: spend $X within N days of opening). Otherwise per-cycle cumulative.
        const dated = !!(rule.period && (rule.period.start || rule.period.end || rule.period.from_opening_days != null));
        let gateSpend;
        if (ms.period === 'total' && dated) {
          windowSpend[rule.id] = (windowSpend[rule.id] || 0) + amount;
          gateSpend = windowSpend[rule.id];
        } else {
          gateSpend = spendInCycle[spendKey(tx.date, ms.period || 'monthly', stmtDay)] ?? amount;
        }
        if (gateSpend < ms.amount) { skipped.push({ id: rule.id, name: rule.name, reason: `未達當期門檻 $${ms.amount.toLocaleString()}` }); continue; }
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

    // Phase 2: 擇優 (XOR) per select group via the shared helper — pick the best
    // BEFORE caps, so only the winner consumes a shared period/total cap.
    const { effective } = selectBest(fired, rates);

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
    for (const f of effective) {
      if (f.reward.topExcluded) continue; // 取高排除:不計入任何上限累加器
      let value = f.reward.value;
      let capped = f.reward.capped;
      for (const c of f.caps) {
        if (c.max == null || !Number.isFinite(c.max)) continue;
        // period caps reset each cycle instance (suffix); total caps span (none).
        const bucket = c.window === 'period' ? `${c.bucket}@${cycleInstanceOf(tx.date, c.cycle, stmtDay)}` : c.bucket;
        const used = capUsed[bucket] || 0;
        const noteHit = (lost) => {
          const m = (capMeta[bucket] = capMeta[bucket] || { name: f.name, max: c.max, metric: c.metric, hit: false, lost: 0 });
          m.lost += lost;
          if (!m.hit) { m.hit = true; m.firstHitTxn = ti; }
        };
        if (c.metric === 'spend') {
          const eligible = Math.max(0, Math.min(amount, c.max - used));
          if (amount > 0 && eligible < amount) { noteHit(value * (1 - eligible / amount)); value *= eligible / amount; capped = true; }
          capUsed[bucket] = used + amount;
        } else if (c.metric === 'count') {
          if (used >= c.max) { noteHit(value); value = 0; capped = true; }
          else capUsed[bucket] = used + 1;
        } else { // reward
          const remaining = Math.max(0, c.max - used);
          if (value > remaining) { noteHit(value - remaining); value = remaining; capped = true; }
          capUsed[bucket] = used + value;
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
    hasMcc: ms.some((m) => m.mcc?.length),
    customFields: uniq(ms.flatMap((m) => (m.custom || []).map((p) => p.field)).filter(Boolean)),
    hasGateOrTiers: rules.some((r) => r.tiers?.mode === 'spend' || r.eligibility?.min_spending || r.eligibility?.pool),
    // 計數級距(踩點等):分析需提供「當期計數」情境;label = 該計數的名稱(品牌數/天數…)。
    hasDistinctCount: rules.some((r) => r.tiers?.mode === 'distinct_count'),
    maxDistinctCount: Math.max(0, ...rules.flatMap((r) => (r.tiers?.mode === 'distinct_count' ? (r.tiers.bands || []).map((b) => b.min_count || 0) : [0]))),
    distinctCountLabel: rules.find((r) => r.tiers?.mode === 'distinct_count')?.tiers?.count_label || '',
    // Named eligibility flags (新戶/登錄…), with each flag's declared state kept
    // as the tri-state it was authored in (true 符合 / false 未符合 / undefined
    // 未選). Analysis shows this READ-ONLY — the resolved value (未選→未符合) is
    // the engine's, not an overridable scenario knob. Deduped by name across cards.
    eligibilityFlags: uniq(rules.flatMap((r) => r.eligibility?.flags || [])).map((name) => ({
      name,
      default: json?.eligibility_flags?.[name]?.default,
    })),
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
    hasMcc: list.some((f) => f.hasMcc),
    customFields: uniq(list.flatMap((f) => f.customFields)),
    hasGateOrTiers: list.some((f) => f.hasGateOrTiers),
    hasDistinctCount: list.some((f) => f.hasDistinctCount),
    maxDistinctCount: Math.max(0, ...list.map((f) => f.maxDistinctCount || 0)),
    distinctCountLabel: list.map((f) => f.distinctCountLabel).find(Boolean) || '',
    eligibilityFlags: Object.values(
      Object.fromEntries(list.flatMap((f) => f.eligibilityFlags || []).map((e) => [e.name, e]))
    ),
  };
}
