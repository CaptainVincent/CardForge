# CardForge 規則 JSON — 完整格式參考(權威)

這份文件描述 **CardForge 引擎可表達的全部規則**。產生 JSON 前務必通讀,產生後務必用
`scripts/validate.mjs` 驗證。

> **真實來源(source of truth)**:`src/lib/importJson.js`(載入)、`src/lib/exportJson.js`
> (匯出/round-trip)、`src/lib/simulate.js`(模擬語意)。本文件若與程式不符,以程式為準
> —— `validate.mjs` 會以實際引擎檢查,抓出任何不一致。

## 心智模型:三軸

每條規則由三個正交的軸組成。理解這點就不會把規則硬塞進錯的欄位:

1. **MATCH(這筆消費算不算數)** — `match`(條件)、`or_groups`(任一)、`eligibility`(門檻解鎖)。
2. **REWARD 公式(算多少)** — `reward`(比率/固定/每元送點)+ `tiers`(級距/超額累進)+ 點數計畫估值。
3. **RELATIONAL 約束(回饋之間/上限怎麼互動)** — `limits.caps`(上限)、`stacking.select_group`
   (擇一:擇優取最高/自選指定一條)、`stacking.top_group` + `top_groups`(取高,取當期消費最高 K 類)。

一張卡通常是「多條規則」的集合,每條規則 = 一個 MATCH → 一個 REWARD,外加可選的約束。

---

## 頂層結構(資料庫)

匯入可接受「單卡」`{card, rules}` 或「資料庫」`{cards:[...]}`。**產出請用資料庫形式**:

```json
{
  "cards": [ /* 一或多張卡 */ ],
  "point_programs": {
    "亞洲萬里通": { "basis": "fixed", "twd_per_point": 0.3 }
  }
}
```

- `point_programs`(可選,**資料庫層級**,與 `cards` 同層):卡片規則用到的點數其「點值」。
  - `basis`: `"fixed"`(官方明訂點值)或 `"estimate"`(彈性點/里程,取最佳兌換的估算)。
  - `twd_per_point`: 單一目前點值(number)。**無時間軸**——只記一個目前值;隨時間的匯率變動
    交由記帳端補,分析可就地微調比較。(匯入仍相容舊的 `prices:[{from?,twd_per_point}]`,取首筆。)
  - 規則只透過 `reward.point_name` 連結到點數**名稱**;點值不寫進規則(屬於下游帳本)。

---

## 卡片物件

```json
{
  "card": "永豐 幣倍卡",
  "rounding": "floor",
  "fx_fee_rate": 1.5,
  "rules": { "<ruleId>": { /* 規則 */ } },
  "top_groups":         { "<topId>":  { "k": 1 } },
  "limit_pools":        { "<poolId>": { "period": { "cycle": "monthly" }, "members": ["<ruleId>"] } },
  "eligibility_pools":  { "<poolId>": { "min_spending": { "amount": 30000, "currency": "TWD", "period": "monthly" }, "members": ["<ruleId>"] } },
  "eligibility_flags":  { "新戶": {}, "活動登錄": {} }   /* 不寫 default = 留未選,讓使用者選 */
}
```

- `card`:卡片名稱(字串)。
- `rounding`:`"floor"`(預設)、`"round"`、`"ceil"`、`"none"` —— 每筆回饋的進位方式。
- `fx_fee_rate`:海外手續費率(%),預設 1.5。
- `statement_day`(選填,1–28):帳單結帳日。設定後,週期為 `billing_cycle` 的上限/門檻會依結帳日
  切期(當日後的消費滾入下一期);不填則 `billing_cycle` 退回月。
- `opened`(選填,`YYYY-MM-DD`):持卡開始日。用來把規則的**相對新戶窗**(`period.from_opening_days`)
  解析成絕對檔期(見「規則 period」)。屬持卡人個人事實,可由消費端注入。
- `rules`:**物件(map)**,key = ruleId,value = 規則。
- `top_groups` / `limit_pools` / `eligibility_pools`:見下方「取高」「上限(共用池)」「門檻(共用)」。
  共用池只在「同一個約束被多條規則共享」時才需要;單一規則自用時直接寫在規則內(見各節)。
