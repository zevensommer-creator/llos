import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  ApiClient,
  ClassAssignmentView,
  ClassDetailView,
  ClassInvitationView,
  ClassStatsView,
  ClassUnlockItem,
  MarketEntry,
} from "@llos/api-client";

interface Notice {
  kind: "ok" | "warn" | "danger";
  text: string;
}

const MODE_LABEL: Record<ClassAssignmentView["mode"], string> = {
  auto_free: "自动授权（免费）",
  teacher_purchase: "教师购买（P8）",
  recommend_self_purchase: "建议自购（P8）",
};

const PRICE_LABEL: Record<MarketEntry["price_model"], string> = {
  free: "免费",
  one_time: "买断",
  subscription: "订阅",
};

function formatRate(rate: number | null): string {
  return rate === null ? "暂无数据" : `${Math.round(rate * 100)}%`;
}

function formatDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : "—";
}

interface ClassDetailProps {
  client: ApiClient;
  classId: string;
  onBack: () => void;
  /** 学生点击“去训练”跳转学习旅程。 */
  onStartTraining: () => void;
  /** 列表页返回后再进入时强制重载（班级状态可能已被其他视图改动）。 */
  refreshKey: number;
}

/**
 * 班级详情页（product_spec §5.2–5.6）。
 * 教师视图：邀请码 / 分配（顺序+截止）/ 通知 / 统计（只读 Core 投影）。
 * 学生视图：先修顺序解锁路径（§5.5：blocked 仅是呈现门，不锁学习权利）+ 通知。
 * 门禁由服务端（Mock 模拟）裁决：非创建者调用教师接口会收到明确失败结果。
 */
