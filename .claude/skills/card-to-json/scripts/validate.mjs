// CardForge JSON validator — runs a candidate rules JSON through the REAL engine
// so the skill can prove its output is genuinely supported (not just plausible).
//
// Usage:  node validate.mjs <path-to-candidate.json>
//
// Checks, in order:
//   1. importFromJson()  — must not throw; reports the rebuilt node/edge graph.
//   2. nodeIssues()      — per-node completeness (missing rate, <2 inputs to 擇優/
//                          取高, unconnected, no cap set, …). ERRORS fail the run.
//   3. exportToJson()    — must not throw (round-trips back to canonical shape).
//   4. feature fingerprint — confirms the constructs you INTENDED (marginal tiers,
//                          metric caps, 取高 groups, 擇優, gates, points) actually
//                          survived import→export, i.e. the engine understood them.
//   5. simulateMonth()   — runs a few synthetic txns per card; must not throw.
//
// The repo's pure libs are the source of truth — this file imports them directly.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve the CardForge engine regardless of where this skill dir sits: walk up
// from this file until src/lib/importJson.js is found (no brittle ../../../..).
function findRepoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'src/lib/importJson.js'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  console.error('✗ 找不到 CardForge 引擎(src/lib);請在專案 repo 內執行此腳本。');
  process.exit(2);
}
const root = findRepoRoot();
const lib = (f) => import(pathToFileURL(join(root, 'src/lib', f)).href);
const { importFromJson } = await lib('importJson.js');
const { exportToJson } = await lib('exportJson.js');
const { simulateMonth } = await lib('simulate.js');
const { nodeIssues } = await lib('validate.js');

const path = process.argv[2];
if (!path) { console.error('usage: node validate.mjs <candidate.json>'); process.exit(2); }

const fail = [];
const warn = [];
const info = [];

let raw;
try { raw = JSON.parse(readFileSync(path, 'utf8')); }
catch (e) { console.error('✗ JSON parse 失敗:', e.message); process.exit(1); }

// Normalize to a {cards:[...]} database view for fingerprinting.
const asDb = (j) => (j.cards ? j : j.card ? { cards: [j] } : { cards: [] });

// Count the constructs present, independent of volatile group/pool ids.
function fingerprint(db) {
  const f = { rules: 0, marginal: 0, spend: 0, caps: { reward: 0, spend: 0, count: 0 }, tops: 0, selects: new Set(), gates: 0, points: new Set() };
  for (const c of db.cards || []) {
    const rs = c.rules ? (Array.isArray(c.rules) ? c.rules : Object.values(c.rules)) : [];
    f.rules += rs.length;
    f.tops += Object.keys(c.top_groups || {}).length;
    for (const r of rs) {
      if (r.tiers?.mode === 'marginal') f.marginal++;
      if (r.tiers?.mode === 'spend') f.spend++;
      let caps = r.limits?.caps;
      if (!caps?.length) { // legacy scalar keys still count toward the fingerprint
        caps = [];
        const lim = r.limits || {};
        if (lim.max_reward_per_period != null) caps.push({ metric: 'reward' });
        if (lim.max_reward_total != null) caps.push({ metric: 'reward' });
        if (lim.max_reward_per_txn != null) caps.push({ metric: 'reward' });
      }
      for (const cap of caps) f.caps[cap.metric || 'reward'] = (f.caps[cap.metric || 'reward'] || 0) + 1;
      if (r.stacking?.select_group) f.selects.add(r.stacking.select_group);
      if (r.eligibility?.min_spending || r.eligibility?.pool) f.gates++;
      if (r.reward?.point_name) f.points.add(r.reward.point_name);
    }
  }
  return { ...f, selects: f.selects.size, points: f.points.size };
}

// ---- 1. import ----
let graph;
try { graph = importFromJson(raw); }
catch (e) { console.error('✗ importFromJson 失敗(JSON 結構無法被引擎載入):', e.message); process.exit(1); }
const { nodes, edges } = graph;
const byType = nodes.reduce((m, n) => ((m[n.type] = (m[n.type] || 0) + 1), m), {});
info.push(`import OK — 節點 ${nodes.length}(${Object.entries(byType).map(([t, n]) => `${t}:${n}`).join(', ')})、連線 ${edges.length}`);

// ---- 2. completeness ----
for (const n of nodes) for (const msg of nodeIssues(n, edges)) fail.push(`節點未完成 [${n.type}] ${msg}`);

// ---- 3. export (round-trip) ----
let out;
try { out = exportToJson(nodes, edges); }
catch (e) { console.error('✗ exportToJson 失敗:', e.message); process.exit(1); }
if (!out || !out.cards?.length) fail.push('export 後沒有任何卡片 — 規則可能未連到卡片');

// ---- 4. feature fingerprint ----
const fin = fingerprint(asDb(raw));
const fout = fingerprint(out);
const cmp = (label, a, b) => { if (a !== b) fail.push(`構造在 round-trip 中遺失/改變:${label} 輸入=${a} 輸出=${b}`); };
cmp('規則數', fin.rules, fout.rules);
cmp('超額累進(marginal)', fin.marginal, fout.marginal);
cmp('消費級距(spend)', fin.spend, fout.spend);
cmp('上限·回饋', fin.caps.reward, fout.caps.reward);
cmp('上限·消費', fin.caps.spend, fout.caps.spend);
cmp('上限·筆數', fin.caps.count, fout.caps.count);
cmp('取高群組', fin.tops, fout.tops);
cmp('擇優群組', fin.selects, fout.selects);
cmp('門檻(gate)', fin.gates, fout.gates);
cmp('點數計畫', fin.points, fout.points);
info.push(`features — 規則${fin.rules} marginal${fin.marginal} spend${fin.spend} caps(回${fin.caps.reward}/消${fin.caps.spend}/筆${fin.caps.count}) 取高${fin.tops} 擇優${fin.selects} 門檻${fin.gates} 點數${fin.points}`);

// ---- 5. simulate smoke ----
const sampleTxns = [
  { amount: 1000, categories: ['dining'], channels: ['online'], currency: 'TWD', isOverseas: false },
  { amount: 3000, categories: ['travel'], channels: ['contactless'], currency: 'TWD', isOverseas: false },
  { amount: 8000, categories: ['supermarket'], channels: ['mobile_pay'], currency: 'TWD', isOverseas: false },
  { amount: 1500, categories: ['gas'], currency: 'TWD', isOverseas: false },
];
for (const c of out.cards) {
  try {
    const res = simulateMonth(c, sampleTxns);
    info.push(`simulate「${c.card}」OK — 回饋 $${res.totals.cashback}、上限觸發 ${res.caps.length}、門檻解鎖 ${res.gates.length}`);
  } catch (e) { fail.push(`simulateMonth「${c.card}」拋錯:${e.message}`); }
}

// ---- report ----
console.log('\n— CardForge 驗證 —');
for (const i of info) console.log('  •', i);
for (const w of warn) console.log('  ⚠', w);
if (fail.length) {
  console.log('\n✗ 未通過:');
  for (const f of fail) console.log('  ✗', f);
  process.exit(1);
}
console.log('\n✓ 通過 — 此 JSON 可被 CardForge 引擎完整載入、模擬、且 round-trip 不失真。');
