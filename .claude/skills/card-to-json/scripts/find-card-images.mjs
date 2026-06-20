// Locate the likely-MEANINGFUL images on a credit-card page, so you Read only a
// few instead of guessing image URLs (which hits CTA buttons / decoration).
//
// Usage:  node find-card-images.mjs <page-url>
//
// Why this exists (validated on real bank pages): the binding detail — 指定特店/
// 通路 logo walls, rate graphics — often lives ONLY in images, and bank images
// carry NO useful alt text. Two cheap, reliable signals separate signal from
// noise: (a) SIZE — benefit graphics are large; icons/buttons are small; and
// (b) DOM PROXIMITY — the image sits near reward keywords in the HTML. This
// ranks candidates by (reward-context, then pixel area) and prints each with a
// text snippet so you can pick which to Read (vision) — then cross-verify.

const REWARD_KW = ['指定', '通路', '特店', '回饋', '加碼', '%', '豐點', '紅利', '哩', '點數', '優惠', '上限', '消費', '倍'];
const ICON_RE = /(\/icon|\.svg|sprite|_icon|icon[-_]|gotop|sidemenu|facebook|instagram|youtube)/i;

const arg = process.argv[2];
if (!arg) { console.error('usage: node find-card-images.mjs <page-url>'); process.exit(2); }

const html = await (await fetch(arg)).text();
const base = new URL(arg);

// Collect <img> tags with their byte position in the HTML.
const imgs = [];
const re = /<img\b[^>]*>/gi;
let m;
while ((m = re.exec(html))) {
  const src = (m[0].match(/\bsrc=["']([^"']+)["']/i) || [])[1];
  if (!src || ICON_RE.test(src)) continue;
  let url;
  try { url = new URL(src, base).href; } catch { continue; }
  if (!/\.(png|jpe?g|webp)$/i.test(url)) continue;
  imgs.push({ url, pos: m.index });
}
const firstPos = new Map();
for (const it of imgs) if (!firstPos.has(it.url)) firstPos.set(it.url, it.pos);

const textAround = (pos) => html.slice(Math.max(0, pos - 400), pos + 400).replace(/<[^>]+>/g, ' ');
const ctxScore = (pos) => { const t = textAround(pos); return REWARD_KW.reduce((s, k) => s + (t.includes(k) ? 1 : 0), 0); };

// Image dimensions from header bytes (PNG / JPEG), pure JS, no dependencies.
function dims(buf) {
  const b = new Uint8Array(buf); const dv = new DataView(buf);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) }; // PNG IHDR
  if (b[0] === 0xff && b[1] === 0xd8) { // JPEG: scan SOF markers
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return { w: 0, h: 0 };
}

const out = [];
for (const [url, pos] of firstPos) {
  let w = 0, h = 0;
  try { ({ w, h } = dims(await (await fetch(url)).arrayBuffer())); } catch { /* unreachable image */ }
  out.push({ url, w, h, ctx: ctxScore(pos), snippet: textAround(pos).replace(/\s+/g, ' ').trim().slice(0, 110) });
}

// Rank: near reward text first, then larger. Keep the plausible content images.
out.sort((a, b) => (b.ctx - a.ctx) || (b.w * b.h - a.w * a.h));
const candidates = out.filter((o) => o.w >= 400 || o.ctx >= 3);
console.log(`# ${candidates.length} 候選圖(共 ${out.length} 張內容圖)。對前幾張用 Read 視覺讀取,再與文字/條款交叉驗證。\n`);
for (const o of candidates.slice(0, 12)) {
  console.log(`${String(o.w).padStart(4)}x${String(o.h).padEnd(4)}  ctx=${o.ctx}  ${o.url}`);
  console.log(`      …${o.snippet}…`);
}
