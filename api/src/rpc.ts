// JSON-RPC 路由（T-037 纵向切片）。
//
// 借鉴 MIT 许可的 tinyjsonrpc-server 模式：方法表 METHOD → (params, ctx)，
// ctx 携带身份；域错误在方法内映射为 wire outcome（wire.ts 声明的判别联合），
// 传输层错误（无效请求/未知方法/内部错误）映射为 RpcError。HttpApiClient
// 把 RpcError 进一步映射为 ApiErrorCode（network_timeout / provider_unavailable /
// session_expired / snapshot_incompatible / unknown）。
//
// 服务端重授权（T-037 要求）：前端隐藏按钮只是展示层；真正的 capability
// 检查全部发生在域服务内部（createDraft / publishDraft / createClass /
// redeemInvitation），本层不做也不绕过任何授权判断。

import {
  BYOK_FAMILIES,
  ByokError,
  ClassError,
  projectClassStats,
  type ByokEntryView,
  type ClassStats,
} from "@llos/core";
import { registerByokProvider, type ProviderRequest } from "@llos/gateway";
import {
  MarketError,
  dlcResourceRef,
  type DifficultyLevel,
  type ListingView,
  type MarketListing,
} from "@llos/market";
import {
  STUDIO_TEMPLATES,
  StudioError,
  deterministicStructureTransport,
  runSandboxTrial,
  templateById,
  type CefrLevel,
  type DraftEdit,
  type IngestSource,
  type SandboxTrialReport,
  type StudioDraft,
  type StructuredFrameType,
} from "@llos/studio";
import type { ApiBackend } from "./backend.js";
import { ACCOUNTS } from "./backend.js";
import type {
  WireAcquireOutcome,
  WireAssignOutcome,
  WireByokEntryView,
  WireChatSessionView,
  WireClassAssignmentView,
  WireClassInvitationView,
  WireClassNoticeView,
  WireClassStatsView,
  WireClassSummary,
  WireClassUnlockItem,
  WireCreateClassOutcome,
  WireCreateStudioDraftOutcome,
  WireDelistStudioOutcome,
  WireEditStudioDraftOutcome,
  WireEntitlementViewModel,
  WireExpertEditStudioOutcome,
  WireJoinClassOutcome,
  WireLearningSessionView,
  WireLoadState,
  WireMarketEntry,
  WireMarketListingDetail,
  WirePostNoticeOutcome,
  WirePublishStudioOutcome,
  WireRegisterByokOutcome,
  WireReviewOutcome,
  WireSandboxOutcome,
  WireStudioDlcView,
  WireStudioDraftView,
  WireStudioTemplateView,
  WireStudioUnitView,
  WireTeacherDashboard,
  WireWorkbenchView,
} from "./wire.js";

// ---------------------------------------------------------------------------
// 传输层形状
// ---------------------------------------------------------------------------

export interface RpcContext {
  account_id: string;
}

export interface RpcError {
  code: "invalid_request" | "method_not_found" | "session_expired" | "unknown";
  message: string;
}

export type RpcResult =
  | { ok: true; result: unknown }
  | { ok: false; error: RpcError };

export type RpcFn = (
  params: Record<string, unknown>,
  ctx: RpcContext,
  backend: ApiBackend,
) => unknown | Promise<unknown>;

export type RpcHandler = (request: unknown) => Promise<RpcResult>;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

type P = Record<string, unknown>;

