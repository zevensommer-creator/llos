import type { LearningSessionView } from "@llos/api-client";

const VERDICT_LABEL: Record<string, string> = {
  correct: "正确",
  partial: "部分正确",
  incorrect: "不正确",
  abstained: "暂不判定（证据不足）",
};

/**
 * 学习旅程（LearningSession）。三层就绪后执行训练并产生学习证据。
 * 学习状态展示为版本化、可撤销的判定（VIEW_MODELS §2/§3：永不显示“永久学会”）；
 * 评价器弃权（abstained）不得显示为学习者失败。
 */
export function LearningJourney({ data }: { data: LearningSessionView }) {
  const { session } = data;
  const current = session.activities?.[data.current_activity_index];

  return (
    <div className="journey">
      <header className="journey-head">
        <span className="mode-badge mode-badge--learning">LearningSession</span>
        <h2 className="journey-title">{session.title}</h2>
      </header>

      {session.snapshot ? (
        <p className="journey-note">
          素材快照：{session.snapshot.title} · {session.snapshot.item_count} 项 · v
          {session.snapshot.version}
          {session.snapshot.offline_allowed ? " · 可离线" : " · 需在线"}
        </p>
      ) : null}

      {current ? (
        <section className="activity-card">
          <p className="activity-kind">当前活动（{current.kind}）</p>
          <p className="activity-prompt">{current.prompt}</p>
          {current.requires_microphone ? <p className="state-meta">需要麦克风</p> : null}
        </section>
      ) : null}

      {data.feedback ? (
        <section className={`feedback-card feedback-card--${data.feedback.verdict}`}>
          <p className="activity-kind">反馈</p>
          <p className="activity-prompt">{VERDICT_LABEL[data.feedback.verdict] ?? data.feedback.verdict}</p>
          <p className="state-body">{data.feedback.explanation}</p>
        </section>
      ) : null}

      {session.learning_state && session.learning_state.length > 0 ? (
        <section className="learning-state">
          <p className="activity-kind">学习状态</p>
          <ul className="state-list">
            {session.learning_state.map((s) => (
              <li key={s.claim_id} className="state-item">
                <span className={`mastery mastery--${s.status}`}>{s.display_label}</span>
                <span className="state-body">{s.reason_summary}</span>
                <span className="state-meta">下一步：{s.next_action} · 政策 {s.policy_ref}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="sync-status">
        同步队列：{data.sync_queue.pending_count} 待提交 ·{" "}
        {data.sync_queue.online ? "在线" : "离线"}
      </footer>
    </div>
  );
}
