---
name: card-to-json
description: Use when given a credit-card official URL (or card name) and asked to produce CardForge rule JSON. Explores the official site within bounds, extracts the card's reward rules, maps them onto the full CardForge schema (match/reward/tiers/limits/gate/select/top/points), self-validates against the real engine, and outputs importable JSON plus notes.
---

# 信用卡官網 → CardForge 規則 JSON

輸入一張信用卡的**官方網址**(或卡名),自由但有節制地探索官方頁面,把該卡的回饋規則
轉成 **可被 `importFromJson` 載入的 CardForge JSON**,並附上註記。產出前一定先讀 schema、
產出後一定用驗證腳本確認引擎真的吃得下。

## 黃金準則

- **schema 先行**:動手前先完整讀 `references/schema.md`(三軸模型 + 全部構造 + 範例)。
  它是這份規則語言的權威;不要憑印象造欄位。
- **引擎是真相**:產出後**必須**執行 `scripts/validate.mjs` 並通過。它用 CardForge 真正的
  `importFromJson / nodeIssues / exportToJson / simulateMonth` 檢查,會抓出「看起來對但引擎
  不支援」的東西。沒過就修,修到過為止。
- **忠實 > 完整**:只寫官方頁面**明確寫出**的規則。推測、業界慣例、過期活動 → 寫進「註記」,
  不要混進規則。不確定的數字寧可標註待確認,也不要編。
- **回中文**:對話與註記用繁體中文。

## 流程

建議用 TodoWrite 建立以下步驟逐一完成。

### 1. 讀 schema
讀 `references/schema.md`。確認你掌握:`match`(含 exclude / or_groups / custom)、三種
`reward.method`、`tiers`(flat / spend / **marginal**)、`limits.caps`(**reward / spend / count**
× txn / period / total,含共用 pool)、`eligibility`(門檻、共用 pool)、`select_group`(擇優)、
`top_group` + `top_groups`(取高)、`point_programs`(點數估值)。

### 2. 有節制地探索官網(文字 → 圖片,兩層)

**2a. 文字優先(最可靠、最好解讀)**
- 從使用者給的 URL 開始,用 WebFetch 取得頁面。
- **範圍限制**:只在**同一官方網域**內,跟進與「權益 / 回饋 / 費率 / 注意事項 / 條款 / 活動辦法」
  直接相關的連結與 **PDF**(`Read` 可直接讀 PDF)。建議上限約 5–8 頁;避免無關連結、外部站、登入牆。
- 抓取重點:各通路/類別/特店回饋率、加碼條件、回饋上限(每月/每筆/總額/筆數)、最低消費門檻、
  排除項目、點數名稱與官方點值、輪動/自選類別機制、活動檔期與是否需登錄、海外手續費、新戶禮。

**2b. 讀圖(關鍵 — 因為 WebFetch 會丟棄圖片)**
信用卡頁的**指定特店/通路清單、費率圖**常常**只存在於圖片**,且銀行圖片多半沒有有用的 `alt`。
若文字層提到「指定特店 / 指定通路 / 最高 N%」卻沒有完整清單,**務必讀圖**,但要「猜對圖」:

```
node <skill 目錄>/scripts/find-card-images.mjs <頁面網址>
```
此工具依兩個已驗證的訊號(**鄰近回饋關鍵字** + **圖片尺寸**)把候選圖排序(大圖、近回饋文字者優先;
icon/CTA 按鈕自動沉底),並印出每張的文字脈絡。**對前幾張候選用 `Read` 視覺讀取**,抽出特店/費率。
- 不要逐張亂猜圖片網址(會讀到「申請按鈕」之類雜訊);用排序後的前幾張即可。
- 讀到的特店/費率務必與文字/條款**交叉驗證**;含糊的(例「其他指定通路」)以圖片清單為準。
- (腳本與本 `SKILL.md` 同目錄。)若該工具回報「0 張內容圖」或頁面為 **JS 動態渲染**(curl 抓到空殼),
  代表抓不到圖 —— 改用 WebFetch 再試、或請使用者直接提供該圖片網址(可用 `Read` 視覺讀取)。

- 找不到關鍵數字就記下來,別猜。

### 3. 映射到構造(對照 schema)
逐條把規則落到正確的軸:
- 「滿額才開始享(%)」→ `eligibility.min_spending`(門檻);門檻是「解鎖後續消費的回饋」。
- **「當期累積滿額 → 送固定獎勵、給一次」**(如「當月滿 3,000 送 300」)= 門檻 + **固定金額**回饋,
  兩種等價表達,差在 300 計在哪:
  - **`settlement:"once"`**:列為一次性(放「另有一次性」清單、**不計入**當期回饋總額、繞過上限)。
    固定金額沒有上限問題,所以這是「一次性里程碑/滿額禮」最自然的表達。
  - **`{metric:"count", window:"period", max:1}`(不設 once)**:**計入**當期回饋總額。
  選哪個看你要不要把它算進「當月回饋總額」。