- `eligibility_flags`:具名**資格**註冊表(新戶 / 已線上登錄…),每項記 `default`(預設是否符合);
  見下方「資格(eligibility flags)」。

---

## 規則物件

```json
{
  "id": "rule-1",
  "name": "永豐幣倍卡 海外/餐飲 3%",
  "card": "永豐 幣倍卡",
  "account": "Liabilities:CreditCard:SinoPac:幣倍",
  "account_match": "exact",
  "is_active": true,
  "period": { "cycle": "monthly", "start": "2026-01-01", "end": "2026-12-31" },
  "match": { /* 見「MATCH」 */ },
  "eligibility": { /* 見「門檻」與「資格」,可為空物件 {} */ },
  "reward": { /* 見「REWARD」 */ },
  "tiers": { "mode": "flat" },
  "limits": { /* 見「上限」,可為空物件 {} */ },
  "stacking": { "layer": "base", "group": "sinopac", "select_group": "...", "top_group": "..." },
  "settlement": "once",
  "note": "細則:喬山限街邊門市、Nuli限官網訂閱;不含稅與保費",
  "reward_posting": { "account": "Income:CreditCard:Reward:..." },
  "provenance": { "generated_by": "cardforge" }
}
```

- `account`:這張卡在帳本中的負債科目(例 `Liabilities:CreditCard:<Bank>:<Card>`);同卡所有規則一致。
- `period.cycle`:`"monthly"` / `"quarterly"` / `"yearly"` / `"billing_cycle"` / `"once"`。
- `period.start` / `period.end`(可選,`YYYY-MM-DD`):限時活動 / 輪動檔期。
- `period.from_opening_days`(可選,整數):**相對新戶窗**——檔期 = 卡片 `opened` 起算 N 天。
  美系首刷禮(SUB)的標準寫法:`period:{from_opening_days:90}` + `eligibility.min_spending:
  {amount:4000, period:"total"}`(窗內累計門檻)+ `reward` 固定值 + `settlement:"once"`。
  引擎會把窗內累計到達門檻的那一筆發一次獎勵;窗外消費不計。需卡片有 `opened` 才解析。
- `note`(可選,純文字):**最後手段**。個別細則/子限制請**優先結構化**——能用 match 欄位/自訂
  述詞描述的(如「喬山限街邊門市」=該特店拆成獨立規則 + `channels:[實體門市]`,共用上限池),
  就用元件表達,讓引擎真正執行;`note` 只留給**真的無欄位可對應的純文字**。隨規則匯出/匯入、
  編輯器可見、不參與試算。
- `is_active`(預設 `true`):**模擬器會讀**。`false` = 規則保留但**不參與試算**(引擎跳過)。
  純編輯期停用(活動過期、暫時隱藏)用它;**新戶/登錄這類「需符合資格」改用 `eligibility.flags`**
  (見「資格」),語意更精確、可一個開關控多條。停用與「資格未符合」的下游在畫布上都顯示為
  **無用路徑(同一個變暗視覺)**,一眼看出該路徑不生效。
  例外:`select_group` 的 `pick`(自選)仍以 `is_active` 標出採用哪條(見「擇一」)。
- `settlement: "once"`:里程碑(編輯器標「里程碑(達標給一次)」):完成一次發一筆、單獨列示、**完全脫離 RELATIONAL 軸**(不參與擇優/取高、也不佔共用上限)。逐筆累積型回饋用 `"recurring"`(編輯器「逐筆回饋」)。
- `eligibility.flags`:二元**資格**(新戶 / 活動登錄…);見下方「資格」。已取代舊的 `requires_activation`
  旗標(該旗標已退役;匯入舊檔時會自動轉成 `活動登錄` 資格)。
- `stacking.layer`:`"base"`(基本)/ `"bonus"`(加碼)。**僅供顯示/分類,引擎不依它改變行為**
  (所有命中規則一律疊加)。要表達「互斥/擇一」請用**擇一**(`select_group`),不要用 layer。
