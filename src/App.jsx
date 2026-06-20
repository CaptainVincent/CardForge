import { useState, useCallback, useRef, useMemo } from 'react';
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

import { nodeTypes } from './nodes';
import { nodeAccent, NODE_MENU } from './nodes/registry';
import Inspector from './inspector/Inspector';
import Toolbar from './components/Toolbar';
import DropMenu from './components/DropMenu';
import DeletableEdge from './components/DeletableEdge';

const edgeTypes = { default: DeletableEdge };
import PreviewModal from './components/PreviewModal';
import ImportModal from './components/ImportModal';
import AnalyzePanel from './components/AnalyzePanel';
import LintPanel from './components/LintPanel';
import SampleGallery from './components/SampleGallery';
import ConfirmDialog from './components/ConfirmDialog';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFlowStore, useTemporalStore } from './store/flowStore';
import { useSettings } from './store/settings';
import { makeIsValidConnection, EXPECTED_TARGETS, isExpected, edgeIssue } from './lib/connectionRules';
import { lintGraph, lintSummary } from './lib/lint';
import { layoutGraph } from './lib/autoLayout';
import { graphIssueCount } from './lib/validate';
import { exportToJson, downloadJson } from './lib/exportJson';
import { importFromJson } from './lib/importJson';

function FlowEditor() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const storeOnConnect = useFlowStore((s) => s.onConnect);
  const addNodeStore = useFlowStore((s) => s.addNode);
  const connectStore = useFlowStore((s) => s.connect);
  const importGraph = useFlowStore((s) => s.importGraph);
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

  const [dropMenu, setDropMenu] = useState(null);
  const [previewJson, setPreviewJson] = useState(null);
  const [showTest, setShowTest] = useState(false);
  const [showLint, setShowLint] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const pointPrograms = useSettings((s) => s.pointPrograms);
  const issues = useMemo(() => lintGraph(nodes, edges, pointPrograms), [nodes, edges, pointPrograms]);
  const lint = lintSummary(issues);

  const focusNode = useCallback((nodeId) => {
    const n = useFlowStore.getState().nodes.find((x) => x.id === nodeId);
    if (!n) return;
    setSelected(nodeId);
    setNodes(useFlowStore.getState().nodes.map((x) =>
      x.selected === (x.id === nodeId) ? x : { ...x, selected: x.id === nodeId }
    ));
    setCenter(n.position.x + 100, n.position.y + 40, { zoom: 1.1, duration: 400 });
    setShowLint(false);
  }, [setSelected, setNodes, setCenter]);

  const nodeTypeById = useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n.type]));
    return (id) => map.get(id);
  }, [nodes]);
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
    if (clientX != null) {
      const nodeEl = document.elementsFromPoint(clientX, clientY).find((el) => el.classList?.contains('react-flow__node'));
      const targetId = nodeEl?.getAttribute('data-id');
      if (targetId && targetId !== fromId) {
        const targetType = nodeTypeById(targetId);
        if (sourceType && targetType && !isExpected(sourceType, targetType)) {
          const reason = edgeIssue(sourceType, targetType);
          if (reason) toast.error(reason);
        }
        connectingFrom.current = null;
        return;
      }
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
  // db object then flows through here.
  const applyDb = useCallback((db, successMsg) => {
    const { nodes: nn, edges: ee, pointPrograms } = importFromJson(db);
    importGraph(layoutGraph(nn, ee), ee);
    useSettings.getState().mergePointPrograms(pointPrograms);
    setTimeout(() => fitView({ duration: 300 }), 60);
    toast.success(successMsg ?? `已匯入 ${nn.length} 個節點`);
  }, [importGraph, fitView]);

  const handleImportText = useCallback((text) => {
    try {
      applyDb(JSON.parse(text));
      setShowImport(false);
    } catch (err) {
      toast.error('JSON 解析失敗：' + err.message);
    }
  }, [applyDb]);

  const loadSample = useCallback((sample) => {
    applyDb(sample.db, `已載入範例：${sample.name}`);
    setShowSamples(false);
  }, [applyDb]);

  const handleLoadSample = useCallback((sample) => {
    const { nodes: n, edges: e } = useFlowStore.getState();
    const hasWork = e.length > 0 || n.length > 1 || n[0]?.data?.cardName;
    if (!hasWork) return loadSample(sample);
    setConfirmDialog({
      title: '載入範例',
      body: `載入「${sample.name}」會取代目前畫布內容。`,
      confirmLabel: '載入',
      onConfirm: () => loadSample(sample),
    });
  }, [loadSample]);

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
  useKeyboardShortcuts({ onDuplicate: duplicateNode, onCopy: handleCopy, onPaste: handlePaste, onExport: handleExport });

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
        onOpenSamples={() => setShowSamples(true)}
        onAnalyze={() => setShowTest(true)}
        onPreview={handlePreview}
        onExport={handleExport}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
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

          <DropMenu menu={dropMenu} onPick={pickFromDropMenu} onClose={() => setDropMenu(null)} />
        </div>

        <Inspector />
      </div>

      <Toaster theme={theme} position="bottom-right" richColors />
      {previewJson != null && (
        <PreviewModal json={previewJson} onClose={() => setPreviewJson(null)} onDownload={handleExport} />
      )}
      {showTest && (
        <AnalyzePanel nodes={nodes} edges={edges} onClose={() => setShowTest(false)} />
      )}
      {showLint && (
        <LintPanel issues={issues} onFocus={focusNode} onClose={() => setShowLint(false)} />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onSubmitText={handleImportText} />
      )}
      {showSamples && (
        <SampleGallery onLoad={handleLoadSample} onClose={() => setShowSamples(false)} />
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