export function ClassDetail({ client, classId, onBack, onStartTraining, refreshKey }: ClassDetailProps) {
  const [detail, setDetail] = useState<ClassDetailView | null | "loading">("loading");
  const [unlock, setUnlock] = useState<readonly ClassUnlockItem[] | null>(null);
  const [stats, setStats] = useState<ClassStatsView | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [invitation, setInvitation] = useState<ClassInvitationView | null>(null);
  const [invMaxUses, setInvMaxUses] = useState(5);

  const [listings, setListings] = useState<readonly MarketEntry[]>([]);
  const [dlcId, setDlcId] = useState("");
  const [sequence, setSequence] = useState(1);
  const [dueAt, setDueAt] = useState("");

  const [noticeText, setNoticeText] = useState("");

  const load = useCallback(() => {
    setDetail("loading");
    void client.getClassDetail(classId).then((d) => {
      setDetail(d);
      if (!d) return;
      if (d.class_summary.is_creator) {
        setSequence(d.assignments.length + 1);
        void client.loadClassStats(classId).then(setStats);
        void client.queryMarket().then(setListings);
      } else {
        void client.loadClassUnlockState(classId).then(setUnlock);
      }
    });
  }, [client, classId]);

  useEffect(load, [load, refreshKey]);

  async function issueInvitation() {
    const inv = await client.issueClassInvitation(classId, invMaxUses);
    if (inv) {
      setInvitation(inv);
      setNotice({ kind: "ok", text: `邀请码已生成：${inv.code}（可用 ${inv.max_uses - inv.uses} 次）` });
    } else {
      setNotice({ kind: "danger", text: "生成邀请码失败：只有班级创建者可以操作。" });
    }
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!dlcId) {
      setNotice({ kind: "warn", text: "请先选择要分配的 DLC。" });
      return;
    }
    const outcome = await client.assignDlc(classId, dlcId, {
      sequence,
      dueAt: dueAt || undefined,
    });
    if (outcome.status === "assigned") {
      setNotice({
        kind: "ok",
        text: `已分配「${outcome.assignment.title}」${
          outcome.assignment.entitlements_granted ? "，成员自动获得授权" : "（付费项，成员需自行获取）"
        }。`,
      });
      setDlcId("");
      setDueAt("");
      load();
    } else {
      setNotice({ kind: "danger", text: outcome.message });
    }
  }

  async function postNotice(e: FormEvent) {
    e.preventDefault();
    const outcome = await client.postClassNotice(classId, noticeText);
    if (outcome.status === "posted") {
      setNoticeText("");
      setNotice({ kind: "ok", text: "通知已发布。" });
      load();
    } else {
      setNotice({ kind: "danger", text: outcome.message });
    }
  }

  if (detail === "loading") {
    return (
      <div className="state--loading" role="status">
        <span className="spinner" aria-hidden="true" />
        正在加载班级…
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="state-panel state-panel--danger">
        <p className="state-title">班级不存在或你不是成员</p>
        <button type="button" className="btn" onClick={onBack}>
          返回班级
        </button>
      </div>
    );
  }

  const isCreator = detail.class_summary.is_creator;

  return (
    <div className="journey">
      <button type="button" className="btn-secondary market-back" onClick={onBack}>
        ← 返回班级
      </button>

      <article className="class-detail">
        <header className="journey-head">
          <span className="mode-badge mode-badge--learning">{isCreator ? "教师视图" : "学生视图"}</span>
          <h2 className="journey-title">{detail.class_summary.name}</h2>
        </header>
        {detail.class_summary.description ? (
          <p className="journey-note">{detail.class_summary.description}</p>
        ) : null}

        <div aria-live="polite">
          {notice ? <p className={`notice notice--${notice.kind}`}>{notice.text}</p> : null}
        </div>

        {isCreator ? (
          <>
            <section className="class-section" aria-label="邀请码">
              <h3 className="class-section-title">邀请码</h3>
              <div className="class-invitation">
                <label className="control">
                  可用次数
                  <select value={invMaxUses} onChange={(e) => setInvMaxUses(Number(e.target.value))}>
                    {[1, 2, 5, 10, 30].map((n) => (
                      <option key={n} value={n}>
                        {n} 次
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn" onClick={() => void issueInvitation()}>
                  生成邀请码
                </button>
                {invitation ? (
                  <p className="class-invitation-code">
                    最新邀请码：<code>{invitation.code}</code>（已用 {invitation.uses}/{invitation.max_uses}）
                  </p>
                ) : (
                  <p className="hint">学生凭邀请码加入班级；免费分配内容入班即自动授权（product_spec §5.2）。</p>
                )}
              </div>
            </section>

            <section className="class-section" aria-label="DLC 分配">
              <h3 className="class-section-title">内容分配</h3>
              <form className="class-form class-form--assign" onSubmit={(e) => void assign(e)}>
                <label className="control class-form-field">
                  DLC
                  <select value={dlcId} onChange={(e) => setDlcId(e.target.value)}>
                    <option value="">选择市场内容…</option>
                    {listings.map((l) => (
                      <option key={l.dlc_id} value={l.dlc_id}>
                        {l.title}（{PRICE_LABEL[l.price_model]}）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="control class-form-field">
                  顺序
                  <input
                    type="number"
                    min={1}
                    value={sequence}
                    onChange={(e) => setSequence(Number(e.target.value))}
                  />
                </label>
                <label className="control class-form-field">
                  截止日期
                  <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </label>
                <button type="submit" className="btn">
                  分配
                </button>
              </form>

              {detail.assignments.length === 0 ? (
                <p className="hint">还没有分配内容。分配顺序决定学生的先修解锁路径（§5.5）。</p>
              ) : (
                <table className="class-table">
                  <thead>
                    <tr>
                      <th>顺序</th>
                      <th>内容</th>
                      <th>截止</th>
                      <th>授权模式</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.assignments]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((a) => (
                        <tr key={a.assignment_id}>
                          <td>{a.sequence}</td>
                          <td>{a.title}</td>
                          <td>{formatDate(a.due_at)}</td>
                          <td>
                            {MODE_LABEL[a.mode]}
                            {a.entitlements_granted ? null : "（P8）"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="class-section" aria-label="班级统计">
              <h3 className="class-section-title">班级统计</h3>
              {stats === null ? (
                <p className="hint">统计加载中…</p>
              ) : (
                <>
                  <dl className="market-facts">
                    <div>
                      <dt>成员</dt>
                      <dd>
                        {stats.members_total}（活跃 {stats.members_active}）
                      </dd>
                    </div>
                    <div>
                      <dt>分配数</dt>
                      <dd>{stats.assignments_total}</dd>
                    </div>
                    <div>
                      <dt>完成总数</dt>
                      <dd>{stats.completions_total}</dd>
                    </div>
                    <div>
                      <dt>总体完成率</dt>
                      <dd>{formatRate(stats.completion_rate_overall)}</dd>
                    </div>
                    <div>
                      <dt>按时完成率</dt>
                      <dd>{formatRate(stats.completion_rate_on_time)}</dd>
                    </div>
                  </dl>

                  <table className="class-table">
                    <thead>
                      <tr>
                        <th>成员</th>
                        <th>已分配</th>
                        <th>已完成</th>
                        <th>训练时长（分钟）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.per_member.map((m) => (
                        <tr key={m.account_id}>
                          <td>{m.display_name}</td>
                          <td>{m.assigned_count}</td>
                          <td>{m.completed_count}</td>
                          <td>{m.training_minutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {stats.weak_spots.length > 0 ? (
                    <div className="class-weak-spots">
                      <h4 className="class-subtitle">薄弱点</h4>
                      <ul>
                        {stats.weak_spots.map((w) => (
                          <li key={w.claim_ref}>
                            <span className="class-weak-claim">{w.claim_ref}</span>
                            <span className="class-weak-meta">
                              {w.members_affected} 名成员 · 正确率 {formatRate(w.success_rate)} ·{" "}
                              {w.reasons.join("、")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </>
        ) : (
          <section className="class-section" aria-label="学习路径">
            <h3 className="class-section-title">学习路径</h3>
            <p className="hint">
              按教师设定的顺序解锁；被锁条目只是推荐顺序，不限制你学习其他已获授权的内容（product_spec §5.5）。
            </p>
            {unlock === null ? (
              <p className="hint">加载中…</p>
            ) : unlock.length === 0 ? (
              <p className="hint">教师还没有分配内容。</p>
            ) : (
              <ol className="class-path">
                {unlock.map((item) => (
                  <li key={item.assignment_id} className="class-path-item">
                    <span className="class-path-seq">{item.sequence}</span>
                    <span className="class-path-body">
                      <span className="class-path-title">{item.title}</span>
                      <span className="class-path-meta">
                        截止 {formatDate(item.due_at)}
                        {item.blocked_by.length > 0 ? ` · 等待 ${item.blocked_by.length} 个先修内容` : ""}
                      </span>
                    </span>
                    {item.completed ? (
                      <span className="path-badge path-badge--done">已完成</span>
                    ) : item.unlocked ? (
                      <button type="button" className="btn" onClick={onStartTraining}>
                        去训练
                      </button>
                    ) : (
                      <span className="path-badge path-badge--locked">未解锁</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section className="class-section" aria-label="班级通知">
          <h3 className="class-section-title">班级通知</h3>
          {isCreator ? (
            <form className="class-form class-form--notice" onSubmit={(e) => void postNotice(e)}>
              <label className="control class-form-field class-form-field--wide">
                通知内容
                <input
                  type="text"
                  value={noticeText}
                  placeholder="例如：本周五 20:00 直播答疑"
                  onChange={(e) => setNoticeText(e.target.value)}
                />
              </label>
              <button type="submit" className="btn">
                发布通知
              </button>
            </form>
          ) : null}
          {detail.notices.length === 0 ? (
            <p className="hint">暂无通知。</p>
          ) : (
            <ul className="class-notices">
              {detail.notices.map((n) => (
                <li key={n.notice_id}>
                  <span className="class-notice-text">{n.text}</span>
                  <span className="class-notice-meta">
                    {n.author_name} · {formatDate(n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="class-section" aria-label="成员">
          <h3 className="class-section-title">成员（{detail.members.length}）</h3>
          <ul className="class-members">
            {detail.members.map((m) => (
              <li key={m.account_id}>
                {m.display_name}
                {m.is_creator ? <span className="tag-chip">创建者</span> : null}
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}
