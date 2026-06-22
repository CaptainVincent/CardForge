import { useMemo } from 'react';
import { exportCards } from '../lib/exportJson';
import { cardRows } from '../lib/ruleList';

// 畫布「清單」檢視:把整張卡的規則用緊湊對照表條列出來(條件/回饋/上限/資格),
// 讓一般使用者不必讀節點圖。唯讀;與節點圖看的是同一份(exportCards)。
// 末欄是每條規則各自的「回報錯誤」。
const COLS = 'grid grid-cols-[1.6fr_0.8fr_1fr_0.9fr_auto] gap-x-3';
const REPO = 'https://github.com/CaptainVincent/CardForge';

// 「回報錯誤」→ 開 GitHub issue,自動帶入「這一條」規則,讓回報者直接指出
// 哪裡有誤、正確值為何。每條規則各自回報(精確到單條,不是整張卡)。
function ruleIssueUrl(card, r) {
  const body = `## 哪裡有誤\n（請說明這條規則哪裡不對、正確的數值/條件應為何、來源連結)\n\n## 卡片\n${card.card}\n\n## 規則(自動帶入)\n- 條件:${r.condition}\n- 回饋:${r.reward}\n- 上限:${r.cap}\n- 資格:${r.eligibility}\n`;
  const q = new URLSearchParams({ title: `規則回報:${card.card} — ${r.condition}`, body });
  return `${REPO}/issues/new?${q.toString()}`;
}

export default function RuleListView({ nodes, edges }) {
  const cards = useMemo(() => exportCards(nodes, edges), [nodes, edges]);

  if (!cards.length) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--cf-canvas)] text-xs text-[var(--cf-text-faint)]">
        請先建立卡片與規則,或切回「節點圖」開始編輯。
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--cf-canvas)] px-6 py-5 pt-14">
      <div className="mx-auto max-w-3xl space-y-8">
        {cards.map((card, i) => {
          const rows = cardRows(card);
          return (
            <section key={i}>
              <h2 className="mb-2 truncate text-sm font-semibold text-[var(--cf-text)]">{card.card}</h2>
              {rows.length === 0 ? (
                <p className="text-xs text-[var(--cf-text-faint)]">此卡尚無規則。</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] shadow-sm">
                  <div className={`${COLS} border-b border-[var(--cf-border)] px-3 py-2 text-[10px] font-medium tracking-wide text-[var(--cf-text-faint)]`}>
                    <span>條件</span><span>回饋</span><span>上限</span><span>資格</span><span className="w-5" />
                  </div>
                  {rows.map((r) => (
                    <div key={r.id} className={`${COLS} group items-start border-b border-[var(--cf-border)] px-3 py-2 text-xs last:border-0 ${r.dimmed ? 'opacity-45' : ''}`}>
                      <span className="break-words leading-snug text-[var(--cf-text)]">{r.condition}{r.dimmed && <span className="text-[var(--cf-text-faint)]">（停用）</span>}</span>
                      <span className="break-words leading-snug font-medium text-[var(--cf-text)]">{r.reward}</span>
                      <span className="break-words leading-snug text-[var(--cf-text-dim)]">{r.cap}</span>
                      <span className="break-words leading-snug text-[var(--cf-text-dim)]">{r.eligibility}</span>
                      <a
                        href={ruleIssueUrl(card, r)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="這條規則有誤?到 GitHub 回報(自動帶入此規則)"
                        className="flex-none whitespace-nowrap text-[var(--cf-text-faint)] transition-colors hover:text-[var(--cf-warn)]"
                      >
                        回報
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        <p className="text-center text-[10px] text-[var(--cf-text-faint)]">回饋率為基本/加碼疊加前的單條規則值;實際到手以「分析 → 試算/週期累積」為準。每條後方「回報」可單獨回報該規則錯誤。</p>
      </div>
    </div>
  );
}