- `stacking.group`:卡片層分組字串(通常 = 卡片 slug);同卡一致即可。

---

## MATCH —— `match`(這筆消費算不算)

所有欄位皆**可選**;同物件內多欄位是 **AND**,陣列欄位內多值是 **OR**。空 `match: {}` = 一般消費(全中)。

```json
"match": {
  "is_overseas": true,
  "currencies": ["JPY", "USD"],
  "channels": ["online", "mobile_pay", "contactless", "overseas"],
  "categories": ["dining", "supermarket", "convenience", "gas", "travel", "streaming", "department", "drugstore"],
  "mcc": ["5812", "5811-5814"],
  "merchants": ["7-11", "全家", "星巴克"],
  "payment_methods": ["apple_pay", "google_pay", "line_pay", "jkopay", "pxpay"],
  "min_amount_twd": 1000,
  "day_of_week": ["fri", "sat", "sun"],
  "day_of_month": [1, 20],
  "custom": [ { "field": "channel_brand", "op": "is", "value": "foodpanda" } ],
  "exclude": { "categories": ["gas"] },
  "or_groups": [ [ { "categories": ["dining"] }, { "channels": ["online"] } ] ]
}
```

**可用列舉(優先使用;沒有對應的才用 `custom`):**
- `day_of_week`(**卡友日/週幾限定**):`["mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"]`,任一命中即算。
- `day_of_month`(**每月某號**):`[1..31]`(數字),任一命中即算。
  兩者皆為**交易日期屬性**——引擎由交易 `date` 自動推算星期/日(單筆試算可顯式給 `dayOfWeek`/
  `dayOfMonth` 情境)。卡友日「週五夢時代+8%」「每月1號家樂福」等,用這兩個欄位、做成一條 match
  帶日期條件的**靜態規則**(不是動態情境)。贈品/折價/買一送一非%回饋 → 記 note。
- `channels`:`online`(網購)、`mobile_pay`(行動支付)、`contactless`(感應)、`overseas`(海外)。
- `categories`:`dining`(餐飲)、`supermarket`(超市)、`convenience`(超商)、`gas`(加油)、
  `travel`(旅遊)、`streaming`(影音)、`department`(百貨)、`drugstore`(藥妝)。
- `payment_methods`:`apple_pay`、`google_pay`、`samsung_pay`、`line_pay`、`jkopay`(街口)、
  `pxpay`(全支付)、`easywallet`(悠遊付)、`ipass_money`(一卡通MONEY)、`taiwan_pay`(台灣Pay)、
  `pi_wallet`(Pi錢包)、`easycard`(悠遊卡)、`ipass`(一卡通)。
- `currencies`:ISO 幣別碼(`JPY`/`USD`/`EUR`…);`is_overseas` 為布林(true=海外、false=國內)。
- `mcc`:**MCC 一級欄位**(美系卡常依 MCC 判別)。陣列,每項為單碼(`"5812"`)或範圍
  (`"5811-5814"`,含端點);交易的 `mcc` 命中任一即算。比 `categories`(策展類別)更精準,
  能表達官網明列 MCC 的加碼;不必再塞 `custom`。
- `merchants`:**指定特店**(特定商家,自由字串,如 `7-11`/`星巴克`/`蝦皮`)。與 `categories`
  是「實例 vs 類型」的關係:`categories` 是商家*類型*(超商),`merchants` 是*特定*商家(7-11)。
  只有官方明寫某家店才用 `merchants`;一般用 `categories` 即可。可單用、也可與 `categories` 併用
  (「超商,但限 7-11」)。

**`custom` 萬用述詞**(表達內建列舉沒有的條件,例如指定通路品牌、星期、首購):
`op` ∈ `is` / `is_not` / `in` / `not_in` / `gte` / `lte` / `contains`;`value` 為字串、數字或陣列。

**`exclude`**(NOT):命中 exclude 子句即不算(例:加碼類別但排除加油站)。
**`or_groups`**(CNF):每個內層陣列代表「其中之一即可」;多個陣列彼此 AND。用於跨欄位的「任一」。

