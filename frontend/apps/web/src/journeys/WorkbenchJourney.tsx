import type { Account, WorkbenchView } from "@llos/api-client";

interface WorkbenchJourneyProps {
  data: WorkbenchView;
  account: Account | null;
  /** T-026：从工作台分区进入市场页。 */
  onOpenMarket?: () => void;
}

/**
 * 电脑工作台旅程（desktop_web，§5）。分区按能力点显隐——显隐只是体验层，
 * 写操作由服务端重新授权（§2）；不得依据屏幕宽度/CSS 授予权限。
 */
export function WorkbenchJourney({ data, account, onOpenMarket }: WorkbenchJourneyProps) {
  return (
    <div className="journey">
      <header className="journey-head">
        <span className="mode-badge mode-badge--learning">电脑工作台</span>
        <h2 className="journey-title">desktop_web</h2>
      </header>
      <p className="journey-note">区域按账户能力显示——显示控制不是安全控制，写操作由服务端重新授权。</p>

      <div className="sections">
        {data.sections.map((section) => {
          const allowed = !section.required_capability || account?.capabilities.includes(section.required_capability);
          return (
            <section key={section.id} className={`section ${allowed ? "" : "section-locked"}`} aria-disabled={!allowed}>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
              {section.id === "market" && allowed && onOpenMarket ? (
                <button type="button" className="btn section-action" onClick={onOpenMarket}>
                  进入市场
                </button>
              ) : null}
              {!allowed ? <p className="locked-note">需要能力点：{section.required_capability}</p> : null}
            </section>
          );
        })}
      </div>

      <section className="learning-state">
        <p className="activity-kind">我的授权（entitlements）</p>
        <ul className="state-list">
          {data.entitlements.map((e) => (
            <li key={`${e.dlc_id}:${e.source}`} className="state-item">
              <span className={`mastery ${e.valid ? "mastery--learned" : "mastery--lapsed"}`}>
                {e.valid ? "有效" : "已失效"}
              </span>
              <span className="state-body">{e.title}</span>
              <span className="state-meta">来源：{e.source}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
