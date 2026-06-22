import { createContext } from 'react';

// Per-node display badges (issue dot, incoming-edge count) computed ONCE in App
// and shared via context, instead of every NodeShell running its own O(N) store
// selector (which made the canvas O(N²) per change). Value: Map<id, {hasIssue,
// incomingCount}>, recomputed only when graph structure/data changes (not on drag).
export const NodeBadgeContext = createContext(null);
