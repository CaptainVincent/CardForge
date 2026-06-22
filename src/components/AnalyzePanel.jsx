import { useMemo, useState } from 'react';
import { exportCards } from '../lib/exportJson';
import { simulate, simulateMonth, deriveTxFieldsFromJson, mergeFields, valueOf } from '../lib/simulate';
import { recommend, compareCards, usedPointNames } from '../lib/recommend';
import { useSettings, effectiveRate, ratesAsOf } from '../store/settings';
import ModalOverlay from './ModalOverlay';
import SegmentedControl from '../inspector/fields/SegmentedControl';
import { CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, CURRENCY_OPTIONS, BASIS_OPTIONS, labelOf } from '../lib/options';

const num = (v) => Number(v).toLocaleString();
// Effective reward rate — every reward product leads with "= X% back".
const pctText = (value, amount) => (amount > 0 ? `≈ ${((value / amount) * 100).toFixed(1)}% 回饋` : '');
const TABS = [
  { id: 'test', label: '試算' },
  { id: 'month', label: '週期累積' },
  { id: 'recommend', label: '推薦' },
  { id: 'compare', label: '比較' },
];
const pointsText = (points) => Object.entries(points).map(([n, v]) => `+${num(v)} ${n}`).join('、');

const txLabel = (t) => {
  const parts = [];
  if (t.date) parts.push(t.date);
  if (t.isOverseas === true) parts.push('海外');
  else if (t.isOverseas === false) parts.push('國內');
  if (t.currency) parts.push(t.currency);
  (t.channels || []).forEach((c) => parts.push(labelOf(CHANNEL_OPTIONS, c)));
  (t.categories || []).forEach((c) => parts.push(labelOf(CATEGORY_OPTIONS, c)));
  if (t.mcc) parts.push(`MCC ${t.mcc}`);
  if (t.merchant) parts.push(`@${t.merchant}`);
  if (t.paymentMethod) parts.push(labelOf(PM_OPTIONS, t.paymentMethod));
  return parts.join(' · ') || '一般消費';
};

