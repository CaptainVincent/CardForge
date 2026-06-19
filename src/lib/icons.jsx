// Monoline icon set (Lucide) — one stroke weight, inherits currentColor so
// every glyph obeys the palette. Node glyphs come from the node registry.
import { createElement } from 'react';
import { Wrench, MousePointerClick, Plus, Sun, Moon, Calculator, LayoutGrid } from 'lucide-react';
import { nodeIconComponent } from '../nodes/registry';

export function NodeGlyph({ type, size = 16, strokeWidth = 1.5 }) {
  return createElement(nodeIconComponent(type), { size, strokeWidth });
}

export { Wrench, MousePointerClick, Plus, Sun, Moon, Calculator, LayoutGrid };
