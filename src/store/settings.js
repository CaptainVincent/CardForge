import { create } from 'zustand';

const KEY = 'cardforge:settings';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

// A point program's value is ONE current TWD-per-point number + a basis.
//   basis: 'fixed' (issuer-defined, authoritative)
//        | 'estimate' (your best-redemption-anchored value for flexible points/miles)
// Time-varying rates are deliberately NOT modelled here — the rule interpreter
// keeps a single current value; analysis lets you tweak it for comparison, and
// rate history over time is the bookkeeping ledger's job (not the rule's).
function normalizeProgram(p) {
  if (p == null) return { basis: 'fixed', rate: 1 };
  if (typeof p === 'number') return { basis: 'fixed', rate: p };
  // back-compat with the old dated history { basis, rates:[{from,rate}] } → baseline.
  if (Array.isArray(p.rates)) {
    return { basis: p.basis || 'fixed', rate: p.rates[0]?.rate ?? 1 };
  }
  return { basis: p.basis || 'fixed', rate: p.rate ?? 1 };
}

function initPrograms() {
  const s = load();
  const src = s.pointPrograms || s.pointRates || {};
  return Object.fromEntries(Object.entries(src).map(([n, p]) => [n, normalizeProgram(p)]));
}

const persist = (pointPrograms) => {
  try { localStorage.setItem(KEY, JSON.stringify({ pointPrograms })); } catch { /* ignore */ }
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

// The TWD value of one point (undefined if unconfigured). A trailing date arg may
// be passed by callers and is ignored — value is a single current number.
export const effectiveRate = (program) => program?.rate;

// The engine's {name: rate} valuation map (unconfigured → 1).
export const ratesAsOf = (pointPrograms) =>
  Object.fromEntries(Object.entries(pointPrograms || {}).map(([n, p]) => [n, p?.rate ?? 1]));

export const useSettings = create((set) => ({
  pointPrograms: initPrograms(),

  setPointBasis: (name, basis) =>
    set((s) => {
      const prev = s.pointPrograms[name] || { rate: 1 };
      const pointPrograms = { ...s.pointPrograms, [name]: { ...prev, basis } };
      persist(pointPrograms);
      return { pointPrograms };
    }),

  // Set the single current value ("the point is worth this"). Analysis edits this.
  setPointRate: (name, rate) =>
    set((s) => {
      const prev = s.pointPrograms[name] || { basis: 'fixed' };
      const pointPrograms = { ...s.pointPrograms, [name]: { basis: prev.basis || 'fixed', rate: rate == null ? 1 : rate } };
      persist(pointPrograms);
      return { pointPrograms };
    }),

  // Merge point programs restored from an imported DB JSON (normalized to single value).
  mergePointPrograms: (incoming) =>
    set((s) => {
      if (!incoming || !Object.keys(incoming).length) return {};
      const norm = Object.fromEntries(Object.entries(incoming).map(([n, p]) => [n, normalizeProgram(p)]));
      const pointPrograms = { ...s.pointPrograms, ...norm };
      persist(pointPrograms);
      return { pointPrograms };
    }),
}));
