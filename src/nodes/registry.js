// Single source of truth for every node type.
// Title / icon / accent / handles / menu all derive from here — add a node
// type in ONE place instead of editing summary, icons, App, MiniMap, nodes/index.
import { CreditCard, Filter, Split, Flag, Percent, ArrowUpToLine, Crown, Trophy } from 'lucide-react';

// kind: 'terminal' (anchors — input card / output reward) vs 'operator'
// (logic/constraints in between). Drives a distinct visual so they don't blur.
export const NODE_TYPES = {
  card:      { title: '信用卡', icon: CreditCard,    accent: '#5e7d9a', kind: 'terminal', hasTarget: false, hasSource: true,  menu: null },
  reward:    { title: '回饋',     icon: Percent,       accent: '#6f8a68', kind: 'terminal', hasTarget: true,  hasSource: true,  menu: '回饋' },
  condition: { title: '配對條件', icon: Filter,        accent: '#8a6e92', kind: 'operator', hasTarget: true,  hasSource: true,  menu: '條件' },
  any:       { title: '任一',     icon: Split,         accent: '#7a8a9a', kind: 'operator', hasTarget: true,  hasSource: true,  menu: '任一' },
  gate:      { title: '門檻',     icon: Flag,          accent: '#5f8f93', kind: 'operator', hasTarget: true,  hasSource: true,  menu: '門檻' },
  limit:     { title: '上限',     icon: ArrowUpToLine, accent: '#b0894a', kind: 'operator', hasTarget: true,  hasSource: false, menu: '上限' },
  select:    { title: '擇優',     icon: Crown,         accent: '#b07a7a', kind: 'operator', hasTarget: true,  hasSource: false, menu: '擇優' },
  top:       { title: '取高',     icon: Trophy,        accent: '#a85e8a', kind: 'operator', hasTarget: true,  hasSource: false, menu: '取高' },
};

const FALLBACK_ACCENT = '#a3a09a';

export const nodeTitle = (type) => NODE_TYPES[type]?.title ?? type;
export const nodeAccent = (type) => NODE_TYPES[type]?.accent ?? FALLBACK_ACCENT;
export const nodeKind = (type) => NODE_TYPES[type]?.kind ?? 'operator';
export const nodeIconComponent = (type) => NODE_TYPES[type]?.icon ?? CreditCard;

// Toolbar / drop-menu entries (those with a menu label), each tagged by kind.
export const NODE_MENU = Object.entries(NODE_TYPES)
  .filter(([, def]) => def.menu)
  .map(([type, def]) => ({ type, label: def.menu, dot: def.accent, kind: def.kind }));
