// Dynamic graph lint — surfaces structures/operations that shouldn't happen,
// each with a reason and (where possible) the node to focus. ESLint-style:
// warns, never blocks. Severity: 'error' (rule won't work) | 'warning'.
import { nodeTitle } from '../nodes/registry';
import { edgeIssue } from './connectionRules';
import { exportCards } from './exportJson';
import { nodeIssues } from './validate';

export function lintGraph(nodes, edges, pointPrograms = {}) {
  const issues = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const typeOf = (id) => byId.get(id)?.type;
  const cards = nodes.filter((n) => n.type === 'card');

  if (cards.length === 0) {
    issues.push({ id: 'no-card', severity: 'error', message: '尚未建立任何信用卡節點' });
  }

  // Duplicate card names
  const byName = {};
  for (const c of cards) {
    const nm = (c.data?.cardName || '').trim();
    if (nm) (byName[nm] = byName[nm] || []).push(c.id);
  }
  for (const [nm, ids] of Object.entries(byName)) {
    if (ids.length > 1) ids.forEach((id) => issues.push({ id: `dup-${id}`, severity: 'warning', message: `卡片名稱「${nm}」重複`, nodeId: id }));
  }

  // Orphans: every non-card node must be reachable downstream from some card.
  const reachable = new Set(cards.map((c) => c.id));
  const stack = [...reachable];
  while (stack.length) {
    const id = stack.pop();
    for (const e of edges) if (e.source === id && !reachable.has(e.target)) { reachable.add(e.target); stack.push(e.target); }
  }
  for (const n of nodes) {
    if (n.type !== 'card' && !reachable.has(n.id)) {
      issues.push({ id: `orphan-${n.id}`, severity: 'error', message: `${nodeTitle(n.type)}未連接到任何卡片,匯出時會被忽略`, nodeId: n.id });
    }
  }

  // Illogical edges. The UI now blocks these at connect-time, so any present
  // came from an imported/legacy graph — flag them as errors (disallowed).
  for (const e of edges) {
    const reason = edgeIssue(typeOf(e.source), typeOf(e.target));
    if (reason) issues.push({ id: `edge-${e.id || `${e.source}-${e.target}`}`, severity: 'error', message: reason, nodeId: e.target });
  }

  // Cycle detection
  const adj = {};
  edges.forEach((e) => { (adj[e.source] = adj[e.source] || []).push(e.target); });
  const color = {};
  let cyc = null;
  const dfs = (u) => {
    color[u] = 1;
    for (const v of adj[u] || []) {
      if (color[v] === 1) { cyc = v; return true; }
      if (!color[v] && dfs(v)) return true;
    }
    color[u] = 2;
    return false;
  };
  for (const n of nodes) { if (!color[n.id] && dfs(n.id)) break; }
  if (cyc) issues.push({ id: 'cycle', severity: 'warning', message: '偵測到循環連線,邏輯不通', nodeId: cyc });

  // Impossible matches: a rule that both requires and excludes the same value.
  for (const cj of exportCards(nodes, edges)) {
    for (const rule of Object.values(cj.rules)) {
      const m = rule.match || {};
      const ex = m.exclude;
      if (!ex) continue;
      for (const f of ['currencies', 'channels', 'categories', 'payment_methods']) {
        const overlap = (m[f] || []).filter((x) => (ex[f] || []).includes(x));
        if (overlap.length) issues.push({ id: `imposs-${rule.id}-${f}`, severity: 'error', message: `規則「${rule.name}」同時要求並排除「${overlap.join('/')}」,永不命中` });
      }
    }
  }

  // Per-node completeness (field-level) as warnings
  for (const n of nodes) {
    for (const msg of nodeIssues(n, edges)) {
      issues.push({ id: `node-${n.id}-${msg}`, severity: 'warning', message: `${nodeTitle(n.type)}：${msg}`, nodeId: n.id });
    }
  }

  // Point-program dated-rate integrity. Only flags CONFIGURED-but-malformed
  // programs (unconfigured points default to 1 and are acceptable, not flagged).
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const checked = new Set();
  for (const n of nodes) {
    if (n.type !== 'reward' || n.data?.rewardType !== 'points') continue;
    const name = (n.data?.pointName || '').trim();
    if (!name || checked.has(name)) continue;
    checked.add(name);
    const rates = pointPrograms[name]?.rates;
    if (!rates?.length) continue; // unconfigured — fine
    const froms = [];
    let bad = false;
    for (const r of rates) {
      if (r.rate == null || Number.isNaN(Number(r.rate)) || Number(r.rate) <= 0) {
        issues.push({ id: `pt-rate-${name}`, severity: 'error', message: `點數「${name}」有不完整的點值(缺數值或 ≤ 0)`, nodeId: n.id });
        bad = true; break;
      }
      if (r.from != null && !dateRe.test(r.from)) {
        issues.push({ id: `pt-date-${name}`, severity: 'error', message: `點數「${name}」的點值變更缺少有效日期`, nodeId: n.id });
        bad = true; break;
      }
      if (r.from != null) froms.push(r.from);
    }
    if (!bad) {
      const dup = froms.find((d, i) => froms.indexOf(d) !== i);
      if (dup) issues.push({ id: `pt-dup-${name}`, severity: 'warning', message: `點數「${name}」有重複生效日(${dup})的點值`, nodeId: n.id });
    }
  }

  return issues;
}

export const lintSummary = (issues) => ({
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warning').length,
});
