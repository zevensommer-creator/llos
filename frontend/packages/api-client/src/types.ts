// UI-1 temporary view types. UI-4 replaces these with types generated from
// docs/contracts v0.2.x via @llos/contracts (TECH_STACK: 类型来源 packages/contracts).
//
// UI-2 additions: the 7-state LoadState model + the mandatory ViewModels from
// frontend/docs/VIEW_MODELS.md §1. Mock 与真实 API 使用相同 ViewModel（§4）；
// UI-4 接入契约类型时仅替换数据形状，状态机与 ViewModel 不变。

export type CapabilityId =
  | "chat"
  | "learn"
  | "generate_material_ephemeral"
  | "join_class"
  | "create_dlc_draft"
  | "upload_dlc"
  | "publish_dlc"
  | "upload_material"
  | "publish_material"
  | "create_class"
  | "review_dlc"
  | "manage_users"
  | "system_config"
  | "global_stats";

export interface Account {
  account_id: string;
  display_name: string;
  capabilities: readonly CapabilityId[];
}

export type SessionMode = "chat" | "learning";

export interface HomeCard {
  id: string;
  kind: "continue_learning" | "due_review" | "recent_chat" | "downloaded" | "teacher_summary";
  title: string;
  detail: string;
}

export interface HomeOverview {
  cards: readonly HomeCard[];
}

export interface MarketEntry {
  dlc_id: string;
  title: string;
  language: string;
  difficulty: string;
  price_model: "free" | "one_time" | "subscription";
  owned: boolean;
}

// ---------------------------------------------------------------------------
// T-026: 市场流程（浏览/筛选 → 详情 → 获取 → 训练入口 → 评价）
// 形状与 @llos/market 后端 CatalogQuery/ListingView 对齐；UI-4 换真实 adapter。
// ---------------------------------------------------------------------------

/** 市场查询条件（对齐后端 CatalogQuery：语言/难度/自由标签 AND/搜索/排序）。 */
export interface MarketQuery {
  language?: string;
  difficulty?: string;
  tags?: readonly string[];
  search?: string;
  sort?: "newest" | "rating_desc" | "downloads_desc";
}

/** DLC 详情视图（市场详情页）。 */
export interface MarketListingDetail {
  dlc_id: string;
  title: string;
  summary: string;
  language: string;
  difficulty: string;
  tags: readonly string[];
  price_model: "free" | "one_time" | "subscription";
  rating_average: number | null;
  rating_count: number;
  downloads: number;
  publisher_name: string;
  published_at: string;
  owned: boolean;
  /** 评价门禁（product_spec §4.3：仅获取者可评价）；显示不是安全控制，服务端重新授权。 */
  can_review: boolean;
  my_review?: { rating: number; text?: string };
}

/** 获取结果。付费获取等待 P8（pricing_not_available）。 */
export type AcquireOutcome =
  | { status: "acquired" }
  | { status: "already_owned" }
  | { status: "payment_not_available"; price_model: "one_time" | "subscription" }
  | { status: "not_found" };

/** 评价结果。requires_entitlement = 评价门禁（未获取不得评价）。 */
export type ReviewOutcome =
  | { status: "submitted"; rating: number }
  | { status: "requires_entitlement"; message: string }
  | { status: "invalid_rating"; message: string }
  | { status: "not_found"; message: string };

// ---------------------------------------------------------------------------
// T-029: 班级流程（product_spec §5：建班 → 邀请码入班 → 分配 → 顺序/截止 →
// 通知 → 统计）。形状与 core ClassService/ClassAssignmentService/projectClassStats
// 对齐；门禁结果由服务端（Mock 模拟）裁决，UI 隐藏按钮不是安全控制。
// ---------------------------------------------------------------------------

/** 班级摘要（我的班级列表项）。 */
export interface ClassSummary {
  class_id: string;
  name: string;
  description?: string;
  member_count: number;
  archived: boolean;
  is_creator: boolean;
}

export interface ClassMemberView {
  account_id: string;
  display_name: string;
  joined_at: string;
  is_creator: boolean;
}

