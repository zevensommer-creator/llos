// HttpApiClient：正式（非 Mock）ApiClient 实现（T-037）。
//
// 通过 JSON-RPC over HTTP（/api/rpc，vite dev proxy 转发到 @llos/api
// node:http 服务）调用真实域服务。所有 ViewModel / Outcome 与 Mock 层
// 1:1 对齐（VIEW_MODELS §4：Mock 与真实 API 使用相同 ViewModel）；
// 传输层/域错误映射为稳定 ApiErrorCode，不把原始异常透传给页面（§4）。
//
// 安全约定（T-037）：本文件不处理任何能力判断——UI 隐藏按钮只是展示层，
// 服务端重新授权；BYOK 明文密钥只作为请求参数单向发送，响应只含掩码视图。

import type {
  AcquireOutcome,
  ApiClient,
  ApiError,
  ApiErrorCode,
  AssignOutcome,
  ByokEntryView,
  ClassDetailView,
  ClassInvitationView,
  ClassStatsView,
  ClassSummary,
  ClassUnlockItem,
  CreateClassOutcome,
  CreateStudioDraftInput,
  CreateStudioDraftOutcome,
  DelistStudioOutcome,
  EditStudioDraftOutcome,
  ExpertEditStudioOutcome,
  JoinClassOutcome,
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
  StudioDraftEditInput,
  StudioDraftView,
  StudioDlcView,
  StudioTemplateView,
} from "./types.js";
import type {
  Account,
  ChatSessionView,
  HomeOverview,
  LearningSessionView,
  TeacherMobileDashboardViewModel,
  WorkbenchView,
} from "./types.js";

export interface HttpApiClientOptions {
  /** RPC 端点前缀；默认 "/api"（vite dev proxy → 本地 @llos/api 服务）。 */
  baseUrl?: string;
  /** 当前账户 id 提供者；默认种子学习者账户（服务端账户由认证流程管理，此为开发缺省）。 */
  getAccountId?: () => string;
  /** 注入 fetch 实现（测试 / SSR）；默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 请求超时（毫秒）；默认 10s。 */
  timeoutMs?: number;
}

interface RpcBody {
  ok: true;
  result: unknown;
}

interface RpcErrorBody {
  ok: false;
  error: { code: string; message: string };
}

const DEFAULT_ACCOUNT = "account.mock.learner";

export class HttpApiClient implements ApiClient {
  private readonly baseUrl: string;
  private readonly getAccountId: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.getAccountId = options.getAccountId ?? (() => DEFAULT_ACCOUNT);
    // 必须 bind：浏览器里裸存 globalThis.fetch 会在调用时因丢失 this 抛
    // Illegal invocation，被上层误映射为"网络请求失败"（T-038 浏览器 E2E 首次暴露）。
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  // -------------------------------------------------------------------------
  // 传输核心
  // -------------------------------------------------------------------------

