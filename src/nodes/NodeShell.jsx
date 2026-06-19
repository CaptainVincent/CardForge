import { useState, useCallback } from 'react';
import { nodeTitle, nodeAccent } from '../lib/summary';
import { nodeKind } from './registry';
import { NodeGlyph, Plus } from '../lib/icons';
import { nodeIssues } from '../lib/validate';
import { EXPECTED_TARGETS } from '../lib/connectionRules';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFlowStore } from '../store/flowStore';

// Presentational node card: icon + title + one-line summary.
// `children` are the React Flow <Handle>s (absolutely positioned by RF).
export default function NodeShell({ id, type, accent, selected, summary, children }) {
  const hasIssue = useFlowStore((s) => {
    const n = s.nodes.find((x) => x.id === id);
    return n ? nodeIssues(n, s.edges).length > 0 : false;
  });
  // ≥2 incoming edges = OR (any one path qualifies) — DNF "sum" boundary.
  const incomingCount = useFlowStore((s) => s.edges.filter((e) => e.target === id).length);
  const addConnectedNode = useFlowStore((s) => s.addConnectedNode);
  const allowed = EXPECTED_TARGETS[type] || [];
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEscapeKey(closeMenu, menuOpen); // Esc collapses the open "+" menu

  const onAddClick = (e) => {
    e.stopPropagation();
    if (allowed.length === 1) addConnectedNode(id, allowed[0]);
    else setMenuOpen((o) => !o);
  };

  return (
    <div className={`cf-node cf-node--${nodeKind(type)}${selected ? ' is-selected' : ''}`} style={{ '--accent': accent }}>
      {children}
      {incomingCount >= 2 && <span className="cf-orbadge" title="多個來源任一成立即可（OR）">任一</span>}
      <div className="cf-node__header">
        <div className="cf-node__icon"><NodeGlyph type={type} /></div>
        <div className="cf-node__title">{nodeTitle(type)}</div>
        {hasIssue && (
          <span className="ml-auto h-2 w-2 flex-none rounded-full bg-amber-400" title="尚有未完成的設定" />
        )}
      </div>
      <div className="cf-node__summary">{summary}</div>

      {allowed.length > 0 && (
        <div className="cf-append" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <button className="cf-append__btn" onClick={onAddClick} title="新增下一個節點">
            <Plus size={14} strokeWidth={2.25} />
          </button>
          {menuOpen && (
            <div className="cf-append__menu">
              {allowed.map((t) => (
                <button
                  key={t}
                  onClick={(e) => { e.stopPropagation(); addConnectedNode(id, t); setMenuOpen(false); }}
                >
                  <span className="flex" style={{ color: nodeAccent(t) }}><NodeGlyph type={t} size={14} /></span>
                  {nodeTitle(t)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