/** 班级分配条目（教师视角）。 */
export interface ClassAssignmentView {
  assignment_id: string;
  dlc_id: string;
  title: string;
  sequence: number;
  due_at?: string;
  mode: "auto_free" | "teacher_purchase" | "recommend_self_purchase";
  entitlements_granted: boolean;
}

/** 班级分配条目（学生视角，§5.5 先修顺序：blocked 仅为呈现门，不锁学习权利）。 */
export interface ClassUnlockItem {
  assignment_id: string;
  dlc_id: string;
  title: string;
  sequence: number;
  due_at?: string;
  unlocked: boolean;
  completed: boolean;
  blocked_by: readonly string[];
}

export interface ClassNoticeView {
  notice_id: string;
  text: string;
  created_at: string;
  author_name: string;
}

/** 班级详情（成员/分配/通知；教师额外含统计）。 */
export interface ClassDetailView {
  class_summary: ClassSummary;
  members: readonly ClassMemberView[];
  assignments: readonly ClassAssignmentView[];
  notices: readonly ClassNoticeView[];
}

/** 班级统计（教师视角，product_spec §5.6：前端只读 Core 投影）。 */
export interface ClassStatsView {
  class_id: string;
  members_total: number;
  members_active: number;
  assignments_total: number;
  completions_total: number;
  completion_rate_overall: number | null;
  completion_rate_on_time: number | null;
  per_member: readonly {
    account_id: string;
    display_name: string;
    assigned_count: number;
    completed_count: number;
    training_minutes: number;
  }[];
  weak_spots: readonly {
    claim_ref: string;
    members_affected: number;
    success_rate: number | null;
    reasons: readonly string[];
  }[];
}

export interface ClassInvitationView {
  code: string;
  max_uses: number;
  uses: number;
}

export type CreateClassOutcome =
  | { status: "created"; class: ClassSummary }
  | { status: "permission_denied"; required_capability: "create_class"; message: string }
  | { status: "invalid_name"; message: string };

export type JoinClassOutcome =
  | { status: "joined"; class: ClassSummary }
  | { status: "already_member"; class: ClassSummary }
  | { status: "invalid_code"; message: string }
  | { status: "class_archived"; message: string };

export type AssignOutcome =
  | { status: "assigned"; assignment: ClassAssignmentView }
  | { status: "not_creator"; message: string }
  | { status: "invalid_input"; message: string };

export type PostNoticeOutcome =
  | { status: "posted"; notice: ClassNoticeView }
  | { status: "not_creator"; message: string }
  | { status: "invalid_text"; message: string };

// ---------------------------------------------------------------------------
// UI-2: 七态加载模型（正常 / 空白 / 加载 / 权限不足 / 离线 / 可恢复失败 / 不可恢复失败）
// ---------------------------------------------------------------------------

/** 稳定错误类型（VIEW_MODELS §4：错误映射成稳定类型；不得把原始异常透传给页面）。 */
export type ApiErrorCode =
  | "network_timeout" // 网络超时（可恢复）
  | "provider_unavailable" // 在线 Provider 不可用（可恢复，CLIENT_SURFACE_SPEC §7）
  | "session_expired" // 会话过期（可恢复：重新登录）
  | "snapshot_incompatible" // 素材快照与 IR 版本不兼容（不可恢复，需重新获取）
  | "unknown"; // 兜底（不可恢复）

export interface ApiError {
  code: ApiErrorCode;
  /** 面向用户的安全文案（不含堆栈/密钥/内部细节）。 */
  message: string;
}

/**
 * 七态加载状态机。每个旅程页（聊天/学习/教师助手/电脑工作台）都以它渲染。
 * 判分与空态不得合并；可恢复与不可恢复失败是两个独立状态（录音状态机 §8 同样要求
 * abstain 与上传失败不得共用同一错误状态）。
 */
export type LoadState<T> =
  | { status: "ready"; data: T } // 正常
  | { status: "empty" } // 空白（已加载，但无内容）
  | { status: "loading" } // 加载中
  | { status: "permission_denied"; required_capability: CapabilityId; message: string } // 权限不足
  | { status: "offline"; cached: T | null } // 离线（cached 非空=有离线快照可用，§9）
  | { status: "error_recoverable"; error: ApiError } // 可恢复失败（可重试）
  | { status: "error_unrecoverable"; error: ApiError }; // 不可恢复失败

