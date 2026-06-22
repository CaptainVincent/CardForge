import { memo } from 'react';
import { Position } from '@xyflow/react';
import PlusHandle from './PlusHandle';
import NodeShell from './NodeShell';
import { NODE_TYPES, nodeAccent } from './registry';
import { nodeSummary } from '../lib/summary';

// One component for every node type — handles & summary come from the registry.
// memo: React Flow re-creates the nodes array on every change (incl. dragging a
// *different* node). Without memo, all N nodes re-render + recompute summary each
// frame. Props are (id,type,data,selected); `data` keeps its reference unless
// that node actually changed (store updates immutably), so memo's shallow compare
// skips untouched nodes — the single biggest per-frame win on large canvases.
function GenericNode({ id, type, data, selected }) {
  const def = NODE_TYPES[type] || {};
  const accent = nodeAccent(type);
  return (
    <NodeShell id={id} type={type} accent={accent} selected={selected} summary={nodeSummary({ type, data })}>
      {def.hasTarget && <PlusHandle type="target" position={Position.Left} color={accent} />}
      {def.hasSource && <PlusHandle type="source" position={Position.Right} color={accent} />}
    </NodeShell>
  );
}

export default memo(GenericNode);
