import { create } from 'zustand';
import { temporal } from 'zundo';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { importFromJson } from '../lib/importJson';
import { layoutGraph } from '../lib/autoLayout';
import { isExpected } from '../lib/connectionRules';
import { DEMO_DB } from '../lib/samples';

const STORAGE_KEY = 'cardforge:graph:v1';

const defaultEdge = (params) => ({ ...params, type: 'default' });

// ID generation lives outside React so it survives re-renders.
let _idCounter = 100;
const nextId = () => ++_idCounter;

// A node + its downstream subtree (snapshotted), and a cloner with fresh ids.
// Shared by duplicate (in-place) and copy/paste (cross-card).
function subtreeOf(nodes, edges, rootId) {
  const keep = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of edges) if (e.source === cur && !keep.has(e.target)) { keep.add(e.target); stack.push(e.target); }
  }
  return {
    subNodes: nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n, data: { ...n.data } })),
    subEdges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)).map((e) => ({ ...e })),
  };
}
// Reward node ids feeding a 擇優 node (its candidate members).
function selectMemberIds(nodes, edges, selectId) {
  return new Set(
    edges
      .filter((e) => e.target === selectId)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n) => n?.type === 'reward')
      .map((n) => n.id)
  );
}
// Bounding box of a node set (positions + measured/estimated sizes).
function bboxOf(nodes) {
  let minX = Infinity; let minY = Infinity; let maxR = -Infinity; let maxB = -Infinity;
  for (const n of nodes) {
    const w = n.measured?.width ?? n.width ?? 200;
    const h = n.measured?.height ?? n.height ?? 88;
    minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
    maxR = Math.max(maxR, n.position.x + w); maxB = Math.max(maxB, n.position.y + h);
  }
  return { minX, minY, width: maxR - minX, height: maxB - minY };
}
function cloneSubtree(subNodes, subEdges, rootId, dx, dy) {
  const idMap = new Map();
  const newNodes = subNodes.map((n) => {
    const nid = `${n.type}-${nextId()}`;
    idMap.set(n.id, nid);
    return { ...n, id: nid, position: { x: n.position.x + dx, y: n.position.y + dy }, selected: n.id === rootId, data: { ...n.data } };
  });
  const newEdges = subEdges.map((e) => {
    const s = idMap.get(e.source); const t = idMap.get(e.target);
    return { ...e, id: `e-${s}-${t}`, source: s, target: t, selected: false };
  });
  return { newNodes, newEdges, newRootId: idMap.get(rootId) };
}

const INITIAL_NODES = [
  {
    id: 'card-1',
    type: 'card',
    position: { x: 80, y: 240 },
    data: { cardName: '', account: '' },
  },
];

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.nodes?.length) return null;
    // Keep the id counter ahead of any persisted numeric suffix to avoid collisions.
    for (const n of parsed.nodes) {
      const m = /-(\d+)$/.exec(n.id);
      if (m) _idCounter = Math.max(_idCounter, Number(m[1]));
    }
    return parsed;
  } catch {
    return null;
  }
}

const persisted = loadPersisted();

// First visit (no saved canvas) → seed the demo so the page isn't empty.
// Clearing the canvas (reset) persists a blank card, so the demo won't return.
function seedDemo() {
  try {
    const g = importFromJson(DEMO_DB);
    if (g.nodes.length) return { nodes: layoutGraph(g.nodes, g.edges), edges: g.edges };
  } catch { /* fall through */ }
  return { nodes: INITIAL_NODES, edges: [] };
}
const seed = persisted ?? seedDemo();