/** Mock 场景选择器：驱动 LoadState 的七个分支，供 UI-2 演示与测试。 */
export type LoadScenario =
  | "normal"
  | "empty"
  | "loading"
  | "permission_denied"
  | "offline"
  | "error_recoverable"
  | "error_unrecoverable";

/** 四条 Mock 旅程。 */
export type JourneyId = "chat" | "learning" | "teacher" | "workbench";

// ---------------------------------------------------------------------------
// UI-2: 强制 ViewModel 清单（VIEW_MODELS §1）
// ---------------------------------------------------------------------------

/** 掌握判定五态（与契约 v0.2 MasteryDecision 对齐；永不显示“永久学会”）。 */
export type MasteryStatus = "not_yet" | "provisional" | "learned" | "uncertain" | "lapsed";

/** VIEW_MODELS §2 规定形状。 */
export interface LearningStateSummary {
  claim_id: string;
  status: MasteryStatus;
  display_label: string;
  reason_summary: string;
  next_action: string;
  policy_ref: string;
  updated_at: string;
}

export interface MaterialSnapshotSummary {
  snapshot_id: string;
  title: string;
  language: string;
  item_count: number;
  version: string;
  /** 是否允许离线执行（CLIENT_SURFACE_SPEC §9：仅 offline_allowed 的 IR 可离线）。 */
  offline_allowed: boolean;
}

/** 学习活动（§7：文本/选择/听力/语音）。 */
export interface ActivityViewModel {
  activity_id: string;
  kind: "text" | "choice" | "listening" | "speech";
  prompt: string;
  /** 语音活动需要麦克风；麦克风拒绝后走替代活动或明确暂停（§7）。 */
  requires_microphone: boolean;
}

/** 反馈（评价器可弃权：verdict="abstained"，证据不足不猜，§7/不变量 7）。 */
export interface FeedbackViewModel {
  activity_id: string;
  verdict: "correct" | "partial" | "incorrect" | "abstained";
  explanation: string;
  /** 证据引用；abstained 时可为空。 */
  evidence_ref?: string;
}

export interface SyncQueueStatusViewModel {
  pending_count: number;
  online: boolean;
  last_synced_at?: string;
}

/**
 * 会话 ViewModel。CLIENT_SURFACE_SPEC §6：ChatSession（DLC 为空）不显示学习进度、
 * 不生成掌握度；故聊天模式下 snapshot/activities/learning_state 必须缺省。
 */
export interface SessionViewModel {
  session_id: string;
  mode: SessionMode;
  title: string;
  snapshot?: MaterialSnapshotSummary;
  activities?: readonly ActivityViewModel[];
  learning_state?: readonly LearningStateSummary[];
}

// --- 旅程负载 ---

export interface ChatMessage {
  message_id: string;
  role: "user" | "assistant";
  text: string;
  /** 聊天可引用素材（§6），但不产生学习状态。 */
  referenced_material?: string;
}

/** 聊天旅程（ChatSession）。刻意不含任何学习进度字段。 */
export interface ChatSessionView {
  session: SessionViewModel; // mode 必为 "chat"
  messages: readonly ChatMessage[];
}

/** 学习旅程（LearningSession）：三层就绪后执行训练并产生学习证据。 */
export interface LearningSessionView {
  session: SessionViewModel; // mode 必为 "learning"，含 snapshot/activities/learning_state
  current_activity_index: number;
  feedback?: FeedbackViewModel;
  sync_queue: SyncQueueStatusViewModel;
}

/** 班级进度摘要（教师端）。 */
export interface ClassProgressSummary {
  class_id: string;
  name: string;
  member_count: number;
  /** 0..1。 */
  completion_rate: number;
  overdue_count: number;
  /** 完成率异常/版本异常等提示（§4 教师首页）。 */
  anomaly?: string;
}

export interface TeacherTask {
  task_id: string;
  label: string;
  due: string;
  overdue: boolean;
}

