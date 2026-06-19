import { Handle } from '@xyflow/react';

// A quiet ringed dot. Hover reveals a soft halo; drag from it to connect/create.
export default function PlusHandle({ type, position, color = '#94a3b8' }) {
  return (
    <Handle
      type={type}
      position={position}
      className="cf-handle"
      style={{
        width: 11,
        height: 11,
        background: 'var(--cf-surface)',
        border: `2px solid ${color}`,
        borderRadius: '50%',
        '--h': color,
      }}
    />
  );
}
