// Per-node completeness/connection checks surfaced in the Inspector and on cards.
export function nodeIssues(node, edges) {
  if (!node) return [];
  const d = node.data || {};
  const issues = [];
  const hasIncoming = edges.some((e) => e.target === node.id);

  if (node.type === 'card') {
    if (!d.cardName?.trim()) issues.push('未填卡片名稱');
  }

  if (node.type === 'condition' && !hasIncoming) {
    issues.push('未連接卡片');
  }

  if (node.type === 'any') {
    if (!hasIncoming) issues.push('未連接來源');
    const hasContent = (a = {}) =>
      a.isOverseas != null || a.channels?.length || a.categories?.length ||
      a.merchants?.length || a.currencies?.length || a.paymentMethods?.length || a.minAmountTwd ||
      a.custom?.some((c) => c.field && c.value !== '' && c.value != null);
    const filled = (d.alternatives || []).filter(hasContent);
    if (filled.length < 2) issues.push('「任一」至少需要兩個有內容的替代條件');
  }

  if (node.type === 'select') {
    if (edges.filter((e) => e.target === node.id).length < 2) {
      issues.push('「擇優」需連入兩個以上回饋(取最高)');
    }
  }

  if (node.type === 'top') {
    if (edges.filter((e) => e.target === node.id).length < 2) {
      issues.push('「取高」需連入兩個以上回饋(取當期消費最高)');
    }
  }

  if (node.type === 'reward') {
    const m = d.method || 'percentage';
    if (m === 'percentage') {
      if (d.tierMode === 'spend' || d.tierMode === 'marginal') {
        if (!d.tiers?.some((t) => t.rate != null)) issues.push('未設定任何級距比率');
      } else if (!d.rate) {
        issues.push('未設定回饋率');
      }
    }
    if (m === 'fixed' && !d.fixedAmount) issues.push('未設定固定金額');
    if (m === 'per_dollar' && !d.perDollar) issues.push('未設定每消費 N 元');
    if (!hasIncoming) issues.push('未連接來源（卡片或條件）');
  }

  if (node.type === 'limit') {
    if (!hasIncoming) issues.push('未連接回饋');
    const anyCap = (d.maxPerPeriod ?? d.maxRewardPerPeriod) || (d.maxTotal ?? d.maxRewardTotal) || (d.maxPerTxn ?? d.maxRewardPerTxn);
    if (!anyCap) issues.push('尚未設定任何上限');
  }

  if (node.type === 'gate') {
    if (!hasIncoming) issues.push('未連接來源');
    if (!d.threshold) issues.push('未設定解鎖門檻');
  }

  return issues;
}

export function graphIssueCount(nodes, edges) {
  return nodes.reduce((sum, n) => sum + nodeIssues(n, edges).length, 0);
}
