import { useMemo, useState } from 'react';
import { exportCards } from '../lib/exportJson';
import { simulate, simulateMonth, deriveTxFieldsFromJson, mergeFields, netScore, valueOf } from '../lib/simulate';
import { recommend } from '../lib/recommend';
import { useSettings, effectiveRate, todayISO } from '../store/settings';
import ModalOverlay from './ModalOverlay';
import SegmentedControl from '../inspector/fields/SegmentedControl';
import RateTimeline from '../inspector/fields/RateTimeline';
import { CHANNEL_OPTIONS, CATEGORY_OPTIONS, PM_OPTIONS, CURRENCY_OPTIONS, BASIS_OPTIONS, labelOf } from '../lib/options';

const num = (v) => Number(v).toLocaleString();
const TABS = [
  { id: 'test', label: '試算' },
  { id: 'month', label: '月度' },
  { id: 'recommend', label: '推薦' },
  { id: 'compare', label: '比較' },
];
const pointsText = (points) => Object.entries(points).map(([n, v]) => `+${num(v)} ${n}`).join('、');

const txLabel = (t) => {
  const parts = [];
  if (t.isOverseas === true) parts.push('海外');
  else if (t.isOverseas === false) parts.push('國內');
  if (t.currency) parts.push(t.currency);
  (t.channels || []).forEach((c) => parts.push(labelOf(CHANNEL_OPTIONS, c)));
  (t.categories || []).forEach((c) => parts.push(labelOf(CATEGORY_OPTIONS, c)));
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
  const setPointRates = useSettings((s) => s.setPointRates);
  const setCurrentRate = useSettings((s) => s.setCurrentRate);
  const today = todayISO();
  // Engine values points by a plain {name: rate} map — the rate effective today.
  const rates = useMemo(
    () => Object.fromEntries(Object.entries(pointPrograms).map(([n, p]) => [n, effectiveRate(p, today) ?? 1])),
    [pointPrograms, today]
  );
  const pointNames = useMemo(
    () => [...new Set(cards.flatMap((c) => Object.values(c.rules).map((r) => r.reward?.point_name).filter(Boolean)))],
    [cards]
  );

  const [tab, setTab] = useState('test');
  const [idx, setIdx] = useState(0);
  const sel = Math.min(idx, Math.max(cards.length - 1, 0));
  const fields = tab === 'compare' ? mergeFields(cardFields.length ? cardFields : [{}]) : (cardFields[sel] || {});

  const [f, setF] = useState({ amount: 1000, region: null, currency: null, channels: [], categories: [], merchant: null, paymentMethod: null, periodSpend: '', custom: {}, hasFee: true });
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const toggle = (key, v) => setF((s) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] }));

  const fixed = useMemo(() => {
    const t = { amount: Number(f.amount) || 0, custom: f.custom, periodSpend: f.periodSpend };
    if (f.region != null) t.isOverseas = f.region;
    if (f.currency) t.currency = f.currency;
    if (f.channels.length) t.channels = f.channels;
    if (f.categories.length) t.categories = f.categories;
    if (f.merchant) t.merchant = f.merchant;
    if (f.paymentMethod) t.paymentMethod = f.paymentMethod;
    t.hasFee = f.hasFee;
    return t;
  }, [f]);

  const [monthTxns, setMonthTxns] = useState([]);

  const json = cards[sel];
  const monthResult = useMemo(
    () => (tab === 'month' && json ? simulateMonth(json, monthTxns, rates) : null),
    [tab, json, monthTxns, rates]
  );
  const testResult = useMemo(() => (json ? simulate(json, fixed, rates) : null), [json, fixed, rates]);
  const rec = useMemo(() => (json ? recommend(json, fixed, rates) : null), [json, fixed, rates]);
  const compareRows = useMemo(
    () => cards
      .map((c) => { const best = recommend(c, fixed, rates).best; return { name: c.card, best, net: best ? netScore(best.result, c, best.tx, rates) : 0 }; })
      .sort((a, b) => b.net - a.net),
    [cards, fixed, rates]
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
              {fields.categories?.length > 0 && <Chips label="類別 / MCC" opts={fields.categories} values={f.categories} optionList={CATEGORY_OPTIONS} onToggle={(v) => toggle('categories', v)} />}
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

              {pointNames.length > 0 && (
                <div className="rounded-lg border border-[var(--cf-border)] p-2.5">
                  <span className="cf-field-label">點數價值總覽（每點 = TWD,影響比較/推薦）</span>
                  <div className="mt-1.5 space-y-2">
                    {pointNames.map((name) => {
                      const prog = pointPrograms[name];
                      const cur = effectiveRate(prog, today) ?? 1;
                      const changes = (prog?.rates?.length || 1) - 1;
                      return (
                        <div key={name} className="rounded-lg border border-[var(--cf-border)] p-2">
                          <div className="flex items-center gap-2">
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
                              type="number" step="0.1"
                              className="cf-input !mt-0 !w-16 flex-none !py-1"
                              value={cur}
                              onChange={(e) => setCurrentRate(name, e.target.value === '' ? 1 : Number(e.target.value))}
                            />
                          </div>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] text-[var(--cf-text-faint)]">時間軸{changes > 0 ? `（${changes} 次異動）` : ''}</summary>
                            <div className="mt-1.5">
                              <RateTimeline rates={prog?.rates} onChange={(next) => setPointRates(name, next)} today={today} />
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-[var(--cf-text-faint)]">
                    平常只需一個「點值」;銀行調整時展開「時間軸」按「異動」記一筆(填生效日),舊值自動保留。<strong>固定</strong>=官方比值、<strong>估算</strong>=彈性點/里程的最佳兌換估值。
                  </p>
                </div>
              )}

              {tab === 'month' && (
                <div className="rounded-lg border border-[var(--cf-border)] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="cf-field-label !mb-0">本月交易（{monthTxns.length} 筆）</span>
                    <button type="button" className="cf-btn cf-btn--quiet !py-1 !text-[11px]" onClick={() => setMonthTxns((s) => [...s, fixed])}>＋ 加入此筆</button>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--cf-text-faint)]">用上方表單設定一筆消費後加入；依序累積期間上限與門檻。</p>
                  {monthTxns.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {monthTxns.map((t, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="truncate">{i + 1}. ${num(t.amount)} <span className="text-[var(--cf-text-faint)]">{txLabel(t)}</span></span>
                          <button type="button" className="flex-none text-[var(--cf-text-faint)] hover:text-[#d4503a]" onClick={() => setMonthTxns((s) => s.filter((_, j) => j !== i))}>✕</button>
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
                    <div className="text-[11px] text-[var(--cf-text-faint)]">這筆預估回饋</div>
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
                        <li key={x.id} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="truncate">{x.name}</span>
                          <span className="flex-none text-[var(--cf-text)]">{x.reward.kind === 'cash' ? `$${num(x.reward.value)}` : `${num(x.reward.value)} ${x.reward.name}`}{x.reward.capped && ' ⤓'}</span>
                        </li>
                      ))}</ul>
                    )}
                  </div>
                  {testResult.oneTime?.length > 0 && (
                    <div>
                      <div className="cf-field-label mb-1">另有一次性獎勵（不計入每筆）</div>
                      <ul className="space-y-1">{testResult.oneTime.map((o, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="truncate">{o.name}</span>
                          <span className="flex-none text-[var(--cf-warn)]">{o.kind === 'cash' ? `$${num(o.value)}` : `${num(o.value)} ${o.pointName}`}</span>
                        </li>
                      ))}</ul>
                    </div>
                  )}
                </>
              )}

              {tab === 'month' && monthResult && (
                monthTxns.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--cf-border)] p-6 text-center text-xs text-[var(--cf-text-faint)]">用左側「＋ 加入此筆」建立本月的多筆消費,即可看到期間上限封頂、門檻解鎖、一次性獎勵的真實累計。</div>
                ) : (
                  <>
                    <div className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4">
                      <div className="text-[11px] text-[var(--cf-text-faint)]">本月累計回饋（{monthTxns.length} 筆）</div>
                      <div className="mt-1 text-2xl font-semibold text-[var(--cf-text)]">${num(monthResult.totals.cashback)}</div>
                      {Object.entries(monthResult.totals.points).map(([n, v]) => <div key={n} className="text-xs text-[var(--cf-text-dim)]">+ {num(v)} {n}</div>)}
                      {Object.keys(monthResult.totals.points).length > 0 && (
                        <div className="mt-1 text-[11px] text-[var(--cf-text-faint)]">≈ 估計總值 ${num(Math.round(valueOf({ cashback: monthResult.totals.cashback, points: monthResult.totals.points }, rates)))}{usesEstimate && ' · 含估算點值'}</div>
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
                          <li key={i} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                            <span className="truncate">「{o.name}」<span className="text-[var(--cf-text-faint)]">第 {o.claimedAtTxn + 1} 筆領取</span></span>
                            <span className="flex-none text-[var(--cf-warn)]">{o.kind === 'cash' ? `$${num(o.value)}` : `${num(o.value)} ${o.pointName}`}</span>
                          </li>
                        ))}</ul>
                      </div>
                    )}

                    <div>
                      <div className="cf-field-label mb-1">逐筆明細</div>
                      <ul className="space-y-1">{monthResult.perTxn.map((t) => (
                        <li key={t.index} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                          <span className="truncate">{t.index + 1}. ${num(t.tx.amount)} <span className="text-[var(--cf-text-faint)]">{txLabel(t.tx)}</span></span>
                          <span className="flex-none text-[var(--cf-text)]">${num(t.cashback)}{Object.entries(t.points).map(([n, v]) => ` +${num(v)}${n}`).join('')}{t.fired.some((x) => x.capped) && ' ⤓'}</span>
                        </li>
                      ))}</ul>
                    </div>
                  </>
                )
              )}

              {tab === 'recommend' && rec?.best && (
                <>
                  <div className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4">
                    <div className="text-[11px] text-[var(--cf-text-faint)]">最佳回饋</div>
                    <div className="mt-1 text-2xl font-semibold text-[var(--cf-text)]">${num(rec.best.result.cashback)}</div>
                    {Object.keys(rec.best.result.points).length > 0 && <div className="text-xs text-[var(--cf-text-dim)]">{pointsText(rec.best.result.points)}</div>}
                    <div className="mt-1.5 text-xs text-[var(--cf-text-dim)]">建議：{rec.best.how.length ? rec.best.how.join(' + ') : '一般消費即可'}{rec.best.note && <span className="text-[var(--cf-warn)]">（{rec.best.note}）</span>}</div>
                    {rec.gainOverBase > 0 && <div className="mt-1 text-[11px] text-[var(--cf-text-faint)]">比一般消費多 ${num(rec.gainOverBase)}</div>}
                  </div>
                  <div>
                    <div className="cf-field-label mb-1">其他組合</div>
                    <ul className="space-y-1">{rec.options.map((o, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-xs text-[var(--cf-text-dim)]">
                        <span className="truncate">{o.how.length ? o.how.join(' + ') : '一般消費'}</span>
                        <span className="flex-none text-[var(--cf-text)]">${num(o.result.cashback)}</span>
                      </li>
                    ))}</ul>
                  </div>
                </>
              )}

              {tab === 'compare' && (
                <>
                  <div className="cf-field-label mb-1">卡片排行（同一筆消費的最佳回饋）</div>
                  {cards.length < 2 && <p className="mb-1 text-[11px] text-[var(--cf-text-faint)]">畫布上有兩張以上卡片即可比較。</p>}
                  {usesEstimate && <p className="mb-1 text-[11px] text-[var(--cf-warn)]">排名含估算點值,僅供參考。</p>}
                  <ul className="space-y-1">
                    {compareRows.map((r, i) => (
                      <li key={r.name + i} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: i === 0 ? 'var(--cf-accent)' : 'var(--cf-border)' }}>
                        <span className="truncate text-[var(--cf-text-dim)]">{i === 0 ? '★ ' : ''}{r.name}<span className="text-[var(--cf-text-faint)]">{r.best?.how?.length ? ` · ${r.best.how.join('+')}` : ''}</span></span>
                        <span className="flex-none font-medium text-[var(--cf-text)]">${num(Math.round(r.net))}</span>
                      </li>
                    ))}
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
