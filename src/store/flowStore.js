import { create } from 'zustand';
import { temporal } from 'zundo';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { importFromJson } from '../lib/importJson';
import { layoutGraph } from '../lib/autoLayout';
import { DEMO_DB } from '../lib/samples';

const STORAGE_KEY = 'cardforge:graph:v1';

const defaultEdge = (params) => ({ ...params, type: 'default' });

// ID generation lives outside React so it survives re-renders.
let _idCounter = 100;
const nextId = () => ++_idCounter;

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
      customOptions: persisted?.customOptions ?? { currencies: [], channels: [], categories: [], paymentMethods: [] },

      onNodesChange: (changes) =>
        set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

      onEdgesChange: (changes) =>
        set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

      onConnect: (params) =>
        set((state) => ({ edges: addEdge(defaultEdge(params), state.edges) })),

      // Adds a node and returns its id so callers can auto-connect.
      addNode: (type, position, data = {}) => {
        const id = `${type}-${nextId()}`;
        set((state) => ({ nodes: [...state.nodes, { id, type, position, data }] }));
        return id;
      },

      connect: (params) =>
        set((state) => ({ edges: addEdge(defaultEdge(params), state.edges) })),

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

      deleteNode: (id) =>
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== id),
          edges: state.edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        })),

      duplicateNode: (id) => {
        const src = get().nodes.find((n) => n.id === id);
        if (!src) return null;
        const newId = `${src.type}-${nextId()}`;
        set((state) => ({
          nodes: [
            ...state.nodes,
            {
              ...src,
              id: newId,
              position: { x: src.position.x + 40, y: src.position.y + 40 },
              selected: false,
              data: { ...src.data },
            },
          ],
        }));
        return newId;
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

      reset: () =>
        set({ nodes: INITIAL_NODES, edges: [], selectedNodeId: null }),
    }),
    {
      // Only graph data participates in undo/redo — not selection.
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
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