function asObj(v: unknown): P {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as P)
    : {};
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sOpt(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function nOpt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** market `purchase` ↔ 前端 `one_time` 的唯一映射点（product_spec §3.4）。 */
function mapPrice(model: MarketListing["pricing"]["model"]): "free" | "one_time" | "subscription" {
  return model === "purchase" ? "one_time" : model;
}

function toStudioDraftView(draft: StudioDraft): WireStudioDraftView {
  return {
    draft_id: draft.draft_id,
    status: draft.status,
    title: draft.manifest.display_name,
    language: draft.language,
    cefr_level: draft.cefr_level,
    units: draft.units.map((u) => ({
      unit_no: u.unit_no,
      frame_type: u.frame_type as WireStudioUnitView["frame_type"],
      title: u.title,
      pattern: u.pattern,
      ...(u.lemma !== undefined && u.lemma !== null ? { lemma: u.lemma } : {}),
    })),
    structured_by: draft.structured_by ?? undefined,
    ocr_by: draft.ocr_by ?? undefined,
    expert_edited: draft.expert_edited,
    ...(draft.expert_edited ? { manifest_json: JSON.stringify(draft.manifest, null, 2) } : {}),
    ...(draft.training_modes_json ? { training_modes_json: draft.training_modes_json } : {}),
    updated_at: draft.updated_at,
  };
}

function toStudioDlcView(listing: MarketListing): WireStudioDlcView {
  return {
    dlc_id: listing.dlc_ref.dlc_id,
    title: listing.title,
    summary: listing.summary,
    language: listing.language,
    difficulty: listing.difficulty ?? "",
    tags: listing.tags ?? [],
    price_model: mapPrice(listing.pricing.model),
    published_at: listing.published_at,
    delisted: listing.delisted_at !== undefined,
  };
}

function toMarketEntry(listing: MarketListing, owned: boolean): WireMarketEntry {
  return {
    dlc_id: listing.dlc_ref.dlc_id,
    title: listing.title,
    language: listing.language,
    difficulty: listing.difficulty ?? "",
    price_model: mapPrice(listing.pricing.model),
    owned,
  };
}

function toClassSummary(
  record: { class_id: string; name: string; description?: string; archived: boolean },
  memberCount: number,
  actorId: string,
  creatorId: string,
): WireClassSummary {
  return {
    class_id: record.class_id,
    name: record.name,
    ...(record.description !== undefined && record.description !== ""
      ? { description: record.description }
      : {}),
    member_count: memberCount,
    archived: record.archived,
    is_creator: creatorId === actorId,
  };
}

function toClassAssignmentView(
  a: { assignment_id: string; dlc_id: string; sequence: number; due_at?: string; mode: string; entitlements_granted: boolean },
  title: string,
): WireClassAssignmentView {
  return {
    assignment_id: a.assignment_id,
    dlc_id: a.dlc_id,
    title,
    sequence: a.sequence,
    ...(a.due_at ? { due_at: a.due_at } : {}),
    mode: a.mode as WireClassAssignmentView["mode"],
    entitlements_granted: a.entitlements_granted,
  };
}

function toClassNoticeView(
  notice: { notice_id: string; text: string; created_at: string; author_id: string },
  backend: ApiBackend,
): WireClassNoticeView {
  return {
    notice_id: notice.notice_id,
    text: notice.text,
    created_at: notice.created_at,
    author_name: backend.displayName(notice.author_id),
  };
}

function toByokEntryView(entry: ByokEntryView): WireByokEntryView {
  return {
    entry_id: entry.entry_id,
    provider_family: entry.provider_family,
    label: entry.label,
    masked_key: entry.masked_key,
    created_at: entry.registered_at,
  };
}

function toTemplateView(t: {
  template_id: string;
  title: string;
  description: string;
  cefr_suggestion: CefrLevel;
  title_suggestion: string;
  prefilled_text: string;
}): WireStudioTemplateView {
  return {
    template_id: t.template_id,
    title: t.title,
    description: t.description,
    cefr_suggestion: t.cefr_suggestion,
    title_suggestion: t.title_suggestion,
    prefilled_text: t.prefilled_text,
  };
}

interface OwnedDlc {
  dlc_id: string;
  title: string;
  source: "free" | "purchase" | "class_assignment";
}

/** 已获取课程（entitlement 判定；delisted 课程不在 market.query 内，属已知限制，后续用 Core 投影解决）。 */
function ownedDlcs(backend: ApiBackend, accountId: string): OwnedDlc[] {
  const now = backend.clock();
  const out: OwnedDlc[] = [];
  for (const view of backend.market.query()) {
    const listing = view.listing;
    const resource = dlcResourceRef(listing.dlc_ref.dlc_id);
    const entitlement = backend.entitlementStore.get(accountId, resource);
    if (!entitlement || entitlement.expires_at !== undefined && entitlement.expires_at < now) continue;
    const source =
      entitlement.source !== undefined && entitlement.source.startsWith("class:")
        ? "class_assignment"
        : listing.pricing.model === "free"
          ? "free"
          : "purchase";
    out.push({ dlc_id: listing.dlc_ref.dlc_id, title: listing.title, source });
  }
  return out;
}

/** 在组合根已知创作者目录中定位已发布草稿（发布后课程包副本仍在草稿存储）。 */
function findPublishedDraft(backend: ApiBackend, dlcId: string): StudioDraft | undefined {
  for (const creatorId of Object.values(ACCOUNTS)) {
    const found = backend.drafts
      .listByCreator(creatorId)
      .find((d) => d.status === "published" && d.manifest.dlc_id === dlcId);
    if (found) return found;
  }
  return undefined;
}

function dlcTitle(backend: ApiBackend, dlcId: string): string {
  const listing = backend.market.view(`listing.${dlcId}`);
  if (listing) return listing.listing.title;
  const draft = findPublishedDraft(backend, dlcId);
  return draft ? draft.manifest.display_name : dlcId;
}

// ---------------------------------------------------------------------------
// 旅程组合（真实域状态，无演示 fixture）
// ---------------------------------------------------------------------------

function composeChat(backend: ApiBackend, accountId: string): WireLoadState<WireChatSessionView> {
  return {
    status: "ready",
    data: {
      session: {
        session_id: `session.chat.${accountId}`,
        mode: "chat",
        title: "自由聊天 · 旅行德语",
      },
      messages: [
        {
          message_id: "m.welcome",
          role: "assistant",
          text: "你好，我是 LLOS 学习助手。第一代产品不内置聊天后端（对话能力属后续任务），请先使用课程、班级与市场功能。",
        },
      ],
    },
  };
}

function composeLearning(
  backend: ApiBackend,
  accountId: string,
): WireLoadState<WireLearningSessionView> {
  const owned = ownedDlcs(backend, accountId);
  if (owned.length === 0) return { status: "empty" };
  const trainable = owned.find((d) => findPublishedDraft(backend, d.dlc_id) !== undefined);
  if (!trainable) return { status: "empty" };
  const draft = findPublishedDraft(backend, trainable.dlc_id)!;
  const offline = (draft.manifest as { degradation_policy?: { offline_allowed?: boolean } })
    .degradation_policy?.offline_allowed;
  return {
    status: "ready",
    data: {
      session: {
        session_id: `session.learning.${accountId}.${trainable.dlc_id}`,
        mode: "learning",
        title: draft.manifest.display_name,
        snapshot: {
          snapshot_id: `snap.${trainable.dlc_id}.${draft.manifest.version}`,
          title: draft.manifest.display_name,
          language: draft.language,
          item_count: draft.material_pack.semantic_frames.length,
          version: draft.manifest.version,
          offline_allowed: offline ?? false,
        },
        activities: draft.units.map((u, i) => ({
          activity_id: `act.${i + 1}`,
          kind: "text" as const,
          prompt: u.pattern,
          requires_microphone: false,
        })),
        learning_state: [],
      },
      current_activity_index: 0,
      sync_queue: { pending_count: 0, online: true },
    },
  };
}

function composeTeacher(backend: ApiBackend, accountId: string): WireTeacherDashboard {
  const now = backend.clock();
  const events = backend.eventStore.events();
  const cutoff = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  const classes = backend.classes.classesFor(accountId).map((record) => {
    const memberIds = backend.classes.members(record.class_id).map((m) => m.account_id);
    const assigns = backend.assignments.assignmentsFor(record.class_id);
    const stats = projectClassStats({
      class_id: record.class_id,
      member_ids: memberIds,
      assignments: assigns.map((a) => ({
        assignment_id: a.assignment_id,
        dlc_id: a.dlc_id,
        ...(a.due_at ? { due_at: a.due_at } : {}),
      })),
      events,
      now,
    });
    const rate = stats.summary.completion_rate_overall;
    const overdue = assigns.filter((a) => a.due_at !== undefined && a.due_at < now).length;
    return {
      class_id: record.class_id,
      name: record.name,
      member_count: memberIds.length,
      completion_rate: rate ?? 0,
      overdue_count: overdue,
      ...(rate !== null && rate < 0.6 ? { anomaly: "完成率低于预期" } : {}),
    };
  });

  const allAssigns = backend.classes
    .classesFor(accountId)
    .flatMap((record) =>
      backend.assignments.assignmentsFor(record.class_id).map((a) => ({ record, a })),
    );
  const pending = allAssigns.filter((x) => x.a.due_at !== undefined && x.a.due_at >= now).length;
  const overdueTasks = allAssigns
    .filter((x) => x.a.due_at !== undefined && x.a.due_at < now)
    .map((x) => ({
      task_id: x.a.assignment_id,
      label: `${x.record.name} · ${dlcTitle(backend, x.a.dlc_id)}`,
      due: x.a.due_at as string,
      overdue: true,
    }));
  const newMemberNames = [
    ...new Set(
      backend.classes
        .classesFor(accountId)
        .flatMap((record) =>
          backend.classes
            .members(record.class_id)
            .filter((m) => m.account_id !== accountId && m.joined_at >= cutoff)
            .map((m) => backend.displayName(m.account_id)),
        ),
    ),
  ];

  return {
    today_pending_count: pending,
    overdue_tasks: overdueTasks,
    new_member_names: newMemberNames,
    classes,
    advanced_note: "班级管理、内容发布与数据报表请在电脑端工作台完成。",
  };
}

function composeWorkbench(
  backend: ApiBackend,
  accountId: string,
): WireLoadState<WireWorkbenchView> {
  const entitlements: WireEntitlementViewModel[] = ownedDlcs(backend, accountId).map((d) => ({
    dlc_id: d.dlc_id,
    title: d.title,
    source: d.source,
    valid: true,
  }));
  return {
    status: "ready",
    data: {
      sections: [
        {
          id: "studio",
          title: "Studio 创作者工作台",
          description: "创建、确认并发布德语课程",
          required_capability: "create_dlc_draft",
        },
        {
          id: "classes",
          title: "班级管理",
          description: "建班、邀请、分配课程与查看统计",
          required_capability: "create_class",
        },
        {
          id: "market",
          title: "内容市场",
          description: "浏览、获取与评价课程",
        },
      ],
      entitlements,
    },
  };
}

// ---------------------------------------------------------------------------
// 方法实现
// ---------------------------------------------------------------------------

function getAccount(_p: P, ctx: RpcContext, backend: ApiBackend) {
  const caps = (
    ["create_dlc_draft", "create_class", "publish_dlc", "upload_material"] as const
  ).filter((c) => backend.accountStore.hasCapability(ctx.account_id, c));
  return {
    account_id: ctx.account_id,
    display_name: backend.displayName(ctx.account_id),
    capabilities: caps,
  };
}

function homeOverview(_p: P, ctx: RpcContext, backend: ApiBackend) {
  const isTeacher = backend.accountStore.hasCapability(ctx.account_id, "create_class");
  const cards: { id: string; kind: string; title: string; detail: string }[] = [];
  if (isTeacher) {
    const myClasses = backend.classes.classesFor(ctx.account_id);
    const pending = myClasses
      .flatMap((r) => backend.assignments.assignmentsFor(r.class_id))
      .filter((a) => a.due_at !== undefined && a.due_at >= backend.clock()).length;
    cards.push({
      id: "teacher",
      kind: "teacher_summary",
      title: "班级概览",
      detail: `${myClasses.length} 个班级 · ${pending} 项待处理`,
    });
  }
  const owned = ownedDlcs(backend, ctx.account_id);
  if (owned.length > 0) {
    cards.push({ id: "continue", kind: "continue_learning", title: owned[0].title, detail: "继续上次学习" });
    cards.push({ id: "downloaded", kind: "downloaded", title: "我的课程", detail: `${owned.length} 门课程已获取` });
  }
  if (cards.length === 0) {
    cards.push({ id: "welcome", kind: "recent_chat", title: "欢迎使用 LLOS", detail: "从内容市场获取第一门课程开始学习" });
  }
  return { cards };
}

function marketList(p: P, ctx: RpcContext, backend: ApiBackend): WireMarketEntry[] {
  const ownedIds = new Set(ownedDlcs(backend, ctx.account_id).map((d) => d.dlc_id));
  const query: Record<string, unknown> = {
    filter: (sOpt(p.filter) ?? "all") as "all" | "free" | "purchased",
  };
  if (sOpt(p.search)) query.search = s(p.search);
  if (sOpt(p.language)) query.language = s(p.language);
  if (sOpt(p.difficulty)) query.difficulty = s(p.difficulty);
  if (Array.isArray(p.tags)) query.tags = (p.tags as unknown[]).map((t) => s(t)).filter(Boolean);
  if (sOpt(p.sort)) query.sort = s(p.sort);
  return backend.market.query(query as never).map((v) => toMarketEntry(v.listing, ownedIds.has(v.listing.dlc_ref.dlc_id)));
}

function marketListingDetail(p: P, ctx: RpcContext, backend: ApiBackend): WireMarketListingDetail | null {
  const view = backend.market.view(s(p.listingId));
  if (!view) return null;
  const listing = view.listing;
  const owned = backend.entitlementStore.has(
    ctx.account_id,
    dlcResourceRef(listing.dlc_ref.dlc_id),
    backend.clock(),
  );
  const myReview = backend.market.reviewsFor(listing.listing_id).find((r) => r.account_id === ctx.account_id);
  return {
    dlc_id: listing.dlc_ref.dlc_id,
    title: listing.title,
    summary: listing.summary,
    language: listing.language,
    difficulty: listing.difficulty ?? "",
    tags: listing.tags ?? [],
    price_model: mapPrice(listing.pricing.model),
    rating_average: view.rating_summary.average,
    rating_count: view.rating_summary.count,
    downloads: view.downloads,
    publisher_name: backend.displayName(listing.publisher_id),
    published_at: listing.published_at,
    owned,
    can_review: owned && listing.delisted_at === undefined,
    my_review: myReview
      ? { rating: myReview.rating, ...(myReview.text !== undefined && myReview.text !== "" ? { text: myReview.text } : {}) }
      : undefined,
  };
}

function marketAcquire(p: P, ctx: RpcContext, backend: ApiBackend): WireAcquireOutcome {
  const listingId = s(p.listingId);
  const listing = backend.market.view(listingId);
  if (!listing) return { status: "not_found" };
  const resource = dlcResourceRef(listing.listing.dlc_ref.dlc_id);
  if (backend.entitlementStore.has(ctx.account_id, resource, backend.clock())) {
    return { status: "already_owned" };
  }
  if (listing.listing.pricing.model !== "free") {
    return {
      status: "payment_not_available",
      price_model: mapPrice(listing.listing.pricing.model) as "one_time" | "subscription",
    };
  }
  try {
    backend.market.acquireFree(ctx.account_id, listingId);
    return { status: "acquired" };
  } catch (err) {
    if (err instanceof MarketError) {
      if (err.code === "listing_delisted") return { status: "not_found" };
      return { status: "already_owned" };
    }
    throw err;
  }
}

function marketReview(p: P, ctx: RpcContext, backend: ApiBackend): WireReviewOutcome {
  const rating = nOpt(p.rating);
  if (rating === undefined) return { status: "invalid_rating", message: "请提供 1–5 分的评分" };
  try {
    backend.market.review(ctx.account_id, s(p.listingId), rating, sOpt(p.text));
    return { status: "submitted", rating };
  } catch (err) {
    if (err instanceof MarketError) {
      if (err.code === "invalid_rating") return { status: "invalid_rating", message: err.message };
      if (err.code === "review_requires_entitlement")
        return { status: "requires_entitlement", message: err.message };
      return { status: "not_found", message: err.message };
    }
    throw err;
  }
}

function classesList(_p: P, ctx: RpcContext, backend: ApiBackend): WireClassSummary[] {
  return backend.classes.classesFor(ctx.account_id).map((record) =>
    toClassSummary(
      record,
      backend.classes.members(record.class_id).length,
      ctx.account_id,
      record.creator_id,
    ),
  );
}

function createClass(p: P, ctx: RpcContext, backend: ApiBackend): WireCreateClassOutcome {
  try {
    const record = backend.classes.createClass(ctx.account_id, {
      name: s(p.name),
      ...(sOpt(p.description) ? { description: s(p.description) } : {}),
    });
    return {
      status: "created",
      class: toClassSummary(
        record,
        backend.classes.members(record.class_id).length,
        ctx.account_id,
        record.creator_id,
      ),
    };
  } catch (err) {
    if (err instanceof ClassError) {
      if (err.code === "create_class_capability_missing")
        return { status: "permission_denied", required_capability: "create_class", message: err.message };
      if (err.code === "invalid_class_input") return { status: "invalid_name", message: err.message };
    }
    throw err;
  }
}

function joinClass(p: P, ctx: RpcContext, backend: ApiBackend): WireJoinClassOutcome {
  const code = s(p.code);
  if (!code) return { status: "invalid_code", message: "请输入邀请码" };
  // 已是成员判定：组合根的 code→classId 索引（seed 与 issueClassInvitation 登记）。
  const knownClassId = backend.invitationIndex.get(code);
  if (knownClassId !== undefined) {
    const record = backend.classes.get(knownClassId);
    if (record && backend.classes.isMember(knownClassId, ctx.account_id)) {
      return {
        status: "already_member",
        class: toClassSummary(record, backend.classes.members(knownClassId).length, ctx.account_id, record.creator_id),
      };
    }
  }
  try {
    const membership = backend.classes.redeemInvitation(code, ctx.account_id);
    const record = backend.classes.get(membership.class_id);
    if (!record) return { status: "invalid_code", message: "邀请码无效" };
    return {
      status: "joined",
      class: toClassSummary(record, backend.classes.members(record.class_id).length, ctx.account_id, record.creator_id),
    };
  } catch (err) {
    if (err instanceof ClassError) {
      switch (err.code) {
        case "class_archived":
          return { status: "class_archived", message: err.message };
        case "unknown_class_invitation":
        case "class_invitation_revoked":
        case "class_invitation_exhausted":
          return { status: "invalid_code", message: err.message };
        default:
          break;
      }
    }
    throw err;
  }
}

function classDetail(p: P, ctx: RpcContext, backend: ApiBackend) {
  const classId = s(p.classId);
  try {
    if (!backend.classes.isMember(classId, ctx.account_id)) return null;
    const record = backend.classes.get(classId);
    if (!record) return null;
    const members = backend.classes.members(classId);
    const assignments = backend.assignments.assignmentsFor(classId);
    const notices = backend.notices.noticesFor(classId, ctx.account_id);
    return {
      class_summary: toClassSummary(record, members.length, ctx.account_id, record.creator_id),
      members: members.map((m) => ({
        account_id: m.account_id,
        display_name: backend.displayName(m.account_id),
        joined_at: m.joined_at,
        is_creator: m.account_id === record.creator_id,
      })),
      assignments: assignments.map((a) => toClassAssignmentView(a, dlcTitle(backend, a.dlc_id))),
      notices: notices.map((n) => toClassNoticeView(n, backend)),
    };
  } catch (err) {
    if (err instanceof ClassError) return null;
    throw err;
  }
}

function issueInvitation(p: P, ctx: RpcContext, backend: ApiBackend): WireClassInvitationView | null {
  try {
    const maxUses = nOpt(p.maxUses);
    const invitation = backend.classes.issueInvitation(ctx.account_id, s(p.classId), {
      ...(maxUses !== undefined ? { maxUses } : {}),
    });
    backend.invitationIndex.set(invitation.code, invitation.class_id);
    return { code: invitation.code, max_uses: invitation.max_uses, uses: invitation.uses };
  } catch (err) {
    if (err instanceof ClassError) return null;
    throw err;
  }
}

function assignClass(p: P, ctx: RpcContext, backend: ApiBackend): WireAssignOutcome {
  const dlcId = s(p.dlcId);
  const classId = s(p.classId);
  const listing = backend.market.view(`listing.${dlcId}`);
  try {
    const options: { sequence?: number; dueAt?: string } = {};
    const sequence = nOpt(p.sequence);
    const dueAt = sOpt(p.dueAt);
    if (sequence !== undefined) options.sequence = sequence;
    if (dueAt !== undefined) options.dueAt = dueAt;
    const assignment = backend.assignments.assign(ctx.account_id, classId, {
      listing_id: `listing.${dlcId}`,
      dlc_id: dlcId,
      pricing_model: listing ? listing.listing.pricing.model : "free",
      publisher_id: listing ? listing.listing.publisher_id : ctx.account_id,
    }, options);
    return {
      status: "assigned",
      assignment: toClassAssignmentView(assignment, dlcTitle(backend, dlcId)),
    };
  } catch (err) {
    if (err instanceof ClassError) {
      if (err.code === "not_class_creator") return { status: "not_creator", message: err.message };
      return { status: "invalid_input", message: err.message };
    }
    throw err;
  }
}

function postNotice(p: P, ctx: RpcContext, backend: ApiBackend): WirePostNoticeOutcome {
  try {
    const notice = backend.notices.post(ctx.account_id, s(p.classId), s(p.text));
    return { status: "posted", notice: toClassNoticeView(notice, backend) };
  } catch (err) {
    if (err instanceof ClassError) {
      if (err.code === "not_class_creator") return { status: "not_creator", message: err.message };
      return { status: "invalid_text", message: err.message };
    }
    throw err;
  }
}

function classUnlock(p: P, ctx: RpcContext, backend: ApiBackend): WireClassUnlockItem[] | null {
  const classId = s(p.classId);
  try {
    return backend.assignments
      .unlockStateFor(classId, ctx.account_id, backend.eventStore.events())
      .map((u) => ({
        assignment_id: u.assignment_id,
        dlc_id: u.dlc_id,
        title: dlcTitle(backend, u.dlc_id),
        sequence: u.sequence,
        ...(u.due_at ? { due_at: u.due_at } : {}),
        unlocked: u.unlocked,
        completed: u.completed,
        blocked_by: u.blocked_by,
      }));
  } catch (err) {
    if (err instanceof ClassError) return null;
    throw err;
  }
}

function classStats(p: P, ctx: RpcContext, backend: ApiBackend): WireClassStatsView | null {
  const classId = s(p.classId);
  try {
    const record = backend.classes.get(classId);
    if (!record || record.creator_id !== ctx.account_id) return null;
    const members = backend.classes.members(classId);
    const assigns = backend.assignments.assignmentsFor(classId);
    const stats: ClassStats = projectClassStats({
      class_id: classId,
      member_ids: members.map((m) => m.account_id),
      assignments: assigns.map((a) => ({
        assignment_id: a.assignment_id,
        dlc_id: a.dlc_id,
        ...(a.due_at ? { due_at: a.due_at } : {}),
      })),
      events: backend.eventStore.events(),
      now: backend.clock(),
    });
    return {
      class_id: stats.class_id,
      members_total: stats.summary.members_total,
      members_active: stats.summary.members_active,
      assignments_total: stats.summary.assignments_total,
      completions_total: stats.summary.completions_total,
      completion_rate_overall: stats.summary.completion_rate_overall,
      completion_rate_on_time: stats.summary.completion_rate_on_time,
      per_member: stats.members.map((m) => ({
        account_id: m.account_id,
        display_name: backend.displayName(m.account_id),
        assigned_count: m.assigned_count,
        completed_count: m.completed_count,
        training_minutes: Math.round(m.training_ms_total / 60000),
      })),
      weak_spots: stats.weak_spots.map((w) => ({
        claim_ref: w.claim_ref,
        members_affected: w.members_affected,
        success_rate: w.success_rate,
        priority_score: w.priority_score,
        reasons: w.reasons,
      })),
    };
  } catch (err) {
    if (err instanceof ClassError) return null;
    throw err;
  }
}

function byokList(_p: P, ctx: RpcContext, backend: ApiBackend): WireByokEntryView[] {
  // 零泄漏：只返回掩码视图（masked_key），明文密钥从不离开 vault。
  return backend.byokVault.list(ctx.account_id).map(toByokEntryView);
}

function byokFamilies(): string[] {
  return BYOK_FAMILIES.filter((f) => f !== "mock");
}

function registerByok(p: P, ctx: RpcContext, backend: ApiBackend): WireRegisterByokOutcome {
  const family = s(p.provider_family);
  const label = s(p.label);
  const apiKey = s(p.api_key);
  if (!family || !label || !apiKey) {
    return { status: "invalid_key", message: "请完整填写提供商、备注与密钥" };
  }
  try {
    const entry = backend.byokVault.register(ctx.account_id, {
      provider_family: family as ByokEntryView["provider_family"],
      label,
      api_key: apiKey,
    });
    // BYOK 注册后挂载真实偏好路由（确定性端口；明文密钥只用于 adapter 装配，绝不返回给客户端）。
    const { provider_id } = registerByokProvider(
      backend.registry,
      { entry_id: entry.entry_id, provider_family: entry.provider_family, label: entry.label },
      { api_key: apiKey, transport: byokTransport },
    );
    if (!backend.preferByok.includes(provider_id)) backend.preferByok.push(provider_id);
    return { status: "registered", entry: toByokEntryView(entry) };
  } catch (err) {
    if (err instanceof ByokError) {
      return { status: "invalid_key", message: err.message };
    }
    throw err;
  }
}

function byokTransport(request: ProviderRequest, _ctx: unknown): unknown {
  if (request.operation === "ocr") {
    const input = request.input as { image_base64?: string } | undefined;
    return { text: Buffer.from(input?.image_base64 ?? "", "base64").toString("utf-8") };
  }
  return deterministicStructureTransport({ input: request.input }, {});
}

function listStudioDlcs(_p: P, ctx: RpcContext, backend: ApiBackend): WireStudioDlcView[] {
  const published = backend.drafts
    .listByCreator(ctx.account_id)
    .filter((d) => d.status === "published");
  return published.map((d) => {
    const listing = backend.market.view(`listing.${d.manifest.dlc_id}`);
    const fallback: MarketListing = {
      listing_id: `listing.${d.manifest.dlc_id}`,
      dlc_ref: { dlc_id: d.manifest.dlc_id, version: d.manifest.version, sha256: "" },
      title: d.manifest.display_name,
      summary: "",
      language: d.language,
      difficulty: d.cefr_level,
      tags: [],
      pricing: { model: "free" },
      publisher_id: ctx.account_id,
      published_at: d.updated_at,
      updated_at: d.updated_at,
    };
    return toStudioDlcView(listing ? listing.listing : fallback);
  });
}

async function createStudioDraft(p: P, ctx: RpcContext, backend: ApiBackend): Promise<WireCreateStudioDraftOutcome> {
  const title = s(p.title);
  const language = s(p.language);
  const cefrLevel = s(p.cefrLevel) as CefrLevel;
  const text = sOpt(p.text);
  const image = asObj(p.image);
  if (text === undefined && sOpt(image.base64) === undefined) {
    return { status: "ingest_empty", message: "请粘贴教学内容或上传图片" };
  }
  if (!title || !language || !isCefr(cefrLevel)) {
    return { status: "structure_invalid", message: "标题、语言或等级不完整" };
  }
  const source: IngestSource =
    text !== undefined
      ? { kind: "text", text, language, title }
      : {
          kind: "image",
          bytes: Buffer.from(s(image.base64), "base64"),
          language,
          title,
          ...(sOpt(image.media_type) ? { media_type: s(image.media_type) } : {}),
        };
  try {
    const draft = await backend.drafts.createDraft(ctx.account_id, { source, cefrLevel, description: sOpt(p.description) });
    return { status: "created", draft: toStudioDraftView(draft) };
  } catch (err) {
    return mapCreateDraftError(err);
  }
}

function isCefr(v: string): v is CefrLevel {
  return ["A1", "A2", "B1", "B2", "C1", "C2"].includes(v);
}

function mapCreateDraftError(err: unknown): WireCreateStudioDraftOutcome {
  if (err instanceof StudioError) {
    switch (err.code) {
      case "capability_missing":
        return { status: "permission_denied", required_capability: "create_dlc_draft", message: err.message };
      case "ingest_source_empty":
        return { status: "ingest_empty", message: err.message };
      case "structure_output_invalid":
      case "ocr_output_invalid":
      case "provider_unavailable":
        return { status: "structure_invalid", message: err.message };
      default:
        return { status: "structure_invalid", message: err.message };
    }
  }
  throw err;
}

function getStudioDraft(p: P, ctx: RpcContext, backend: ApiBackend): WireStudioDraftView | null {
  try {
    return toStudioDraftView(backend.drafts.get(ctx.account_id, s(p.draftId)));
  } catch (err) {
    if (err instanceof StudioError && err.code === "draft_not_found") return null;
    throw err;
  }
}

function buildDraftEdit(p: P): DraftEdit {
  const edit: DraftEdit = {};
  if (sOpt(p.title) !== undefined) edit.title = s(p.title);
  if (Array.isArray(p.units)) {
    edit.units = (p.units as unknown[]).map((u, i) => {
      const row = asObj(u);
      return {
        unit_no: i + 1,
        frame_type: s(row.frame_type) as StructuredFrameType,
        title: s(row.title),
        pattern: s(row.pattern),
        ...(sOpt(row.lemma) !== undefined ? { lemma: s(row.lemma) } : {}),
      };
    });
  }
  return edit;
}

function mapEditDraftError(err: unknown): WireEditStudioDraftOutcome {
  if (err instanceof StudioError) {
    switch (err.code) {
      case "draft_not_found":
        return { status: "not_found", message: err.message };
      case "draft_state_invalid":
        return { status: "state_invalid", message: err.message };
      case "draft_schema_invalid":
      default:
        return { status: "confirm_failed", message: err.message };
    }
  }
  throw err;
}

function editStudioDraft(p: P, ctx: RpcContext, backend: ApiBackend, confirm: boolean): WireEditStudioDraftOutcome {
  try {
    const draft = confirm
      ? backend.drafts.confirm(ctx.account_id, s(p.draftId), buildDraftEdit(p))
      : backend.drafts.edit(ctx.account_id, s(p.draftId), buildDraftEdit(p));
    return { status: "saved", draft: toStudioDraftView(draft) };
  } catch (err) {
    return mapEditDraftError(err);
  }
}

function discardStudioDraft(p: P, ctx: RpcContext, backend: ApiBackend): WireEditStudioDraftOutcome {
  try {
    backend.drafts.discard(ctx.account_id, s(p.draftId));
    return { status: "saved" as const, draft: undefined as unknown as WireStudioDraftView };
  } catch (err) {
    return mapEditDraftError(err);
  }
}

function runSandbox(p: P, ctx: RpcContext, backend: ApiBackend): WireSandboxOutcome {
  try {
    const draft = backend.drafts.get(ctx.account_id, s(p.draftId));
    const report = runSandboxTrial(draft.material_pack, draft.manifest, { clock: backend.clock });
    return { status: "ran", report: toSandboxReportView(report) };
  } catch (err) {
    if (err instanceof StudioError) {
      if (err.code === "draft_not_found") return { status: "not_found", message: err.message };
      if (err.code === "sandbox_compile_failed") return { status: "compile_failed", message: err.message };
      return { status: "compile_failed", message: err.message };
    }
    throw err;
  }
}

function toSandboxReportView(report: SandboxTrialReport) {
  return {
    status: report.status,
    steps_completed: report.steps_completed,
    events_appended: report.events_appended,
    real_event_store_used: report.real_event_store_used,
    executed_at: report.executed_at,
  };
}

async function publishStudioDraft(p: P, ctx: RpcContext, backend: ApiBackend): Promise<WirePublishStudioOutcome> {
  const difficulty = s(p.difficulty) as DifficultyLevel;
  try {
    const result = await backend.studio.publishDraft(ctx.account_id, s(p.draftId), {
      listing: {
        summary: s(p.summary),
        difficulty,
        tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map((t) => s(t)).filter(Boolean) : [],
        pricing: { model: "free" },
      },
      acknowledged_delist_terms: p.acknowledged_delist_terms === true,
    });
    return { status: "published", dlc: toStudioDlcView(result.listing) };
  } catch (err) {
    if (err instanceof StudioError) {
      if (err.code === "delist_acknowledgement_required")
        return { status: "acknowledgement_required", message: err.message };
      return { status: "state_invalid", message: err.message };
    }
    if (err instanceof MarketError) {
      if (err.code === "publisher_capability_missing")
        return { status: "permission_denied", required_capability: "publish_dlc", message: err.message };
      return { status: "invalid_input", message: err.message };
    }
    throw err;
  }
}

function startRevision(p: P, ctx: RpcContext, backend: ApiBackend): WireCreateStudioDraftOutcome {
  const dlcId = s(p.dlcId);
  const published = backend.drafts
    .listByCreator(ctx.account_id)
    .find((d) => d.status === "published" && d.manifest.dlc_id === dlcId);
  if (!published) {
    return { status: "structure_invalid", message: "没有找到已发布的课程，无法发起修订" };
  }
  try {
    const draft = backend.drafts.startRevision(ctx.account_id, published.draft_id);
    return { status: "created", draft: toStudioDraftView(draft) };
  } catch (err) {
    if (err instanceof StudioError) return { status: "structure_invalid", message: err.message };
    throw err;
  }
}

function delistStudioDlc(p: P, ctx: RpcContext, backend: ApiBackend): WireDelistStudioOutcome {
  const dlcId = s(p.dlcId);
  const published = backend.drafts
    .listByCreator(ctx.account_id)
    .find((d) => d.status === "published" && d.manifest.dlc_id === dlcId);
  if (!published) return { status: "not_found", message: "没有找到这门课程" };
  try {
    backend.studio.delist(ctx.account_id, published.draft_id);
    return { status: "delisted", dlc_id: dlcId };
  } catch (err) {
    if (err instanceof StudioError || err instanceof MarketError) {
      return { status: "not_found", message: err.message };
    }
    throw err;
  }
}

function listStudioTemplates(): WireStudioTemplateView[] {
  return STUDIO_TEMPLATES.map(toTemplateView);
}

async function fromTemplate(p: P, ctx: RpcContext, backend: ApiBackend): Promise<WireCreateStudioDraftOutcome> {
  const template = templateById(s(p.templateId));
  if (!template) return { status: "structure_invalid", message: "未知的模板" };
  const language = s(p.language);
  const cefrLevel = s(p.cefrLevel) as CefrLevel;
  if (!language || !isCefr(cefrLevel)) {
    return { status: "structure_invalid", message: "语言或等级不完整" };
  }
  try {
    const draft = await backend.drafts.createDraft(ctx.account_id, {
      source: {
        kind: "text",
        text: template.prefilled_text,
        language,
        title: template.title_suggestion,
      },
      cefrLevel,
    });
    return { status: "created", draft: toStudioDraftView(draft) };
  } catch (err) {
    return mapCreateDraftError(err);
  }
}

function mapExpertEditError(err: unknown): WireExpertEditStudioOutcome {
  if (err instanceof StudioError) {
    switch (err.code) {
      case "draft_not_found":
        return { status: "not_found", message: err.message };
      case "draft_state_invalid":
        return { status: "state_invalid", message: err.message };
      case "draft_schema_invalid":
        return err.message.includes("不是有效的 JSON")
          ? { status: "invalid_json", message: err.message }
          : { status: "invalid_content", message: err.message };
      default:
        return { status: "invalid_content", message: err.message };
    }
  }
  throw err;
}

function editTrainingModes(p: P, ctx: RpcContext, backend: ApiBackend): WireExpertEditStudioOutcome {
  try {
    const draft = backend.drafts.editTrainingModes(ctx.account_id, s(p.draftId), s(p.modesJson));
    return { status: "saved", draft: toStudioDraftView(draft) };
  } catch (err) {
    return mapExpertEditError(err);
  }
}

function editManifest(p: P, ctx: RpcContext, backend: ApiBackend): WireExpertEditStudioOutcome {
  try {
    const draft = backend.drafts.editManifest(ctx.account_id, s(p.draftId), s(p.manifestJson));
    return { status: "saved", draft: toStudioDraftView(draft) };
  } catch (err) {
    return mapExpertEditError(err);
  }
}

// ---------------------------------------------------------------------------
// 方法表
// ---------------------------------------------------------------------------

const METHODS: Record<string, RpcFn> = {
  "account.get": getAccount,
  "home.overview": homeOverview,
  "market.list": marketList,
  "market.listing.get": marketListingDetail,
  "market.acquire": marketAcquire,
  "market.review": marketReview,
  "classes.list": classesList,
  "classes.create": createClass,
  "classes.join": joinClass,
  "classes.detail.get": classDetail,
  "classes.invitation.issue": issueInvitation,
  "classes.assign": assignClass,
  "classes.notice.post": postNotice,
  "classes.unlock.load": classUnlock,
  "classes.stats.load": classStats,
  "journey.chat.load": (p, ctx, b) => composeChat(b, ctx.account_id),
  "journey.learning.load": (p, ctx, b) => composeLearning(b, ctx.account_id),
  "journey.teacher.load": (p, ctx, b) => composeTeacher(b, ctx.account_id),
  "journey.workbench.load": (p, ctx, b) => composeWorkbench(b, ctx.account_id),
  "byok.list": byokList,
  "byok.families": () => byokFamilies(),
  "byok.register": registerByok,
  "studio.dlcs.list": listStudioDlcs,
  "studio.draft.create": createStudioDraft,
  "studio.draft.get": getStudioDraft,
  "studio.draft.edit": (p, ctx, b) => editStudioDraft(p, ctx, b, false),
  "studio.draft.confirm": (p, ctx, b) => editStudioDraft(p, ctx, b, true),
  "studio.draft.discard": discardStudioDraft,
  "studio.sandbox.run": runSandbox,
  "studio.draft.publish": publishStudioDraft,
  "studio.revision.start": startRevision,
  "studio.dlc.delist": delistStudioDlc,
  "studio.templates.list": () => listStudioTemplates(),
  "studio.draft.fromTemplate": fromTemplate,
  "studio.trainingModes.edit": editTrainingModes,
  "studio.manifest.edit": editManifest,
};

export function createRpcHandler(backendProvider: () => Promise<ApiBackend>): RpcHandler {
  return async (request: unknown): Promise<RpcResult> => {
    try {
      const req = asObj(request);
      const method = s(req.method);
      if (!method) return fail("invalid_request", "请求缺少 method");
      const fn = METHODS[method];
      if (!fn) return fail("method_not_found", `未知方法 ${method}`);
      const accountId = s(asObj(req.auth).account_id);
      if (!accountId) return fail("session_expired", "请求缺少账户身份");
      const backend = await backendProvider();
      const result = await fn(asObj(req.params), { account_id: accountId }, backend);
      return { ok: true, result };
    } catch (err) {
      console.error("[llos/api] rpc error:", err);
      return fail("unknown", "服务器内部错误");
    }
  };
}

function fail(code: RpcError["code"], message: string): RpcResult {
  return { ok: false, error: { code, message } };
}
