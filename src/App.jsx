import { useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import {
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  MiniMap,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Toaster, toast } from 'sonner';
import { Network, List } from 'lucide-react';

import { nodeTypes } from './nodes';
import { nodeAccent, NODE_MENU } from './nodes/registry';
import Inspector from './inspector/Inspector';
import Toolbar from './components/Toolbar';
import DropMenu from './components/DropMenu';
import DeletableEdge from './components/DeletableEdge';

const edgeTypes = { default: DeletableEdge };

// The React Flow node id under a screen point (the node sits behind the
// connection-line overlay mid-drag), or null. Used to hit-test connection drops.
function nodeIdAtPoint(x, y) {
  if (x == null || y == null) return null;
  const el = document.elementsFromPoint(x, y).find((e) => e.classList?.contains('react-flow__node'));
  return el?.getAttribute('data-id') || null;
}

import LintPanel from './components/LintPanel';
import RuleListView from './components/RuleListView';
import ConfirmDialog from './components/ConfirmDialog';
// Modals are opened on demand → lazy-load so their code (incl. the simulate /
// recommend engine pulled in by AnalyzePanel) stays off the first paint.
const PreviewModal = lazy(() => import('./components/PreviewModal'));
const ImportModal = lazy(() => import('./components/ImportModal'));
const AnalyzePanel = lazy(() => import('./components/AnalyzePanel'));
const BuiltinCards = lazy(() => import('./components/BuiltinCards'));
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFlowStore, useTemporalStore } from './store/flowStore';
import { useSettings } from './store/settings';
import { makeIsValidConnection, EXPECTED_TARGETS, isExpected, edgeIssue } from './lib/connectionRules';
import { lintGraph, lintSummary } from './lib/lint';
import { layoutGraph } from './lib/autoLayout';
import { graphIssueCount, nodeIssues } from './lib/validate';
import { exportToJson, downloadJson } from './lib/exportJson';
import { importFromJson } from './lib/importJson';
import { inactiveNodeIds } from './lib/decorate.js';
import { NodeBadgeContext } from './nodes/NodeBadgeContext';

