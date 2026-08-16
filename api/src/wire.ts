// Wire contract: the server-side ViewModels returned by the JSON-RPC handler.
// These shapes are consumed verbatim by HttpApiClient (frontend/packages/api-client)
// and are intentionally aligned 1:1 with the client ViewModels in
// frontend/packages/api-client/src/types.ts. The api package cannot depend on
// @llos/api-client (the client is browser-safe and must never pull node modules),
// so the wire shapes are declared here as the single source of truth for the RPC
// boundary. Any change to the client ViewModels must be mirrored here.

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

export type ApiErrorCode =
  | "network_timeout"
  | "provider_unavailable"
  | "session_expired"
  | "snapshot_incompatible"
  | "unknown";

export interface WireAccount {
  account_id: string;
  display_name: string;
  capabilities: CapabilityId[];
}

export interface WireHomeCard {
  id: string;
  kind: "continue_learning" | "due_review" | "recent_chat" | "downloaded" | "teacher_summary";
  title: string;
  detail: string;
}

export interface WireMarketEntry {
  dlc_id: string;
  title: string;
  language: string;
  difficulty: string;
  price_model: "free" | "one_time" | "subscription";
  owned: boolean;
}

export interface WireMarketListingDetail {
  dlc_id: string;
  title: string;
  summary: string;
  language: string;
  difficulty: string;
  tags: string[];
  price_model: "free" | "one_time" | "subscription";
  rating_average: number | null;
  rating_count: number;
  downloads: number;
  publisher_name: string;
  published_at: string;
  owned: boolean;
  can_review: boolean;
  my_review?: { rating: number; text?: string };
}

export interface WireClassSummary {
  class_id: string;
  name: string;
  description?: string;
  member_count: number;
  archived: boolean;
  is_creator: boolean;
}

export interface WireClassMemberView {
  account_id: string;
  display_name: string;
  joined_at: string;
  is_creator: boolean;
}

export interface WireClassAssignmentView {
  assignment_id: string;
  dlc_id: string;
  title: string;
  sequence: number;
  due_at?: string;
  mode: "auto_free" | "teacher_purchase" | "recommend_self_purchase";
  entitlements_granted: boolean;
}

export interface WireClassUnlockItem {
  assignment_id: string;
  dlc_id: string;
  title: string;
  sequence: number;
  due_at?: string;
  unlocked: boolean;
  completed: boolean;
  blocked_by: string[];
}

export interface WireClassNoticeView {
  notice_id: string;
  text: string;
  created_at: string;
  author_name: string;
}

export interface WireClassDetailView {
  class_summary: WireClassSummary;
  members: WireClassMemberView[];
  assignments: WireClassAssignmentView[];
  notices: WireClassNoticeView[];
}

export interface WireClassStatsView {
  class_id: string;
  members_total: number;
  members_active: number;
  assignments_total: number;
  completions_total: number;
  completion_rate_overall: number | null;
  completion_rate_on_time: number | null;
  per_member: {
    account_id: string;
    display_name: string;
    assigned_count: number;
    completed_count: number;
    training_minutes: number;
  }[];
  weak_spots: {
    claim_ref: string;
    members_affected: number;
    success_rate: number | null;
    reasons: string[];
  }[];
}

export interface WireClassInvitationView {
  code: string;
  max_uses: number;
  uses: number;
}

export interface WireByokEntryView {
  entry_id: string;
  provider_family: string;
  label: string;
  masked_key: string;
  created_at: string;
}

export interface WireStudioUnitView {
  unit_no: number;
  frame_type: "scenario" | "argument_structure" | "concept";
  title: string;
  pattern: string;
  lemma?: string;
}

export interface WireStudioDraftView {
  draft_id: string;
  status: "structured" | "confirmed" | "published" | "discarded";
  title: string;
  language: string;
  cefr_level: string;
  units: WireStudioUnitView[];
  structured_by: { provider_id: string; model_id?: string };
  ocr_by?: { provider_id: string; model_id?: string };
  expert_edited?: boolean;
  manifest_json?: string;
  training_modes_json?: string;
  updated_at: string;
}

export interface WireStudioDlcView {
  dlc_id: string;
  title: string;
  language: string;
  summary: string;
  difficulty: string;
  tags: string[];
  price_model: "free" | "one_time" | "subscription";
  published_at: string;
  delisted: boolean;
}

export interface WireSandboxReportView {
  status: "completed" | "aborted";
  steps_completed: number;
  events_appended: number;
  real_event_store_used: false;
  executed_at: string;
}

export interface WireStudioTemplateView {
  template_id: string;
  title: string;
  description: string;
  cefr_suggestion: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  title_suggestion: string;
  prefilled_text: string;
}

export interface WireEntitlementViewModel {
  dlc_id: string;
  title: string;
  source: "free" | "purchase" | "class_assignment";
  valid: boolean;
}

export interface WireWorkbenchSection {
  id: string;
  title: string;
  description: string;
  required_capability?: CapabilityId;
}

export interface WireWorkbenchView {
  sections: WireWorkbenchSection[];
  entitlements: WireEntitlementViewModel[];
}

export interface WireClassProgressSummary {
  class_id: string;
  name: string;
  member_count: number;
  completion_rate: number;
  overdue_count: number;
  anomaly?: string;
}

