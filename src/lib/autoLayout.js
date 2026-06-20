import dagre from '@dagrejs/dagre';
import { nodeKind } from '../nodes/registry';

// Fallback sizes per kind when the node hasn't been measured yet (e.g. right
// after import, before first render). Terminals are larger than operators.
const FALLBACK = { terminal: { w: 210, h: 88 }, operator: { w: 188, h: 64 } };

// Use React Flow's measured size when available (accurate → no overlap), else a
// kind-based estimate. This is what makes dagre reserve the right space.
const sizeOf = (n) => {
  const fb = FALLBACK[nodeKind(n.type)] || FALLBACK.operator;
  return {
    w: n.measured?.width ?? n.width ?? fb.w,
    h: n.measured?.height ?? n.height ?? fb.h,
  };
};

// Layered left-to-right layout for the card → condition → reward → limit chain.
export function layoutGraph(nodes, edges, direction = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 44, ranksep: 110, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => { const { w, h } = sizeOf(n); g.setNode(n.id, { width: w, height: h }); });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    const { w, h } = sizeOf(n);
    return { ...n, position: { x: p.x - w / 2, y: p.y - h / 2 } };
  });
}
