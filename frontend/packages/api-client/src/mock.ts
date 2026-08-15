import type {
  Account,
  AcquireOutcome,
  ApiClient,
  ApiError,
  CapabilityId,
  ChatSessionView,
  EntitlementViewModel,
  HomeCard,
  HomeOverview,
  JourneyId,
  LearningSessionView,
  LoadScenario,
  LoadState,
  MarketEntry,
  MarketListingDetail,
  MarketQuery,
  ReviewOutcome,
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

// ---------------------------------------------------------------------------
// T-026: 模块级市场状态。useJourneyState 每次加载都会新建 MockApiClient，
// 获取/评价等写操作必须跨实例可见，故状态放在模块层（Mock 层模拟服务端）。
// resetMockMarket() 恢复种子数据，供测试隔离。
// ---------------------------------------------------------------------------

interface MarketListingRecord {
  dlc_id: string;
  title: string;
  summary: string;
  language: string;
  difficulty: string;
  tags: readonly string[];
  price_model: "free" | "one_time" | "subscription";
  publisher_name: string;
  published_at: string;
  downloads: number;
}

interface MarketAccountState {
  owned: Set<string>;
  /** 一用户一评，覆盖更新（product_spec §4.3）。 */
  reviews: Map<string, { rating: number; text?: string }>;
}

interface MarketStore {
  listings: Map<string, MarketListingRecord>;
  accounts: Map<string, MarketAccountState>;
}

function seedListings(): MarketListingRecord[] {
  return [
    {
      dlc_id: "dlc.fsi-german-a1",
      title: "FSI 德语发音基础",
      summary: "长短元音、前圆唇元音与 ich-Laut/ach-Laut 的听辨与跟读训练，德语首发内容。",
      language: "de",
      difficulty: "A1",
      tags: ["发音", "基础"],
      price_model: "free",
      publisher_name: "LLOS 参考内容组",
      published_at: "2026-08-01T09:00:00Z",
      downloads: 128,
    },
    {
      dlc_id: "dlc.de-hotel-survival",
      title: "酒店德语速成",
      summary: "入住、问询与退房场景的替换训练，配套 de-hotel-checkin 参考素材。",
      language: "de",
      difficulty: "A1",
      tags: ["旅行", "酒店"],
      price_model: "free",
      publisher_name: "LLOS 参考内容组",
      published_at: "2026-08-12T10:00:00Z",
      downloads: 36,
    },
    {
      dlc_id: "dlc.german-b1-grammar",
      title: "德语 B1 语法强化",
      summary: "从句语序与格位系统的证据驱动训练（订阅制示例，付费获取见 P8）。",
      language: "de",
      difficulty: "B1",
      tags: ["语法", "强化"],
      price_model: "subscription",
      publisher_name: "王老师（已认证）",
      published_at: "2026-08-05T08:00:00Z",
      downloads: 61,
    },
    {
      dlc_id: "dlc.french-start",
      title: "法语入门（第二批次预览）",
      summary: "第二批次语言预览内容（买断制示例，付费获取见 P8）。",
      language: "fr",
      difficulty: "A1",
      tags: ["入门"],
      price_model: "one_time",
      publisher_name: "LLOS 参考内容组",
      published_at: "2026-08-10T09:00:00Z",
      downloads: 12,
    },
  ];
}

function seedStore(): MarketStore {
  const listings = new Map<string, MarketListingRecord>();
  for (const listing of seedListings()) listings.set(listing.dlc_id, listing);
  const accounts = new Map<string, MarketAccountState>();
  for (const accountId of ["account.mock.learner", "account.mock.teacher"]) {
    accounts.set(accountId, { owned: new Set(["dlc.fsi-german-a1"]), reviews: new Map() });
  }
  return { listings, accounts };
}

let MARKET_STORE: MarketStore = seedStore();

/** 恢复市场种子数据（测试隔离用）。 */
export function resetMockMarket(): void {
  MARKET_STORE = seedStore();
}

function marketStateFor(accountId: string): MarketAccountState {
  let state = MARKET_STORE.accounts.get(accountId);
  if (!state) {
    state = { owned: new Set(), reviews: new Map() };
    MARKET_STORE.accounts.set(accountId, state);
  }
  return state;
}

function ratingSummaryFor(dlcId: string): { average: number | null; count: number } {
  let total = 0;
  let count = 0;
  for (const state of MARKET_STORE.accounts.values()) {
    const review = state.reviews.get(dlcId);
    if (review) {
      total += review.rating;
      count += 1;
    }
  }
  return count === 0
    ? { average: null, count: 0 }
    : { average: Math.round((total / count) * 100) / 100, count };
}

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
    return this.queryMarket();
  }

  // -------------------------------------------------------------------------
  // T-026 市场流程（Mock 层模拟服务端：门禁结果与 @llos/market 语义一致）
  // -------------------------------------------------------------------------

  queryMarket(query: MarketQuery = {}): Promise<readonly MarketEntry[]> {
    const state = marketStateFor(this.#account.account_id);
    const search = query.search?.trim().toLowerCase();
    const entries = [...MARKET_STORE.listings.values()]
      .filter((listing) => {
        if (query.language && listing.language !== query.language) return false;
        if (query.difficulty && listing.difficulty !== query.difficulty) return false;
        if (query.tags?.length && !query.tags.every((tag) => listing.tags.includes(tag))) return false;
        if (search) {
          const inTitle = listing.title.toLowerCase().includes(search);
          const inTags = listing.tags.some((tag) => tag.toLowerCase().includes(search));
          if (!inTitle && !inTags) return false;
        }
        return true;
      })
      .map((listing) => ({
        dlc_id: listing.dlc_id,
        title: listing.title,
        language: listing.language,
        difficulty: listing.difficulty,
        price_model: listing.price_model,
        owned: state.owned.has(listing.dlc_id),
      }));
    const sort = query.sort ?? "newest";
    entries.sort((a, b) => {
      const la = MARKET_STORE.listings.get(a.dlc_id);
      const lb = MARKET_STORE.listings.get(b.dlc_id);
      if (!la || !lb) return 0;
      if (sort === "rating_desc") {
        const ra = ratingSummaryFor(a.dlc_id);
        const rb = ratingSummaryFor(b.dlc_id);
        const avgA = ra.average ?? -1;
        const avgB = rb.average ?? -1;
        if (avgB !== avgA) return avgB - avgA;
        return rb.count - ra.count;
      }
      if (sort === "downloads_desc") {
        return lb.downloads - la.downloads;
      }
      return lb.published_at.localeCompare(la.published_at);
    });
    return Promise.resolve(Object.freeze(entries));
  }

  getMarketListing(dlcId: string): Promise<MarketListingDetail | null> {
    const listing = MARKET_STORE.listings.get(dlcId);
    if (!listing) return Promise.resolve(null);
    const state = marketStateFor(this.#account.account_id);
    const owned = state.owned.has(dlcId);
    const { average, count } = ratingSummaryFor(dlcId);
    const mine = state.reviews.get(dlcId);
    const detail: MarketListingDetail = {
      dlc_id: listing.dlc_id,
      title: listing.title,
      summary: listing.summary,
      language: listing.language,
      difficulty: listing.difficulty,
      tags: [...listing.tags],
      price_model: listing.price_model,
      rating_average: average,
      rating_count: count,
      downloads: listing.downloads,
      publisher_name: listing.publisher_name,
      published_at: listing.published_at,
      owned,
      can_review: owned,
      my_review: mine ? { rating: mine.rating, text: mine.text } : undefined,
    };
    return Promise.resolve(detail);
  }

  acquireListing(dlcId: string): Promise<AcquireOutcome> {
    const listing = MARKET_STORE.listings.get(dlcId);
    if (!listing) return Promise.resolve({ status: "not_found" });
    if (listing.price_model !== "free") {
      return Promise.resolve({ status: "payment_not_available", price_model: listing.price_model });
    }
    const state = marketStateFor(this.#account.account_id);
    if (state.owned.has(dlcId)) return Promise.resolve({ status: "already_owned" });
    state.owned.add(dlcId);
    listing.downloads += 1;
    return Promise.resolve({ status: "acquired" });
  }

  submitReview(dlcId: string, rating: number, text?: string): Promise<ReviewOutcome> {
    const listing = MARKET_STORE.listings.get(dlcId);
    if (!listing) return Promise.resolve({ status: "not_found" });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return Promise.resolve({ status: "invalid_rating", message: "评分必须是 1–5 的整数" });
    }
    const state = marketStateFor(this.#account.account_id);
    if (!state.owned.has(dlcId)) {
      return Promise.resolve({
        status: "requires_entitlement",
        message: "获取该内容后才能评价（product_spec §4.3；服务端重新授权）",
      });
    }
    const trimmed = text?.trim();
    state.reviews.set(dlcId, { rating, text: trimmed ? trimmed : undefined });
    return Promise.resolve({ status: "submitted", rating });
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
    return Promise.resolve(this.#resolve("workbench", this.#workbenchView(), undefined));
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

  /** 工作台授权列表 = 市场获取记录（source=free）+ 班级分配示例条目。 */
  #workbenchView(): WorkbenchView {
    const state = marketStateFor(this.#account.account_id);
    const owned: EntitlementViewModel[] = [...state.owned].map((dlcId) => ({
      dlc_id: dlcId,
      title: MARKET_STORE.listings.get(dlcId)?.title ?? dlcId,
      source: "free",
      valid: true,
    }));
    const assigned: EntitlementViewModel[] = [{
      dlc_id: "dlc.german-b1-grammar",
      title: "德语 B1 语法强化",
      source: "class_assignment",
      valid: true,
    }];
    return {
      sections: WORKBENCH_SECTIONS,
      entitlements: Object.freeze([...owned, ...assigned]),
    };
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
