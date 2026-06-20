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
   (擇優,取回饋最高一個)、`stacking.top_group` + `top_groups`(取高,取當期消費最高 K 類)。

一張卡通常是「多條規則」的集合,每條規則 = 一個 MATCH → 一個 REWARD,外加可選的約束。

---

## 頂層結構(資料庫)

匯入可接受「單卡」`{card, rules}` 或「資料庫」`{cards:[...]}`。**產出請用資料庫形式**:

```json
{
  "cards": [ /* 一或多張卡 */ ],
  "point_programs": {
    "亞洲萬里通": { "basis": "fixed", "prices": [ { "twd_per_point": 0.3 } ] }
  }
}
```

- `point_programs`(可選,**資料庫層級**,與 `cards` 同層):卡片規則用到的點數其「點值」。
  - `basis`: `"fixed"`(官方明訂點值)或 `"estimate"`(彈性點/里程,取最佳兌換的估算)。
  - `prices`: `[{ "from"?: "YYYY-MM-DD", "twd_per_point": number }]`。`from` 省略 = 起始基準值;
    多筆 = 隨日期變動的階梯。**只在官方有明確固定點值時填**;彈性點/里程設 `basis:"estimate"`
    並可省略價格(由使用者在 app 內維護)。
  - 規則只透過 `reward.point_name` 連結到點數**名稱**;點值不寫進規則(它隨時間變、屬於下游帳本)。

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
  "eligibility_pools":  { "<poolId>": { "min_spending": { "amount": 30000, "currency": "TWD", "period": "monthly" }, "members": ["<ruleId>"] } }
}
```

- `card`:卡片名稱(字串)。
- `rounding`:`"floor"`(預設)、`"round"`、`"ceil"`、`"none"` —— 每筆回饋的進位方式。
- `fx_fee_rate`:海外手續費率(%),預設 1.5。
- `rules`:**物件(map)**,key = ruleId,value = 規則。
- `top_groups` / `limit_pools` / `eligibility_pools`:見下方「取高」「上限(共用池)」「門檻(共用)」。
  共用池只在「同一個約束被多條規則共享」時才需要;單一規則自用時直接寫在規則內(見各節)。

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
  "eligibility": { /* 見「門檻」,可為空物件 {} */ },
  "reward": { /* 見「REWARD」 */ },
  "tiers": { "mode": "flat" },
  "limits": { /* 見「上限」,可為空物件 {} */ },
  "stacking": { "layer": "base", "group": "sinopac", "select_group": "...", "top_group": "..." },
  "settlement": "once",
  "requires_activation": true,
  "note": "細則:喬山限街邊門市、Nuli限官網訂閱;不含稅與保費",
  "reward_posting": { "account": "Income:CreditCard:Reward:..." },
  "provenance": { "generated_by": "cardforge" }
}
```

- `account`:這張卡在帳本中的負債科目(例 `Liabilities:CreditCard:<Bank>:<Card>`);同卡所有規則一致。
- `period.cycle`:`"monthly"` / `"quarterly"` / `"yearly"` / `"billing_cycle"` / `"once"`。
- `period.start` / `period.end`(可選,`YYYY-MM-DD`):限時活動 / 輪動檔期。
- `note`(可選,純文字):**最後手段**。個別細則/子限制請**優先結構化**——能用 match 欄位/自訂
  述詞描述的(如「喬山限街邊門市」=該特店拆成獨立規則 + `channels:[實體門市]`,共用上限池),
  就用元件表達,讓引擎真正執行;`note` 只留給**真的無欄位可對應的純文字**。隨規則匯出/匯入、
  編輯器可見、不參與試算。
- `is_active`(預設 `true`):**模擬器會讀**。`false` = 規則保留但**不參與試算**(引擎跳過)。
  用於限時/新戶取得型促銷:存著、可見,但不灌爆日常回饋估算。
