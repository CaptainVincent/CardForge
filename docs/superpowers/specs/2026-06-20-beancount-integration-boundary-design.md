# CardForge → Beancount 整合界線(設計決策)

- 日期:2026-06-20
- 狀態:已定案(經兩位獨立專家 review)
- 範圍:定義 CardForge 匯出的規則 JSON 與「下游 Beancount plugin」之間的職責界線。**不含** plugin 的實作(獨立未來專案)。

## 為什麼寫這份文件

使用者問:CardForge 匯出的 JSON 之後 import 到 Beancount,能不能建立回饋規則?並希望「自訂點數」有對應的 Beancount 宣告,以及消費屬性(通路/類別/MCC/海外/custom)該用 tag 還是 metadata。

**關鍵事實:Beancount 是純複式記帳,沒有規則引擎。** 它只記錄交易,不會自己判斷條件、算回饋。因此「import JSON 就自動建立回饋規則」不可能;真正落地需要一個**下游 Beancount plugin / importer**:載入這份規則 JSON、跑評估引擎(等同 `src/lib/simulate.js` / `simulateMonth.js` 的邏輯)、再對交易產生回饋 posting。

一個常見誤區(本專案曾考慮、已否決):把 Beancount 專屬細節(commodity 符號表、點→TWD 匯率、`cf-` metadata 慣例)塞進匯出 JSON。這會破壞 JSON 目前正確的「引擎無關」特性。

## 核心決策

**規則 JSON 維持引擎無關;所有 Beancount 專屬知識歸下游 plugin。**

判斷準則(任何要加進匯出的欄位都先過這關):
> 「如果有第二個、非 Beancount 的消費者讀這份 JSON,這個欄位會不會變得無意義或錯誤?」
> `commodity SHUMU`、`points-value: 0.3 TWD`、`cf-` 前綴的 metadata → 都不通過 → 不放進匯出。
> `point_name: "小樹點"`、`match.channels: ["online"]` → 通過 → 留在匯出。

## 點數(Points / Miles)

- **匯出只保留身分**:`reward.point_name`(顯示名,如「小樹點」)。匯出**不含** commodity 符號、不含匯率。
- **commodity 符號**(Beancount 要求大寫,如 `SHUMU`、`ASIA.MILES`)由 **plugin** 在 render 時產生或以小型別名表對應;不在 CardForge 指定(那只是為了滿足 Beancount 的大寫 lexer,是下游語法細節)。
- **估值分兩種(關鍵精煉)**:
  - **固定比值(`basis: "fixed"`)** = 發卡行/點數計畫**官方定義**的點值(如 OPENPOINT 1 點 = 1 元)。這**是規則事實**,CardForge 維護並**匯出**(見下)。
  - **估算(`basis: "estimate"`)** = 彈性點/里程(無官方現金價),由使用者**錨定最佳兌換手動換算**的估值。會匯出但標示為估算,僅供比較參考;ledger 可自行覆寫。
- **點數計畫是全域參照表,不是節點**:存於 `src/store/settings.js` 的 `pointPrograms`(`{ name: { basis, rates:[{from,rate}] } }`,以點數名稱為 key);回饋節點以 `reward.point_name` 引用。
- **UX = 垂直時間軸(共用 `RateTimeline`)**(經三方專家審查):點值是一條垂直軸——「起始」(無日期,涵蓋卡片啟用)+ 按「**異動**」加「生效日 → 新值」;目前值圓點實心。編輯主場 = 回饋節點 Inspector;「分析 → 點數價值總覽」是跨點掃視(時間軸收在折疊內)。compact 編輯走 `setCurrentRate`(edit 今天生效那筆)、整列增刪走 `setPointRates`。**不把點值耦合到規則檔期**(兩軸獨立,只在交易日期對齊)。
- **點值是有日期的階梯(step function),不是單一值**:`rates` 是一條 dated 序列,`from===null` = 起始(從卡片啟用),某日期的有效匯率 = `from ≤ 該日期` 中最晚的一筆(`effectiveRate()` in settings.js)。例:`[{rate:0.1},{from:'2026-11-10',rate:0.05}]` → 11/10 前 0.1、之後 0.05。這支援「銀行中途改點值」,並能推導卡片啟用→剪卡的完整匯率變化。
- **App 內推薦/比較**用「今天生效」的匯率(`effectiveRate(p, today)`);**匯出**輸出整條時間軸。
- **匯出 `point_programs`**:`exportToJson(nodes, edges, { pointPrograms })` 對**規則實際用到**的點,輸出中性的 dated 價格序列(非 Beancount 語法):
  ```
  point_programs: { "小樹點": { basis:"fixed",
    prices:[ {twd_per_point:0.1}, {from:"2026-11-10", twd_per_point:0.05} ] } }
  ```
  plugin 把每筆轉成**有日期的 `price` 指令**(baseline 無 from = 從卡片啟用),連續的 price 點 → dated price 時間軸(區間制,如外匯)。`estimate` 由 plugin 決定要不要硬記。匯入 `importFromJson` 還原為 `pointPrograms` 並 `mergePointPrograms` 併回 settings。
- **匯入還原**:`importFromJson` 解析 `point_programs` → 回傳 `pointPrograms`,App 以 `mergePointPrograms` 併回 settings。round-trip 一致。
- **推薦/比較**:`valueOf`/`netScore` 以 `pointPrograms` 衍生的 `{name: rate}` 數字 map 估值(不分 basis);UI 在含 estimate 點時標「含估算點值,僅供參考」以降低誤解。
- **現金回饋 ≠ 點數**:回饋金記台幣(`Income:Rewards:*`),**不**當 commodity。只有會累積/過期的點數計畫才用 commodity。
- **時間語意**:規則的 `period.start/end`(回饋節點)gate「哪段日期適用」;`period.cycle`(上限/門檻)是重複窗口;**點值的時間區間**由匯出的 `point_programs.<name>.prices[].from`(dated 序列)+ ledger 的 dated `price` 提供。三者皆以交易日期對齊,彼此獨立。