> ⚠ 不要在同一規則同時 require 又 exclude 同一個值(永不命中)——`validate.mjs` 會抓出來。

---

## REWARD —— `reward`(算多少)

三種 `method`:

```json
// 1) 百分比(現金回饋或定率送點)
"reward": { "type": "cashback", "method": "percentage", "rate": 0.03 }          // 3%
"reward": { "type": "points",   "method": "percentage", "rate": 0.05, "point_name": "永豐幣倍點" }

// 2) 固定金額
"reward": { "type": "cashback", "method": "fixed", "fixed_amount": 100, "reward_currency": "TWD" }

// 3) 每 N 元送點
"reward": { "type": "points", "method": "per_dollar", "per_dollar": 30, "points_per_unit": 1, "point_name": "亞洲萬里通" }
```

- `rate` 是**小數比率**(0.05 = 5%),不是百分比數字。
- `type: "points"` 時務必給 `point_name`,並在頂層 `point_programs` 補上其 `basis`(及官方固定點值)。

### 級距 / 超額累進 —— `tiers`(REWARD 公式的變體)

```json
"tiers": { "mode": "flat" }                               // 無級距(用 reward.rate)

"tiers": { "mode": "spend",     "bands": [ { "min_amount": 0, "rate": 0.01 }, { "min_amount": 10000, "rate": 0.1 } ] }
// 消費級距:依「當期累積消費」落點,整筆套單一最高符合費率(滿1萬→全部10%)

"tiers": { "mode": "marginal",  "bands": [ { "min_amount": 0, "rate": 0.01 }, { "min_amount": 10000, "rate": 0.05 } ] }
// 超額累進:每段金額各套自己的費率(前1萬→1%,超過1萬的部分→5%)

"tiers": { "mode": "distinct_count", "count_label": "不同品牌數",
           "bands": [ { "min_count": 2, "rate": 0.01 }, { "min_count": 5, "rate": 0.04 } ] }
// 計數級距(通用):費率由「當期某個計數」決定,取最高符合檔。count_label = 這個計數
// 代表什麼(品牌數/天數/筆數…,純顯示,由你定義)。門檻用 min_count(非金額)。
// 用途例:踩點(當期不同品牌數越多檔位越高)。計數為情境輸入(分析給、記帳判定),
// 引擎不自動推算 → 單筆試算無計數時不加碼。
```

- `bands[].rate` 同樣是小數比率;`min_amount`(金額)/ `min_count`(計數)是門檻。
- **spend vs marginal 的差別**:spend 選「一個」費率套整筆;marginal 把金額切段、各段分別計、加總。
  「超過 X 元的部分享 Y%」→ 用 **marginal**;「當期滿 X 元起整筆升級為 Y%」→ 用 **spend**。
- **distinct_count(計數級距)**:當費率取決於「當期某個計數(不同品牌數、天數…)」而非金額時用;
  是通用機制(節點不綁特定用途),以 `count_label` 命名該計數。

---

## RELATIONAL 約束

### 上限 —— `limits.caps`

一條規則可有**多個**上限,各自獨立累加。每個 cap:

```json
"limits": {
  "caps": [
    { "metric": "reward", "window": "txn",    "max": 50 },     // 單筆回饋上限 $50
    { "metric": "reward", "window": "period", "max": 300 },    // 每期回饋上限 $300
    { "metric": "reward", "window": "total",  "max": 1000 },   // 累計(整個活動)回饋上限 $1000
    { "metric": "spend",  "window": "period", "max": 1500 },   // 每期「前 $1,500 消費」才享此回饋
    { "metric": "count",  "window": "period", "max": 2 }       // 每期「前 2 筆」才享此回饋
  ]
}
```

- `metric`:`"reward"`(回饋金額上限,截斷)、`"spend"`(消費金額上限,超出部分不給回饋 —— 表達
  「前 $X 消費享優惠」)、`"count"`(筆數上限,超過 N 筆後該筆回饋歸零 —— 表達「前 N 筆」)。