/** 教师移动端仪表盘（§4：随身班级助手，非缩小版电脑后台）。 */
export interface TeacherMobileDashboardViewModel {
  today_pending_count: number;
  overdue_tasks: readonly TeacherTask[];
  new_member_names: readonly string[];
  classes: readonly ClassProgressSummary[];
  /** “请在电脑端完成”的高级功能说明（§4）。 */
  advanced_note: string;
}

export interface EntitlementViewModel {
  dlc_id: string;
  title: string;
  source: "free" | "purchase" | "class_assignment";
  valid: boolean;
}

export interface CreatorCapabilityViewModel {
  can_create_dlc: boolean;
  can_publish: boolean;
  verified_creator: boolean;
}

/** 电脑工作台分区（§5 电脑端专属工作）。 */
export interface WorkbenchSection {
  id: string;
  title: string;
  description: string;
  required_capability?: CapabilityId;
}

/** 电脑工作台旅程（desktop_web）。 */
export interface WorkbenchView {
  sections: readonly WorkbenchSection[];
  entitlements: readonly EntitlementViewModel[];
}

// ---------------------------------------------------------------------------
// T-032: Studio 创作者流程（product_spec §6：粘贴/上传 → AI 结构化 → 表单确认
// → 沙箱试用 → 发布；BYOK 密钥；版本对创作者隐形；下架告知义务）。
// 形状与 @llos/studio（StudioDrafts/StudioService/runSandboxTrial）对齐；
// 门禁结果由服务端（Mock 模拟）裁决，UI 隐藏按钮不是安全控制。
// ---------------------------------------------------------------------------

/** 结构化单元（向导表单中的"第 N 课"）。 */
export interface StudioUnitView {
  unit_no: number;
  frame_type: "scenario" | "argument_structure" | "concept";
  title: string;
  pattern: string;
  lemma?: string;
}

/** 草稿视图（结构化产物，创作者表单确认前的编辑对象）。 */
export interface StudioDraftView {
  draft_id: string;
  status: "structured" | "confirmed" | "published" | "discarded";
  title: string;
  language: string;
  cefr_level: string;
  units: readonly StudioUnitView[];
  structured_by: { provider_id: string; model_id?: string };
  updated_at: string;
}

/** 已发布课程条目（我的课程列表项；版本号对创作者隐形 §6.7）。 */
export interface StudioDlcView {
  dlc_id: string;
  title: string;
  language: string;
  summary: string;
  difficulty: string;
  tags: readonly string[];
  price_model: "free" | "one_time" | "subscription";
  published_at: string;
  delisted: boolean;
}

/** 沙箱试用报告（§6.4：不写真实学习事件）。 */
export interface SandboxReportView {
  status: "completed" | "aborted";
  steps_completed: number;
  events_appended: number;
  real_event_store_used: false;
  executed_at: string;
}

/** BYOK 密钥条目（仅掩码视图；明文永不出服务端 §6.5）。 */
export interface ByokEntryView {
  entry_id: string;
  provider_family: string;
  label: string;
  masked_key: string;
  created_at: string;
}

export interface CreateStudioDraftInput {
  text: string;
  title: string;
  language: string;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
}

export type CreateStudioDraftOutcome =
  | { status: "created"; draft: StudioDraftView }
  | { status: "permission_denied"; required_capability: "create_dlc_draft"; message: string }
  | { status: "ingest_empty"; message: string }
  | { status: "structure_invalid"; message: string };

export interface StudioDraftEditInput {
  title?: string;
  units?: readonly { frame_type: StudioUnitView["frame_type"]; title: string; pattern: string; lemma?: string }[];
}

export type EditStudioDraftOutcome =
  | { status: "saved"; draft: StudioDraftView }
  | { status: "confirm_failed"; message: string }
  | { status: "state_invalid"; message: string }
  | { status: "not_found"; message: string };

export type SandboxOutcome =
  | { status: "ran"; report: SandboxReportView }
  | { status: "compile_failed"; message: string }
  | { status: "not_found"; message: string };

export interface PublishStudioInput {
  summary: string;
  difficulty: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  tags: readonly string[];
  /** §6.9 告知义务：必须显式确认知悉下架规则。 */
  acknowledged_delist_terms: boolean;
}