export interface WireTeacherTask {
  task_id: string;
  label: string;
  due: string;
  overdue: boolean;
}

export interface WireTeacherDashboard {
  today_pending_count: number;
  overdue_tasks: WireTeacherTask[];
  new_member_names: string[];
  classes: WireClassProgressSummary[];
  advanced_note: string;
}

export interface WireMaterialSnapshotSummary {
  snapshot_id: string;
  title: string;
  language: string;
  item_count: number;
  version: string;
  offline_allowed: boolean;
}

export interface WireActivity {
  activity_id: string;
  kind: "text" | "choice" | "listening" | "speech";
  prompt: string;
  requires_microphone: boolean;
}

export interface WireLearningStateSummary {
  claim_id: string;
  status: "not_yet" | "provisional" | "learned" | "uncertain" | "lapsed";
  display_label: string;
  reason_summary: string;
  next_action: string;
  policy_ref: string;
  updated_at: string;
}

export interface WireSessionViewModel {
  session_id: string;
  mode: "chat" | "learning";
  title: string;
  snapshot?: WireMaterialSnapshotSummary;
  activities?: WireActivity[];
  learning_state?: WireLearningStateSummary[];
}

export interface WireChatMessage {
  message_id: string;
  role: "user" | "assistant";
  text: string;
  referenced_material?: string;
}

export interface WireChatSessionView {
  session: WireSessionViewModel;
  messages: WireChatMessage[];
}

export interface WireSyncQueueStatus {
  pending_count: number;
  online: boolean;
  last_synced_at?: string;
}

export interface WireFeedback {
  activity_id: string;
  verdict: "correct" | "partial" | "incorrect" | "abstained";
  explanation: string;
  evidence_ref?: string;
}

export interface WireLearningSessionView {
  session: WireSessionViewModel;
  current_activity_index: number;
  feedback?: WireFeedback;
  sync_queue: WireSyncQueueStatus;
}

export type WireLoadState<T> =
  | { status: "ready"; data: T }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "permission_denied"; required_capability: CapabilityId; message: string }
  | { status: "offline"; cached: T | null }
  | { status: "error_recoverable"; error: { code: ApiErrorCode; message: string } }
  | { status: "error_unrecoverable"; error: { code: ApiErrorCode; message: string } };

// ---------------------------------------------------------------------------
// RPC outcomes: mirror of frontend/packages/api-client/src/types.ts outcomes.
// The JSON-RPC handler maps every domain result/error to one of these shapes,
// so HttpApiClient can forward them to the UI verbatim (no client-side remap).
// ---------------------------------------------------------------------------

export type WireCreateClassOutcome =
  | { status: "created"; class: WireClassSummary }
  | { status: "permission_denied"; required_capability: "create_class"; message: string }
  | { status: "invalid_name"; message: string };

export type WireJoinClassOutcome =
  | { status: "joined"; class: WireClassSummary }
  | { status: "already_member"; class: WireClassSummary }
  | { status: "invalid_code"; message: string }
  | { status: "class_archived"; message: string };

export type WireAssignOutcome =
  | { status: "assigned"; assignment: WireClassAssignmentView }
  | { status: "not_creator"; message: string }
  | { status: "invalid_input"; message: string };

export type WirePostNoticeOutcome =
  | { status: "posted"; notice: WireClassNoticeView }
  | { status: "not_creator"; message: string }
  | { status: "invalid_text"; message: string };

export type WireAcquireOutcome =
  | { status: "acquired" }
  | { status: "already_owned" }
  | { status: "payment_not_available"; price_model: "one_time" | "subscription" }
  | { status: "not_found" };

export type WireReviewOutcome =
  | { status: "submitted"; rating: number }
  | { status: "requires_entitlement"; message: string }
  | { status: "invalid_rating"; message: string }
  | { status: "not_found"; message: string };

export type WireCreateStudioDraftOutcome =
  | { status: "created"; draft: WireStudioDraftView }
  | { status: "permission_denied"; required_capability: "create_dlc_draft"; message: string }
  | { status: "ingest_empty"; message: string }
  | { status: "structure_invalid"; message: string };

export type WireEditStudioDraftOutcome =
  | { status: "saved"; draft: WireStudioDraftView }
  | { status: "confirm_failed"; message: string }
  | { status: "state_invalid"; message: string }
  | { status: "not_found"; message: string };

export type WireSandboxOutcome =
  | { status: "ran"; report: WireSandboxReportView }
  | { status: "compile_failed"; message: string }
  | { status: "not_found"; message: string };

export type WirePublishStudioOutcome =
  | { status: "published"; dlc: WireStudioDlcView }
  | { status: "permission_denied"; required_capability: "publish_dlc"; message: string }
  | { status: "acknowledgement_required"; message: string }
  | { status: "state_invalid"; message: string }
  | { status: "invalid_input"; message: string };

export type WireDelistStudioOutcome =
  | { status: "delisted"; dlc_id: string }
  | { status: "not_found"; message: string };

export type WireRegisterByokOutcome =
  | { status: "registered"; entry: WireByokEntryView }
  | { status: "invalid_key"; message: string };

export type WireExpertEditStudioOutcome =
  | { status: "saved"; draft: WireStudioDraftView }
  | { status: "invalid_json"; message: string }
  | { status: "invalid_content"; message: string }
  | { status: "state_invalid"; message: string }
  | { status: "not_found"; message: string };
