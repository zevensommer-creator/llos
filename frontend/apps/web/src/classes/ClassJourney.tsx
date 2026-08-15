import { useEffect, useState, type FormEvent } from "react";
import type { ApiClient, ClassSummary } from "@llos/api-client";
import { ClassDetail } from "./ClassDetail";

interface ClassJourneyProps {
  client: ApiClient;
  /** 学生点击“去训练”跳转学习旅程。 */
  onStartTraining: () => void;
}

/**
 * desktop_web 班级页（product_spec §5）：我的班级 + 输码入班；教师可建班
 * （create_class 门禁在服务端裁决，UI 隐藏表单只是呈现层判断）。
 */
export function ClassJourney({ client, onStartTraining }: ClassJourneyProps) {
  const [classes, setClasses] = useState<readonly ClassSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);

  async function reload() {
    setClasses(await client.listMyClasses());
  }

  useEffect(() => {
    let live = true;
    void client.getAccount().then((account) => {
      if (live) setCanCreate(account.capabilities.includes("create_class"));
    });
    void reload().then(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  if (selected) {
    return (
      <ClassDetail
        client={client}
        classId={selected}
        onBack={() => {
          setSelected(null);
          setDetailVersion((v) => v + 1);
        }}
        onStartTraining={onStartTraining}
        refreshKey={detailVersion}
      />
    );
  }

  async function createClass(e: FormEvent) {
    e.preventDefault();
    const outcome = await client.createClass(newName, newDescription || undefined);
    if (outcome.status === "created") {
      setNotice(`班级「${outcome.class.name}」已创建`);
      setNewName("");
      setNewDescription("");
      await reload();
    } else {
      setNotice(outcome.message);
    }
  }

  async function joinClass(e: FormEvent) {
    e.preventDefault();
    const outcome = await client.joinClass(joinCode);
    if (outcome.status === "joined") {
      setNotice(`已加入班级「${outcome.class.name}」`);
      setJoinCode("");
      await reload();
    } else if (outcome.status === "already_member") {
      setNotice(`你已经是「${outcome.class.name}」的成员`);
    } else {
      setNotice(outcome.message);
    }
  }

  return (
    <div className="journey">
      <header className="journey-head">
        <span className="mode-badge mode-badge--learning">班级</span>
        <h2 className="journey-title">我的班级</h2>
      </header>
      <p className="journey-note">
        输入邀请码加入班级；班级分配的免费内容自动获得授权（product_spec §5.2–5.4）。
      </p>

      {notice ? <p className="class-notice-line" role="status">{notice}</p> : null}

      <div className="class-entry-forms">
        <form className="class-form" onSubmit={(e) => void joinClass(e)}>
          <label className="control class-form-field">
            邀请码
            <input
              type="text"
              value={joinCode}
              placeholder="llos-class-…"
              onChange={(e) => setJoinCode(e.target.value)}
            />
          </label>
          <button type="submit" className="btn">
            加入班级
          </button>
        </form>
        {canCreate ? (
          <form className="class-form" onSubmit={(e) => void createClass(e)}>
            <label className="control class-form-field">
              班级名称
              <input
                type="text"
                value={newName}
                placeholder="例如：德语 A1 精读班"
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label className="control class-form-field class-form-field--wide">
              简介（可选）
              <input
                type="text"
                value={newDescription}
                placeholder="训练目标 / 时间安排"
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </label>
            <button type="submit" className="btn">
              创建班级
            </button>
          </form>
        ) : null}
      </div>

      {classes === null ? (
        <div className="state--loading" role="status">
          <span className="spinner" aria-hidden="true" />
          正在加载班级…
        </div>
      ) : classes.length === 0 ? (
        <div className="state-panel">
          <p className="state-title">还没有加入任何班级</p>
          <p className="state-body">向老师索取班级邀请码（空白态）。</p>
        </div>
      ) : (
        <ul className="market-grid">
          {classes.map((klass) => (
            <li key={klass.class_id}>
              <button
                type="button"
                className="market-card"
                onClick={() => setSelected(klass.class_id)}
                aria-label={`打开班级：${klass.name}`}
              >
                <span className="market-card-title">{klass.name}</span>
                <span className="market-card-meta">
                  {klass.member_count} 名成员 · {klass.is_creator ? "我是创建者" : "学生视图"}
                  {klass.archived ? " · 已归档" : ""}
                </span>
                {klass.is_creator ? <span className="market-owned-badge">教师</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
