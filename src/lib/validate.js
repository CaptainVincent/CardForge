// Per-node completeness/connection checks surfaced in the Inspector and on cards.
// Returns [{ message, severity }]:
//   'error'   — structurally incomplete / would never work (must fix).
//   'pending' — a choice left to the user (資格符合與否、擇一選法). Valid to leave
//               unset on a shipped/template card; the engine handles it. The
//               editor still flags it (黃點) so the user knows to decide.
export function nodeIssues(node, edges, nodes = []) {
  if (!node) return [];
  const d = node.data || {};
  const issues = [];
  const E = (message) => issues.push({ message, severity: 'error' });
  const P = (message) => issues.push({ message, severity: 'pending' });
  const hasIncoming = edges.some((e) => e.target === node.id);

  if (node.type === 'card') {
    if (!d.cardName?.trim()) E('未填卡片名稱');
  }

  if (node.type === 'condition' && !hasIncoming) {
    E('未連接卡片');
  }

  if (node.type === 'any') {
    if (d.alternatives?.length) {
      // 舊模型:內部替代(相容)。
      const hasContent = (a = {}) =>
        a.isOverseas != null || a.channels?.length || a.categories?.length ||
        a.merchants?.length || a.currencies?.length || a.paymentMethods?.length || a.minAmountTwd ||
        a.custom?.some((c) => c.field && c.value !== '' && c.value != null);
      if (d.alternatives.filter(hasContent).length < 2) E('「任一」至少需要兩個有內容的替代條件');
    } else {
      // 閘模型:替代 = 連入的配對條件,需 ≥2 個。
      if (edges.filter((e) => e.target === node.id).length < 2) E('「任一」需連入兩個以上配對條件(任一成立即可)');
    }
  }

  if (node.type === 'select') {
    const incoming = edges.filter((e) => e.target === node.id);
    if (incoming.length < 2) {
      E('「擇一」需連入兩個以上回饋');
    } else if (d.mode == null) {
      P('尚未選擇選法(擇優/自選)');
    } else if (d.mode === 'pick') {
      const members = incoming.map((e) => nodes.find((n) => n.id === e.source)).filter(Boolean);
      const active = members.filter((m) => m.data?.isActive === true);
      if (active.length !== 1) P('自選:尚未選擇採用哪一條(需剛好一條)');
    }
  }

  if (node.type === 'top') {
    if (edges.filter((e) => e.target === node.id).length < 2) {
      E('「取高」需連入兩個以上回饋(取當期消費最高)');
    }
  }

  if (node.type === 'reward') {
    const m = d.method || 'percentage';
    if (m === 'percentage') {
      if (d.tierMode === 'spend' || d.tierMode === 'marginal' || d.tierMode === 'distinct_count') {
        if (!d.tiers?.some((t) => t.rate != null)) E('未設定任何級距比率');
      } else if (!d.rate) {
        E('未設定回饋率');
      }
    }
    if (m === 'fixed' && !d.fixedAmount) E('未設定固定金額');
    if (m === 'per_dollar' && !d.perDollar) E('未設定每消費 N 元');
    if (!hasIncoming) E('未連接來源（卡片或條件）');
    // 檔期日期反轉
    if (d.startDate && d.endDate && d.startDate > d.endDate) E('活動起始日晚於截止日');
    if (d.fromOpeningDays != null && d.fromOpeningDays <= 0) E('首刷期限天數需大於 0');
    // 級距門檻需由小到大遞增(否則引擎取級距會錯亂)
    if ((d.tierMode === 'spend' || d.tierMode === 'marginal' || d.tierMode === 'distinct_count') && d.tiers?.length) {
      const mins = d.tiers.map((t) => t.minSpend).filter((v) => v != null);
      if (mins.some((v, i) => i > 0 && v <= mins[i - 1])) E('級距門檻未由小到大遞增');
    }
  }

  if (node.type === 'limit') {
    if (!hasIncoming) E('未連接回饋');
    const vals = [d.maxPerTxn, d.maxPerPeriod, d.maxTotal, d.maxRewardPerTxn, d.maxRewardPerPeriod, d.maxRewardTotal];
    const anyCap = vals.some((v) => v != null && v !== '');
    if (!anyCap) E('尚未設定任何上限');
    else if (vals.some((v) => v != null && v !== '' && Number(v) <= 0)) E('上限金額需大於 0');
  }

  if (node.type === 'gate') {
    if (!hasIncoming) E('未連接來源');
    if (!d.threshold) E('未設定解鎖門檻');
  }

  if (node.type === 'eligibility') {
    if (!hasIncoming) E('未連接來源');
    if (!d.name?.trim()) E('未命名資格（如:新戶、活動登錄）');
    if (d.default == null) P('尚未選擇預設狀態(符合/未符合)');
    const hasDownstream = edges.some((e) => e.source === node.id);
    if (!hasDownstream) E('未連接要控制的回饋');
  }

  return issues;
}

export function graphIssueCount(nodes, edges) {
  return nodes.reduce((sum, n) => sum + nodeIssues(n, edges, nodes).length, 0);
}
