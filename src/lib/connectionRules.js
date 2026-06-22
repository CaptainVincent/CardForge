// Connection policy (single source of truth):
//  - EXPECTED_TARGETS / isExpected: the sensible role graph. This is now ALSO
//    the hard rule — isValidConnection rejects anything not expected, so the UI
//    cancels illogical drags outright (not just warns). edgeIssue supplies the
//    reason shown when a drag is rejected, and powers the lint for any
//    illogical edges that slip in via import/legacy graphs.
import { NODE_TYPES, nodeTitle, nodeRole, PATH_TARGETS, SINK_TARGETS } from '../nodes/registry';

// The sensible role graph, DERIVED from each type's role (registry single source):
//  source / path / constraint → may point at any path-like or a reward (PATH_TARGETS)
//  reward                     → may point at its constraints (SINK_TARGETS: 上限/擇優)
//  sink                       → terminal, points at nothing
// Adding a node of a known role needs no edit here.
const targetsForRole = (role) => {
  if (role === 'source' || role === 'path' || role === 'constraint') return PATH_TARGETS;
  if (role === 'reward') return SINK_TARGETS;
  return [];
};
export const EXPECTED_TARGETS = Object.fromEntries(
  Object.keys(NODE_TYPES).map((type) => [type, targetsForRole(nodeRole(type))])
);

export const isExpected = (s, t) => !!EXPECTED_TARGETS[s]?.includes(t);

// Why an edge is illogical (null if it's fine). Used by lint + rejection toast.
export function edgeIssue(s, t) {
  if (!s || !t || isExpected(s, t)) return null;
  if (t === 'card') return '卡片不能有輸入';
  if (t === 'limit') return '「上限」只能接在「回饋」之後';
  if (t === 'select') return '「擇一」只能由「回饋」連入（擇優/自選一條）';
  if (s === 'reward' && (t === 'condition' || t === 'gate')) return '「回饋」之後不應再接條件/門檻';
  if (s === 'reward' && t === 'reward') return '回饋不應串接回饋（疊加請各自連到卡片）';
  if (!NODE_TYPES[s]?.hasSource) return `「${nodeTitle(s)}」是終點,不能再往外接`;
  return `「${nodeTitle(s)}」不該接到「${nodeTitle(t)}」`;
}

// Strict: only semantically-sensible edges are allowed. React Flow calls this
// during a drag; returning false makes it refuse to create the edge.
export function makeIsValidConnection(getNodeType) {
  return (conn) => {
    if (conn.source === conn.target) return false; // no self-loops
    return isExpected(getNodeType(conn.source), getNodeType(conn.target));
  };
}
