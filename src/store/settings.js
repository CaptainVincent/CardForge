import { create } from 'zustand';

const KEY = 'cardforge:settings';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

// A point program's value over time is a step-function (dated rate history),
// like an FX/Beancount price timeline:
//   rates: [{ from: 'YYYY-MM-DD' | null, rate: number }]
//   - from === null → baseline ("from the beginning / card activation")
//   - the rate effective at a date = the entry with the greatest `from` that is
//     ≤ that date (baseline counts as earliest)
// basis: 'fixed' (issuer-defined, authoritative) | 'estimate' (your best-
// redemption-anchored value for flexible points/miles).
function normalizeProgram(p) {
  if (Array.isArray(p?.rates)) return { basis: p.basis || 'fixed', rates: p.rates.map((r) => ({ from: r.from ?? null, rate: r.rate })) };
  // legacy just-shipped shape { rate, basis }
  return { basis: p?.basis || 'fixed', rates: [{ from: null, rate: p?.rate ?? 1 }] };
}

function initPrograms() {
  const s = load();
  if (s.pointPrograms) return Object.fromEntries(Object.entries(s.pointPrograms).map(([n, p]) => [n, normalizeProgram(p)]));
  const legacy = s.pointRates || {}; // oldest shape: { name: number }
  return Object.fromEntries(Object.entries(legacy).map(([n, rate]) => [n, { basis: 'fixed', rates: [{ from: null, rate }] }]));
}

const persist = (pointPrograms) => {
  try { localStorage.setItem(KEY, JSON.stringify({ pointPrograms })); } catch { /* ignore */ }
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Index of the rate entry effective at `isoDate` (nearest-earlier `from`; all
// future-dated → earliest). -1 if unconfigured. Single source for "which rate
// applies now" — reused by effectiveRate and setCurrentRate.
export function effectiveIndex(rates, isoDate) {
  if (!rates?.length) return -1;
  const pool = rates.map((r, i) => ({ r, i })).filter(({ r }) => r.from == null || r.from <= isoDate);
  const candidates = pool.length ? pool : rates.map((r, i) => ({ r, i }));
  let best = candidates[0];
  for (const x of candidates) if ((x.r.from || '') >= (best.r.from || '')) best = x;
  return best.i;
}

// The rate effective at `isoDate` (string YYYY-MM-DD). undefined if unconfigured.
export function effectiveRate(program, isoDate) {
  const i = effectiveIndex(program?.rates, isoDate);
  return i < 0 ? undefined : program.rates[i].rate;
}

// The engine's {name: rate} valuation map at a date (unconfigured → 1).
export const ratesAsOf = (pointPrograms, isoDate) =>
  Object.fromEntries(Object.entries(pointPrograms || {}).map(([n, p]) => [n, effectiveRate(p, isoDate) ?? 1]));

export const useSettings = create((set) => ({
  pointPrograms: initPrograms(),

  setPointBasis: (name, basis) =>
    set((s) => {
      const prev = s.pointPrograms[name] || { rates: [{ from: null, rate: 1 }] };
      const pointPrograms = { ...s.pointPrograms, [name]: { ...prev, basis } };
      persist(pointPrograms);
      return { pointPrograms };
    }),

  // Replace the whole dated rate history (used by the full editor).
  setPointRates: (name, rates) =>
    set((s) => {
      const prev = s.pointPrograms[name] || { basis: 'fixed' };
      const pointPrograms = { ...s.pointPrograms, [name]: { basis: prev.basis || 'fixed', rates } };
      persist(pointPrograms);
      return { pointPrograms };
    }),

  // Edit the CURRENT value (the latest-dated entry; baseline if single). The
  // common low-maintenance edit — "the point is worth this now".
  setCurrentRate: (name, rate) =>
    set((s) => {
      const prev = s.pointPrograms[name] || { basis: 'fixed', rates: [] };
      const rates = prev.rates.length ? [...prev.rates] : [{ from: null, rate }];
      if (prev.rates.length) {
        const i = effectiveIndex(rates, todayISO()); // edit the entry shown as "current"
        rates[i] = { ...rates[i], rate };
      }
      const pointPrograms = { ...s.pointPrograms, [name]: { basis: prev.basis || 'fixed', rates } };
      persist(pointPrograms);
      return { pointPrograms };
    }),

  // Merge point programs restored from an imported DB JSON.
  mergePointPrograms: (incoming) =>
    set((s) => {
      if (!incoming || !Object.keys(incoming).length) return {};
      const norm = Object.fromEntries(Object.entries(incoming).map(([n, p]) => [n, normalizeProgram(p)]));
      const pointPrograms = { ...s.pointPrograms, ...norm };
      persist(pointPrograms);
      return { pointPrograms };
    }),
}));
