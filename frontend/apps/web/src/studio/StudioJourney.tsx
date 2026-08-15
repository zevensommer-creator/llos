import { useEffect, useState, type FormEvent } from "react";
import type {
  ApiClient,
  ByokEntryView,
  PublishStudioInput,
  SandboxReportView,
  StudioDlcView,
  StudioDraftView,
  StudioUnitView,
} from "@llos/api-client";

// desktop_web Studio 向导页（product_spec §6.2/§6.4/§6.7/§6.9）：
// 粘贴文字 → AI 结构化预览表单 → 沙箱试用 → 发布（下架告知义务确认）。
// 版本号对创作者隐形；校验错误以教学语言呈现（"第 N 课缺少标题"），
// 不暴露技术细节；发布/下架门禁由服务端裁决，UI 只呈现结果。

type Phase = "input" | "review" | "sandbox" | "publish" | "done";

interface EditableUnit {
  frame_type: StudioUnitView["frame_type"];
  title: string;
  pattern: string;
  lemma: string;
}

const FRAME_LABEL: Record<EditableUnit["frame_type"], string> = {
  scenario: "场景",
  argument_structure: "构式",
  concept: "概念",
};

const LANGUAGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "de-DE", label: "德语" },
  { value: "fr-FR", label: "法语" },
  { value: "en-US", label: "英语" },
];

const CEFR_OPTIONS: readonly StudioUnitCefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
type StudioUnitCefr = PublishStudioInput["difficulty"];

const BYOK_FAMILIES: readonly string[] = ["deepseek", "openai", "gemini"];

const SAMPLE_TEXT = [
  "Szenario: Im Café bestellen | Ich hätte gern einen Kaffee, bitte.",
  "Valenz: empfehlen | Der Kellner empfiehlt uns den Kuchen. | empfehlen",
  "Konstruktion: Höfliche Bitte | Könnten Sie bitte das Wasser bringen?",
].join("\n");

const STEP_LABELS: readonly { id: Phase; label: string }[] = [
  { id: "input", label: "1 · 添加内容" },
  { id: "review", label: "2 · 检查课程" },
  { id: "sandbox", label: "3 · 沙箱试用" },
  { id: "publish", label: "4 · 发布" },
];

interface StudioJourneyProps {
  client: ApiClient;
  /** 发布成功后跳市场页查看自己的课程。 */
  onOpenMarket: () => void;
}