function FlowEditor() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const storeOnConnect = useFlowStore((s) => s.onConnect);
  const addNodeStore = useFlowStore((s) => s.addNode);
  const connectStore = useFlowStore((s) => s.connect);
  const importGraph = useFlowStore((s) => s.importGraph);
  const appendGraph = useFlowStore((s) => s.appendGraph);
  const setSelected = useFlowStore((s) => s.setSelected);
  const duplicateNode = useFlowStore((s) => s.duplicateNode);
  const copySubtree = useFlowStore((s) => s.copySubtree);
  const pasteClipboard = useFlowStore((s) => s.pasteClipboard);
  const addConnectedNode = useFlowStore((s) => s.addConnectedNode);
  const setNodes = useFlowStore((s) => s.setNodes);
  const reset = useFlowStore((s) => s.reset);

  const connectingFrom = useRef(null);
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow();
  const { theme, isDark, toggle: toggleTheme } = useTheme();

  const [view, setView] = useState('graph'); // 'graph' 節點圖編輯 | 'list' 條列閱讀
  const [dropMenu, setDropMenu] = useState(null);
  const [previewJson, setPreviewJson] = useState(null);
  const [showTest, setShowTest] = useState(false);
  const [showLint, setShowLint] = useState(false);
  const [showBuiltin, setShowBuiltin] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [flaggedIds, setFlaggedIds] = useState(() => new Set());
  const flagTimer = useRef(null);

  const pointPrograms = useSettings((s) => s.pointPrograms);

  // Structure/data signature that EXCLUDES position (node.data has no position).
  // Heavy derived state (lint+export, dim/lock, badges) keys off this so dragging
  // a node — which only changes position — reuses the cached result instead of
  // re-running. Cheaper to build (one O(N) stringify) than the work it guards.
  const structureKey = useMemo(
    () => JSON.stringify(nodes.map((n) => [n.id, n.type, n.data])) + '|' + edges.map((e) => `${e.source}>${e.target}`).join(','),
    [nodes, edges]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- structureKey captures the relevant slice of nodes/edges
  const issues = useMemo(() => lintGraph(nodes, edges, pointPrograms), [structureKey, pointPrograms]);
  const lint = lintSummary(issues);

  // Per-node badges (issue dot + incoming count) — computed once, shared via
  // context, so each NodeShell no longer runs its own O(N) store selector.
  const nodeBadges = useMemo(() => {
    const inc = new Map();
    for (const e of edges) inc.set(e.target, (inc.get(e.target) || 0) + 1);
    const m = new Map();
    for (const n of nodes) m.set(n.id, { hasIssue: nodeIssues(n, edges, nodes).length > 0, incomingCount: inc.get(n.id) || 0 });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by structureKey
  }, [structureKey]);

  // Jump to a lint issue. An issue carries the nodes that introduced it
  // (relatedIds) and optionally a distinct fix node (nodeId) — these can live
  // apart (e.g. a card-level field vs the limits that reference it), or there may
  // be no single fix node at all (e.g. a contradiction spread across conditions).
  // We open the Inspector on the fix node (or the first related node), frame the
  // WHOLE set together, and transiently ring them all (warn colour, ~2.6s) so
  // "where it's caused ↔ where to fix" is visible at once. Single-node issues
  // degrade to a plain center.
  const focusIssue = useCallback((issue) => {
    const cur = useFlowStore.getState().nodes;
    const has = (id) => id != null && cur.some((x) => x.id === id);
    const related = (issue?.relatedIds || []).filter(has);
    const fixId = has(issue?.nodeId) ? issue.nodeId : related[0];
    if (!fixId) return;
    const fix = cur.find((x) => x.id === fixId);
    const involved = [...new Set([fixId, ...related])];
    setSelected(fixId);
    setNodes(cur.map((x) => (x.selected === (x.id === fixId) ? x : { ...x, selected: x.id === fixId })));
    if (involved.length > 1) {
      fitView({ nodes: involved.map((id) => ({ id })), padding: 0.4, duration: 450, maxZoom: 1.1 });
    } else {
      setCenter(fix.position.x + 100, fix.position.y + 40, { zoom: 1.1, duration: 400 });
    }
    if (flagTimer.current) clearTimeout(flagTimer.current);
    setFlaggedIds(new Set(involved));
    flagTimer.current = setTimeout(() => setFlaggedIds(new Set()), 2600);
    setShowLint(false);
  }, [setSelected, setNodes, setCenter, fitView]);

  const nodeTypeById = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n.type]));
    return (id) => map.get(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- types/topology only (structureKey), not position
  }, [structureKey]);
  const isValidConnection = useMemo(() => makeIsValidConnection(nodeTypeById), [nodeTypeById]);

  // Label condition→condition edges with 且 (AND) so the implicit DNF reads clearly.
  const labeledEdges = useMemo(
    () => edges.map((e) =>
      nodeTypeById(e.source) === 'condition' && nodeTypeById(e.target) === 'condition'
        ? { ...e, label: '且' }
        : e
    ),
    [edges, nodeTypeById]
  );

  // Inactive (useless) paths — ONE concept, ONE visual: a reward that earns
  // nothing by default (disabled, or gated by a not-符合 資格) and everything
  // reachable only through it. Mirrors the engine's skip logic.
  const inactiveIds = useMemo(
    () => inactiveNodeIds(nodes, edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by structureKey (ids stable across drag)
    [structureKey]
  );

  const displayNodes = useMemo(() => {
    if (!inactiveIds.size && !flaggedIds.size) return nodes;
    return nodes.map((n) => {
      let cls = n.className || '';
      if (inactiveIds.has(n.id)) cls = `${cls} cf-node-dimmed`.trim();
      if (flaggedIds.has(n.id)) cls = `${cls} cf-node-flagged`.trim();
      return cls === (n.className || '') ? n : { ...n, className: cls };
    });
  }, [nodes, inactiveIds, flaggedIds]);

  const onConnect = useCallback((params) => {
    connectingFrom.current = null;
    storeOnConnect(params);
    setDropMenu(null);
  }, [storeOnConnect]);

  const onConnectStart = useCallback((_event, params) => {
    connectingFrom.current = params;
  }, []);

  const onConnectEnd = useCallback((event, conn) => {
    const fromId = connectingFrom.current?.nodeId;
    const sourceType = nodeTypeById(fromId) || conn?.fromNode?.type;
    const point = event?.changedTouches?.[0] || event;
    const { clientX, clientY } = point || {};

    // Released over an existing node? React Flow reports invalid drops the same
    // as empty drops, so hit-test the pointer (the node sits behind the
    // connection-line overlay). A valid edge was already made by onConnect; an
    // unexpected target means the connection was cancelled — explain why.
    const targetId = nodeIdAtPoint(clientX, clientY);
    if (targetId && targetId !== fromId) {
      const targetType = nodeTypeById(targetId);
      if (sourceType && targetType && !isExpected(sourceType, targetType)) {
        const reason = edgeIssue(sourceType, targetType);
        if (reason) toast.error(reason);
      }
      connectingFrom.current = null;
      return;
    }

    // Dropped on empty canvas → offer the sensible next nodes.
    if (clientX == null && clientY == null) return;
    const allowed = sourceType ? EXPECTED_TARGETS[sourceType] ?? [] : NODE_MENU.map((m) => m.type);
    if (allowed.length === 0) { connectingFrom.current = null; return; }
    try {
      const pos = screenToFlowPosition({ x: clientX, y: clientY });
      setDropMenu({ flowX: pos.x, flowY: pos.y, screenX: clientX, screenY: clientY, allowed });
    } catch { /* not mounted */ }
  }, [screenToFlowPosition, nodeTypeById]);

  const onSelectionChange = useCallback(({ nodes: selected }) => {
    setSelected(selected?.[0]?.id ?? null);
  }, [setSelected]);

  const pickFromDropMenu = (type) => {
    const newId = addNodeStore(type, { x: dropMenu.flowX, y: dropMenu.flowY });
    if (connectingFrom.current) {
      connectStore({ source: connectingFrom.current.nodeId, sourceHandle: connectingFrom.current.handleId, target: newId });
    }
    connectingFrom.current = null;
    setDropMenu(null);
  };

  const addNode = (type) => {
    const { selectedNodeId, nodes: cur } = useFlowStore.getState();
    // Cards are roots — drop them in a left-hand column, never auto-connected.
    if (type === 'card') {
      const cardCount = cur.filter((n) => n.type === 'card').length;
      return addNodeStore('card', { x: 80, y: 120 + cardCount * 320 });
    }
    // Append to a compatible selected node (no orphans); else drop at a spread position.
    const sel = cur.find((n) => n.id === selectedNodeId);
    if (sel && isExpected(sel.type, type)) return addConnectedNode(selectedNodeId, type);
    const count = cur.filter((n) => n.type === type).length;
    addNodeStore(type, { x: 420, y: 120 + count * 200 });
  };

  const handleExport = useCallback(() => {
    const { nodes: n, edges: e } = useFlowStore.getState();
    const json = exportToJson(n, e, { pointPrograms: useSettings.getState().pointPrograms });
    if (!json) return toast.error('請先建立卡片節點');
    const filename = (json.cards.length === 1 ? json.cards[0].card : 'cardforge').toLowerCase().replace(/\s+/g, '_') + '.json';
    downloadJson(json, filename);
    const issues = graphIssueCount(n, e);
    toast[issues > 0 ? 'warning' : 'success'](issues > 0 ? `已匯出 ${json.cards.length} 張卡（${issues} 項提醒）` : `已匯出 ${json.cards.length} 張卡`);
  }, []);

  const handleLayout = useCallback(() => {
    const { nodes: n, edges: e } = useFlowStore.getState();
    setNodes(layoutGraph(n, e));
    setTimeout(() => fitView({ duration: 300 }), 60);
    toast.success('已自動排版');
  }, [setNodes, fitView]);

  // Single import path: every source (file / paste / url / sample) parses to a
  // db object then flows through here. `append` merges into the current canvas
  // (placed below); otherwise it replaces the canvas.
  const applyDb = useCallback((db, { append = false, successMsg } = {}) => {
    const { nodes: nn, edges: ee, pointPrograms } = importFromJson(db);
    const laid = layoutGraph(nn, ee);
    if (append) appendGraph(laid, ee); else importGraph(laid, ee);
    useSettings.getState().mergePointPrograms(pointPrograms);
    setTimeout(() => fitView({ duration: 300 }), 60);
    toast.success(successMsg ?? `已${append ? '加入' : '匯入'} ${nn.length} 個節點`);
  }, [importGraph, appendGraph, fitView]);

  // Multiple sources (files / urls / paste) → parse each → merge cards +
  // point_programs into one db → one import (replace or append).
  const handleImportTexts = useCallback((texts, { append = false } = {}) => {
    try {
      const cards = [];
      const point_programs = {};
      for (const t of texts) {
        const db = JSON.parse(t);
        if (Array.isArray(db.cards)) cards.push(...db.cards);
        else if (db.card || db.rules) cards.push(db);
        Object.assign(point_programs, db.point_programs || {});
      }
      if (!cards.length) throw new Error('找不到任何卡片');
      applyDb({ cards, point_programs }, { append, successMsg: `已${append ? '加入' : '匯入'} ${cards.length} 張卡` });
      setShowImport(false);
    } catch (err) {
      toast.error('匯入失敗：' + err.message);
    }
  }, [applyDb]);

  // 內建卡片:加入 = 直接疊到畫布;取代 = 有內容先詢問(同範例載入的防呆)。
  const handleImportBuiltin = useCallback((db, { append = false } = {}) => {
    const doIt = () => {
      applyDb(db, { append, successMsg: `已${append ? '加入' : '匯入'} ${db.cards?.length ?? 1} 張內建卡` });
      setShowBuiltin(false);
    };
    if (append) return doIt();
    const { nodes: n, edges: e } = useFlowStore.getState();
    const hasWork = e.length > 0 || n.length > 1 || n[0]?.data?.cardName;
    if (!hasWork) return doIt();
    setConfirmDialog({ title: '匯入內建卡片', body: '「取代」會清空目前畫布內容（可用 ⌘Z 復原）。', confirmLabel: '取代', danger: true, onConfirm: doIt });
  }, [applyDb]);

  const handleReset = useCallback(() => {
    setConfirmDialog({
      title: '清空畫布',
      body: '僅保留一張空白卡片（可用 ⌘Z 復原）。',
      confirmLabel: '清空',
      danger: true,
      onConfirm: () => { reset(); toast.success('已重設畫布'); },
    });
  }, [reset]);

  const handlePreview = useCallback(() => {
    const { nodes: n, edges: e } = useFlowStore.getState();
    const json = exportToJson(n, e, { pointPrograms: useSettings.getState().pointPrograms });
    if (!json) return toast.error('請先建立卡片節點');
    setPreviewJson(JSON.stringify(json, null, 2));
  }, []);

  const duplicateSelected = useCallback(() => {
    const id = useFlowStore.getState().selectedNodeId;
    if (id) duplicateNode(id);
  }, [duplicateNode]);
  const handleCopy = useCallback((id) => {
    const n = copySubtree(id);
    if (n) toast.success(`已複製 ${n} 個節點（含子樹）`);
  }, [copySubtree]);
  const handlePaste = useCallback((targetId) => {
    const root = pasteClipboard(targetId);
    if (root) { toast.success('已貼上'); setTimeout(() => fitView({ duration: 300 }), 60); }
    else toast('剪貼簿是空的，先按 ⌘C 複製一個節點');
  }, [pasteClipboard, fitView]);
  useKeyboardShortcuts({ onDuplicate: duplicateNode, onCopy: handleCopy, onPaste: handlePaste });

  return (
    <div className="flex h-dvh flex-col bg-[var(--cf-canvas)]">
      <Toolbar
        nodeCount={nodes.length}
        lintErrors={lint.errors}
        lintWarnings={lint.warnings}
        onLint={() => setShowLint(true)}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onAddNode={addNode}
        onUndo={() => useTemporalStore.getState().undo()}
        onRedo={() => useTemporalStore.getState().redo()}
        onLayout={handleLayout}
        onReset={handleReset}
        onDuplicate={duplicateSelected}
        onOpenImport={() => setShowImport(true)}
        onOpenBuiltin={() => setShowBuiltin(true)}
        onAnalyze={() => setShowTest(true)}
        onPreview={handlePreview}
        onExport={handleExport}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {/* 畫布層級檢視切換:節點圖(編輯)↔ 清單(一般使用者條列閱讀) */}
          <div className="absolute left-3 top-3 z-10 cf-seg !mt-0 !w-auto flex-none !bg-[var(--cf-panel)] shadow-sm">
            <button type="button" title="節點圖（編輯）" aria-label="節點圖" className={`flex items-center justify-center ${view === 'graph' ? 'is-active' : ''}`} onClick={() => setView('graph')}><Network size={15} strokeWidth={1.75} /></button>
            <button type="button" title="清單（閱讀）" aria-label="清單" className={`flex items-center justify-center ${view === 'list' ? 'is-active' : ''}`} onClick={() => setView('list')}><List size={15} strokeWidth={1.75} /></button>
          </div>
          {view === 'list' ? (
            <RuleListView nodes={nodes} edges={edges} />
          ) : (
          <>
         <NodeBadgeContext.Provider value={nodeBadges}>
          <ReactFlow
            nodes={displayNodes}
            edges={labeledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onSelectionChange={onSelectionChange}
            onPaneClick={() => setDropMenu(null)}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            deleteKeyCode={['Delete', 'Backspace']}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
            snapToGrid
            snapGrid={[20, 20]}
            defaultEdgeOptions={{ type: 'default' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={isDark ? '#2a2d33' : '#d8d3c8'} gap={22} size={1.5} />
            <Controls className="!rounded-lg !overflow-hidden !border !border-[var(--cf-border)] !shadow-lg [&>button]:!bg-[var(--cf-surface)] [&>button]:!border-[var(--cf-border)] [&>button]:!text-[var(--cf-text-dim)] [&>button:hover]:!bg-[var(--cf-surface-hover)] [&>button:hover]:!text-[var(--cf-text)]" />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              style={{ width: 168, height: 112 }}
              maskColor={isDark ? 'rgba(14,15,17,0.6)' : 'rgba(243,241,236,0.6)'}
              nodeStrokeColor={isDark ? '#3a3d42' : '#d4cfc3'}
              nodeColor={(n) => nodeAccent(n.type)}
              className="!bg-[var(--cf-surface)] !border-[var(--cf-border)]"
            />
            <Panel position="top-center" className="pointer-events-none text-[11px] text-[var(--cf-text-faint)]">
              串聯=且(AND) · 分支=任一(OR) · 節點上的 + 新增 · Delete 刪除
            </Panel>
          </ReactFlow>
         </NodeBadgeContext.Provider>

          <DropMenu menu={dropMenu} onPick={pickFromDropMenu} onClose={() => setDropMenu(null)} />
          </>
          )}
        </div>

        <Inspector />
      </div>

      <Toaster theme={theme} position="bottom-right" richColors />
      <Suspense fallback={null}>
        {previewJson != null && (
          <PreviewModal json={previewJson} onClose={() => setPreviewJson(null)} onDownload={handleExport} />
        )}
        {showTest && (
          <AnalyzePanel nodes={nodes} edges={edges} onClose={() => setShowTest(false)} />
        )}
        {showImport && (
          <ImportModal onClose={() => setShowImport(false)} onSubmitTexts={handleImportTexts} />
        )}
        {showBuiltin && (
          <BuiltinCards onImport={handleImportBuiltin} onClose={() => setShowBuiltin(false)} />
        )}
      </Suspense>
      {showLint && (
        <LintPanel issues={issues} onFocus={focusIssue} onClose={() => setShowLint(false)} />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          body={confirmDialog.body}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => { confirmDialog.onConfirm?.(); setConfirmDialog(null); }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}
