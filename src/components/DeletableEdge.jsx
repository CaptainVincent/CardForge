import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { useFlowStore } from '../store/flowStore';

// Default edge + a delete "×" shown when the edge is selected, so a mis-wired
// connection can be removed without deleting a node. BaseEdge keeps the same
// bezier path + themed stroke; the "且" label (condition→condition) still shows.
export default function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, label, selected }) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {(label || selected) && (
        <EdgeLabelRenderer>
          <div
            className="cf-edge-tools nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label && <span className="cf-edge-label">{label}</span>}
            {selected && (
              <button
                type="button"
                className="cf-edge-del"
                title="刪除連線"
                onClick={(e) => { e.stopPropagation(); onEdgesChange([{ id, type: 'remove' }]); }}
              >
                ×
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
