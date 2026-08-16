import type {
  Account,
  AcquireOutcome,
  ApiClient,
  ApiError,
  ByokEntryView,
  CapabilityId,
  ChatSessionView,
  ClassAssignmentView,
  ClassDetailView,
  ClassInvitationView,
  ClassStatsView,
  ClassSummary,
  ClassUnlockItem,
  CreateClassOutcome,
  CreateStudioDraftInput,
  CreateStudioDraftOutcome,
  AssignOutcome,
  DelistStudioOutcome,
  EditStudioDraftOutcome,
  StudioDraftEditInput,
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
  PublishStudioInput,
  PublishStudioOutcome,
  RegisterByokOutcome,
  ReviewOutcome,
  SandboxOutcome,
  StudioDraftView,
  StudioDlcView,
  StudioTemplateView,
  StudioUnitView,
  ExpertEditStudioOutcome,
  TeacherMobileDashboardViewModel,
  WorkbenchSection,
  WorkbenchView,
} from "./types.js";
import { parseTrainingModes } from "@llos/compiler/training-modes-parse";

/**
 * base64 → UTF-8 文本解码（浏览器安全；T-036 之前用 Node 的 Buffer，浏览器侧不可用）。
 * Mock 层模拟"确定性 OCR"：把 base64 解码为文本，真实图片 OCR 走 provider-backed 传输。
 */
