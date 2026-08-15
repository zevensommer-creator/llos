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
}