- `settlement: "once"`:里程碑(編輯器標「里程碑(達標給一次)」):完成一次發一筆、單獨列示、繞過上限。逐筆累積型回饋用 `"recurring"`(編輯器「逐筆回饋」)。
- `requires_activation: true`:需登錄才生效;**只在官網明寫需登錄時才設,不要推論**(模擬器不讀此旗標)。
- `stacking.layer`:`"base"`(基本)/ `"bonus"`(加碼,可疊加)/ `"exclusive"`(排他)。
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
  "merchants": ["7-11", "全家", "星巴克"],
  "payment_methods": ["apple_pay", "google_pay", "line_pay", "jkopay", "pxpay"],
  "min_amount_twd": 1000,
  "custom": [ { "field": "day_of_week", "op": "in", "value": ["sat", "sun"] } ],
  "exclude": { "categories": ["gas"] },
  "or_groups": [ [ { "categories": ["dining"] }, { "channels": ["online"] } ] ]
}
```

**可用列舉(優先使用;沒有對應的才用 `custom`):**
- `channels`:`online`(網購)、`mobile_pay`(行動支付)、`contactless`(感應)、`overseas`(海外)。
- `categories`:`dining`(餐飲)、`supermarket`(超市)、`convenience`(超商)、`gas`(加油)、
  `travel`(旅遊)、`streaming`(影音)、`department`(百貨)、`drugstore`(藥妝)。
- `payment_methods`:`apple_pay`、`google_pay`、`samsung_pay`、`line_pay`、`jkopay`(街口)、
  `pxpay`(全支付)、`easywallet`(悠遊付)、`ipass_money`(一卡通MONEY)、`taiwan_pay`(台灣Pay)、
  `pi_wallet`(Pi錢包)、`easycard`(悠遊卡)、`ipass`(一卡通)。
- `currencies`:ISO 幣別碼(`JPY`/`USD`/`EUR`…);`is_overseas` 為布林(true=海外、false=國內)。
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
```

- `bands[].rate` 同樣是小數比率;`min_amount` 是金額門檻。
- **spend vs marginal 的差別**:spend 選「一個」費率套整筆;marginal 把金額切段、各段分別計、加總。
  「超過 X 元的部分享 Y%」→ 用 **marginal**;「當期滿 X 元起整筆升級為 Y%」→ 用 **spend**。

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
```

- 多條規則共用同一道門檻 → 用 pool:規則寫 `"eligibility": { "pool": "<poolId>" }`,卡片層
  `eligibility_pools` 註冊 `min_spending` 與 members。
- 門檻 = **下限/解鎖**,上限 = **上限/截斷**,兩者是鏡像、各自獨立,不要混用。

### 擇優(取回饋最高一個)—— `stacking.select_group`

多條規則互斥、每筆只取「回饋最高」的那一條(現金 vs 點數會換算後比較):

```json
// 互斥的數條規則都帶同一個 select_group 字串
"stacking": { "layer": "base", "group": "x", "select_group": "grp-best" }
```

- `select_group` 只是個共用字串 id(K 隱含為 1,取最高一個);不需另外註冊。
- 「擇優之後還有總上限」→ 在參與規則上照常加 `limits.caps`;引擎會「先擇優、再對勝出者套上限」。

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
- **擇優 vs 取高**:擇優取「回饋金額最高的那條規則」(同一筆比較);取高取「當期消費最高的類別」
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

## 產出檢查清單

1. 用**資料庫形式** `{cards:[...]}`;每張卡 `card` / `account` / `rounding` 齊全。
2. 每條規則含 `match` / `reward` / `tiers`(至少 `{mode:"flat"}`)/ `limits`(至少 `{}`)/ `stacking`。
3. 比率一律小數(0.05 ≠ 5)。
4. 點數規則給 `reward.point_name`,並在頂層 `point_programs` 補 `basis`(官方固定點值才填價格)。
5. 多重上限 → `limits.caps[]`;前$X消費 → `metric:"spend"`;前N筆 → `metric:"count"`;超額累進 → `tiers.mode:"marginal"`;自動最高類別 → `top_group` + `top_groups{k}`。
6. **務必執行 `node scripts/validate.mjs <檔案>` 並通過**,再交付。
</content>