export type PublishStudioOutcome =
  | { status: "published"; dlc: StudioDlcView }
  | { status: "permission_denied"; required_capability: "publish_dlc"; message: string }
  | { status: "acknowledgement_required"; message: string }
  | { status: "state_invalid"; message: string }
  | { status: "invalid_input"; message: string };

export type DelistStudioOutcome =
  | { status: "delisted"; dlc_id: string }
  | { status: "not_found"; message: string };

export type RegisterByokOutcome =
  | { status: "registered"; entry: ByokEntryView }
  | { status: "invalid_key"; message: string };

// ---------------------------------------------------------------------------
// ApiClient：UI-1 三个方法 + UI-2 四个旅程方法（页面禁止散落 fetch，§4）
// ---------------------------------------------------------------------------

export interface ApiClient {
  getAccount(): Promise<Account>;
  getHomeOverview(): Promise<HomeOverview>;
  listMarket(): Promise<readonly MarketEntry[]>;

  /** UI-2 四旅程：统一返回七态 LoadState。 */
  loadChatSession(): Promise<LoadState<ChatSessionView>>;
  loadLearningSession(): Promise<LoadState<LearningSessionView>>;
  loadTeacherDashboard(): Promise<LoadState<TeacherMobileDashboardViewModel>>;
  loadWorkbench(): Promise<LoadState<WorkbenchView>>;

  /** T-026 市场流程：筛选查询 / 详情 / 获取 / 评价（门禁由服务端重新授权）。 */
  queryMarket(query?: MarketQuery): Promise<readonly MarketEntry[]>;
  getMarketListing(dlcId: string): Promise<MarketListingDetail | null>;
  acquireListing(dlcId: string): Promise<AcquireOutcome>;
  submitReview(dlcId: string, rating: number, text?: string): Promise<ReviewOutcome>;

  /** T-029 班级流程：列表 / 建班 / 入班 / 详情 / 邀请码 / 分配 / 通知 / 学生解锁 / 教师统计。 */
  listMyClasses(): Promise<readonly ClassSummary[]>;
  createClass(name: string, description?: string): Promise<CreateClassOutcome>;
  joinClass(code: string): Promise<JoinClassOutcome>;
  getClassDetail(classId: string): Promise<ClassDetailView | null>;
  issueClassInvitation(classId: string, maxUses?: number): Promise<ClassInvitationView | null>;
  assignDlc(classId: string, dlcId: string, options?: { sequence?: number; dueAt?: string }): Promise<AssignOutcome>;
  postClassNotice(classId: string, text: string): Promise<PostNoticeOutcome>;
  loadClassUnlockState(classId: string): Promise<readonly ClassUnlockItem[] | null>;
  loadClassStats(classId: string): Promise<ClassStatsView | null>;

  /** T-032 Studio 流程：BYOK / 草稿向导 / 沙箱 / 发布 / 下架（门禁由服务端重新授权）。 */
  listByokKeys(): Promise<readonly ByokEntryView[]>;
  registerByokKey(providerFamily: string, label: string, key: string): Promise<RegisterByokOutcome>;
  listStudioDlcs(): Promise<readonly StudioDlcView[]>;
  createStudioDraft(input: CreateStudioDraftInput): Promise<CreateStudioDraftOutcome>;
  getStudioDraft(draftId: string): Promise<StudioDraftView | null>;
  editStudioDraft(draftId: string, edit: StudioDraftEditInput): Promise<EditStudioDraftOutcome>;
  confirmStudioDraft(draftId: string, edit: StudioDraftEditInput): Promise<EditStudioDraftOutcome>;
  discardStudioDraft(draftId: string): Promise<EditStudioDraftOutcome>;
  runSandboxTrial(draftId: string): Promise<SandboxOutcome>;
  publishStudioDraft(draftId: string, input: PublishStudioInput): Promise<PublishStudioOutcome>;
  startRevision(dlcId: string): Promise<CreateStudioDraftOutcome>;
  delistStudioDlc(dlcId: string): Promise<DelistStudioOutcome>;
}
