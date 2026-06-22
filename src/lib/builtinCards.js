// 內建卡片庫:建置時把 repo 的 cards/*.json(已 parse 好的真實卡片規則)glob 進
// bundle,讓使用者免上傳/貼網址即可直接匯入。每筆帶卡名、規則數、檔名供畫廊顯示。
const modules = import.meta.glob('/cards/*.json', { eager: true });

export const BUILTIN_CARDS = Object.entries(modules)
  .map(([path, mod]) => {
    const db = mod.default || mod;
    const cards = Array.isArray(db.cards) ? db.cards : (db.card || db.rules ? [db] : []);
    return {
      file: path.split('/').pop(),
      db,
      names: cards.map((c) => c.card).filter(Boolean),
      cardCount: cards.length,
      ruleCount: cards.reduce((n, c) => n + Object.keys(c.rules || {}).length, 0),
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));
