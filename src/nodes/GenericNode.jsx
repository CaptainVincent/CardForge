import { Position } from '@xyflow/react';
import PlusHandle from './PlusHandle';
import NodeShell from './NodeShell';
import { NODE_TYPES, nodeAccent } from './registry';
import { nodeSummary } from '../lib/summary';

// One component for every node type — handles & summary come from the registry.
export default function GenericNode({ id, type, data, selected }) {
  const def = NODE_TYPES[type] || {};
  const accent = nodeAccent(type);
  return (
    <NodeShell id={id} type={type} accent={accent} selected={selected} summary={nodeSummary({ type, data })}>
      {def.hasTarget && <PlusHandle type="target" position={Position.Left} color={accent} />}
      {def.hasSource && <PlusHandle type="source" position={Position.Right} color={accent} />}
    </NodeShell>
  );
}
