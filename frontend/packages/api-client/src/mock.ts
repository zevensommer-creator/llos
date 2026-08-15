import type {
  Account,
  ApiClient,
  ApiError,
  CapabilityId,
  ChatSessionView,
  HomeCard,
  HomeOverview,
  JourneyId,
  LearningSessionView,
  LoadScenario,
  LoadState,
  MarketEntry,
  TeacherMobileDashboardViewModel,
  WorkbenchSection,
  WorkbenchView,
} from "./types.js";

const BASE_CAPABILITIES: readonly CapabilityId[] = [
  "chat",
  "learn",
  "generate_material_ephemeral",
  "join_class",
  "create_dlc_draft",
];

const TEACHER_EXTRA: readonly CapabilityId[] = [...BASE_CAPABILITIES, "create_class"];

export interface MockApiClientOptions {
  account?: "learner" | "teacher";
  /** 每个旅程的演示场景；缺省为 "normal"。 */
  scenarios?: Partial<Record<JourneyId, LoadScenario>>;
}

const RECOVERABLE: ApiError = Object.freeze({
  code: "provider_unavailable",
  message: "在线服务暂时不可用，可稍后重试",
});

const UNRECOVERABLE: ApiError = Object.freeze({
  code: "snapshot_incompatible",
  message: "内容版本不兼容，需要重新获取",
});

/**
 * Deterministic, network-free ApiClient for UI-1/UI-2. Real adapter arrives at
 * UI-4 (contracts + real API surface); both apps consume only this interface.
 *
 * UI-2：四个旅程方法统一返回七态 LoadState，由 options.scenarios 驱动；
 * 权限门遵循 CLIENT_SURFACE_SPEC §2（隐藏按钮不是安全控制——这里在 Mock 层
 * 模拟服务端重新授权的结果：能力不足即返回 permission_denied）。
 */
export class MockApiClient implements ApiClient {
  readonly #account: Account;
  readonly #scenarios: Partial<Record<JourneyId, LoadScenario>>;

