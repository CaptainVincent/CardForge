// Shared graph traversal over React Flow nodes/edges. Before this, "walk the
// graph" was hand-rolled 6–7 times (App dim/lock, store subtree, lint orphans,
// export scope, inspector "controlled"); each carried its own seen/stack/while.
// One named home for the core verbs.

// id → incoming edges (edges whose .target === id)
export function incomingMap(edges) {
  const m = new Map();
  for (const e of edges) {
    const a = m.get(e.target);
    if (a) a.push(e); else m.set(e.target, [e]);
  }
  return m;
}

// id → outgoing edges (edges whose .source === id)
export function outgoingMap(edges) {
  const m = new Map();
  for (const e of edges) {
    const a = m.get(e.source);
    if (a) a.push(e); else m.set(e.source, [e]);
  }
  return m;
}

// Every node id reachable downstream from any seed (seeds excluded unless a
// cycle leads back). O(V+E) via a precomputed outgoing map.
export function forwardReachable(seedIds, edges, outMap = outgoingMap(edges)) {
  const seen = new Set();
  const stack = [...seedIds];
  while (stack.length) {
    for (const e of outMap.get(stack.pop()) || []) {
      if (!seen.has(e.target)) { seen.add(e.target); stack.push(e.target); }
    }
  }
  return seen;
}

// Grow `seeds` by repeatedly adding any node that HAS incoming edges and whose
// incoming all originate inside the set — i.e. "reachable only through already-
// included nodes". Used for "the cap/limit fed solely by a dimmed/locked path".
export function closeUnderAllIncoming(seeds, nodes, edges, inMap = incomingMap(edges)) {
  const out = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (out.has(n.id)) continue;
      const inc = inMap.get(n.id);
      if (inc && inc.length && inc.every((e) => out.has(e.source))) { out.add(n.id); changed = true; }
    }
  }
  return out;
}

// Ancestor nodes whose type is in `collect`, walking backwards from startId.
// `passThrough` types are traversed but not collected. A fresh `seen` per branch
// keeps sibling paths independent (an ancestor reachable via two routes counts
// once per route, matching the previous hand-rolled behaviour). byId: Map.
export function ancestorsByType(startId, collect, passThrough, byId, inMap, seen = new Set()) {
  if (seen.has(startId)) return [];
  seen.add(startId);
  const found = [];
  for (const e of inMap.get(startId) || []) {
    const p = byId.get(e.source);
    if (!p) continue;
    if (collect.has(p.type)) {
      found.push(p, ...ancestorsByType(p.id, collect, passThrough, byId, inMap, new Set(seen)));
    } else if (passThrough.has(p.type)) {
      found.push(...ancestorsByType(p.id, collect, passThrough, byId, inMap, new Set(seen)));
    }
  }
  return found;
}
