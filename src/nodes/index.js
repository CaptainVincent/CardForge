import GenericNode from './GenericNode';
import { NODE_TYPES } from './registry';

// Every registered type renders through the one GenericNode.
export const nodeTypes = Object.fromEntries(
  Object.keys(NODE_TYPES).map((type) => [type, GenericNode])
);