  constructor(options: MockApiClientOptions = {}) {
    const teacher = options.account === "teacher";
    this.#account = Object.freeze({
      account_id: teacher ? "account.mock.teacher" : "account.mock.learner",
      display_name: teacher ? "王老师（Mock）" : "小夏（Mock）",
      capabilities: Object.freeze(teacher ? TEACHER_EXTRA : BASE_CAPABILITIES),
    });
    this.#scenarios = options.scenarios ?? {};
  }

  getAccount(): Promise<Account> {
    return Promise.resolve(this.#account);
  }

  getHomeOverview(): Promise<HomeOverview> {
    const teacher = this.#account.capabilities.includes("create_class");
    const cards: readonly HomeCard[] = teacher
      ? [
          { id: "home.1", kind: "teacher_summary", title: "今日待处理 3 项", detail: "德语 A1 班 · 2 名学生逾期" },
          { id: "home.2", kind: "continue_learning", title: "继续：FSI 德语发音基础", detail: "短元音训练 · 上次到第 4 步" },
          { id: "home.3", kind: "due_review", title: "待复习 12 项", detail: "ich-Laut / ach-Laut · 明天到期" },
        ]
      : [
          { id: "home.1", kind: "continue_learning", title: "继续：FSI 德语发音基础", detail: "短元音训练 · 上次到第 4 步" },
          { id: "home.2", kind: "due_review", title: "待复习 12 项", detail: "ich-Laut / ach-Laut · 明天到期" },
          { id: "home.3", kind: "recent_chat", title: "最近聊天", detail: "上周关于摩洛哥旅行德语的对话" },
        ];
    return Promise.resolve({ cards: Object.freeze(cards) });
  }

  listMarket(): Promise<readonly MarketEntry[]> {
    return Promise.resolve(
      Object.freeze([
        { dlc_id: "dlc.fsi-german-a1", title: "FSI 德语发音基础", language: "de", difficulty: "A1", price_model: "free", owned: true },
        { dlc_id: "dlc.german-b1-grammar", title: "德语 B1 语法强化", language: "de", difficulty: "B1", price_model: "subscription", owned: false },
        { dlc_id: "dlc.french-start", title: "法语入门（第二批次预览）", language: "fr", difficulty: "A1", price_model: "one_time", owned: false },
      ]),
    );
  }

  // -------------------------------------------------------------------------
  // UI-2 四旅程
  // -------------------------------------------------------------------------

  loadChatSession(): Promise<LoadState<ChatSessionView>> {
    return Promise.resolve(this.#resolve("chat", chatFixture(), undefined));
  }

  loadLearningSession(): Promise<LoadState<LearningSessionView>> {
    // 学习旅程需要 learn 能力（基础能力，所有 Mock 账户都有）。
    return Promise.resolve(this.#resolve("learning", learningFixture(), "learn"));
  }

  loadTeacherDashboard(): Promise<LoadState<TeacherMobileDashboardViewModel>> {
    // 教师旅程需要 create_class 能力：学习者账户自然得到 permission_denied（§2）。
    return Promise.resolve(this.#resolve("teacher", teacherFixture(), "create_class"));
  }

  loadWorkbench(): Promise<LoadState<WorkbenchView>> {
    return Promise.resolve(this.#resolve("workbench", workbenchFixture(), undefined));
  }

  /**
   * 七态解析。真实能力门优先于场景：能力不足一律 permission_denied（§2）。
   * 离线态按 §9 区分：依赖在线 Provider 的旅程（聊天）cached=null；
   * 有离线快照的旅程（学习，snapshot.offline_allowed）cached 带数据。
   */
  #resolve<T>(journey: JourneyId, data: T, required: CapabilityId | undefined): LoadState<T> {
    if (required && !this.#account.capabilities.includes(required)) {
      return {
        status: "permission_denied",
        required_capability: required,
        message: "当前账户没有此功能权限（写操作由服务端重新授权）",
      };
    }
    const scenario = this.#scenarios[journey] ?? "normal";
    switch (scenario) {
      case "loading":
        return { status: "loading" };
      case "empty":
        return { status: "empty" };
      case "permission_denied":
        return {
          status: "permission_denied",
          required_capability: required ?? "learn",
          message: "当前账户没有此功能权限（写操作由服务端重新授权）",
        };
      case "offline":
        return { status: "offline", cached: offlineCacheFor(journey, data) };
      case "error_recoverable":
        return { status: "error_recoverable", error: RECOVERABLE };
      case "error_unrecoverable":
        return { status: "error_unrecoverable", error: UNRECOVERABLE };
      case "normal":
      default:
        return { status: "ready", data };
    }
  }
}

/** §9：离线时只有 offline_allowed 的内容带缓存；在线 Provider 活动明确不可离线。 */
function offlineCacheFor<T>(journey: JourneyId, data: T): T | null {
  return journey === "learning" ? data : null;
}

// ---------------------------------------------------------------------------
// Mock fixtures（正常态数据）
// ---------------------------------------------------------------------------

function chatFixture(): ChatSessionView {
  return {
    session: {
      session_id: "session.chat.mock",
      mode: "chat",
      title: "自由聊天 · 旅行德语",
      // ChatSession：刻意不含 snapshot/activities/learning_state（§6 不显示学习进度）。
    },
    messages: Object.freeze([
      { message_id: "m1", role: "user", text: "Wie sage ich „我想订一间房“ auf Deutsch?" },
      {
        message_id: "m2",
        role: "assistant",
        text: "Ich möchte ein Zimmer buchen.",
        referenced_material: "de-hotel-checkin",
      },
      { message_id: "m3", role: "user", text: "Danke! Und „含早餐吗“?" },
    ]),
  };
}

function learningFixture(): LearningSessionView {
  return {
    session: {
      session_id: "session.learn.mock",
      mode: "learning",
      title: "FSI 德语发音基础 · 短元音替换训练",
      snapshot: {
        snapshot_id: "snap.de.fsi.a1",
        title: "FSI 德语 A1 素材快照",
        language: "de",
        item_count: 48,
        version: "0.2.1",
        offline_allowed: true,
      },
      activities: Object.freeze([
        { activity_id: "act.1", kind: "listening", prompt: "听示范：Ich komme.", requires_microphone: false },
        { activity_id: "act.2", kind: "speech", prompt: "跟读替换：Ich komme / Du kommst / Er kommt", requires_microphone: true },
        { activity_id: "act.3", kind: "choice", prompt: "选出正确的 ich-Laut 发音", requires_microphone: false },
      ]),
      learning_state: Object.freeze([
        {
          claim_id: "claim.de.short-vowel",
          status: "provisional",
          display_label: "暂时达到当前标准",
          reason_summary: "需要在另一次会话中完成复测",
          next_action: "review_later",
          policy_ref: "policy.fsi@0.2.0",
          updated_at: "2026-08-15T12:00:00Z",
        },
      ]),
    },
    current_activity_index: 1,
    feedback: {
      activity_id: "act.2",
      verdict: "abstained",
      explanation: "录音证据不足，暂不给出发音判定（可重录）。",
    },
    sync_queue: { pending_count: 2, online: true, last_synced_at: "2026-08-15T11:58:00Z" },
  };
}

function teacherFixture(): TeacherMobileDashboardViewModel {
  return {
    today_pending_count: 3,
    overdue_tasks: Object.freeze([
      { task_id: "t.1", label: "德语 A1 班 · 发音作业", due: "2026-08-14", overdue: true },
      { task_id: "t.2", label: "德语 A1 班 · 替换训练 2", due: "2026-08-15", overdue: false },
    ]),
    new_member_names: Object.freeze(["小李", "小周"]),
    classes: Object.freeze([
      {
        class_id: "class.de.a1",
        name: "德语 A1 班",
        member_count: 24,
        completion_rate: 0.62,
        overdue_count: 2,
        anomaly: "完成率低于预期",
      },
    ]),
    advanced_note: "批量管理、复杂顺序与统计导出请在电脑端完成",
  };
}

const WORKBENCH_SECTIONS: readonly WorkbenchSection[] = [
  { id: "chat", title: "普通聊天", description: "ChatSession（DLC 为空）：不产生学习状态" },
  { id: "learning", title: "学习工作台", description: "LearningSession：三层就绪后执行训练与反馈" },
  { id: "market", title: "市场", description: "DLC 与素材的浏览、获取与已购内容" },
  { id: "classes", title: "班级管理", description: "批量成员管理、学习组合分配、截止日期", required_capability: "create_class" },
  { id: "studio", title: "DLC Studio", description: "DLC 创建、编辑、测试与发布；BYOK", required_capability: "publish_dlc" },
  { id: "review", title: "审核与用户", description: "内容下架、用户管理、系统配置", required_capability: "manage_users" },
];

function workbenchFixture(): WorkbenchView {
  return {
    sections: WORKBENCH_SECTIONS,
    entitlements: Object.freeze([
      { dlc_id: "dlc.fsi-german-a1", title: "FSI 德语发音基础", source: "free", valid: true },
      { dlc_id: "dlc.german-b1-grammar", title: "德语 B1 语法强化", source: "class_assignment", valid: true },
    ]),
  };
}