- **「只限某檔期」≠「結算方式」**:活動只在某段期間,用 `is_active`/`period` 表達(時間軸);
  「給一次」用上面的結算方式(發放軸)。兩軸獨立,別混。
- **唯一不能用 `once` 的:比例 + 上限累積型**(如「20% 上限 500」)——`once` 會繞過上限、只算
  第一筆 → 低估又爆上限。這種一律「每筆循環 + `window:"total"` 上限(+ 限時用 `is_active`)」。
- 「回饋上限 $X / 月」→ `caps metric:reward window:period`;「前 $X 消費享優惠」→ `metric:spend`;
  「前 N 筆」→ `metric:count`;「單筆上限」→ `window:txn`。
- 「超過 X 元的部分享 Y%」→ `tiers.mode:"marginal"`;「當期滿 X 元整筆升級」→ `tiers.mode:"spend"`。
- 「數種優惠擇一」→ 同 `select_group`;「自動加碼最高消費類別」→ `top_group` + `top_groups{k}`。
- **官網活動檔期 → 填進該檔期所有規則的 `period.start`/`end`**(如「2026/1/1–6/30」→
  `start:"2026-01-01", end:"2026-06-30"`)。檔期內的加碼規則**每一條都要填**,別只填一條;
  卡片的常態基本回饋(非活動)可不填。⚠️ 引擎模擬**不依日期自動生效/失效**(日期屬記錄/
  匯出/編輯器顯示用);若要「過期就不算進試算」,改用 `is_active:false`。檔名後綴也依此檔期
  (上半年→`2026h1`)。
- **會員/身分等級制**(如 Level 1/2 上限或費率不同,取決於**帳戶身分**——大戶、資產餘額、
  方案等級——而非「這筆消費」):引擎無法從交易判斷身分,不可用單一規則表達「視身分而定」。
  **首選做法:tier 條件分流**——各等級一條規則(只差上限/費率),用一個自訂條件 `tier` 互斥分流:
  最常見等級用 `op:"not_in"` 排除其他值(當**預設**:未填或填該等級都生效)、其餘等級用
  `op:"is"` 限定。例:L1 `{field:"tier",op:"not_in",value:"L2"}`、L2 `{field:"tier",op:"is",value:"L2"}`。
  如此**試算表單會多一個 tier 欄位,選等級即自動套對應上限**,不必手動開關;互斥所以不會疊加。
  (替代做法:用 `is_active` 當等級開關——較精簡但要手動切。)
- 點數 → `reward.point_name` + 頂層 `point_programs`(官方固定點值填 `basis:"fixed"` 與價格;
  彈性點/里程填 `basis:"estimate"`,價格可留給使用者維護)。
- 內建列舉沒有的條件 → `match.custom` 述詞。
- **個別細則/子限制 → 優先「結構化」,不要丟進 note。** 大規則底下的小備註(如「喬山限街邊
  門市」「Nuli 限官網訂閱」)其實多半能用元件表達:把那個特店**拆成自己的一條規則**,在它的
  condition 加上額外條件(例 `merchants:[喬山] + channels:[實體門市]`,或自訂 chip/述詞),
  再讓它與母規則**共用同一個上限池**(`limits.caps[].pool` + 卡層 `limit_pools`)。如此細則會被
  引擎真正執行(線上消費就不給加碼),而非只是文字。可結構化的判準:該限制是「某個可被
  match 欄位/自訂述詞描述的條件」。
  - **只有真的無欄位可表達的純文字**(如純說明、無法對應到任何交易屬性的限制)才寫進 `note`。

### 4. 產生 JSON(直接存進 `cards/`,依命名慣例)
- 用**資料庫形式** `{ "cards": [ ... ], "point_programs": {...} }`。
- 比率一律小數;每條規則 `tiers` 至少 `{mode:"flat"}`、`limits` 至少 `{}`。
- 規則 `name` 用人類可讀的中文摘要,`account` 用 `Liabilities:CreditCard:<Bank>:<Card>`。
- **存到 repo 的 `cards/` 資料夾**(不是 /tmp),檔名遵循 `cards/README.md` 的慣例:

  ```
  cards/<bank>-<card>-<period>.json
  ```
  - 全英文、小寫、連字號;用銀行**官方英文名**(永豐=sinopac、國泰=cathay、玉山=esun…),
    不確定時合理音譯。
  - `<period>` = 該卡回饋**適用週期**,由規則推斷:活動檔期上半年→`2026h1`、下半年→`2026h2`、
    全年活動→`2026`、全年一次→`annual`、月度常態→`monthly`、一次性→`once`。
  - 例:永豐 SPORT 卡(官網檔期 2026/1/1-6/30)→ `cards/sinopac-sport-2026h1.json`。