  private async call<T>(method: string, params?: unknown): Promise<T> {
    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        response = await this.fetchImpl(`${this.baseUrl}/rpc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            params: params ?? {},
            auth: { account_id: this.getAccountId() },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      throw toApiError(err);
    }

    if (!response.ok) {
      throw { code: "unknown", message: `服务响应异常（HTTP ${response.status}）` } satisfies ApiError;
    }

    let body: RpcBody | RpcErrorBody;
    try {
      body = (await response.json()) as RpcBody | RpcErrorBody;
    } catch {
      throw { code: "unknown", message: "服务响应不是有效的 JSON" } satisfies ApiError;
    }

    if (!body.ok) {
      throw toApiError(body.error);
    }
    return body.result as T;
  }

  // -------------------------------------------------------------------------
  // 账户与首页
  // -------------------------------------------------------------------------

  getAccount(): Promise<Account> {
    return this.call<Account>("account.get");
  }

  getHomeOverview(): Promise<HomeOverview> {
    return this.call<HomeOverview>("home.overview");
  }

  // -------------------------------------------------------------------------
  // UI-2 四旅程
  // -------------------------------------------------------------------------

  loadChatSession(): Promise<LoadState<ChatSessionView>> {
    return this.call<LoadState<ChatSessionView>>("journey.chat.load");
  }

  loadLearningSession(): Promise<LoadState<LearningSessionView>> {
    return this.call<LoadState<LearningSessionView>>("journey.learning.load");
  }

  loadTeacherDashboard(): Promise<LoadState<TeacherMobileDashboardViewModel>> {
    return this.call<LoadState<TeacherMobileDashboardViewModel>>("journey.teacher.load");
  }

  loadWorkbench(): Promise<LoadState<WorkbenchView>> {
    return this.call<LoadState<WorkbenchView>>("journey.workbench.load");
  }

  // -------------------------------------------------------------------------
  // 市场
  // -------------------------------------------------------------------------

  listMarket(): Promise<readonly MarketEntry[]> {
    return this.call<readonly MarketEntry[]>("market.list");
  }

  queryMarket(query: MarketQuery = {}): Promise<readonly MarketEntry[]> {
    return this.call<readonly MarketEntry[]>("market.list", {
      ...(query.language ? { language: query.language } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.tags && query.tags.length > 0 ? { tags: [...query.tags] } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.sort ? { sort: query.sort } : {}),
    });
  }

  getMarketListing(dlcId: string): Promise<MarketListingDetail | null> {
    return this.call<MarketListingDetail | null>("market.listing.get", { listingId: `listing.${dlcId}` });
  }

  acquireListing(dlcId: string): Promise<AcquireOutcome> {
    return this.call<AcquireOutcome>("market.acquire", { listingId: `listing.${dlcId}` });
  }

  submitReview(dlcId: string, rating: number, text?: string): Promise<ReviewOutcome> {
    return this.call<ReviewOutcome>("market.review", {
      listingId: `listing.${dlcId}`,
      rating,
      ...(text !== undefined && text !== "" ? { text } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // 班级
  // -------------------------------------------------------------------------

  listMyClasses(): Promise<readonly ClassSummary[]> {
    return this.call<readonly ClassSummary[]>("classes.list");
  }

  createClass(name: string, description?: string): Promise<CreateClassOutcome> {
    return this.call<CreateClassOutcome>("classes.create", {
      name,
      ...(description !== undefined && description !== "" ? { description } : {}),
    });
  }

  joinClass(code: string): Promise<JoinClassOutcome> {
    return this.call<JoinClassOutcome>("classes.join", { code });
  }

  getClassDetail(classId: string): Promise<ClassDetailView | null> {
    return this.call<ClassDetailView | null>("classes.detail.get", { classId });
  }

  issueClassInvitation(classId: string, maxUses?: number): Promise<ClassInvitationView | null> {
    return this.call<ClassInvitationView | null>("classes.invitation.issue", {
      classId,
      ...(maxUses !== undefined ? { maxUses } : {}),
    });
  }

  assignDlc(
    classId: string,
    dlcId: string,
    options?: { sequence?: number; dueAt?: string },
  ): Promise<AssignOutcome> {
    return this.call<AssignOutcome>("classes.assign", {
      classId,
      dlcId,
      ...(options?.sequence !== undefined ? { sequence: options.sequence } : {}),
      ...(options?.dueAt !== undefined ? { dueAt: options.dueAt } : {}),
    });
  }

  postClassNotice(classId: string, text: string): Promise<PostNoticeOutcome> {
    return this.call<PostNoticeOutcome>("classes.notice.post", { classId, text });
  }

  loadClassUnlockState(classId: string): Promise<readonly ClassUnlockItem[] | null> {
    return this.call<readonly ClassUnlockItem[] | null>("classes.unlock.load", { classId });
  }

  loadClassStats(classId: string): Promise<ClassStatsView | null> {
    return this.call<ClassStatsView | null>("classes.stats.load", { classId });
  }

  // -------------------------------------------------------------------------
  // Studio
  // -------------------------------------------------------------------------

  listByokKeys(): Promise<readonly ByokEntryView[]> {
    return this.call<readonly ByokEntryView[]>("byok.list");
  }

  registerByokKey(providerFamily: string, label: string, key: string): Promise<RegisterByokOutcome> {
    return this.call<RegisterByokOutcome>("byok.register", {
      provider_family: providerFamily,
      label,
      api_key: key,
    });
  }

  listByokProviderFamilies(): Promise<readonly string[]> {
    return this.call<readonly string[]>("byok.families");
  }

  listStudioDlcs(): Promise<readonly StudioDlcView[]> {
    return this.call<readonly StudioDlcView[]>("studio.dlcs.list");
  }

  createStudioDraft(input: CreateStudioDraftInput): Promise<CreateStudioDraftOutcome> {
    return this.call<CreateStudioDraftOutcome>("studio.draft.create", {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.image !== undefined
        ? { image: { media_type: input.image.media_type, base64: input.image.base64 } }
        : {}),
      title: input.title,
      language: input.language,
      cefrLevel: input.cefrLevel,
    });
  }

  getStudioDraft(draftId: string): Promise<StudioDraftView | null> {
    return this.call<StudioDraftView | null>("studio.draft.get", { draftId });
  }

  editStudioDraft(draftId: string, edit: StudioDraftEditInput): Promise<EditStudioDraftOutcome> {
    return this.call<EditStudioDraftOutcome>("studio.draft.edit", { draftId, ...toEditParams(edit) });
  }

  confirmStudioDraft(draftId: string, edit: StudioDraftEditInput): Promise<EditStudioDraftOutcome> {
    return this.call<EditStudioDraftOutcome>("studio.draft.confirm", { draftId, ...toEditParams(edit) });
  }

  discardStudioDraft(draftId: string): Promise<EditStudioDraftOutcome> {
    return this.call<EditStudioDraftOutcome>("studio.draft.discard", { draftId });
  }

  runSandboxTrial(draftId: string): Promise<SandboxOutcome> {
    return this.call<SandboxOutcome>("studio.sandbox.run", { draftId });
  }

  publishStudioDraft(draftId: string, input: PublishStudioInput): Promise<PublishStudioOutcome> {
    return this.call<PublishStudioOutcome>("studio.draft.publish", {
      draftId,
      summary: input.summary,
      difficulty: input.difficulty,
      tags: [...input.tags],
      acknowledged_delist_terms: input.acknowledged_delist_terms,
    });
  }

  startRevision(dlcId: string): Promise<CreateStudioDraftOutcome> {
    return this.call<CreateStudioDraftOutcome>("studio.revision.start", { dlcId });
  }

  delistStudioDlc(dlcId: string): Promise<DelistStudioOutcome> {
    return this.call<DelistStudioOutcome>("studio.dlc.delist", { dlcId });
  }

  listStudioTemplates(): Promise<readonly StudioTemplateView[]> {
    return this.call<readonly StudioTemplateView[]>("studio.templates.list");
  }

  createStudioDraftFromTemplate(
    templateId: string,
    language: string,
    cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  ): Promise<CreateStudioDraftOutcome> {
    return this.call<CreateStudioDraftOutcome>("studio.draft.fromTemplate", {
      templateId,
      language,
      cefrLevel,
    });
  }

  editTrainingModes(draftId: string, modesJson: string): Promise<ExpertEditStudioOutcome> {
    return this.call<ExpertEditStudioOutcome>("studio.trainingModes.edit", { draftId, modesJson });
  }

  editManifest(draftId: string, manifestJson: string): Promise<ExpertEditStudioOutcome> {
    return this.call<ExpertEditStudioOutcome>("studio.manifest.edit", { draftId, manifestJson });
  }
}

function toEditParams(edit: StudioDraftEditInput): Record<string, unknown> {
  return {
    ...(edit.title !== undefined ? { title: edit.title } : {}),
    ...(edit.units !== undefined && edit.units.length > 0
      ? {
          units: edit.units.map((u) => ({
            frame_type: u.frame_type,
            title: u.title,
            pattern: u.pattern,
            ...(u.lemma !== undefined ? { lemma: u.lemma } : {}),
          })),
        }
      : {}),
  };
}

/** 网络/传输/域错误 → 稳定 ApiErrorCode（VIEW_MODELS §4 错误映射）。 */
function toApiError(cause: unknown): ApiError {
  if (isAbortError(cause)) {
    return { code: "network_timeout", message: "网络超时，请检查连接后重试" };
  }
  if (isRpcError(cause)) {
    const { code, message } = cause.error;
    if (code === "session_expired") {
      return { code: "session_expired", message: message || "会话已过期，请重新登录" };
    }
    return { code: mapUnknownCode(code), message: safeMessage(message) };
  }
  return { code: "unknown", message: "网络请求失败，请稍后重试" };
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "AbortError"
  );
}

function isRpcError(err: unknown): err is RpcErrorBody {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { ok?: boolean }).ok === false &&
    typeof (err as { error?: unknown }).error === "object"
  );
}

function mapUnknownCode(code: string): ApiErrorCode {
  return code === "unknown" || code === "invalid_request" || code === "method_not_found"
    ? "unknown"
    : ("unknown" as ApiErrorCode);
}

function safeMessage(message: string): string {
  return message && message.length > 0 ? message : "服务处理失败，请稍后重试";
}