## 消費屬性:tag 還是 metadata

**此對應屬 plugin,不寫進規則 JSON。** 規則 JSON 只定義抽象的 match 欄位詞彙(`match.channels/categories/payment_methods/is_overseas/currency/custom/or_groups`);「這些欄位實體上如何出現在一筆 Beancount 交易」由 plugin 決定。

供 plugin 參考的一般原則(來自社群慣例,無強制標準):
- **帶值 / 可比較**(MCC 數字、門檻、custom 的 gte/lte)→ **metadata**(可存 Decimal、BQL 可查)。
- **純布林旗標**(海外、可報帳)→ **tag**(`#overseas`);Beancount metadata 沒有官方 boolean 型別。
- **一筆多值**(同時屬多類別)→ **多個 tag**;metadata 欄位不能是 list、重複 key 只留第一個。
- **類別** → 慣例上就是**支出科目**(`Expenses:Food:Dining`),而非另設欄位。
- key 命名衝突(Fava 會把 metadata key `tags` 當內建欄位)→ 需要時由 plugin 加 namespace,於 plugin 端決定。

## 誠實的可得性(避免想太多)

銀行 CSV 通常只有:日期、金額、幣別、說明文字(payee/narration)。因此:
- **穩定可匹配的最小集合**:金額、幣別、(由幣別/手續費推斷的)海外、(richer export 偶有的)MCC。
- 通路 / 類別 / payment_method 在多數帳單中**不存在**,屬「使用者後續以 tag/metadata 自行加註」或「由 payee 文字/MCC 推導」。**現階段不為它們訂死 ingestion 慣例**;等真的做出一支 bank importer、看清楚欄位怎麼來,再從那裡反推慣例。

## 下游 Beancount plugin 的職責(契約清單,未實作)

當未來要實作 plugin(獨立專案)時,它負責:
1. 載入本規則 JSON。
2. 評估引擎(移植 `simulate` / `simulateMonth`:含 or_groups、tiers、月度期間上限封頂、gate 解鎖、擇優、一次性)。
3. `point_name` → commodity 符號的產生/別名;render `commodity` 與(選用)`price` 宣告。
4. 抽象 match 欄位 → Beancount 交易的 tag/metadata/posting 的對應與讀取;`is_overseas` 推斷、payee/narration 解析。
5. 產生回饋 posting(`Income:CreditCard:Reward:*` ↔ 卡片/應收)。

## 本次對 CardForge 的變更(已實作)

- `src/store/settings.js`:`pointRates`(number map)升級為 `pointPrograms`(`{name:{basis,rates:[{from,rate}]}}`,dated 階梯),含多代舊資料遷移;`setPointBasis`/`setPointRates`/`setCurrentRate`/`mergePointPrograms` + 純函式 `effectiveRate`/`effectiveIndex`/`todayISO`。
- `src/components/AnalyzePanel.jsx`:點數計畫編輯器 = 固定/估算 + 可增刪的「日期→匯率」階梯;以 `effectiveRate(p, today)` 衍生引擎用的 `rates` 數字 map;含 estimate 時於試算/比較標示。
- `src/inspector/RewardFields.jsx`:點數型回饋內嵌編輯 basis + baseline 匯率(多段時導向分析面板)。
- `src/lib/exportJson.js`:`exportToJson(nodes, edges, {pointPrograms})` 輸出 `point_programs.<name>.prices`(dated 序列,只含用到的點);移除無用的 `reward.point_value`。
- `src/lib/importJson.js`:解析 `point_programs.prices`(+ 舊單筆 back-compat)→ 回傳 `pointPrograms`。
- `src/lib/lint.js`:`lintGraph(nodes, edges, pointPrograms)` 新增點數匯率完整性檢查(只抓「已設定但不完整」:缺數值/≤0=error、缺有效日期=error、重複生效日=warning;未設定者預設 1,不誤報)。
- `src/App.jsx`:匯出/預覽帶入 `pointPrograms`;lint 帶入 `pointPrograms`;匯入/載入範例以 `mergePointPrograms` 還原。

## 明確不做(YAGNI)

- 不在 JSON 輸出 Beancount **語法**(`commodity SHUMU` / `points-value:` / `price` 指令字串)——只輸出中性數字,語法由 plugin render。
- 不在 CardForge 指定 commodity **符號**(大寫 ticker)——plugin 端產生/別名。
- 不在 JSON 定義 `cf-*` metadata 或 tag 慣例——屬 plugin。
- 不建「可兌換品項表自動取 max」——估算為使用者手動換算一個數字即可。
- 不現在實作 Beancount plugin(獨立專案,以本文件為契約)。

## 驗證

- `pnpm lint` 零錯、`pnpm build` 綠。
- `effectiveRate` step function:`[{0.1},{from:11/10,0.05}]` → 9月=0.1、11/10=0.05、12月=0.05。
- `point_programs` round-trip:export 輸出 dated `prices`(baseline 無 from)→ import 還原為 `{basis,rates:[{from,rate}]}`。
- Lint:demo(點未設匯率)維持「✓ 無誤」;設定有效匯率仍「✓」;清空已設匯率 → 立即「✕ 1」(抓到不完整)。
- UI:點數計畫階梯可增刪;回饋節點內嵌編輯與面板同步;無 console 錯誤。舊 `pointRates`/單筆 `pointPrograms` 自動遷移。
