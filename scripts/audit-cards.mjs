// 全卡稽核:每次拓展 UI/詮釋能力(加新構造)後,確認既有 cards/*.json
//   (1) 格式相容  — import→export 冪等 + simulate 不爆(新格式下仍正確載入/模擬)。
//   (2) 升級訊號  — note/custom 提到某機制、卻沒用對應的一級構造 → 可能漏「回填舊卡」。
//
// 用法:  node scripts/audit-cards.mjs        (= pnpm cards:check)
// 退出碼:有「格式不相容」→ 1(CI 會擋);只有升級訊號 → 0(提醒,人工複核)。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findRepoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'src/lib/importJson.js'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  console.error('✗ 找不到 CardForge 引擎(src/lib)');
  process.exit(2);
}
const root = findRepoRoot();
const lib = (f) => import(pathToFileURL(join(root, 'src/lib', f)).href);
const { importFromJson } = await lib('importJson.js');
const { exportToJson } = await lib('exportJson.js');
const { simulateMonth } = await lib('simulate.js');

// 升級訊號表:某機制的「文字訊號」(note/名稱常出現的詞) vs「結構化判定」(已用對應構造)。
// 文字命中但結構化未命中 → 該卡可能該升級到此構造(回填)。
const SIGNALS = [
  {
    primitive: '計數級距 distinct_count(踩點/品牌數)',
    re: /踩點|不同品牌|品牌數|每多一家|多一家|家數.*[%％]/,
    has: (rules) => rules.some((r) => r.tiers?.mode === 'distinct_count'),
  },
  {
    primitive: '時段 day_of_week / day_of_month(卡友日)',
    re: /卡友日|每週[一二三四五六日]|週[一二三四五六日](?!末)|每月\s*\d+\s*[號日]/,
    has: (rules) => rules.some((r) => r.match?.day_of_week?.length || r.match?.day_of_month?.length),
  },
  {
    primitive: '筆數門檻 min_spending.metric:count(滿 N 筆解鎖)',
    re: /滿\s*\d+\s*筆|當月.*\d+\s*筆.*(才|享|解鎖)/,
    has: (rules) => rules.some((r) => r.eligibility?.min_spending?.metric === 'count'),
  },
  {
    primitive: '資格重設週期 cycle(每月登錄/每季任務)',
    // 收緊:需「每月/季 + 重新/需登錄/達標/任務」近距;避免「無須登錄」「整檔登錄」「每月上限」誤報。
    re: /每月[^。,;]{0,8}(重新|需登錄|達標|任務)|每季[^。,;]{0,8}(重新|需登錄|達標|任務)|逐月達成/,
    has: (rules, card) => Object.values(card.eligibility_flags || {}).some((f) => f?.cycle),
  },
];

function auditCard(db, file) {
  const card = db.cards?.[0] || db;
  const rules = Object.values(card.rules || {});
  const out = { file, conform: true, errors: [], signals: [], customFields: new Set() };

  // (1) 格式相容:import→export 冪等 + simulate 不爆。
  try {
    const { nodes, edges } = importFromJson(db);
    const e1 = exportToJson(nodes, edges);
    const r2 = importFromJson(e1);
    const e2 = exportToJson(r2.nodes, r2.edges);
    if (JSON.stringify(e1) !== JSON.stringify(e2)) { out.conform = false; out.errors.push('import→export 非冪等(格式漂移)'); }
    for (const c of e1.cards) simulateMonth(c, [{ amount: 1000 }, { amount: 2000, isOverseas: true }]);
  } catch (e) {
    out.conform = false; out.errors.push('載入/匯出/模擬擲錯:' + e.message);
  }

  // (2) 升級訊號:把所有 note + 規則名 串起來找關鍵字。
  const text = [card.card, ...rules.flatMap((r) => [r.name, r.note])].filter(Boolean).join('\n');
  for (const s of SIGNALS) {
    if (s.re.test(text) && !s.has(rules, card)) out.signals.push(s.primitive);
  }
  // custom 逃生口使用(可能該升一級欄位)。
  for (const r of rules) for (const p of (r.match?.custom || [])) if (p.field) out.customFields.add(p.field);

  return out;
}

const dir = join(root, 'cards');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let fail = 0, anySignal = 0;
console.log(`— 全卡稽核(${files.length} 張)—\n`);
for (const f of files) {
  const db = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const a = auditCard(db, f);
  const tag = a.conform ? '✅ 相容' : '❌ 不相容';
  console.log(`${tag}  ${f}`);
  a.errors.forEach((e) => { console.log(`     ✗ ${e}`); });
  a.signals.forEach((s) => { console.log(`     ⚠️ 可能該升級 → ${s}`); anySignal++; });
  if (a.customFields.size) console.log(`     · 用了 custom 逃生口:${[...a.customFields].join(', ')}(確認是否該升一級欄位)`);
  if (!a.conform) fail++;
}
console.log('');
if (fail) { console.log(`❌ ${fail} 張格式不相容 —— 必須修(回填到新格式)。`); process.exit(1); }
console.log(anySignal ? `✅ 全部相容;有 ${anySignal} 個升級訊號(人工複核是否回填)。` : '✅ 全部相容,無升級訊號。');