- `window`:`"txn"`(單筆)、`"period"`(每期,依 `period.cycle`)、`"total"`(累計)。
  `txn` 只對 `reward` metric 有意義。
  - **多期**:交易帶 `date` 時,`period` 上限每個**週期實例**(依該上限的 cycle:月/季/年)各自
    重置、`total` 橫跨整段;交易**不帶日期**時退化為單期(`period` 等同 `total`,共用一桶)。
  - ⚠️ `count`「前 N 筆」計入**每一筆命中的交易**(含 $0 或被擇優淘汰的筆),非僅「有回饋的筆」。
- **共用上限池**:當「同一個上限被多條規則共用」(例:多類別共用每月回饋上限),在 cap 加
  `"pool": "<poolId>"`,並在卡片層 `limit_pools` 註冊該 pool 與 members:

```json
// 規則 A 與 B 的 cap 都帶 "pool": "sinopac-pool-1"
"limit_pools": { "sinopac-pool-1": { "period": { "cycle": "monthly" }, "members": ["rule-a", "rule-b"] } }
```

### 門檻(解鎖)—— `eligibility`

「當期累積消費滿 X 才開始享回饋」:

```json
"eligibility": { "min_spending": { "amount": 30000, "currency": "TWD", "period": "monthly" } }
// 筆數門檻(當期滿 N 筆才享):metric:"count",amount = 筆數(無 currency)
"eligibility": { "min_spending": { "amount": 3, "metric": "count", "period": "monthly" } }
```

- `min_spending.metric`:`"spend"`(預設,amount=**金額**)或 `"count"`(amount=**筆數**,當期累積
  達 N 筆才解鎖)。筆數門檻各週期重置;單筆試算以 `periodCount` 情境(預設 1)代入。
- 多條規則共用同一道門檻 → 用 pool:規則寫 `"eligibility": { "pool": "<poolId>" }`,卡片層
  `eligibility_pools` 註冊 `min_spending` 與 members。
- 門檻 = **下限/解鎖**,上限 = **上限/截斷**,兩者是鏡像、各自獨立,不要混用。
- ⚠️ **單筆試算**未給「本期已累計消費」時以本筆金額代入,故一筆夠大的交易會自我解鎖門檻;
  「月度」逐筆累計版才精確(達標後**之後**的消費才享)。記帳端以實際當期累計判斷。

### 資格(eligibility flags)—— `eligibility.flags` + 卡層 `eligibility_flags`

二元**資格**:持卡人「符合與否」的條件,如**新戶**、**已線上登錄活動**。與門檻不同——門檻是
「累計消費資料驅動、會在期間中途解鎖」;資格是「情境變數、整段恆定、天生跨規則共用」。

```json
// 規則:列出需滿足的資格名稱(全部要符合,AND)
"eligibility": { "flags": ["新戶"] }
// 卡層:註冊每項資格的預設狀態
"eligibility_flags": { "新戶": {}, "活動登錄": {} }   // 不寫 default = 未選(慣例);要預設可寫 {"default": false|true}
```

- **同名 = 同一項資格**:多條規則寫同一個 `flags` 名稱,即「一個開關控多條」。分析面板依名稱
  去重成**一個 ✓/✗ 情境開關**,一勾全部解鎖。(畫布上可由一個資格節點扇出到多條回饋。)
- `default`:預設是否符合(`true`/`false`),**或省略 = 未選**。**慣例:省略(留未選),讓使用者選**——
  「我是不是新戶 / 有沒有登錄」是持卡人的事實,卡片不該替他預設。引擎把未選(或 `false`)當「未符合」
  → 日常試算**不灌水**;其下游在畫布上顯示為**無用路徑(變暗,與停用同視覺)**,使用者在編輯器選或在
  分析面板勾「符合」才亮起。(要硬寫預設仍可填 `false`/`true`。)取代過去 `is_active:false` 假裝關掉的做法。