- 產出後順手更新 `cards/README.md` 的「目前收錄」表格新增一列。

### 5. 驗證(必做,可迭代)
```
node <skill 目錄>/scripts/validate.mjs cards/<bank>-<card>-<period>.json
```
- 通過(✓)才算數。看 `features` 那行確認你想表達的構造(marginal / caps / 取高 / 擇優 / 門檻 /
  點數)數量符合預期 —— 若你以為加了某構造但 features 顯示 0,代表寫錯欄位,引擎沒認得。
- 未通過 → 依錯誤訊息修 JSON,重跑,直到通過。

### 6. 交付
- **檔案**:已存於 `cards/<bank>-<card>-<period>.json`(通過驗證),並已更新 `cards/README.md`。
  使用者可在 CardForge「資料 ▾ → 匯入 JSON」載入(貼上 / 檔案 / 網址皆可)。告知檔名與路徑。
- **註記**:資料來源頁面、做了哪些假設、哪些數字待確認、官網有提到但目前 schema 無法精確
  表達的部分(例如多期循環回饋 #5、階梯式上限 #6 —— 設計上刻意延後,可在註記說明近似做法)。

## 映射陷阱(務必避開 — 來自實戰修正)

**引擎是單期、只看「這筆消費」**:`period.start`/`end`(日期)與 `requires_activation` 會被
export/import 保留,但**模擬器不讀**(無法依日期/登錄狀態自動生效或失效)。`is_active` **則會被
模擬器讀取**——`false` 的規則會被跳過、不參與試算。所以:

- **限時 / 新戶取得型促銷**(如「核卡 45 天內綁 Pay 享 20% 刷卡金、限 N 名」)**寫成規則但設
  `is_active:false`**:規則存著、編輯器看得到、`name`/`note` 標明「限時/名額」,但**不參與日常試算**
  (引擎跳過它),不會把這張卡的日常價值灌爆(例:讓 Apple Pay 看起來像 25%)。比只寫進 note 好
  ——結構保留、可被使用者一鍵啟用。`window:"total"` 的上限仍照實填(代表整檔期上限)。
- 一次性里程碑/首刷禮(完成一次給固定獎勵)才用 `settlement:"once"`;**百分比 + 上限的促銷不是
  一次性**(它隨消費累積),別誤用 once。
- **`requires_activation` 只在官網明寫「需登錄/註冊活動」時才設**,不要推論。注意分辨:某段「加碼
  條件」常只屬於某幾條規則(如 +1%/+3% 需註冊 App),別把它套到沒寫的規則(如新戶禮)。「綁定
  Pay」屬於 `match.payment_methods`,**不是**登錄。沒寫就不要加——忠實 > 完整。

**讓「指定特店」看得見,不要藏進 `or_groups`**:當某個加碼是針對**特定商家/通路**(7-11、App
Store…),用一級的 `match.merchants` 表達,讓它成為一條看得出來的規則。

- 若「指定支付」與「指定特店」**共用同一個上限**(例:兩者合計月上限 300),**拆成兩條規則 +
  共用上限池**(各自 `limits.caps[].pool` 指向同一個 pool,並在卡片層 `limit_pools` 註冊),而不是
  把它們塞進同一個 `任一(or_groups)` 規則 —— 後者會讓特店「藏起來」、使用者看不到。
- 只有當「同一條規則的命中條件本身是跨欄位的或」(且不需各自獨立顯示)時,才用 `or_groups`。

## 已知表達邊界(誠實告知使用者)

CardForge 目前**可表達**:多通路/類別比率、固定/每元送點、spend/marginal 級距、reward/spend/count
多重上限(單筆/每期/總額、可共用池)、消費門檻解鎖、擇優、取高(動態最高消費類別)、排除、
跨欄位任一、自訂述詞、點數估值。

目前**尚未**精確表達(寫進註記,給近似):
- **多期循環回饋**(如「每年回饋一次年費抵用」)—— 引擎為單期模擬;可用 `period.cycle:"yearly"`
  近似,跨期累積語意有限。
- **階梯式上限**(上限本身隨消費級距變動)—— 用「每級距各一條規則 + 各自上限」近似。
</content>
