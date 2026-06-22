// Dynamic graph lint — surfaces structures/operations that shouldn't happen,
// each with a reason and (where possible) the node to focus. ESLint-style:
// warns, never blocks. Severity: 'error' (rule won't work) | 'warning'.
import { nodeTitle } from '../nodes/registry';
import { edgeIssue } from './connectionRules';
import { exportCard } from './exportJson';
import { nodeIssues } from './validate';
import { forwardReachable } from './graph.js';
import { MATCH_LIST_FIELDS } from './matchFields';

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
  const reachable = forwardReachable(cards.map((c) => c.id), edges);
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
  // The conflict is computed from the merged export (authoritative), but the FIX
  // lives on the CONDITION nodes — so we map each conflicting value back to the
  // condition nodes in that card's subtree that mention it (relatedIds). Clicking
  // then frames+highlights exactly the nodes to reconcile (no single fix node).
  for (const card of cards) {
    const cj = exportCard(card, nodes, edges);
    if (!cj) continue;
    const subIds = forwardReachable([card.id], edges);
    const conds = nodes.filter((n) => n.type === 'condition' && subIds.has(n.id));
    const condsWith = (field, vals) => conds.filter((n) => (n.data?.[field] || []).some((v) => vals.includes(v))).map((n) => n.id);
    const condsRegion = (val) => conds.filter((n) => n.data?.isOverseas === val).map((n) => n.id);
    for (const rule of Object.values(cj.rules)) {
      const m = rule.match || {};
      const ex = m.exclude;
      if (!ex) continue;
      // 「同時要求又排除同值」永不命中 — 涵蓋所有清單型 match 欄位(由單一來源
      // MATCH_LIST_FIELDS 推導,含 countries / mcc / 卡友日,過去寫死 5 欄漏接)。
      for (const { json: f, node: nodeKey } of MATCH_LIST_FIELDS) {
        const overlap = (m[f] || []).filter((x) => (ex[f] || []).includes(x));
        if (overlap.length) issues.push({ id: `imposs-${rule.id}-${f}`, severity: 'error', message: `規則「${rule.name}」同時要求並排除「${overlap.join('/')}」,永不命中`, relatedIds: condsWith(nodeKey, overlap) });
      }
      if (m.is_overseas != null && ex.is_overseas === m.is_overseas) {
        issues.push({ id: `imposs-${rule.id}-region`, severity: 'error', message: `規則「${rule.name}」同時要求並排除「${m.is_overseas ? '海外' : '國內'}」,永不命中`, relatedIds: condsRegion(m.is_overseas) });
      }
    }
  }

  // Cross-node misconfig: a construct REFERENCES a card-level field the card
  // lacks. The introducing nodes (cause) and the field to fill (fix) live apart,
  // so the issue carries BOTH — nodeId = the card (where you fix it), relatedIds
  // = the nodes that triggered it (so clicking frames+highlights the whole set).
  for (const c of cards) {
    const sub = forwardReachable([c.id], edges);
    const idsInCard = (pred) => nodes.filter((n) => sub.has(n.id) && pred(n)).map((n) => n.id);
    const billing = idsInCard((n) => (n.type === 'limit' || n.type === 'gate') && n.data?.cycle === 'billing_cycle');
    if (!c.data?.statementDay && billing.length) {
      issues.push({ id: `nostmt-${c.id}`, severity: 'warning', message: `有 ${billing.length} 個上限/門檻用「帳單週期」,但此卡未填「帳單結帳日」(在此卡片設定)→ 否則以「月」近似`, nodeId: c.id, relatedIds: billing });
    }
    const opening = idsInCard((n) => n.type === 'reward' && n.data?.fromOpeningDays);
    if (!c.data?.opened && opening.length) {
      issues.push({ id: `noopen-${c.id}`, severity: 'warning', message: `有 ${opening.length} 條「首刷期限(開卡後 N 天)」,但此卡未填「持卡開始日」(在此卡片設定)→ 否則該窗無法生效`, nodeId: c.id, relatedIds: opening });
    }
  }

  // Same-named 資格 must agree on their default — they collapse to ONE flag by
  // name (one ✓/✗ toggle), so conflicting defaults are ambiguous.
  const byFlag = {};
  for (const n of nodes) {
    if (n.type !== 'eligibility') continue;
    const nm = (n.data?.name || '').trim();
    if (nm) (byFlag[nm] = byFlag[nm] || []).push(n);
  }
  for (const [nm, list] of Object.entries(byFlag)) {
    if (new Set(list.map((n) => n.data?.default === true)).size > 1) {
      list.forEach((n) => issues.push({ id: `elig-conflict-${n.id}`, severity: 'warning', message: `資格「${nm}」的預設狀態在多個節點不一致`, nodeId: n.id }));
    }
  }

  // Per-node completeness (field-level) as warnings
  for (const n of nodes) {
    for (const it of nodeIssues(n, edges, nodes)) {
      issues.push({ id: `node-${n.id}-${it.message}`, severity: 'warning', message: `${nodeTitle(n.type)}：${it.message}`, nodeId: n.id });
    }
  }

  // Point-program value integrity (single current value, no time axis). Only
  // flags CONFIGURED-but-malformed programs (unconfigured points default to 1).
  const checked = new Set();
  for (const n of nodes) {
    if (n.type !== 'reward' || n.data?.rewardType !== 'points') continue;
    const name = (n.data?.pointName || '').trim();
    if (!name || checked.has(name)) continue;
    checked.add(name);
    const rate = pointPrograms[name]?.rate;
    if (rate == null) continue; // unconfigured — fine
    if (Number.isNaN(Number(rate)) || Number(rate) <= 0) {
      issues.push({ id: `pt-rate-${name}`, severity: 'error', message: `點數「${name}」的點值無效(需為大於 0 的數值)`, nodeId: n.id });
    }
  }

  return issues;
}

export const lintSummary = (issues) => ({
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warning').length,
});