- 與門檻可並存(同一 `eligibility` 物件可同時有 `min_spending`/`pool` 與 `flags`,引擎一律 AND)。
- 忠實原則不變:**只有官網明寫的資格才設**(明寫「限新戶」「需登錄活動」);不要推論。
  「綁定 Pay」屬 `match.payment_methods`,**不是**資格。

### 擇一(從互斥的數條取一條)—— `stacking.select_group`

節點名「**擇一**」;兩種選法:**擇優**(`mode:"best"`,引擎自動取最高)/ **自選**
(`mode:"pick"`,使用者指定)。多條規則互斥、每筆只取一條(現金 vs 點數會換算後比較):

```json
// 互斥的數條規則都帶同一個 select_group 字串
"stacking": { "layer": "base", "group": "x", "select_group": "grp-best" }
```

- `select_group` 只是個共用字串 id(K 隱含為 1,取最高一個)。
- 「擇優之後還有總上限」→ 在參與規則上照常加 `limits.caps`;引擎會「先擇優、再對勝出者套上限」。

**兩種決定方式 —— 卡層 `select_groups`(仿 `top_groups`):**
```json
"select_groups": { "grp-best": { "mode": "best" }, "grp-tier": { "mode": "pick" } }
```
- `mode:"best"`(**擇優**,預設):引擎每筆**自動取最高**(上述行為);卡層可省略不寫。
- `mode:"pick"`(**自選**):**使用者宣告**採用哪一條,其餘停用——用於**會員/身分等級**
  (大戶 L1/L2、方案別…)這種「非交易屬性、得使用者告知」的互斥選擇。表達方式:成員規則同
  `select_group`,並以 `is_active` 標出預設採用哪條(常見等級 `true`、其餘 `false`)。引擎不需特例:
  剛好一條 `is_active`,「擇優」對單一啟用者自得該條。畫布上該擇一節點以 radio 切換、未選會警示。

### 取高(取當期消費最高 K 類)—— `stacking.top_group` + `top_groups`

「系統自動把你當期消費最高的 K 個類別給加碼」(Citi Custom Cash、國泰 CUBE 自選):

```json
// 每個類別一條規則,都帶同一個 top_group;卡片層註冊 K
"rules": {
  "din": { "match": { "categories": ["dining"] },     "reward": { "type": "cashback", "method": "percentage", "rate": 0.05 }, "stacking": { "layer": "base", "group": "x", "top_group": "tg-rotate" }, "tiers": { "mode": "flat" }, "limits": {} },
  "trv": { "match": { "categories": ["travel"] },     "reward": { "type": "cashback", "method": "percentage", "rate": 0.05 }, "stacking": { "layer": "base", "group": "x", "top_group": "tg-rotate" }, "tiers": { "mode": "flat" }, "limits": {} }
},
"top_groups": { "tg-rotate": { "k": 1 } }
```

- 引擎每期依「各成員類別的累積消費」排名,只有前 `k` 名的類別實際給回饋,其餘該筆歸零。
- ⚠️ 排名以「當期**即時累積**消費」計、**不回溯**:期內排名翻轉時,先領先的類別在它領先當下已
  得的回饋不退(真實卡多為**期末結算**,可能略有出入;記帳端若需精確,以期末排名重算)。
- **擇一 vs 取高**:擇一(擇優)取「回饋金額最高的那條規則」(同一筆比較);取高取「當期消費最高的類別」
  (跨整期累積),概念不同,別混用。

---

## 完整範例(涵蓋多種構造)

