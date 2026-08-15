import type {
  Account,
  AcquireOutcome,
  ApiClient,
  ApiError,
  CapabilityId,
  ChatSessionView,
  ClassAssignmentView,
  ClassDetailView,
  ClassInvitationView,
  ClassStatsView,
  ClassSummary,
  ClassUnlockItem,
  CreateClassOutcome,
  AssignOutcome,
  EntitlementViewModel,
  HomeCard,
  HomeOverview,
  JoinClassOutcome,
  JourneyId,
  LearningSessionView,
  LoadScenario,
  LoadState,
  MarketEntry,
  MarketListingDetail,
  MarketQuery,
  PostNoticeOutcome,
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
      publisher_name: "王老师（Mock）",
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

// ---------------------------------------------------------------------------
// T-029: 模块级班级状态（与 MARKET_STORE 同模式）。Mock 层模拟服务端语义，
// 与 core ClassService/ClassAssignmentService/projectClassStats 行为对齐：
// 门禁（create_class/join_class/creator）、后加入补发由 join 即时模拟、
// 先修顺序是纯呈现门、统计从完成标记聚合（真实投影在 Core，e2e-p5 已验证）。
// ---------------------------------------------------------------------------

const LEARNER_ID = "account.mock.learner";
const TEACHER_ID = "account.mock.teacher";

interface MockClassAssignment {
  assignment_id: string;
  dlc_id: string;
  title: string;
  sequence: number;
  due_at?: string;
  mode: "auto_free" | "teacher_purchase" | "recommend_self_purchase";
  entitlements_granted: boolean;
}

interface MockClassInvitation {
  code: string;
  class_id: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
}

interface MockClassRecord {
  class_id: string;
  name: string;
  description?: string;
  creator_id: string;
  created_at: string;
  archived: boolean;
  /** account_id → joined_at；display_name 经 knownNames 解析。 */
  members: Map<string, string>;
  assignments: MockClassAssignment[];
  invitations: Map<string, MockClassInvitation>;
  notices: { notice_id: string; author_id: string; text: string; created_at: string }[];
}

interface MockClassStore {
  classes: Map<string, MockClassRecord>;
  /** `${class_id}::${account_id}` → 完成的 dlc 集合。 */
  completed: Map<string, Set<string>>;
  /** `${class_id}::${account_id}` → 累计训练分钟。 */
  trainingMinutes: Map<string, number>;
  nextId: { class: number; assignment: number; invitation: number; notice: number };
}

function knownName(accountId: string): string {
  if (accountId === TEACHER_ID) return "王老师（Mock）";
  if (accountId === LEARNER_ID) return "小夏（Mock）";
  if (accountId === "account.mock.student-a") return "学生 A（Mock）";
  return accountId;
}

function seedClassStore(): MockClassStore {
  const store: MockClassStore = {
    classes: new Map(),
    completed: new Map(),
    trainingMinutes: new Map(),
    nextId: { class: 2, assignment: 3, invitation: 1, notice: 2 },
  };
  const klass: MockClassRecord = {
    class_id: "class.mock.a1",
    name: "德语 A1 班（Mock 种子）",
    description: "长短元音与酒店场景跟读训练。",
    creator_id: TEACHER_ID,
    created_at: "2026-08-10T09:00:00Z",
    archived: false,
    members: new Map([
      [TEACHER_ID, "2026-08-10T09:00:00Z"],
      [LEARNER_ID, "2026-08-11T10:00:00Z"],
      ["account.mock.student-a", "2026-08-11T10:05:00Z"],
    ]),
    assignments: [
      {
        assignment_id: "assign.mock.1",
        dlc_id: "dlc.fsi-german-a1",
        title: "FSI 德语发音基础",
        sequence: 1,
        due_at: "2026-08-20T00:00:00Z",
        mode: "auto_free",
        entitlements_granted: true,
      },
      {
        assignment_id: "assign.mock.2",
        dlc_id: "dlc.de-hotel-survival",
        title: "酒店德语速成",
        sequence: 2,
        mode: "auto_free",
        entitlements_granted: true,
      },
    ],
    invitations: new Map(),
    notices: [
      {
        notice_id: "notice.mock.1",
        author_id: TEACHER_ID,
        text: "本周日前完成第 1 项发音训练。",
        created_at: "2026-08-12T08:00:00Z",
      },
    ],
  };
  store.classes.set(klass.class_id, klass);
  store.completed.set(`${klass.class_id}::${LEARNER_ID}`, new Set(["dlc.fsi-german-a1"]));
  store.completed.set(`${klass.class_id}::account.mock.student-a`, new Set(["dlc.fsi-german-a1"]));
  store.trainingMinutes.set(`${klass.class_id}::${LEARNER_ID}`, 42);
  store.trainingMinutes.set(`${klass.class_id}::account.mock.student-a`, 30);
  return store;
}

let CLASS_STORE: MockClassStore = seedClassStore();

/** 恢复班级种子数据（测试隔离用）。 */
export function resetMockClasses(): void {
  CLASS_STORE = seedClassStore();
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
    if (!listing) return Promise.resolve({ status: "not_found", message: "市场不存在该 DLC" });
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
  // T-029 班级流程（Mock 层模拟服务端门禁，语义对齐 core）
  // -------------------------------------------------------------------------

  #myClasses(): MockClassRecord[] {
    return [...CLASS_STORE.classes.values()].filter((klass) =>
      klass.members.has(this.#account.account_id),
    );
  }

  listMyClasses(): Promise<readonly ClassSummary[]> {
    return Promise.resolve(
      Object.freeze(
        this.#myClasses().map((klass) => this.#summaryOf(klass)),
      ),
    );
  }

  createClass(name: string, description?: string): Promise<CreateClassOutcome> {
    if (!this.#account.capabilities.includes("create_class")) {
      return Promise.resolve({
        status: "permission_denied",
        required_capability: "create_class",
        message: "建班需要 create_class 能力（服务端重新授权，product_spec §2.1）",
      });
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return Promise.resolve({ status: "invalid_name", message: "班级名称不能为空" });
    }
    const id = `class.mock.${CLASS_STORE.nextId.class++}`;
    const klass: MockClassRecord = {
      class_id: id,
      name: trimmed,
      description: description?.trim() || undefined,
      creator_id: this.#account.account_id,
      created_at: "2026-08-16T10:00:00Z",
      archived: false,
      members: new Map([[this.#account.account_id, "2026-08-16T10:00:00Z"]]),
      assignments: [],
      invitations: new Map(),
      notices: [],
    };
    CLASS_STORE.classes.set(id, klass);
    return Promise.resolve({ status: "created", class: this.#summaryOf(klass) });
  }

  joinClass(code: string): Promise<JoinClassOutcome> {
    const invitation = [...CLASS_STORE.classes.values()]
      .flatMap((klass) => [...klass.invitations.values()])
      .find((inv) => inv.code === code.trim());
    const klass = invitation
      ? CLASS_STORE.classes.get(invitation.class_id)
      : undefined;
    if (!invitation || !klass || invitation.revoked || invitation.uses >= invitation.max_uses) {
      return Promise.resolve({ status: "invalid_code", message: "邀请码无效或已用尽" });
    }
    if (klass.members.has(this.#account.account_id)) {
      return Promise.resolve({ status: "already_member", class: this.#summaryOf(klass) });
    }
    if (klass.archived) {
      return Promise.resolve({ status: "class_archived", message: "班级已归档，无法加入" });
    }
    klass.members.set(this.#account.account_id, "2026-08-16T10:30:00Z");
    invitation.uses += 1;
    // 后加入补发（core onMemberJoined 语义）：auto_free 分配对训练完成标记初始化。
    const key = `${klass.class_id}::${this.#account.account_id}`;
    if (!CLASS_STORE.completed.has(key)) CLASS_STORE.completed.set(key, new Set());
    return Promise.resolve({ status: "joined", class: this.#summaryOf(klass) });
  }

  getClassDetail(classId: string): Promise<ClassDetailView | null> {
    const klass = CLASS_STORE.classes.get(classId);
    if (!klass || !klass.members.has(this.#account.account_id)) return Promise.resolve(null);
    const members = [...klass.members.entries()]
      .map(([accountId, joinedAt]) => ({
        account_id: accountId,
        display_name: knownName(accountId),
        joined_at: joinedAt,
        is_creator: accountId === klass.creator_id,
      }))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    const assignments: readonly ClassAssignmentView[] = klass.assignments
      .map((assignment) => ({ ...assignment }));
    const notices = [...klass.notices]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((notice) => ({
        notice_id: notice.notice_id,
        text: notice.text,
        created_at: notice.created_at,
        author_name: knownName(notice.author_id),
      }));
    return Promise.resolve({
      class_summary: this.#summaryOf(klass),
      members: Object.freeze(members),
      assignments: Object.freeze(assignments),
      notices: Object.freeze(notices),
    });
  }

  issueClassInvitation(classId: string, maxUses = 1): Promise<ClassInvitationView | null> {
    const klass = CLASS_STORE.classes.get(classId);
    if (!klass || klass.creator_id !== this.#account.account_id) return Promise.resolve(null);
    const code = `llos-class-mock${CLASS_STORE.nextId.invitation++}`;
    klass.invitations.set(code, {
      code,
      class_id: classId,
      max_uses: maxUses,
      uses: 0,
      revoked: false,
    });
    return Promise.resolve({ code, max_uses: maxUses, uses: 0 });
  }

  assignDlc(
    classId: string,
    dlcId: string,
    options?: { sequence?: number; dueAt?: string },
  ): Promise<AssignOutcome> {
    const klass = CLASS_STORE.classes.get(classId);
    if (!klass || klass.creator_id !== this.#account.account_id) {
      return Promise.resolve({ status: "not_creator", message: "只有班级创建者可以分配" });
    }
    const listing = MARKET_STORE.listings.get(dlcId);
    if (!listing) {
      return Promise.resolve({ status: "invalid_input", message: "市场不存在该 DLC" });
    }
    const existing = klass.assignments.find((a) => a.dlc_id === dlcId);
    const assignmentId = existing?.assignment_id ?? `assign.mock.${CLASS_STORE.nextId.assignment++}`;
    // §4.2：创建者自有内容对班级自动免费；其余付费项仅记录 C 方案（P8 前不授权）。
    const creatorOwned = listing.publisher_name === knownName(klass.creator_id);
    const autoFree = listing.price_model === "free" || creatorOwned;
    const assignment: MockClassAssignment = {
      assignment_id: assignmentId,
      dlc_id: dlcId,
      title: listing.title,
      sequence: options?.sequence ?? existing?.sequence ?? klass.assignments.length + 1,
      due_at: options?.dueAt ?? existing?.due_at,
      mode: autoFree ? "auto_free" : "recommend_self_purchase",
      entitlements_granted: autoFree,
    };
    if (existing) {
      klass.assignments[klass.assignments.indexOf(existing)] = assignment;
    } else {
      klass.assignments.push(assignment);
    }
    return Promise.resolve({ status: "assigned", assignment: { ...assignment } });
  }

  postClassNotice(classId: string, text: string): Promise<PostNoticeOutcome> {
    const klass = CLASS_STORE.classes.get(classId);
    if (!klass || klass.creator_id !== this.#account.account_id) {
      return Promise.resolve({ status: "not_creator", message: "只有班级创建者可以发通知" });
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return Promise.resolve({ status: "invalid_text", message: "通知内容不能为空" });
    }
    const notice = {
      notice_id: `notice.mock.${CLASS_STORE.nextId.notice++}`,
      author_id: this.#account.account_id,
      text: trimmed,
      created_at: "2026-08-16T11:00:00Z",
    };
    klass.notices.push(notice);
    return Promise.resolve({
      status: "posted",
      notice: {
        notice_id: notice.notice_id,
        text: notice.text,
        created_at: notice.created_at,
        author_name: knownName(notice.author_id),
      },
    });
  }

  loadClassUnlockState(classId: string): Promise<readonly ClassUnlockItem[] | null> {
    const klass = CLASS_STORE.classes.get(classId);
    if (!klass || !klass.members.has(this.#account.account_id)) return Promise.resolve(null);
    const completed =
      CLASS_STORE.completed.get(`${classId}::${this.#account.account_id}`) ?? new Set<string>();
    const ordered = [...klass.assignments].sort((a, b) => a.sequence - b.sequence);
    return Promise.resolve(
      Object.freeze(
        ordered.map((assignment) => {
          const blockers = ordered
            .filter((other) => other.sequence < assignment.sequence && !completed.has(other.dlc_id))
            .map((other) => other.assignment_id);
          return {
            assignment_id: assignment.assignment_id,
            dlc_id: assignment.dlc_id,
            title: assignment.title,
            sequence: assignment.sequence,
            due_at: assignment.due_at,
            unlocked: blockers.length === 0,
            completed: completed.has(assignment.dlc_id),
            blocked_by: Object.freeze(blockers),
          };
        }),
      ),
    );
  }

  loadClassStats(classId: string): Promise<ClassStatsView | null> {
    const klass = CLASS_STORE.classes.get(classId);
    if (!klass || klass.creator_id !== this.#account.account_id) return Promise.resolve(null);
    const perMember = [...klass.members.keys()].map((accountId) => {
      const completed =
        CLASS_STORE.completed.get(`${classId}::${accountId}`) ?? new Set<string>();
      const trainingMinutes =
        CLASS_STORE.trainingMinutes.get(`${classId}::${accountId}`) ?? 0;
      return {
        account_id: accountId,
        display_name: knownName(accountId),
        assigned_count: klass.assignments.length,
        completed_count: [...completed].filter((dlcId) =>
          klass.assignments.some((a) => a.dlc_id === dlcId),
        ).length,
        training_minutes: trainingMinutes,
      };
    });
    const completionsTotal = perMember.reduce((sum, m) => sum + m.completed_count, 0);
    const expected = klass.members.size * klass.assignments.length;
    const seedWeakSpot = {
      claim_ref: "claim/pronunciation.ich_laut",
      members_affected: 2,
      success_rate: 0.4,
      reasons: Object.freeze(["conflicted_evidence", "low_success_rate"]),
    };
    return Promise.resolve({
      class_id: classId,
      members_total: klass.members.size,
      members_active: perMember.filter((m) => m.completed_count > 0 || m.training_minutes > 0).length,
      assignments_total: klass.assignments.length,
      completions_total: completionsTotal,
      completion_rate_overall: expected > 0 ? Math.round((completionsTotal / expected) * 1000) / 1000 : null,
      completion_rate_on_time: expected > 0 ? Math.round((completionsTotal / expected) * 1000) / 1000 : null,
      per_member: Object.freeze(perMember),
      weak_spots: klass.assignments.length > 0 ? Object.freeze([seedWeakSpot]) : Object.freeze([]),
    });
  }

  #summaryOf(klass: MockClassRecord): ClassSummary {
    return Object.freeze({
      class_id: klass.class_id,
      name: klass.name,
      description: klass.description,
      member_count: klass.members.size,
      archived: klass.archived,
      is_creator: klass.creator_id === this.#account.account_id,
    });
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