function Chips({ label, opts, values, optionList, onToggle }) {
  return (
    <div>
      <span className="cf-field-label">{label}<span className="text-[var(--cf-text-faint)]">（不選＝不限）</span></span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {opts.map((v) => (
          <button key={v} type="button" className={`cf-chip${values.includes(v) ? ' is-active' : ''}`} onClick={() => onToggle(v)}>
            {labelOf(optionList, v)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AnalyzePanel({ nodes, edges, onClose }) {
  const cards = useMemo(() => exportCards(nodes, edges), [nodes, edges]);
  const cardFields = useMemo(() => cards.map((c) => deriveTxFieldsFromJson(c)), [cards]);
  const pointPrograms = useSettings((s) => s.pointPrograms);
  const setPointBasis = useSettings((s) => s.setPointBasis);
  const setPointRate = useSettings((s) => s.setPointRate);
  // Engine values points by a plain {name: rate} map (single current value).
  const rates = useMemo(() => ratesAsOf(pointPrograms), [pointPrograms]);
  const pointNames = useMemo(() => usedPointNames(cards), [cards]);

  const [tab, setTab] = useState('test');
  const [idx, setIdx] = useState(0);
  const sel = Math.min(idx, Math.max(cards.length - 1, 0));
  const fields = tab === 'compare' ? mergeFields(cardFields.length ? cardFields : [{}]) : (cardFields[sel] || {});

  const [f, setF] = useState({ amount: 1000, date: '', region: null, currency: null, country: null, channels: [], categories: [], mcc: '', merchant: null, paymentMethod: null, periodSpend: '', custom: {}, flags: {}, distinctCount: '', hasFee: true });
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const toggle = (key, v) => setF((s) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] }));

  const fixed = useMemo(() => {
    const t = { amount: Number(f.amount) || 0, custom: f.custom, periodSpend: f.periodSpend };
    if (f.region != null) t.isOverseas = f.region;
    if (f.currency) t.currency = f.currency;
    if (f.country) t.country = f.country;
    if (f.channels.length) t.channels = f.channels;
    if (f.categories.length) t.categories = f.categories;
    if (f.mcc) t.mcc = f.mcc;
    if (f.merchant) t.merchant = f.merchant;
    if (f.paymentMethod) t.paymentMethod = f.paymentMethod;
    // 情境假設(僅供比較,不寫回規則):資格符合與否、踩點當期不同品牌數。
    // 動態真實值(這月任務做了沒、實際家數)未來由記帳判定;這裡只是 what-if 旋鈕。
    t.flags = f.flags;
    if (f.distinctCount !== '' && f.distinctCount != null) t.distinctCount = Number(f.distinctCount);
    if (f.date) t.date = f.date; // 帶日期 → 多期:依日期生效 + 各週期上限/門檻分別重置
    t.hasFee = f.hasFee;
    return t;
  }, [f]);

  const [monthTxns, setMonthTxns] = useState([]);

  const json = cards[sel];
  const monthResult = useMemo(
    () => (tab === 'month' && json ? simulateMonth(json, monthTxns, rates) : null),
    [tab, json, monthTxns, rates]
  );
  const monthSpend = useMemo(() => monthTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0), [monthTxns]);
  // Each result is gated by its tab so switching cards / editing the form only
  // recomputes the engine for the view actually on screen (compare = cards × recommend).
  const testResult = useMemo(() => (tab === 'test' && json ? simulate(json, fixed, rates) : null), [tab, json, fixed, rates]);
  const rec = useMemo(() => (tab === 'recommend' && json ? recommend(json, fixed, rates) : null), [tab, json, fixed, rates]);
  const compareRows = useMemo(
    () => (tab === 'compare' ? compareCards(cards, fixed, rates) : []),
    [tab, cards, fixed, rates]
  );
  // Any point used by the selected/compared cards valued by an ESTIMATE?
  const usesEstimate = useMemo(
    () => pointNames.some((n) => pointPrograms[n]?.basis === 'estimate'),
    [pointNames, pointPrograms]
  );

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--cf-border-strong)] bg-[var(--cf-panel)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--cf-border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[var(--cf-text)]">分析</span>
            <div className="cf-seg !mt-0 !w-auto">
              {TABS.map((t) => <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
            </div>
          </div>
          <button onClick={onClose} className="cf-btn cf-btn--ghost">關閉</button>
        </div>

        {cards.length > 0 && (
          <p className="border-b border-[var(--cf-border)] px-4 py-1.5 text-[10px] leading-relaxed text-[var(--cf-text-faint)]">
            交易<strong>不帶日期</strong> = 單一結算週期(total 等同每期);<strong>帶日期</strong>則跨期試算:dated 規則依檔期生效、各週期上限/門檻分別重置、total 上限橫跨。
          </p>
        )}

        {cards.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--cf-text-faint)]">請先建立卡片與規則</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
            {/* ---- shared input ---- */}
            <div className="space-y-4">
              {tab !== 'compare' && cards.length > 1 && (
                <label className="block">
                  <span className="cf-field-label">卡片</span>
                  <select className="cf-select" value={sel} onChange={(e) => setIdx(Number(e.target.value))}>
                    {cards.map((c, i) => <option key={i} value={i}>{c.card}</option>)}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="cf-field-label">消費金額（TWD）</span>
                <input type="number" className="cf-input" value={f.amount} onChange={(e) => set({ amount: Number(e.target.value) || 0 })} />
              </label>

              <label className="block">
                <span className="cf-field-label">消費日期<span className="text-[var(--cf-text-faint)]">(選填;填了才依檔期/跨週期試算)</span></span>
                <input type="date" className="cf-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
              </label>

              {fields.hasRegion && (
                <div>
                  <span className="cf-field-label">消費地區</span>
                  <div className="cf-seg">
                    {[['不限', null], ['國內', false], ['海外', true]].map(([l, v]) => (
                      <button key={l} type="button" className={f.region === v ? 'is-active' : ''} onClick={() => set({ region: v })}>{l}</button>
                    ))}
                  </div>
                  {f.region === true && (
                    <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-[var(--cf-text-dim)]">
                      <input type="checkbox" checked={f.hasFee} onChange={(e) => set({ hasFee: e.target.checked })} />
                      含海外手續費（推薦/比較扣淨值）
                    </label>
                  )}
                </div>
              )}

              {fields.countries?.length > 0 && (
                <label className="block">
                  <span className="cf-field-label">消費國別</span>
                  <select className="cf-select" value={f.country || ''} onChange={(e) => set({ country: e.target.value || null })}>
                    <option value="">不限</option>
                    {fields.countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              )}
              {fields.currencies?.length > 0 && (
                <label className="block">
                  <span className="cf-field-label">幣別</span>
                  <select className="cf-select" value={f.currency || ''} onChange={(e) => set({ currency: e.target.value || null })}>
                    <option value="">不限</option>
                    {[...new Set(['TWD', ...CURRENCY_OPTIONS.filter((c) => fields.currencies.includes(c)), ...fields.currencies])].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              )}
              {fields.channels?.length > 0 && <Chips label="通路" opts={fields.channels} values={f.channels} optionList={CHANNEL_OPTIONS} onToggle={(v) => toggle('channels', v)} />}
              {fields.categories?.length > 0 && <Chips label="類別" opts={fields.categories} values={f.categories} optionList={CATEGORY_OPTIONS} onToggle={(v) => toggle('categories', v)} />}
              {fields.hasMcc && (
                <label className="block">
                  <span className="cf-field-label">MCC<span className="text-[var(--cf-text-faint)]">(此卡有依 MCC 判別的加碼)</span></span>
                  <input className="cf-input font-mono" value={f.mcc || ''} placeholder="例:5812" onChange={(e) => set({ mcc: e.target.value.trim() })} />
                </label>
              )}
              {fields.merchants?.length > 0 && (
                <label className="block">
                  <span className="cf-field-label">指定特店</span>
                  <select className="cf-select" value={f.merchant || ''} onChange={(e) => set({ merchant: e.target.value || null })}>
                    <option value="">不限</option>
                    {fields.merchants.map((mc) => <option key={mc} value={mc}>{mc}</option>)}
                  </select>
                </label>
              )}
              {fields.paymentMethods?.length > 0 && (
                <label className="block">
                  <span className="cf-field-label">支付方式</span>
                  <select className="cf-select" value={f.paymentMethod || ''} onChange={(e) => set({ paymentMethod: e.target.value || null })}>
                    <option value="">不限</option>
                    {fields.paymentMethods.map((p) => <option key={p} value={p}>{labelOf(PM_OPTIONS, p)}</option>)}
                  </select>
                </label>
              )}
              {(fields.customFields || []).map((cf) => (
                <label key={cf} className="block">
                  <span className="cf-field-label">{cf}</span>
                  <input className="cf-input" value={f.custom[cf] ?? ''} onChange={(e) => set({ custom: { ...f.custom, [cf]: e.target.value } })} />
                </label>
              ))}
              {fields.hasGateOrTiers && (
                <label className="block">
                  <span className="cf-field-label">本期已累計消費（門檻/級距,選填）</span>
                  <input type="number" className="cf-input" value={f.periodSpend} placeholder="預設＝本次金額" onChange={(e) => set({ periodSpend: e.target.value })} />
                </label>
              )}

              {(fields.eligibilityFlags?.length > 0 || fields.hasDistinctCount) && (
                <div>
                  <span className="cf-field-label">情境假設<span className="text-[var(--cf-text-faint)]">（僅供比較,不影響規則;真實值由記帳判定）</span></span>
                  <div className="mt-1.5 space-y-1.5">
                    {fields.eligibilityFlags.map((fl) => {
                      const on = f.flags[fl.name] ?? fl.default ?? false;
                      return (
                        <div key={fl.name} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-[var(--cf-text-dim)]">{fl.name}</span>
                          <div className="cf-seg !mt-0 !w-auto flex-none">
                            {[['符合', true], ['未符合', false]].map(([l, v]) => (
                              <button key={l} type="button" className={`!px-2 !text-[11px] ${on === v ? 'is-active' : ''}`} onClick={() => set({ flags: { ...f.flags, [fl.name]: v } })}>{l}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {fields.hasDistinctCount && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--cf-text-dim)]">當期{fields.distinctCountLabel || '計數'}（計數級距）</span>
                        <input
                          type="number" min="0" step="1"
                          className="cf-input !mt-0 !w-20 flex-none"
                          placeholder="家數"
                          value={f.distinctCount}
                          onChange={(e) => set({ distinctCount: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {pointNames.length > 0 && (
                <div className="rounded-lg border border-[var(--cf-border)] p-2.5">
                  <span className="cf-field-label">點數價值總覽（每點 = TWD,影響比較/推薦）</span>
                  <div className="mt-1.5 space-y-2">
                    {pointNames.map((name) => {
                      const prog = pointPrograms[name];
                      const cur = effectiveRate(prog) ?? 1;
                      return (
                        <div key={name} className="flex items-center gap-2 rounded-lg border border-[var(--cf-border)] p-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--cf-text)]">{name}</span>
                          <div className="cf-seg !mt-0 !w-auto flex-none">
                            {BASIS_OPTIONS.map((o) => (
                              <button
                                key={o.value}
                                type="button"
                                title={o.value === 'fixed' ? '官方固定比值' : '彈性點/里程,你錨定最佳兌換的估值'}
                                className={`!px-2 !text-[11px] ${(prog?.basis ?? 'fixed') === o.value ? 'is-active' : ''}`}
                                onClick={() => setPointBasis(name, o.value)}
                              >{o.label}</button>
                            ))}
                          </div>
                          <input
                            type="number" step="0.01"
                            className="cf-input !mt-0 !w-16 flex-none !py-1"
                            value={cur}
                            onChange={(e) => setPointRate(name, e.target.value === '' ? 1 : Number(e.target.value))}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--cf-text-faint)]">
                    一個目前「點值」即可,<strong>就地微調</strong>比較回饋;隨時間的匯率變動由記帳補。<strong>固定</strong>=官方比值、<strong>估算</strong>=彈性點/里程的最佳兌換估值。
                  </p>
                </div>
              )}

              {tab === 'month' && (
                <div className="rounded-lg border border-[var(--cf-border)] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="cf-field-label !mb-0">逐筆交易（{monthTxns.length} 筆,可跨期）</span>
                    <button type="button" className="cf-btn cf-btn--quiet !py-1 !text-[11px]" onClick={() => setMonthTxns((s) => [...s, fixed])}>＋ 加入此筆</button>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--cf-text-faint)]">用上方表單設定一筆消費後加入,依序累積上限與門檻。<strong>填日期</strong>可跨月/季/年(輪動、首刷窗等依日期生效、各週期分別重置)。</p>
                  {monthTxns.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {monthTxns.map((t, i) => (
                        <li key={i} className="flex items-start justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="min-w-0 flex-1 break-words leading-snug">{i + 1}. ${num(t.amount)} <span className="text-[var(--cf-text-faint)]">{txLabel(t)}</span></span>
                          <button type="button" className="flex-none text-[var(--cf-text-faint)] hover:text-[var(--cf-danger)]" onClick={() => setMonthTxns((s) => s.filter((_, j) => j !== i))}>✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {monthTxns.length > 0 && (
                    <button type="button" className="mt-2 text-[11px] text-[var(--cf-text-faint)] hover:text-[var(--cf-text-dim)]" onClick={() => setMonthTxns([])}>清空清單</button>
                  )}
                </div>
              )}
            </div>

            {/* ---- result ---- */}
            <div className="space-y-3">
              {tab === 'test' && testResult && (
                <>
                  <div className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-[var(--cf-text-faint)]">這筆預估回饋</span>
                      <span className="text-[11px] font-medium text-[var(--cf-text-dim)]">{pctText(valueOf(testResult, rates), Number(f.amount) || 0)}</span>
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-[var(--cf-text)]">${num(testResult.cashback)}</div>
                    {Object.entries(testResult.points).map(([n, v]) => <div key={n} className="text-xs text-[var(--cf-text-dim)]">+ {num(v)} {n}</div>)}
                    {Object.keys(testResult.points).length > 0 && (
                      <div className="mt-1 text-[11px] text-[var(--cf-text-faint)]">≈ 估計總值 ${num(Math.round(valueOf(testResult, rates)))}{usesEstimate && ' · 含估算點值'}</div>
                    )}
                  </div>
                  <div>
                    <div className="cf-field-label mb-1">命中規則</div>
                    {testResult.fired.length === 0 ? <div className="text-xs text-[var(--cf-text-faint)]">沒有規則命中</div> : (
                      <ul className="space-y-1">{testResult.fired.map((x) => (
                        <li key={x.id} className="flex items-start justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="min-w-0 flex-1 break-words leading-snug">{x.name}</span>
                          <span className="flex-none whitespace-nowrap text-[var(--cf-text)]">{x.reward.kind === 'cash' ? `$${num(x.reward.value)}` : `${num(x.reward.value)} ${x.reward.name}`}{x.reward.capped && ' ⤓'}</span>
                        </li>
                      ))}</ul>
                    )}
                  </div>
                  {testResult.oneTime?.length > 0 && (
                    <div>
                      <div className="cf-field-label mb-1">另有一次性獎勵（不計入每筆）</div>
                      <ul className="space-y-1">{testResult.oneTime.map((o, i) => (
                        <li key={i} className="flex items-start justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="min-w-0 flex-1 break-words leading-snug">{o.name}</span>
                          <span className="flex-none whitespace-nowrap text-[var(--cf-warn)]">{o.kind === 'cash' ? `$${num(o.value)}` : `${num(o.value)} ${o.pointName}`}</span>
                        </li>
                      ))}</ul>
                    </div>
                  )}
                </>
              )}

              {tab === 'month' && monthResult && (
                monthTxns.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--cf-border)] p-6 text-center text-xs text-[var(--cf-text-faint)]">用左側「＋ 加入此筆」逐筆建立消費(可填日期跨期),即可看到期間上限封頂、門檻解鎖、輪動/首刷依日期生效的真實累計。</div>
                ) : (
                  <>
                    <div className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-[var(--cf-text-faint)]">期間累計回饋（{monthTxns.length} 筆 · 刷 ${num(monthSpend)}）</span>
                        <span className="text-[11px] font-medium text-[var(--cf-text-dim)]">{pctText(valueOf(monthResult.totals, rates), monthSpend)}</span>
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-[var(--cf-text)]">${num(monthResult.totals.cashback)}</div>
                      {Object.entries(monthResult.totals.points).map(([n, v]) => <div key={n} className="text-xs text-[var(--cf-text-dim)]">+ {num(v)} {n}</div>)}
                      {Object.keys(monthResult.totals.points).length > 0 && (
                        <div className="mt-1 text-[11px] text-[var(--cf-text-faint)]">≈ 估計總值 ${num(Math.round(valueOf(monthResult.totals, rates)))}{usesEstimate && ' · 含估算點值'}</div>
                      )}
                    </div>

                    {monthResult.caps.length > 0 && (
                      <div>
                        <div className="cf-field-label mb-1">期間上限封頂</div>
                        <ul className="space-y-1">{monthResult.caps.map((c) => (
                          <li key={c.bucket} className="text-xs text-[var(--cf-text-dim)]">
                            「{c.name}」第 <span className="text-[var(--cf-text)]">{c.firstHitTxn + 1}</span> 筆達上限 ${num(c.max)}，之後少賺 <span className="text-[var(--cf-warn)]">${num(c.lost)}</span>
                          </li>
                        ))}</ul>
                      </div>
                    )}

                    {monthResult.gates.length > 0 && (
                      <div>
                        <div className="cf-field-label mb-1">門檻解鎖</div>
                        <ul className="space-y-1">{monthResult.gates.map((g) => (
                          <li key={g.ruleId} className="text-xs text-[var(--cf-text-dim)]">「{g.name}」第 <span className="text-[var(--cf-text)]">{g.unlockedAtTxn + 1}</span> 筆達標解鎖（滿 ${num(g.threshold)}）</li>
                        ))}</ul>
                      </div>
                    )}

                    {monthResult.oneTime.length > 0 && (
                      <div>
                        <div className="cf-field-label mb-1">一次性獎勵（整月一次）</div>
                        <ul className="space-y-1">{monthResult.oneTime.map((o, i) => (
                          <li key={i} className="flex items-start justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                            <span className="min-w-0 flex-1 break-words leading-snug">「{o.name}」<span className="text-[var(--cf-text-faint)]">第 {o.claimedAtTxn + 1} 筆領取</span></span>
                            <span className="flex-none whitespace-nowrap text-[var(--cf-warn)]">{o.kind === 'cash' ? `$${num(o.value)}` : `${num(o.value)} ${o.pointName}`}</span>
                          </li>
                        ))}</ul>
                      </div>
                    )}

                    <div>
                      <div className="cf-field-label mb-1">逐筆明細</div>
                      <ul className="space-y-1">{monthResult.perTxn.map((t) => (
                        <li key={t.index} className="flex items-start justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="min-w-0 flex-1 break-words leading-snug">{t.index + 1}. ${num(t.tx.amount)} <span className="text-[var(--cf-text-faint)]">{txLabel(t.tx)}</span></span>
                          <span className="flex-none whitespace-nowrap text-[var(--cf-text)]">${num(t.cashback)}{Object.entries(t.points).map(([n, v]) => ` +${num(v)}${n}`).join('')}{t.fired.some((x) => x.capped) && ' ⤓'}</span>
                        </li>
                      ))}</ul>
                    </div>
                  </>
                )
              )}

              {tab === 'recommend' && rec?.best && (
                <>
                  <div className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-[var(--cf-text-faint)]">最佳回饋</span>
                      <span className="text-[11px] font-medium text-[var(--cf-text-dim)]">{pctText(valueOf(rec.best.result, rates), Number(f.amount) || 0)}</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-[var(--cf-text)]">${num(rec.best.result.cashback)}</span>
                      {rec.gainOverBase > 0 && <span className="rounded-full bg-[color-mix(in_srgb,var(--cf-warn)_16%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--cf-warn)]">比一般多 ${num(Math.round(rec.gainOverBase))}</span>}
                    </div>
                    {Object.keys(rec.best.result.points).length > 0 && <div className="text-xs text-[var(--cf-text-dim)]">{pointsText(rec.best.result.points)}</div>}
                    <div className="mt-1.5 text-xs text-[var(--cf-text-dim)]">建議:{rec.best.how.length ? rec.best.how.join(' + ') : '一般消費即可'}{rec.best.note && <span className="text-[var(--cf-warn)]">({rec.best.note})</span>}</div>
                  </div>
                  <div>
                    <div className="cf-field-label mb-1">其他組合</div>
                    <ul className="space-y-1">{rec.options.map((o, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                        <span className="min-w-0 flex-1 break-words leading-snug">{o.how.length ? o.how.join(' + ') : '一般消費'}</span>
                        <span className="flex-none whitespace-nowrap text-[var(--cf-text)]">${num(o.result.cashback)}</span>
                      </li>
                    ))}</ul>
                  </div>
                </>
              )}

              {tab === 'compare' && (
                <>
                  <div className="cf-field-label mb-1">卡片排行<span className="text-[var(--cf-text-faint)]">（同一筆消費的最佳淨回饋）</span></div>
                  {cards.length < 2 && <p className="mb-1 text-[11px] text-[var(--cf-text-faint)]">畫布上有兩張以上卡片即可比較。</p>}
                  {usesEstimate && <p className="mb-1 text-[11px] text-[var(--cf-warn)]">排名含估算點值,僅供參考。</p>}
                  <ul className="space-y-1.5">
                    {compareRows.map((r, i) => {
                      const top = compareRows[0]?.net || 0;
                      const w = Math.max(2, Math.min(100, top > 0 ? (r.net / top) * 100 : 0));
                      const diff = top - r.net;
                      return (
                        <li key={r.name + i} className="relative overflow-hidden rounded-lg border px-3 py-2" style={{ borderColor: i === 0 ? 'var(--cf-accent)' : 'var(--cf-border)' }}>
                          <div className="absolute inset-y-0 left-0" style={{ width: `${w}%`, background: i === 0 ? 'color-mix(in srgb, #6f8a68 16%, transparent)' : 'color-mix(in srgb, var(--cf-text-faint) 9%, transparent)' }} />
                          <div className="relative flex items-start justify-between gap-2 text-xs">
                            <span className="min-w-0 flex-1 break-words leading-snug">
                              <span className="font-medium text-[var(--cf-text)]">{i === 0 ? '★ ' : `${i + 1}. `}{r.name}</span>
                              {r.best?.how?.length ? <span className="text-[var(--cf-text-faint)]"> · {r.best.how.join('+')}</span> : ''}
                            </span>
                            <span className="flex-none whitespace-nowrap text-right">
                              <span className="font-semibold text-[var(--cf-text)]">${num(Math.round(r.net))}</span>
                              {i > 0 && diff > 0 && <span className="ml-1 text-[10px] text-[var(--cf-text-faint)]">−${num(Math.round(diff))}</span>}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