function base64ToUtf8(base64: string): string {
  const binary = typeof atob === "function" ? atob(base64) : "";
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

const BASE_CAPABILITIES: readonly CapabilityId[] = [
  "chat",
  "learn",
  "generate_material_ephemeral",
  "join_class",
  "create_dlc_draft",
];

// Mock 教师账户 = teacher_verified：core 语义下额外持有 CREATOR 能力（publish_dlc 等）
// + create_class（T-029 班级）。学习者保持基础能力：可建草稿、不可发布。
const TEACHER_EXTRA: readonly CapabilityId[] = [
  ...BASE_CAPABILITIES,
  "create_class",
  "publish_dlc",
];

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
  /** T-032：Studio 下架标记——目录隐藏，已获取用户保留访问权（§6.9）。 */
  delisted?: boolean;
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

// ---------------------------------------------------------------------------
// T-032: 模块级 Studio 状态。Mock 层模拟 @llos/studio 服务端语义：
// - 摄入结构化沿用后端 deterministic transport 的行协议（"Szenario: 标题 | 例句"）；
// - 草稿状态机 structured → confirmed → published / discarded；
// - 发布门禁 = confirmed + delist 告知确认（§6.9）；
// - 发布免费 DLC 注入 MARKET_STORE（市场即时可见，闭环演示）；
// - 版本号对创作者隐形（§6.7）：视图层不含 version 字段；
// - BYOK 明文不出存储，列表仅掩码（§6.5，掩码规则与 core maskKey 一致）。
// ---------------------------------------------------------------------------

interface MockByokRecord {
  entry_id: string;
  account_id: string;
  provider_family: string;
  label: string;
  api_key: string;
  created_at: string;
}

interface MockStudioDraft {
  draft_id: string;
  dlc_id: string;
  creator_id: string;
  status: "structured" | "confirmed" | "published" | "discarded";
  title: string;
  language: string;
  cefr_level: string;
  units: StudioUnitView[];
  structured_by: { provider_id: string; model_id?: string };
  ocr_by?: { provider_id: string; model_id?: string };
  /** 专家模式：训练模式定义 JSON（manifest extensions 经 sha256 引用它）。 */
  training_modes_json?: string;
  /** 专家模式：manifest 或训练模式被直接编辑过；向导编辑随之锁定。 */
  expert_edited?: boolean;
  /** 完整清单（专家 manifest 编辑器的基线；draftView 以 JSON 快照暴露）。 */
  manifest: MockManifest;
  updated_at: string;
}

/** Mock 清单：对齐真实后端 buildManifestDraft 的关键字段（专家编辑门禁用）。 */
interface MockManifest {
  schema_version: string;
  dlc_id: string;
  display_name: string;
  language: string;
  claims: { claim_ref: string; evidence_policy_ref: string }[];
  passes: { id: string; entrypoint: string; version: string }[];
}

interface MockStudioDlc {
  dlc_id: string;
  creator_id: string;
  title: string;
  language: string;
  summary: string;
  difficulty: string;
  tags: string[];
  price_model: "free" | "one_time" | "subscription";
  published_at: string;
  delisted: boolean;
  /** 修订基线（§6.7）：startRevision 以此为起点新建草稿。 */
  units: StudioUnitView[];
  cefr_level: string;
  /** 专家模式定义随发布落档；修订草稿继承（对齐 @llos/studio）。 */
  training_modes_json?: string;
  expert_edited?: boolean;
}

interface MockStudioStore {
  byok: MockByokRecord[];
  drafts: Map<string, MockStudioDraft>;
  published: Map<string, MockStudioDlc>;
  templates: readonly StudioTemplateView[];
  nextId: { draft: number; dlc: number; byok: number };
}

/** 模板加速器（对齐 @llos/studio 的 STUDIO_TEMPLATES；仅预填文本，无教学策略）。 */
const STUDIO_TEMPLATES_MOCK: readonly StudioTemplateView[] = [
  {
    template_id: "tpl.scenario-dialogue",
    title: "情景对话",
    description: "咖啡馆、问路、预约等日常情景，适合从零组织一门 A2 口语课。",
    cefr_suggestion: "A2",
    title_suggestion: "Alltagssituationen auf Deutsch",
    prefilled_text: [
      "Szenario: Im Café bestellen | Ich hätte gern einen Kaffee, bitte.",
      "Szenario: Nach dem Weg fragen | Entschuldigung, wie komme ich zum Bahnhof?",
      "Szenario: Einen Termin vereinbaren | Ich möchte gern einen Termin machen.",
    ].join("\n"),
  },
  {
    template_id: "tpl.verb-valence",
    title: "动词配价",
    description: "围绕德语动词配价（及物/双宾/介词补足）组织操练单元。",
    cefr_suggestion: "B1",
    title_suggestion: "Deutsche Verbvalenz üben",
    prefilled_text: [
      "Valenz: empfehlen | Der Kellner empfiehlt uns den Kuchen. | empfehlen",
      "Valenz: schenken | Die Großmutter schenkt dem Kind ein Buch. | schenken",
      "Valenz: erklären | Der Lehrer erklärt den Schülern die Regel. | erklären",
    ].join("\n"),
  },
  {
    template_id: "tpl.polite-construction",
    title: "礼貌构式",
    description: "虚拟式请求、婉转追问等礼貌表达的构式训练。",
    cefr_suggestion: "A2",
    title_suggestion: "Höflich auf Deutsch",
    prefilled_text: [
      "Konstruktion: Höfliche Bitte | Könnten Sie bitte das Wasser bringen?",
      "Konstruktion: Höfliche Nachfrage | Könnten Sie das bitte wiederholen?",
      "Konstruktion: Wunsch äußern | Ich würde gern ein Einzelzimmer nehmen.",
    ].join("\n"),
  },
];

function seedStudioStore(): MockStudioStore {
  const store: MockStudioStore = {
    byok: [
      {
        entry_id: "byok.mock.1",
        account_id: TEACHER_ID,
        provider_family: "deepseek",
        label: "备课用 DeepSeek Key",
        api_key: "sk-byok-mock-0123456789abcdef",
        created_at: "2026-08-14T09:00:00Z",
      },
    ],
    drafts: new Map(),
    published: new Map(),
    templates: STUDIO_TEMPLATES_MOCK,
    nextId: { draft: 1, dlc: 1, byok: 2 },
  };
  return store;
}

let STUDIO_STORE: MockStudioStore = seedStudioStore();

/** 恢复 Studio 种子数据（测试隔离用）。 */
export function resetMockStudio(): void {
  STUDIO_STORE = seedStudioStore();
}

/** 掩码规则与 core maskKey 一致：保留前 3 后 4；短密钥不露任何字符。 */
function maskKey(apiKey: string): string {
  if (apiKey.length < 12) return "…";
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}

/** 结构化（Mock 层复刻 deterministicStructureTransport 行协议）。 */
function structureUnits(text: string): { ok: true; units: StudioUnitView[] } | { ok: false; reason: "empty" | "invalid" } {
  const lines = text.split(/\r?\n/);
  const units: StudioUnitView[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const prefix = line.slice(0, sep).trim().toLowerCase();
    const parts = line.slice(sep + 1).split("|").map((p) => p.trim());
    const title = parts[0];
    const pattern = parts[1] ?? title;
    if (title.length === 0 || pattern.length === 0) continue;
    const frameType =
      prefix === "szenario" || prefix === "scenario"
        ? "scenario"
        : prefix === "valenz" || prefix === "valence"
          ? "argument_structure"
          : "concept";
    const lemma = parts[2];
    units.push({
      unit_no: units.length + 1,
      frame_type: frameType,
      title,
      pattern,
      ...(lemma && lemma.length > 0 ? { lemma } : {}),
    });
  }
  if (units.length === 0) {
    return lines.every((l) => l.trim().length === 0) ? { ok: false, reason: "empty" } : { ok: false, reason: "invalid" };
  }
  return { ok: true, units };
}

/** 单元表单校验（错误信息教学化，§6.2 不暴露技术错误）。 */
function validateUnits(units: readonly { title: string; pattern: string }[]): string | null {
  for (let i = 0; i < units.length; i++) {
    if (units[i].title.trim().length === 0) return `第 ${i + 1} 课还没有标题，请补全后再确认`;
    if (units[i].pattern.trim().length === 0) return `第 ${i + 1} 课还没有例句，请补全后再确认`;
  }
  if (units.length === 0) return "课程至少需要 1 个学习单元";
  return null;
}

function draftView(draft: MockStudioDraft): StudioDraftView {
  return Object.freeze({
    draft_id: draft.draft_id,
    status: draft.status,
    title: draft.title,
    language: draft.language,
    cefr_level: draft.cefr_level,
    units: Object.freeze(draft.units.map((u) => Object.freeze({ ...u }))),
    structured_by: Object.freeze({ ...draft.structured_by }),
    ...(draft.ocr_by ? { ocr_by: Object.freeze({ ...draft.ocr_by }) } : {}),
    ...(draft.expert_edited ? { expert_edited: true } : {}),
    manifest_json: JSON.stringify(draft.manifest),
    ...(draft.training_modes_json ? { training_modes_json: draft.training_modes_json } : {}),
    updated_at: draft.updated_at,
  });
}

function dlcView(dlc: MockStudioDlc): StudioDlcView {
  return Object.freeze({
    dlc_id: dlc.dlc_id,
    title: dlc.title,
    language: dlc.language,
    summary: dlc.summary,
    difficulty: dlc.difficulty,
    tags: Object.freeze([...dlc.tags]),
    price_model: dlc.price_model,
    published_at: dlc.published_at,
    delisted: dlc.delisted,
  });
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
        if (listing.delisted) return false;
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
    if (!listing || listing.delisted) return Promise.resolve(null);
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
    // 已下架：停止新获取；已获取用户走 already_owned 幂等保留（§6.9）。
    if (listing.delisted) {
      const state = marketStateFor(this.#account.account_id);
      return state.owned.has(dlcId)
        ? Promise.resolve({ status: "already_owned" })
        : Promise.resolve({ status: "not_found" });
    }
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
  // T-032 Studio 流程（Mock 层模拟服务端门禁，语义对齐 @llos/studio）
  // -------------------------------------------------------------------------

  listByokKeys(): Promise<readonly ByokEntryView[]> {
    return Promise.resolve(
      Object.freeze(
        STUDIO_STORE.byok
          .filter((entry) => entry.account_id === this.#account.account_id)
          .map((entry) => Object.freeze({
            entry_id: entry.entry_id,
            provider_family: entry.provider_family,
            label: entry.label,
            masked_key: maskKey(entry.api_key),
            created_at: entry.created_at,
          })),
      ),
    );
  }

  listByokProviderFamilies(): Promise<readonly string[]> {
    // T-036：品牌家族清单模拟服务端从 Gateway 的 BYOK adapter 注册表派生，页面不硬编码。
    return Promise.resolve(Object.freeze(["deepseek", "openai", "gemini"]));
  }

  registerByokKey(providerFamily: string, label: string, key: string): Promise<RegisterByokOutcome> {
    const trimmed = key.trim();
    if (trimmed.length < 12) {
      return Promise.resolve({
        status: "invalid_key",
        message: "密钥太短，请完整粘贴 Provider 控制台里的 API 密钥",
      });
    }
    const entry: MockByokRecord = {
      entry_id: `byok.mock.${STUDIO_STORE.nextId.byok++}`,
      account_id: this.#account.account_id,
      provider_family: providerFamily.trim() || "deepseek",
      label: label.trim() || "我的密钥",
      api_key: trimmed,
      created_at: "2026-08-16T12:00:00Z",
    };
    STUDIO_STORE.byok.push(entry);
    return Promise.resolve({
      status: "registered",
      entry: Object.freeze({
        entry_id: entry.entry_id,
        provider_family: entry.provider_family,
        label: entry.label,
        masked_key: maskKey(entry.api_key),
        created_at: entry.created_at,
      }),
    });
  }

  listStudioDlcs(): Promise<readonly StudioDlcView[]> {
    return Promise.resolve(
      Object.freeze(
        [...STUDIO_STORE.published.values()]
          .filter((dlc) => dlc.creator_id === this.#account.account_id)
          .sort((a, b) => b.published_at.localeCompare(a.published_at))
          .map(dlcView),
      ),
    );
  }

  createStudioDraft(input: CreateStudioDraftInput): Promise<CreateStudioDraftOutcome> {
    if (!this.#account.capabilities.includes("create_dlc_draft")) {
      return Promise.resolve({
        status: "permission_denied",
        required_capability: "create_dlc_draft",
        message: "创建课程草稿需要 create_dlc_draft 能力（服务端重新授权，product_spec §6.2）",
      });
    }
    // PNG 摄入（T-035）：base64 → OCR 提取文字 → 复用 structure 管线。
    // Mock 层模拟确定性 OCR：空图片（极短 base64）→ 空文本；其余按行协议解析。
    let sourceText = input.text;
    let ocrBy;
    if (input.image !== undefined) {
      let decoded = "";
      try {
        decoded = base64ToUtf8(input.image.base64);
      } catch {
        decoded = "";
      }
      if (decoded.trim().length === 0) {
        return Promise.resolve({
          status: "ingest_empty",
          message: "图片里没有识别出可用的文字，请换一张清晰的图片，或直接粘贴文字",
        });
      }
      sourceText = decoded;
      ocrBy = { provider_id: "provider.byok.deepseek", model_id: "deepseek-ocr" };
    }
    const structured = structureUnits(sourceText ?? "");
    if (!structured.ok) {
      return Promise.resolve(
        structured.reason === "empty"
          ? {
              status: "ingest_empty",
              message: "没有可读取的内容，请检查粘贴的文字或上传的文件",
            }
          : {
              status: "structure_invalid",
              message: "AI 结构化结果无法使用：没有识别出任何课程单元。请按“Szenario: 标题 | 例句”一行一课的格式整理，或调整输入内容。",
            },
      );
    }
    const draft: MockStudioDraft = {
      draft_id: `draft.studio.mock.${STUDIO_STORE.nextId.draft}`,
      dlc_id: `dlc.studio.mock.${STUDIO_STORE.nextId.draft}`,
      creator_id: this.#account.account_id,
      status: "structured",
      title: input.title.trim() || "未命名课程",
      language: input.language,
      cefr_level: input.cefrLevel,
      units: structured.units,
      structured_by: { provider_id: "provider.byok.deepseek", model_id: "deepseek-chat" },
      ...(ocrBy ? { ocr_by: ocrBy } : {}),
      manifest: {
        schema_version: "0.2.0",
        dlc_id: `dlc.studio.mock.${STUDIO_STORE.nextId.draft}`,
        display_name: input.title.trim() || "未命名课程",
        language: input.language,
        claims: [
          { claim_ref: `dlc.studio.mock.${STUDIO_STORE.nextId.draft}:claim/checkin_dialogue`, evidence_policy_ref: "policy.performance" },
          { claim_ref: `dlc.studio.mock.${STUDIO_STORE.nextId.draft}:claim/verb_valence_dative`, evidence_policy_ref: "policy.performance" },
          { claim_ref: `dlc.studio.mock.${STUDIO_STORE.nextId.draft}:claim/polite_request_construction`, evidence_policy_ref: "policy.performance" },
        ],
        passes: [{ id: "pedagogical.plan", entrypoint: "manifest", version: "0.2.0" }],
      },
      updated_at: "2026-08-16T12:05:00Z",
    };
    STUDIO_STORE.nextId.draft += 1;
    STUDIO_STORE.drafts.set(draft.draft_id, draft);
    return Promise.resolve({ status: "created", draft: draftView(draft) });
  }

  #ownedDraft(draftId: string): MockStudioDraft | null {
    const draft = STUDIO_STORE.drafts.get(draftId);
    if (!draft || draft.creator_id !== this.#account.account_id) return null;
    return draft;
  }

  getStudioDraft(draftId: string): Promise<StudioDraftView | null> {
    const draft = this.#ownedDraft(draftId);
    return Promise.resolve(draft ? draftView(draft) : null);
  }

  #applyEdit(draft: MockStudioDraft, edit: StudioDraftEditInput): EditStudioDraftOutcome {
    if (draft.expert_edited) {
      return {
        status: "state_invalid",
        message: "此草稿包含专家模式修改（训练模式或清单），向导编辑会覆盖它们；请继续用专家模式编辑，或重新创建草稿",
      };
    }
    if (edit.title !== undefined && edit.title.trim().length === 0) {
      return { status: "confirm_failed", message: "课程标题不能为空" };
    }
    const units =
      edit.units !== undefined
        ? edit.units.map((u, i) => ({ ...u, unit_no: i + 1 }))
        : draft.units;
    const invalid = validateUnits(units);
    if (invalid) return { status: "confirm_failed", message: invalid };
    draft.title = edit.title?.trim() || draft.title;
    draft.units = units;
    draft.updated_at = "2026-08-16T12:10:00Z";
    return { status: "saved", draft: draftView(draft) };
  }

  editStudioDraft(draftId: string, edit: StudioDraftEditInput): Promise<EditStudioDraftOutcome> {
    const draft = this.#ownedDraft(draftId);
    if (!draft) return Promise.resolve({ status: "not_found", message: "草稿不存在" });
    if (draft.status === "published" || draft.status === "discarded") {
      return Promise.resolve({
        status: "state_invalid",
        message: `草稿已${draft.status === "published" ? "发布" : "废弃"}，不能继续编辑；如需修改请发起修订`,
      });
    }
    return Promise.resolve(this.#applyEdit(draft, edit));
  }

  confirmStudioDraft(draftId: string, edit: StudioDraftEditInput): Promise<EditStudioDraftOutcome> {
    const draft = this.#ownedDraft(draftId);
    if (!draft) return Promise.resolve({ status: "not_found", message: "草稿不存在" });
    if (draft.status === "published" || draft.status === "discarded") {
      return Promise.resolve({
        status: "state_invalid",
        message: `草稿已${draft.status === "published" ? "发布" : "废弃"}，不能继续编辑；如需修改请发起修订`,
      });
    }
    const hasWizardEdit = edit.title !== undefined || (edit.units !== undefined && edit.units.length > 0);
    // 专家模式：无向导编辑时直接确认；带向导编辑则走 #applyEdit（会被 expert 守卫拒绝）。
    if (draft.expert_edited && !hasWizardEdit) {
      draft.status = "confirmed";
      draft.updated_at = "2026-08-16T12:12:00Z";
      return Promise.resolve({ status: "saved", draft: draftView(draft) });
    }
    const applied = this.#applyEdit(draft, edit);
    if (applied.status !== "saved") return Promise.resolve(applied);
    draft.status = "confirmed";
    draft.updated_at = "2026-08-16T12:12:00Z";
    return Promise.resolve({ status: "saved", draft: draftView(draft) });
  }

  discardStudioDraft(draftId: string): Promise<EditStudioDraftOutcome> {
    const draft = this.#ownedDraft(draftId);
    if (!draft) return Promise.resolve({ status: "not_found", message: "草稿不存在" });
    if (draft.status === "published") {
      return Promise.resolve({
        status: "state_invalid",
        message: "已发布的课程请走下架流程，不能直接废弃草稿",
      });
    }
    draft.status = "discarded";
    draft.updated_at = "2026-08-16T12:14:00Z";
    return Promise.resolve({ status: "saved", draft: draftView(draft) });
  }

  runSandboxTrial(draftId: string): Promise<SandboxOutcome> {
    const draft = this.#ownedDraft(draftId);
    if (!draft) return Promise.resolve({ status: "not_found", message: "草稿不存在" });
    if (draft.units.length === 0) {
      return Promise.resolve({
        status: "compile_failed",
        message: "试运行前的编译检查未通过：课程里没有任何学习单元",
      });
    }
    // 沙箱报告语义对齐 runSandboxTrial：每个单元走呈现+作答+反馈三步，事件只进丢弃式收集器。
    const steps = draft.units.length * 3 + 1;
    return Promise.resolve({
      status: "ran",
      report: Object.freeze({
        status: "completed",
        steps_completed: steps,
        events_appended: draft.units.length * 3,
        real_event_store_used: false,
        executed_at: "2026-08-16T12:16:00Z",
      }),
    });
  }

  publishStudioDraft(draftId: string, input: PublishStudioInput): Promise<PublishStudioOutcome> {
    // 发布门禁：publish_dlc（market 层执行；teacher/developer verified 持有）。
    // create_dlc_draft 是基础能力，草稿人人可建，发布必须重新授权。
    if (!this.#account.capabilities.includes("publish_dlc")) {
      return Promise.resolve({
        status: "permission_denied",
        required_capability: "publish_dlc",
        message: "发布课程需要 publish_dlc 能力：个人账户可创作草稿，发布前需完成创作者认证（product_spec §6.7）",
      });
    }
    const draft = this.#ownedDraft(draftId);
    if (!draft) return Promise.resolve({ status: "invalid_input", message: "草稿不存在" });
    if (draft.status !== "confirmed") {
      return Promise.resolve({
        status: "state_invalid",
        message: `草稿状态是 ${draft.status}；请先在表单里确认内容，再发布`,
      });
    }
    if (input.acknowledged_delist_terms !== true) {
      return Promise.resolve({
        status: "acknowledgement_required",
        message: "发布前请确认知悉：学员获取的是长期授权，下架只影响新获取，不收回既有学员的访问权。",
      });
    }
    if (input.summary.trim().length === 0) {
      return Promise.resolve({ status: "invalid_input", message: "市场摘要不能为空" });
    }
    const dlcId = draft.dlc_id;
    const dlc: MockStudioDlc = {
      dlc_id: dlcId,
      creator_id: draft.creator_id,
      title: draft.title,
      language: draft.language.split("-")[0].toLowerCase(),
      summary: input.summary.trim(),
      difficulty: input.difficulty,
      tags: [...input.tags],
      price_model: "free",
      published_at: "2026-08-16T12:20:00Z",
      delisted: false,
      units: draft.units.map((u) => ({ ...u })),
      cefr_level: draft.cefr_level,
      ...(draft.training_modes_json ? { training_modes_json: draft.training_modes_json } : {}),
      ...(draft.expert_edited ? { expert_edited: true } : {}),
    };
    STUDIO_STORE.published.set(dlcId, dlc);
    draft.status = "published";
    draft.updated_at = dlc.published_at;
    // 发布联动市场（Mock 模拟服务端一次写入两条记录）：免费 DLC 立即可被学员获取。
    MARKET_STORE.listings.set(dlcId, {
      dlc_id: dlcId,
      title: dlc.title,
      summary: dlc.summary,
      language: dlc.language,
      difficulty: dlc.difficulty,
      tags: [...dlc.tags],
      price_model: "free",
      publisher_name: this.#account.display_name,
      published_at: dlc.published_at,
      downloads: 0,
    });
    return Promise.resolve({ status: "published", dlc: dlcView(dlc) });
  }

  startRevision(dlcId: string): Promise<CreateStudioDraftOutcome> {
    const dlc = STUDIO_STORE.published.get(dlcId);
    if (!dlc || dlc.creator_id !== this.#account.account_id) {
      return Promise.resolve({
        status: "structure_invalid",
        message: "没有找到你的这门已发布课程",
      });
    }
    const draft: MockStudioDraft = {
      draft_id: `draft.studio.mock.${STUDIO_STORE.nextId.draft}`,
      dlc_id: dlc.dlc_id,
      creator_id: dlc.creator_id,
      status: "structured",
      title: dlc.title,
      language: dlc.language,
      cefr_level: dlc.cefr_level,
      units: dlc.units.map((u) => ({ ...u })),
      structured_by: { provider_id: "provider.byok.deepseek", model_id: "deepseek-chat" },
      ...(dlc.training_modes_json ? { training_modes_json: dlc.training_modes_json } : {}),
      ...(dlc.expert_edited ? { expert_edited: true } : {}),
      manifest: {
        schema_version: "0.2.0",
        dlc_id: dlc.dlc_id,
        display_name: dlc.title,
        language: dlc.language,
        claims: [
          { claim_ref: `${dlc.dlc_id}:claim/checkin_dialogue`, evidence_policy_ref: "policy.performance" },
          { claim_ref: `${dlc.dlc_id}:claim/verb_valence_dative`, evidence_policy_ref: "policy.performance" },
          { claim_ref: `${dlc.dlc_id}:claim/polite_request_construction`, evidence_policy_ref: "policy.performance" },
        ],
        passes: [{ id: "pedagogical.plan", entrypoint: "manifest", version: "0.2.0" }],
      },
      updated_at: "2026-08-16T12:30:00Z",
    };
    STUDIO_STORE.nextId.draft += 1;
    STUDIO_STORE.drafts.set(draft.draft_id, draft);
    return Promise.resolve({ status: "created", draft: draftView(draft) });
  }

  delistStudioDlc(dlcId: string): Promise<DelistStudioOutcome> {
    const dlc = STUDIO_STORE.published.get(dlcId);
    if (!dlc || dlc.creator_id !== this.#account.account_id) {
      return Promise.resolve({ status: "not_found", message: "没有找到你的这门已发布课程" });
    }
    if (dlc.delisted) {
      return Promise.resolve({ status: "delisted", dlc_id: dlc.dlc_id });
    }
    dlc.delisted = true;
    const listing = MARKET_STORE.listings.get(dlcId);
    if (listing) listing.delisted = true;
    return Promise.resolve({ status: "delisted", dlc_id: dlc.dlc_id });
  }

  // -------------------------------------------------------------------------
  // T-035 Studio v2：模板加速器 + 专家模式编辑（Mock 层模拟服务端门禁）
  // -------------------------------------------------------------------------

  listStudioTemplates(): Promise<readonly StudioTemplateView[]> {
    return Promise.resolve(
      Object.freeze(STUDIO_STORE.templates.map((t) => Object.freeze({ ...t }))),
    );
  }

  createStudioDraftFromTemplate(
    templateId: string,
    language: string,
    cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  ): Promise<CreateStudioDraftOutcome> {
    const tpl = STUDIO_STORE.templates.find((t) => t.template_id === templateId);
    if (!tpl) {
      return Promise.resolve({
        status: "structure_invalid",
        message: "没有找到这个模板，请刷新后重试，或直接粘贴内容",
      });
    }
    return this.createStudioDraft({
      text: tpl.prefilled_text,
      title: tpl.title_suggestion,
      language,
      cefrLevel: cefrLevel ?? tpl.cefr_suggestion,
    });
  }

  #expertEditable(draftId: string): { ok: true; draft: MockStudioDraft } | { ok: false; outcome: ExpertEditStudioOutcome } {
    const draft = this.#ownedDraft(draftId);
    if (!draft) {
      return { ok: false, outcome: { status: "not_found", message: "草稿不存在" } };
    }
    if (draft.status === "published" || draft.status === "discarded") {
      return {
        ok: false,
        outcome: {
          status: "state_invalid",
          message: `草稿已${draft.status === "published" ? "发布" : "废弃"}，不能继续编辑；如需修改请发起修订`,
        },
      };
    }
    return { ok: true, draft };
  }

  editTrainingModes(draftId: string, modesJson: string): Promise<ExpertEditStudioOutcome> {
    const editable = this.#expertEditable(draftId);
    if (!editable.ok) return Promise.resolve(editable.outcome);
    const draft = editable.draft;
    let payload: unknown;
    try {
      payload = JSON.parse(modesJson);
    } catch {
      return Promise.resolve({
        status: "invalid_json",
        message: "训练模式定义不是有效的 JSON，请检查括号、引号与逗号",
      });
    }
    // T-036：单一解析入口——复用编译器 parseTrainingModes（浏览器安全子路径），
    // 不再在 Mock 内复刻一套守卫（审计第 8 条：消除 compiler 与 Mock 各维护一套规则）。
    try {
      parseTrainingModes(payload);
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message.replace(/^\[[^\]]+\]\s*[^:]*:\s*/, "")
          : "请检查内容";
      return Promise.resolve({
        status: "invalid_content",
        message: `训练模式定义无法使用：${detail}`,
      });
    }
    // claim 必须由清单声明（对齐编译器 manifest_reference_broken 守卫，而非硬编码后缀）。
    const declared = new Set(
      draft.manifest.claims.map((c) => {
        const idx = c.claim_ref.lastIndexOf(":claim/");
        return idx >= 0 ? c.claim_ref.slice(idx + ":claim/".length) : "";
      }),
    );
    const parsedModes = (payload as { modes: { mode_ref: string; claim_suffix: string }[] }).modes;
    for (const raw of parsedModes) {
      if (!declared.has(raw.claim_suffix)) {
        return Promise.resolve({
          status: "invalid_content",
          message: `训练模式 ${raw.mode_ref} 的教学主张不在本课程清单中，无法使用`,
        });
      }
    }
    draft.training_modes_json = modesJson;
    draft.expert_edited = true;
    draft.status = "structured";
    draft.updated_at = "2026-08-16T12:15:00Z";
    return Promise.resolve({ status: "saved", draft: draftView(draft) });
  }

  editManifest(draftId: string, manifestJson: string): Promise<ExpertEditStudioOutcome> {
    const editable = this.#expertEditable(draftId);
    if (!editable.ok) return Promise.resolve(editable.outcome);
    const draft = editable.draft;
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestJson);
    } catch {
      return Promise.resolve({
        status: "invalid_json",
        message: "课程清单不是有效的 JSON，请检查括号、引号与逗号",
      });
    }
    if (typeof parsed !== "object" || parsed === null) {
      return Promise.resolve({ status: "invalid_content", message: "课程清单无法使用，请检查内容" });
    }
    const manifest = parsed as {
      dlc_id?: unknown;
      display_name?: unknown;
      claims?: unknown;
      passes?: unknown;
      schema_version?: unknown;
      language?: unknown;
    };
    if (typeof manifest.dlc_id !== "string" || manifest.dlc_id !== draft.dlc_id) {
      return Promise.resolve({
        status: "invalid_content",
        message: "课程标识（dlc_id）不能修改或缺失",
      });
    }
    if (typeof manifest.display_name !== "string" || manifest.display_name.trim().length === 0) {
      return Promise.resolve({ status: "invalid_content", message: "课程名称不能为空" });
    }
    if (!Array.isArray(manifest.claims) || manifest.claims.length === 0) {
      return Promise.resolve({
        status: "invalid_content",
        message: "课程必须声明至少一个教学主张（claims）",
      });
    }
    if (!Array.isArray(manifest.passes) || manifest.passes.length === 0) {
      return Promise.resolve({
        status: "invalid_content",
        message: "课程必须保留至少一个编译管线（passes）",
      });
    }
    // 专家编辑后锁定向导；训练模式定义保留；manifest 快照更新。
    draft.expert_edited = true;
    draft.status = "structured";
    draft.title = manifest.display_name.trim();
    draft.manifest = {
      schema_version: typeof manifest.schema_version === "string" ? manifest.schema_version : "0.2.0",
      dlc_id: manifest.dlc_id,
      display_name: manifest.display_name,
      language: typeof manifest.language === "string" ? manifest.language : draft.language,
      claims: (manifest.claims as MockManifest["claims"]),
      passes: (manifest.passes as MockManifest["passes"]),
    };
    draft.updated_at = "2026-08-16T12:18:00Z";
    return Promise.resolve({ status: "saved", draft: draftView(draft) });
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