export const useFlowStore = create(
  temporal(
    (set, get) => ({
      nodes: seed.nodes ?? INITIAL_NODES,
      edges: seed.edges ?? [],
      selectedNodeId: null,
      // User-defined option extensions for condition chip fields, remembered
      // globally so a custom 悠遊付/PayPay is reusable across every node.
      customOptions: persisted?.customOptions ?? { currencies: [], channels: [], categories: [], merchants: [], paymentMethods: [] },
      clipboard: null, // in-memory copy/paste buffer (transient: not persisted, not undone)

      onNodesChange: (changes) =>
        set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

      onEdgesChange: (changes) =>
        set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

      // Add an edge from a {source,target[,handles]} connection. Exposed under
      // two names kept for call-site clarity (React Flow's onConnect handler vs
      // imperative connect()); identical behaviour.
      onConnect: (params) =>
        set((state) => ({ edges: addEdge(defaultEdge(params), state.edges) })),

      // Adds a node and returns its id so callers can auto-connect.
      addNode: (type, position, data = {}) => {
        const id = `${type}-${nextId()}`;
        set((state) => ({ nodes: [...state.nodes, { id, type, position, data }] }));
        return id;
      },

      connect: (params) => get().onConnect(params),

      // Append a new node already connected to `sourceId`, positioned to its
      // right, and select it — the Dify/n8n "click +" flow.
      addConnectedNode: (sourceId, type) => {
        const state = get();
        const src = state.nodes.find((n) => n.id === sourceId);
        const childCount = state.edges.filter((e) => e.source === sourceId).length;
        const position = src
          ? { x: src.position.x + 280, y: src.position.y + childCount * 132 }
          : { x: 400, y: 200 };
        const id = `${type}-${nextId()}`;
        set((s) => ({
          // Mark the new node selected (and deselect others) so React Flow's
          // own selection — which Delete/Backspace act on — stays in sync.
          nodes: [
            ...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            { id, type, position, data: {}, selected: true },
          ],
          edges: addEdge(defaultEdge({ source: sourceId, target: id }), s.edges),
          selectedNodeId: id,
        }));
        return id;
      },

      updateNodeData: (id, patch) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
          ),
        })),

      // 擇優節點的不變式守門人(取代 UI 直接突變成員 isActive)。
      // best=全部納入比較;pick=全部停用,等使用者擇一。
      setSelectMode: (selectId, mode) =>
        set((state) => {
          const memberIds = selectMemberIds(state.nodes, state.edges, selectId);
          return {
            nodes: state.nodes.map((n) => {
              if (n.id === selectId) return { ...n, data: { ...n.data, mode } };
              if (memberIds.has(n.id)) return { ...n, data: { ...n.data, isActive: mode === 'best' } };
              return n;
            }),
          };
        }),

      // pick:採用 memberId 那條(設為唯一 active),其餘停用。
      pickSelectMember: (selectId, memberId) =>
        set((state) => {
          const memberIds = selectMemberIds(state.nodes, state.edges, selectId);
          return {
            nodes: state.nodes.map((n) =>
              memberIds.has(n.id) ? { ...n, data: { ...n.data, isActive: n.id === memberId } } : n
            ),
          };
        }),

      deleteNode: (id) =>
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== id),
          edges: state.edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        })),

      // Duplicate a node + its downstream subtree in place (offset, selected).
      duplicateNode: (id) => {
        const { nodes, edges } = get();
        if (!nodes.some((n) => n.id === id)) return null;
        const { subNodes, subEdges } = subtreeOf(nodes, edges, id);
        // Drop the copy directly BELOW the source subtree (offset by its own
        // height) so it never overlaps the original — no global re-layout.
        const { newNodes, newEdges, newRootId } = cloneSubtree(subNodes, subEdges, id, 0, bboxOf(subNodes).height + 40);
        set((state) => ({
          nodes: [...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes],
          edges: [...state.edges, ...newEdges],
          selectedNodeId: newRootId,
        }));
        return newRootId;
      },

      // Snapshot a node + subtree to an in-memory clipboard (not persisted).
      copySubtree: (id) => {
        const { nodes, edges } = get();
        if (!nodes.some((n) => n.id === id)) return 0;
        const { subNodes, subEdges } = subtreeOf(nodes, edges, id);
        set({ clipboard: { subNodes, subEdges, rootId: id } });
        return subNodes.length;
      },

      // Paste the clipboard. If `targetId` is a node the pasted root may legally
      // attach to (e.g. another card), connect them; otherwise it floats free.
      pasteClipboard: (targetId) => {
        const { clipboard, nodes } = get();
        if (!clipboard) return null;
        const root = clipboard.subNodes.find((n) => n.id === clipboard.rootId);
        const target = targetId && nodes.find((n) => n.id === targetId);
        const willConnect = !!(target && root && isExpected(target.type, root.type));
        // Connected → land the pasted root to the RIGHT of the target (LR flow);
        // otherwise drop it below the copied block. Either way: clean, no overlap.
        let dx; let dy;
        if (willConnect) {
          const tw = target.measured?.width ?? target.width ?? 200;
          dx = (target.position.x + tw + 60) - root.position.x;
          dy = target.position.y - root.position.y;
        } else {
          dx = 0; dy = bboxOf(clipboard.subNodes).height + 40;
        }
        const { newNodes, newEdges, newRootId } = cloneSubtree(clipboard.subNodes, clipboard.subEdges, clipboard.rootId, dx, dy);
        const extra = willConnect ? [defaultEdge({ id: `e-${targetId}-${newRootId}`, source: targetId, target: newRootId })] : [];
        set((state) => ({
          nodes: [...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes],
          edges: [...state.edges, ...newEdges, ...extra],
          selectedNodeId: newRootId,
        }));
        return newRootId;
      },

      setNodes: (nodes) => set({ nodes }),

      addCustomOption: (field, label) =>
        set((s) => {
          const value = String(label).trim();
          if (!value) return {};
          const list = s.customOptions[field] || [];
          if (list.some((o) => o.value === value)) return {};
          return { customOptions: { ...s.customOptions, [field]: [...list, { value, label: value }] } };
        }),

      setSelected: (id) => set({ selectedNodeId: id }),

      importGraph: (nodes, edges) => set({ nodes, edges, selectedNodeId: null }),

      // Merge an imported subgraph INTO the current canvas (vs replace). Re-ids
      // every incoming node (imported ids restart at node_1 each call → would
      // collide), remaps edges, and drops the block below the existing graph.
      appendGraph: (newNodes, newEdges) =>
        set((state) => {
          const cur = state.nodes;
          const curMaxY = cur.length ? Math.max(...cur.map((n) => n.position.y)) : 0;
          const newMinY = newNodes.length ? Math.min(...newNodes.map((n) => n.position.y)) : 0;
          const dy = cur.length ? curMaxY - newMinY + 220 : 0;
          const idMap = {};
          for (const n of newNodes) idMap[n.id] = `${n.type}-${nextId()}`;
          const remap = newNodes.map((n) => ({
            ...n,
            id: idMap[n.id],
            position: { x: n.position.x, y: n.position.y + dy },
            selected: false,
          }));
          const remapEdges = newEdges.map((e) => ({
            ...e,
            id: `e-${idMap[e.source]}-${idMap[e.target]}`,
            source: idMap[e.source],
            target: idMap[e.target],
          }));
          return {
            nodes: [...cur.map((n) => (n.selected ? { ...n, selected: false } : n)), ...remap],
            edges: [...state.edges, ...remapEdges],
            selectedNodeId: null,
          };
        }),

      reset: () =>
        set({ nodes: INITIAL_NODES, edges: [], selectedNodeId: null }),
    }),
    {
      // Only graph data participates in undo/redo — not selection.
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges, customOptions: state.customOptions }),
      limit: 100,
      equality: (a, b) => a.nodes === b.nodes && a.edges === b.edges,
      // Leading-edge throttle: capture the pre-burst snapshot once, then
      // collapse rapid follow-ups (drag, typing) into a single undo step.
      handleSet: (handleSet) => {
        let timer = null;
        return (...args) => {
          if (timer === null) handleSet(...args);
          clearTimeout(timer);
          timer = setTimeout(() => { timer = null; }, 400);
        };
      },
    }
  )
);

// Debounced persistence to localStorage.
let saveTimer = null;
useFlowStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ nodes: state.nodes, edges: state.edges, customOptions: state.customOptions })
      );
    } catch {
      // ignore quota / serialization errors
    }
  }, 400);
});

// Convenience hooks for undo/redo (wired to shortcuts in Stage 2).
export const useTemporalStore = useFlowStore.temporal;
