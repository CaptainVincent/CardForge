# 🔧 CardForge

視覺化的信用卡回饋規則編輯器。在一張畫布上用節點圖描述**多張卡**的回饋規則,內建試算 / 推薦 / 比較 / 月度模擬與規則檢查(lint),並與 ChristianWolff 相容的 JSON 雙向匯入匯出。

## 開發

```bash
pnpm install
pnpm dev      # 開發伺服器（--host，可區網存取）
pnpm build    # production 打包
pnpm preview  # 預覽打包結果
pnpm lint     # ESLint（零錯為準）
```

## 節點模型

| 節點 | 類別 | 用途 |
|---|---|---|
| 信用卡 `card` | 端點 | 一張卡的根節點;畫布可有多張卡 |
| 回饋 `reward` | 端點 | 回饋方式(%／固定／每 N 元送點)、級距、結算(每筆／一次性) |
| 配對條件 `condition` | 邏輯 | 比對通路/類別/幣別/支付/海外/自訂述詞;可設「排除(NOT)」 |
| 任一 `any` | 邏輯 | **跨欄位的「或」**(CNF 子句):符合任一替代條件即通過 |
| 門檻 `gate` | 邏輯 | 累積消費解鎖;接多個回饋＝共用門檻 |
| 上限 `limit` | 邏輯 | 單筆／單期／總回饋上限;接多個回饋＝共用額度池 |
| 擇優 `select` | 邏輯 | 多個回饋連入＝取估值最高一個(XOR) |

**布林語意**:串聯=AND、分支/匯入=OR、條件可反相=NOT、`任一`節點=跨欄位 OR。
組合後可表達完整的 DNF 與 CNF(布林完備),且不會因跨欄位 OR 造成分支指數爆炸。

## 操作

- **新增節點**:工具列「新增 ▾」,或從節點的 `+` 拖線到空白處(只列出語意合理的下游節點)。
- **連線**:採嚴格驗證 — 不合邏輯的連線會被取消並提示原因(例如「上限」只能接在「回饋」之後)。
- **編輯**:點選節點 → 右側 Inspector 編輯所有欄位;節點卡只顯示一行摘要。
- **快捷鍵**:`⌘Z` / `⌘⇧Z`(或 `⌘Y`)復原重做、`⌘D` 複製、`⌘S` 匯出、`Delete` / `Backspace` 刪除。
- **主題**:工具列可切換淺色(Gallery)/ 深色,偏好存於 `localStorage`。
- **持久化**:畫布(含自訂選項)自動存到 `localStorage`,重整還原。

## 分析

工具列「分析」開啟四個分頁:

- **試算**:選卡 + 勾選消費條件 → 即時回饋金額與命中規則(毛回饋)。
- **月度**:加入一串交易 → 跨筆累積期間上限(封頂)、門檻解鎖、一次性獎勵的真實結果。
- **推薦**:未勾選的欄位視為開放,反推「怎麼刷回饋最高」。
- **比較**:同一筆消費,畫布上各卡的最佳回饋淨值排行(已扣海外手續費、已估點數匯率)。

## 規則檢查(Lint)

`src/lib/lint.js` 動態偵測不該存在的結構並說明原因:無卡片、卡名重複、孤立節點、不合邏輯連線、循環、永不命中的規則(同時要求並排除同一值)、欄位未完成。工具列狀態晶片顯示錯誤/提醒數,點開可逐項跳轉到節點。

## 架構

- **單一資料來源**:`src/store/flowStore.js` — Zustand(`zundo` undo/redo + localStorage 持久化)。節點透過 store 讀寫,不在 render 期注入 `onChange`。`src/store/settings.js` 存點數匯率。
- **節點登錄表**:`src/nodes/registry.js` 是唯一真實來源(標題/圖示/配色/handle/選單);所有型別共用一個 `GenericNode`。新增型別只需改 registry + 加一個 Fields 元件。
- **引擎(純函式)**:`src/lib/` — `exportJson` / `importJson`(圖 ↔ JSON)、`simulate`(單筆)、`simulateMonth`(月度)、`recommend`、`lint`、`validate`、`autoLayout`(dagre)。
- **編輯面板**:`src/inspector/` — `Inspector` + 可複用欄位(`fields/`)+ 各型別欄位群。
- **設計系統**:`src/index.css` 的 CSS 變數 tokens(淺色 `:root` + 深色 `[data-theme="dark"]`),近單色的 Gallery 風格、髮絲邊框 + 柔和陰影。圖示為 Lucide 單線集(`src/lib/icons.jsx`)。

## 技術棧

React 19 · Vite · @xyflow/react(React Flow)· Zustand + zundo · lucide-react · sonner · @dagrejs/dagre · Tailwind CSS v4。