export function StudioJourney({ client, onOpenMarket }: StudioJourneyProps) {
  const [phase, setPhase] = useState<Phase>("input");
  const [notice, setNotice] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("de-DE");
  const [cefr, setCefr] = useState<StudioUnitCefr>("A2");
  const [text, setText] = useState("");

  const [draft, setDraft] = useState<StudioDraftView | null>(null);
  const [units, setUnits] = useState<EditableUnit[]>([]);
  const [report, setReport] = useState<SandboxReportView | null>(null);
  const [published, setPublished] = useState<StudioDlcView | null>(null);

  const [byokKeys, setByokKeys] = useState<readonly ByokEntryView[] | null>(null);
  const [byokFamily, setByokFamily] = useState("deepseek");
  const [byokLabel, setByokLabel] = useState("");
  const [byokKey, setByokKey] = useState("");

  const [myDlcs, setMyDlcs] = useState<readonly StudioDlcView[] | null>(null);
  const [dlcVersion, setDlcVersion] = useState(0);

  const [summary, setSummary] = useState("");
  const [publishDifficulty, setPublishDifficulty] = useState<StudioUnitCefr>("A2");
  const [tags, setTags] = useState("");
  const [ackDelist, setAckDelist] = useState(false);

  useEffect(() => {
    let live = true;
    void client.listByokKeys().then((keys) => {
      if (live) setByokKeys(keys);
    });
    return () => {
      live = false;
    };
  }, [client]);

  useEffect(() => {
    let live = true;
    void client.listStudioDlcs().then((dlcs) => {
      if (live) setMyDlcs(dlcs);
    });
    return () => {
      live = false;
    };
  }, [client, dlcVersion]);

  function resetWizard() {
    setPhase("input");
    setNotice(null);
    setWarn(null);
    setDraft(null);
    setUnits([]);
    setReport(null);
    setPublished(null);
    setTitle("");
    setText("");
  }

  async function startDraft() {
    setNotice(null);
    setWarn(null);
    const outcome = await client.createStudioDraft({ text, title, language, cefrLevel: cefr });
    if (outcome.status !== "created") {
      setWarn(outcome.message);
      return;
    }
    setDraft(outcome.draft);
    setUnits(outcome.draft.units.map(unitFromView));
    setTitle(outcome.draft.title);
    setPhase("review");
  }

  function unitFromView(u: StudioUnitView): EditableUnit {
    return { frame_type: u.frame_type, title: u.title, pattern: u.pattern, lemma: u.lemma ?? "" };
  }

  function updateUnit(index: number, patch: Partial<EditableUnit>) {
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  }

  function removeUnit(index: number) {
    setUnits((prev) => prev.filter((_, i) => i !== index));
  }

  function addUnit() {
    setUnits((prev) => [...prev, { frame_type: "scenario", title: "", pattern: "", lemma: "" }]);
  }

  async function confirmDraft() {
    if (!draft) return;
    setWarn(null);
    const outcome = await client.confirmStudioDraft(draft.draft_id, {
      title,
      units: units.map((u) => ({
        frame_type: u.frame_type,
        title: u.title,
        pattern: u.pattern,
        ...(u.lemma.trim() ? { lemma: u.lemma.trim() } : {}),
      })),
    });
    if (outcome.status !== "saved") {
      setWarn(outcome.status === "not_found" ? "草稿不存在" : outcome.message);
      return;
    }
    setDraft(outcome.draft);
    setNotice(`已确认 ${outcome.draft.units.length} 个学习单元，进入沙箱试用`);
    setPhase("sandbox");
  }

  async function runTrial() {
    if (!draft) return;
    setWarn(null);
    const outcome = await client.runSandboxTrial(draft.draft_id);
    if (outcome.status !== "ran") {
      setWarn(outcome.status === "not_found" ? "草稿不存在" : outcome.message);
      return;
    }
    setReport(outcome.report);
  }

  async function publish(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setWarn(null);
    const outcome = await client.publishStudioDraft(draft.draft_id, {
      summary,
      difficulty: publishDifficulty,
      tags: tags.split(/[,，\s]+/).filter((t) => t.length > 0),
      acknowledged_delist_terms: ackDelist,
    });
    if (outcome.status !== "published") {
      setWarn(outcome.message);
      return;
    }
    setPublished(outcome.dlc);
    setPhase("done");
    setDlcVersion((v) => v + 1);
  }

  async function registerByok(e: FormEvent) {
    e.preventDefault();
    const outcome = await client.registerByokKey(byokFamily, byokLabel, byokKey);
    if (outcome.status !== "registered") {
      setWarn(outcome.message);
      return;
    }
    setByokLabel("");
    setByokKey("");
    setByokKeys(await client.listByokKeys());
    setNotice(`密钥已登记（仅显示掩码 ${outcome.entry.masked_key}）`);
  }

  async function delist(dlcId: string, dlcTitle: string) {
    if (!window.confirm(`下架「${dlcTitle}」？已获取的学员仍可继续使用（§6.9）。`)) return;
    const outcome = await client.delistStudioDlc(dlcId);
    if (outcome.status !== "delisted") {
      setWarn(outcome.message);
      return;
    }
    setNotice("已下架：市场不再接受新获取，已获取学员保留访问权");
    setDlcVersion((v) => v + 1);
  }

  async function revise(dlcId: string) {
    setNotice(null);
    setWarn(null);
    const outcome = await client.startRevision(dlcId);
    if (outcome.status !== "created") {
      setWarn(outcome.message);
      return;
    }
    setDraft(outcome.draft);
    setUnits(outcome.draft.units.map(unitFromView));
    setTitle(outcome.draft.title);
    setPhase("review");
    setNotice("修订草稿已创建：以已发布内容为基线，确认后发布会自动更新版本");
  }

  return (
    <div className="journey">
      <header className="journey-head">
        <span className="mode-badge mode-badge--learning">Studio</span>
        <h2 className="journey-title">创作工作台</h2>
      </header>
      <p className="journey-note">
        把备课笔记变成可训练的课程：粘贴内容 → AI 结构化 → 检查 → 沙箱试用 → 发布到市场。
        AI 结构化默认走你自己的密钥（BYOK）；版本更新由系统自动处理。
      </p>

      {notice ? <p className="class-notice-line" role="status">{notice}</p> : null}
      {warn ? <p className="notice notice--danger studio-warn" role="alert">{warn}</p> : null}

      <div className="studio-layout">
        <aside className="studio-side">
          <section className="studio-panel">
            <h3 className="studio-panel-title">AI 密钥（BYOK）</h3>
            {byokKeys === null ? (
              <p className="studio-muted">加载中…</p>
            ) : byokKeys.length === 0 ? (
              <p className="studio-muted">还没有登记密钥。Studio 的 AI 辅助默认使用你自己的密钥，不消耗平台算力。</p>
            ) : (
              <ul className="studio-byok-list">
                {byokKeys.map((k) => (
                  <li key={k.entry_id}>
                    <span className="studio-byok-label">{k.label}</span>
                    <span className="studio-byok-key">{k.masked_key}</span>
                    <span className="studio-byok-family">{k.provider_family}</span>
                  </li>
                ))}
              </ul>
            )}
            <form className="studio-byok-form" onSubmit={(e) => void registerByok(e)}>
              <label className="control">
                服务商
                <select value={byokFamily} onChange={(e) => setByokFamily(e.target.value)}>
                  {BYOK_FAMILIES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="control">
                名称
                <input type="text" value={byokLabel} placeholder="备课用 Key" onChange={(e) => setByokLabel(e.target.value)} />
              </label>
              <label className="control">
                密钥
                <input type="password" value={byokKey} placeholder="sk-…" onChange={(e) => setByokKey(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-secondary">登记密钥</button>
            </form>
          </section>

          <section className="studio-panel">
            <h3 className="studio-panel-title">我的课程</h3>
            {myDlcs === null ? (
              <p className="studio-muted">加载中…</p>
            ) : myDlcs.length === 0 ? (
              <p className="studio-muted">还没有发布过课程。完成右侧向导后，课程会出现在这里。</p>
            ) : (
              <ul className="studio-dlc-list">
                {myDlcs.map((d) => (
                  <li key={d.dlc_id} className={d.delisted ? "studio-dlc--delisted" : undefined}>
                    <div className="studio-dlc-info">
                      <span className="studio-dlc-title">{d.title}</span>
                      <span className="studio-dlc-meta">
                        {d.language.toUpperCase()} · {d.difficulty} · 免费
                        {d.delisted ? " · 已下架" : ""}
                      </span>
                    </div>
                    {!d.delisted ? (
                      <div className="studio-dlc-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => void revise(d.dlc_id)}>
                          修订
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => void delist(d.dlc_id, d.title)}>
                          下架
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="studio-main">
          {phase !== "done" ? (
            <ol className="studio-steps" aria-label="向导步骤">
              {STEP_LABELS.map((s, i) => {
                const order: Phase[] = ["input", "review", "sandbox", "publish"];
                const active = order.indexOf(phase) >= i;
                return (
                  <li key={s.id} className={`studio-step ${active ? "studio-step--active" : ""}`}>
                    {s.label}
                  </li>
                );
              })}
            </ol>
          ) : null}

          {phase === "input" ? (
            <form className="studio-form" onSubmit={(e) => { e.preventDefault(); void startDraft(); }}>
              <label className="control">
                课程标题
                <input type="text" value={title} placeholder="如：咖啡馆德语速成" onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div className="studio-form-row">
                <label className="control">
                  语言
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    {LANGUAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="control">
                  难度（CEFR）
                  <select value={cefr} onChange={(e) => setCefr(e.target.value as StudioUnitCefr)}>
                    {CEFR_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="control">
                备课内容（粘贴文字；一行一课，格式「前缀: 标题 | 例句」，前缀可用 Szenario / Valenz / 其他）
                <textarea
                  className="studio-textarea"
                  rows={8}
                  value={text}
                  placeholder={SAMPLE_TEXT}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="studio-form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setText(SAMPLE_TEXT)}>
                  填入示例
                </button>
                <button type="submit" className="btn">AI 结构化</button>
              </div>
            </form>
          ) : null}

          {phase === "review" ? (
            <div className="studio-review">
              <label className="control">
                课程标题
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              {draft ? (
                <p className="studio-muted">
                  AI（{draft.structured_by.provider_id}）识别出 {draft.units.length} 个学习单元；下面可以逐课修改、删除或补充。
                </p>
              ) : null}
              <ul className="studio-units">
                {units.map((u, i) => (
                  <li key={i} className="studio-unit">
                    <div className="studio-unit-head">
                      <span className="studio-unit-no">第 {i + 1} 课 · {FRAME_LABEL[u.frame_type]}</span>
                      <button type="button" className="btn btn-secondary" onClick={() => removeUnit(i)}>
                        删除
                      </button>
                    </div>
                    <label className="control">
                      标题
                      <input type="text" value={u.title} onChange={(e) => updateUnit(i, { title: e.target.value })} />
                    </label>
                    <label className="control">
                      例句
                      <input type="text" value={u.pattern} onChange={(e) => updateUnit(i, { pattern: e.target.value })} />
                    </label>
                    {u.frame_type === "argument_structure" ? (
                      <label className="control">
                        核心动词
                        <input type="text" value={u.lemma} onChange={(e) => updateUnit(i, { lemma: e.target.value })} />
                      </label>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="studio-form-actions">
                <button type="button" className="btn btn-secondary" onClick={addUnit}>添加一课</button>
                <button type="button" className="btn btn-secondary" onClick={resetWizard}>放弃草稿</button>
                <button type="button" className="btn" onClick={() => void confirmDraft()}>确认内容</button>
              </div>
            </div>
          ) : null}

          {phase === "sandbox" ? (
            <div className="studio-sandbox">
              <p className="studio-muted">
                以学员视角完整走一遍训练流程。试运行不产生真实学习记录——成绩和事件只用于你检查课程。
              </p>
              {report ? (
                <div className="studio-report" role="status">
                  <p className="studio-report-title">
                    {report.status === "completed" ? "试运行完成" : `试运行中止（${report.status}）`}
                  </p>
                  <dl className="studio-report-facts">
                    <div><dt>训练步数</dt><dd>{report.steps_completed}</dd></div>
                    <div><dt>产生事件</dt><dd>{report.events_appended}</dd></div>
                    <div><dt>真实学习记录</dt><dd>{report.real_event_store_used ? "已写入" : "未写入（沙箱）"}</dd></div>
                  </dl>
                  <div className="studio-form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setPhase("review")}>回去修改</button>
                    <button type="button" className="btn" onClick={() => setPhase("publish")}>去发布</button>
                  </div>
                </div>
              ) : (
                <div className="studio-form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setPhase("review")}>回去修改</button>
                  <button type="button" className="btn" onClick={() => void runTrial()}>开始试运行</button>
                </div>
              )}
            </div>
          ) : null}

          {phase === "publish" ? (
            <form className="studio-form" onSubmit={(e) => void publish(e)}>
              <label className="control">
                市场摘要
                <input type="text" value={summary} placeholder="一句话介绍这门课" onChange={(e) => setSummary(e.target.value)} />
              </label>
              <div className="studio-form-row">
                <label className="control">
                  难度
                  <select value={publishDifficulty} onChange={(e) => setPublishDifficulty(e.target.value as StudioUnitCefr)}>
                    {CEFR_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label className="control">
                  标签（空格分隔）
                  <input type="text" value={tags} placeholder="餐饮 旅行" onChange={(e) => setTags(e.target.value)} />
                </label>
              </div>
              <label className="control studio-ack">
                <input
                  type="checkbox"
                  checked={ackDelist}
                  onChange={(e) => setAckDelist(e.target.checked)}
                />
                我已知悉：学员获取的是长期授权；课程下架只影响新获取，不收回既有学员的访问权。
              </label>
              <div className="studio-form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setPhase("sandbox")}>返回</button>
                <button type="submit" className="btn">发布（免费）</button>
              </div>
            </form>
          ) : null}

          {phase === "done" && published ? (
            <div className="studio-done" role="status">
              <p className="studio-report-title">「{published.title}」已发布到市场</p>
              <p className="studio-muted">
                学员现在可以在市场里获取这门课程；内容更新会自动推送给已获取的学员，无需他们重新获取。
              </p>
              <div className="studio-form-actions">
                <button type="button" className="btn" onClick={onOpenMarket}>打开市场看看</button>
                <button type="button" className="btn btn-secondary" onClick={resetWizard}>再创作一门</button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