```json
{
  "cards": [
    {
      "card": "示範銀行 旋鑽卡",
      "rounding": "floor",
      "fx_fee_rate": 1.5,
      "rules": {
        "base":  { "id": "base",  "name": "一般 1%",       "card": "示範銀行 旋鑽卡", "account": "Liabilities:CreditCard:Demo:旋鑽", "account_match": "exact", "is_active": true, "period": { "cycle": "monthly" }, "match": {}, "eligibility": {}, "reward": { "type": "cashback", "method": "percentage", "rate": 0.01 }, "tiers": { "mode": "flat" }, "limits": {}, "stacking": { "layer": "base", "group": "demo" } },
        "oversea": { "id": "oversea", "name": "海外 3%(每月回饋上限$300)", "card": "示範銀行 旋鑽卡", "account": "Liabilities:CreditCard:Demo:旋鑽", "account_match": "exact", "is_active": true, "period": { "cycle": "monthly" }, "match": { "is_overseas": true }, "eligibility": {}, "reward": { "type": "cashback", "method": "percentage", "rate": 0.03 }, "tiers": { "mode": "flat" }, "limits": { "caps": [ { "metric": "reward", "window": "period", "max": 300 } ] }, "stacking": { "layer": "bonus", "group": "demo" } },
        "din":   { "id": "din",   "name": "取高·餐飲 5%", "card": "示範銀行 旋鑽卡", "account": "Liabilities:CreditCard:Demo:旋鑽", "account_match": "exact", "is_active": true, "period": { "cycle": "monthly" }, "match": { "categories": ["dining"] }, "eligibility": {}, "reward": { "type": "cashback", "method": "percentage", "rate": 0.05 }, "tiers": { "mode": "flat" }, "limits": {}, "stacking": { "layer": "bonus", "group": "demo", "top_group": "tg" } },
        "trv":   { "id": "trv",   "name": "取高·旅遊 5%", "card": "示範銀行 旋鑽卡", "account": "Liabilities:CreditCard:Demo:旋鑽", "account_match": "exact", "is_active": true, "period": { "cycle": "monthly" }, "match": { "categories": ["travel"] }, "eligibility": {}, "reward": { "type": "cashback", "method": "percentage", "rate": 0.05 }, "tiers": { "mode": "flat" }, "limits": {}, "stacking": { "layer": "bonus", "group": "demo", "top_group": "tg" } }
      },
      "top_groups": { "tg": { "k": 1 } }
    }
  ]
}
```

---

## 消費端:結合 beancount 記帳(回饋週期 / 資格 / 估值)

這份 JSON 是**引擎中立的「規則事實」**:描述「什麼條件、給多少、上限多少」,但**刻意不含**三件
隨時間/個人而變、屬於**下游帳本**的事:點值多少、你實際符不符合資格、某筆落在哪個週期。用
beancount 由規則產生回饋 posting 時,依下列對應解讀(規則本身不變,變的是你餵進去的「事實」)。

### 回饋週期 —— `period` + `limits.caps[].window`
- `period.cycle`(`monthly` / `quarterly` / `yearly` / `billing_cycle` / `once`):**累計的邊界標示**。
  上限 `window:"period"` 與門檻 `min_spending.period` 的「當期」就是指這個週期。記帳端據此**把交易
  分桶**——同一 cycle 內的交易共用同一個累計器;`billing_cycle` 以該卡帳單結帳日為界。
- `period.start` / `end`(選填,`YYYY-MM-DD`):活動檔期。**交易帶 `date` 時引擎會自動依檔期生效/
  失效**(落在 `start~end` 外的交易不命中該規則 → 輪動季度 = 多條 dated 規則自然成立);交易**不帶
  日期**時不過濾(視為恆在,單期行為)。記帳端只要餵入每筆的日期即可,毋須自行判斷檔期。
- `limits.caps[].window`:`txn`(單筆)/ `period`(每 cycle)/ `total`(整個 `start~end` 檔期)。
  記帳端需**跨交易累計**:每筆先算回饋,再依該 cap 的桶截斷(同 `pool` 的跨規則共用一個桶、否則
  per-rule);`period` 桶每個 cycle 重置、`total` 桶橫跨整段檔期不重置。`metric`:`reward`(扣回饋額)
  / `spend`(前 $X 消費,按比例)/ `count`(前 N 筆)。

