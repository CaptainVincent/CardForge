// Single source of truth for every node type.
// Title / icon / accent / handles / menu all derive from here — add a node
// type in ONE place instead of editing summary, icons, App, MiniMap, nodes/index.
import { CreditCard, Filter, Split, Flag, Percent, ArrowUpToLine, Crown, BadgeCheck } from 'lucide-react';

// kind: 'terminal' (anchors — input card / output reward) vs 'operator'
// (logic/constraints in between). Drives a distinct visual so they don't blur.
// role: the SEMANTIC class that drives connection topology + export traversal —
//   source     卡片(圖的根)
//   path       配對條件(condition/any):決定「算不算」、沿路徑串接
//   constraint 約束(gate/eligibility):掛在路徑上 AND、不改路徑
//   reward     回饋(公式輸出)
//   sink       回饋的下游約束(limit/select/top):終點,不再外接
// 連線規則與匯出走訪都由 role 衍生 → 新增節點只要標 role,不必再改多處型別清單。
export const NODE_TYPES = {
  card:      { title: '信用卡', icon: CreditCard,    accent: '#5e7d9a', kind: 'terminal', role: 'source',     hasTarget: false, hasSource: true,  menu: null },
  reward:    { title: '回饋',     icon: Percent,       accent: '#6f8a68', kind: 'terminal', role: 'reward',     hasTarget: true,  hasSource: true,  menu: '回饋' },
  condition: { title: '配對條件', icon: Filter,        accent: '#8a6e92', kind: 'operator', role: 'path',       hasTarget: true,  hasSource: true,  menu: '條件' },
  any:       { title: '任一',     icon: Split,         accent: '#7a8a9a', kind: 'operator', role: 'path',       hasTarget: true,  hasSource: true,  menu: '任一' },
  gate:      { title: '門檻',     icon: Flag,          accent: '#5f8f93', kind: 'operator', role: 'constraint', hasTarget: true,  hasSource: true,  menu: '門檻' },
  eligibility:{ title: '資格',    icon: BadgeCheck,    accent: '#6e72a8', kind: 'operator', role: 'constraint', hasTarget: true,  hasSource: true,  menu: '資格' },
  limit:     { title: '上限',     icon: ArrowUpToLine, accent: '#b0894a', kind: 'operator', role: 'sink',       hasTarget: true,  hasSource: false, menu: '上限' },
  select:    { title: '擇一',     icon: Crown,         accent: '#b07a7a', kind: 'operator', role: 'sink',       hasTarget: true,  hasSource: false, menu: '擇一' },
};

const FALLBACK_ACCENT = '#a3a09a';

export const nodeTitle = (type) => NODE_TYPES[type]?.title ?? type;
export const nodeAccent = (type) => NODE_TYPES[type]?.accent ?? FALLBACK_ACCENT;
export const nodeKind = (type) => NODE_TYPES[type]?.kind ?? 'operator';
export const nodeRole = (type) => NODE_TYPES[type]?.role;
export const nodeIconComponent = (type) => NODE_TYPES[type]?.icon ?? CreditCard;

// Types grouped by role — the building blocks of connection topology.
const typesWithRole = (...roles) => Object.entries(NODE_TYPES).filter(([, d]) => roles.includes(d.role)).map(([t]) => t);
// path/constraint listed before reward (keeps the "+" drop-menu order natural).
export const PATH_TARGETS = [...typesWithRole('path', 'constraint'), ...typesWithRole('reward')];
export const SINK_TARGETS = typesWithRole('sink'); // what a reward may point at

// Toolbar / drop-menu entries (those with a menu label), each tagged by kind.
export const NODE_MENU = Object.entries(NODE_TYPES)
  .filter(([, def]) => def.menu)
  .map(([type, def]) => ({ type, label: def.menu, dot: def.accent, kind: def.kind }));
