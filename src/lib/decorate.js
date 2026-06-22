import { forwardReachable, closeUnderAllIncoming } from './graph.js';

// Nodes on an INACTIVE path — useless in the default scenario, so the canvas
// renders them uniformly dimmed (one concept, one visual). A path is inactive
// when its reward is disabled (is_active:false) OR gated by an eligibility flag
// that is not 符合 by default (未符合/未選 → the engine skips it by default),
// plus everything reachable only through such nodes (e.g. their 上限/擇一).
// This mirrors what the engine actually does, so "looks dead" ⇔ "earns nothing".
export function inactiveNodeIds(nodes, edges) {
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const disabledRewards = nodes.filter((n) => n.type === 'reward' && n.data?.isActive === false).map((n) => n.id);
  const notMetFlags = nodes.filter((n) => n.type === 'eligibility' && n.data?.default !== true).map((n) => n.id);
  const gatedRewards = notMetFlags.length
    ? [...forwardReachable(notMetFlags, edges)].filter((id) => typeOf.get(id) === 'reward')
    : [];
  return closeUnderAllIncoming([...disabledRewards, ...gatedRewards], nodes, edges);
}