### 資格 —— `eligibility`(本段重點)
- `min_spending`(門檻):用你帳本**實際**的當期累計消費判斷是否達標;達標後的消費才產生該回饋。
- `flags`(資格,如新戶 / 活動登錄):一組 **AND 前置條件**。卡層 `eligibility_flags[name].default`
  只是**模擬器的保守假設**(慣例 `false`)——**記帳端不可照搬,要用「真實事實」覆蓋**:
  - 維護一份**事實表**:`{ card, flag, 為真區間 [from, until] }`(例:新戶 = 核卡日 ~ +N 天;
    活動登錄 = 你實際登錄日 ~ 活動結束)。
  - 產生 posting 時,對交易日 D 查表:該 flag 在 D 是否為真。**任一所需 flag 為假 → 不產生**該規則
    的回饋 posting(這正是 default `false` 的精神:沒有事實證明符合,就別記、以免高估)。
  - 「資格分月份 / 某時符合某時不符合」的時間邏輯**完全由記帳端掌握**(對應引擎維持單期、不讀日期)。

### 其他要一起讀的欄位
- `is_active: false`:規則**完全不生效**(過期、或擇一·自選未採用的那條)→ 不產生 posting。
  (`select_group: "pick"` 群組中,只有唯一 `is_active: true` 的那條成立。)
- `settlement: "once"`:**一次性里程碑**(首刷禮…)——整段檔期只產生**一筆**、且**不佔上限**;
  其餘 `"recurring"` 則逐筆累積、受 `caps` 約束。
- `reward.point_name` + 頂層 `point_programs`:回饋是**點數**時規則只給名稱;**點值(TWD/點)屬帳本**
  (`basis:"fixed"` 用官方比值、`"estimate"` 用你錨定的兌換估值;`twd_per_point` 為單一目前值,**無時間軸**)。
  隨時間的匯率變動由記帳端維護一份 price db,記帳時用「**交易日當時生效**的點值」換算金額。
- `reward_posting.account`:回饋記入的收入科目(`Income:CreditCard:Reward:...`);卡片 `account` 是
  該卡負債科目;`rounding`(`floor`/`round`/`ceil`/`none`)決定每筆回饋進位。

### 產生一筆回饋 posting 的判定流程
對每筆真實交易(日期 D、金額、通路 / 類別 / 特店 / 支付…),逐條規則:
1. `is_active !== false`?否 → 跳過。
2. `match` 命中?(含 `exclude` / `or_groups`)否 → 跳過。
3. `period.start`/`end` 存在時,D 在範圍內?否 → 跳過。
4. `eligibility.flags` 每項 → 查事實表,D 當天為真?有一項假 → 跳過。
5. `eligibility.min_spending` → 用帳本當期實際累計判斷已達標?未達 → 跳過。
6. 依 `reward`(+ `tiers`)算金額;點數用 D 當時生效點值換算。
7. 依 `limits.caps[]`(per-rule 或 `pool` 共用桶,按 cycle / total 累計)截斷。
8. `select_group`(取最高 / 自選)、`top_group`(當期消費最高 K)若適用 → 決定這筆是否被取代/排除。
9. 成立 → 依 `rounding` 進位,記一筆到 `reward_posting.account`。

> 一句話:**規則給「條件與公式」,你給「事實與時間」**——交易日、實際資格、實際累計消費、當時點值,
> 都由記帳端注入;引擎欄位本身是穩定不變的依據。

---

## 產出檢查清單

1. 用**資料庫形式** `{cards:[...]}`;每張卡 `card` / `account` / `rounding` 齊全。
2. 每條規則含 `match` / `reward` / `tiers`(至少 `{mode:"flat"}`)/ `limits`(至少 `{}`)/ `stacking`。
3. 比率一律小數(0.05 ≠ 5)。
4. 點數規則給 `reward.point_name`,並在頂層 `point_programs` 補 `basis`(官方固定點值才填價格)。
5. 多重上限 → `limits.caps[]`;前$X消費 → `metric:"spend"`;前N筆 → `metric:"count"`;超額累進 → `tiers.mode:"marginal"`;費率依當期計數(品牌數/天數…)→ `tiers.mode:"distinct_count"`(+`count_label`);自動最高類別 → `top_group` + `top_groups{k}`。
6. **務必執行 `node scripts/validate.mjs <檔案>` 並通過**,再交付。
</content>
