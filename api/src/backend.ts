// LLOS API 组合根（T-037 纵向切片）。
//
// 这里把真实域服务装配成一个后端：Core（账户/授权/事件/会话/BYOK/班级/
// 分配/通知/投影）+ Market（市场）+ Gateway（Provider 注册表）+ Studio
// （草稿/发布）。所有授权写入都走 Core 注入的存储；DLC 只编译、不持有素材
// 之外的东西；业务代码只请求 capability（不变量 1/4/5/12）。
//
// 种子数据刻意走真实服务路径（createDraft → confirm → publishDraft →
// createClass → issueInvitation → redeemInvitation → assign），保证
// 「演示数据」与「用户数据」经过完全相同的门禁与校验。

import { createHash } from "node:crypto";
import {
  ByokVault,
  ClassAssignmentService,
  ClassNoticeService,
  ClassService,
  InMemoryAccountStore,
  InMemoryEntitlementStore,
  InMemoryEventStore,
  InMemorySessionStore,
} from "@llos/core";
import { ProviderGateway, ProviderRegistry } from "@llos/gateway";
import { MarketService } from "@llos/market";
import { StudioDrafts, StudioService } from "@llos/studio";
import { registerPlatformProvider } from "./platform.js";

/** 种子账户（组合根是系统自身，可创建测试/演示账户；运行时账户由认证流程创建）。 */
export const ACCOUNTS = {
  learner: "account.mock.learner",
  teacher: "account.mock.teacher",
  reference: "account.mock.reference-publisher",
} as const;

/** 服务端展示名注册表（身份存储不持有展示名；演示账户的展示名在此声明）。 */
export const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  [ACCOUNTS.learner]: "小夏",
  [ACCOUNTS.teacher]: "王老师",
  [ACCOUNTS.reference]: "LLOS 参考内容组",
  "account.mock.student-a": "学生 A",
  "account.mock.student-b": "学生 B",
};

/** 种子课程文本：deterministicStructureTransport 行协议（Szenario/Valenz/Konstruktion）。 */
export const CAFE_TEXT = [
  "Szenario: Im Café bestellen | 在咖啡馆点单",
  "Valenz: empfehlen | empfehlen + Dativ：empfehlen Sie mir",
  "Konstruktion: Höfliche Bitte | Könnten Sie mir bitte …?",
].join("\n");

export interface SeedState {
  /** 教师发布的课程 dlc_id（learner 经班级分配获得授权）。 */
  publishedDlcId: string;
  /** 对应已发布草稿 id（listStudioDlcs / revision 查找用）。 */
  publishedDraftId: string;
  /** 种子班级。 */
  classId: string;
  /** 种子班级邀请码。 */
  invitationCode: string;
}

export interface ApiBackend {
  clock: () => string;
  accountStore: InMemoryAccountStore;
  entitlementStore: InMemoryEntitlementStore;
  eventStore: InMemoryEventStore;
  sessionStore: InMemorySessionStore;
  byokVault: ByokVault;
  registry: ProviderRegistry;
  gateway: ProviderGateway;
  /** 运行时注册 BYOK 后追加其 provider_id（StudioDrafts 持有同一数组引用）。 */
  preferByok: string[];
  classes: ClassService;
  assignments: ClassAssignmentService;
  notices: ClassNoticeService;
  market: MarketService;
  drafts: StudioDrafts;
  studio: StudioService;
  seed: SeedState;
  /** 邀请码 → classId 索引（组合根维护；用于 join 的 already_member 判定）。 */
  invitationIndex: Map<string, string>;
  displayName(accountId: string): string;
}

export async function createBackend(): Promise<ApiBackend> {
  const clock = () => new Date().toISOString();

  const accountStore = new InMemoryAccountStore();
  accountStore.createAccount(ACCOUNTS.learner, "unverified");
  accountStore.createAccount(ACCOUNTS.teacher, "teacher_verified");
  accountStore.createAccount(ACCOUNTS.reference, "teacher_verified");
  // 种子授权：create_class 不在 CREATOR_CAPABILITIES 内（产品 §2.4 由管理员流程
  // 授予）；组合根作为系统自身直接授予种子教师账户，等价于产品内的管理员开户动作。
  accountStore.grant(ACCOUNTS.teacher, "create_class");

  const entitlementStore = new InMemoryEntitlementStore();
  const eventStore = new InMemoryEventStore();
  const sessionStore = new InMemorySessionStore();
  const byokVault = new ByokVault({ clock });

  const registry = new ProviderRegistry();
  registerPlatformProvider(registry);
  const gateway = new ProviderGateway(registry);
  const preferByok: string[] = [];

  const drafts = new StudioDrafts({ accountStore, gateway, clock, preferProviderIds: preferByok });
  const classes = new ClassService({ accountStore, entitlementStore, clock });
  const assignments = new ClassAssignmentService({ classService: classes, entitlementStore, clock });
  const notices = new ClassNoticeService({ classService: classes, clock });
  const market = new MarketService({ accountStore, entitlementStore, clock });
  const studio = new StudioService({ drafts, market, clock });

  const backend: ApiBackend = {
    clock,
    accountStore,
    entitlementStore,
    eventStore,
    sessionStore,
    byokVault,
    registry,
    gateway,
    preferByok,
    classes,
    assignments,
    notices,
    market,
    drafts,
    studio,
    seed: await seedServices({ drafts, studio, classes, assignments, market, clock, teacherId: ACCOUNTS.teacher }),
    invitationIndex: new Map<string, string>(),
    displayName: (accountId: string) => DISPLAY_NAMES[accountId] ?? accountId,
  };
  // 登记种子邀请码（join 的 already_member 判定）。
  backend.invitationIndex.set(backend.seed.invitationCode, backend.seed.classId);
  return backend;
}

async function seedServices(input: {
  drafts: StudioDrafts;
  studio: StudioService;
  classes: ClassService;
  assignments: ClassAssignmentService;
  market: MarketService;
  clock: () => string;
  teacherId: string;
}): Promise<SeedState> {
  const teacherId = input.teacherId;

  // 1) 教师创建课程草稿（真实摄入/结构化管线）→ 表单确认 → 发布（免费）。
  const draft = await input.drafts.createDraft(teacherId, {
    source: {
      kind: "text",
      text: CAFE_TEXT,
      language: "de-DE",
      title: "咖啡馆点单（Café Deutsch）",
    },
    cefrLevel: "A1",
    creatorName: "王老师",
    description: "在咖啡馆点单的基础对话训练：场景、动词配价与礼貌请求。",
  });
  const confirmed = input.drafts.confirm(teacherId, draft.draft_id);
  const published = await input.studio.publishDraft(teacherId, confirmed.draft_id, {
    listing: {
      summary: "在咖啡馆点单的基础对话训练：场景、动词配价与礼貌请求。",
      difficulty: "A1",
      tags: ["基础", "旅行"],
      pricing: { model: "free" },
    },
    acknowledged_delist_terms: true,
  });

  // 2) 建班 → 邀请码 → 学习者入班（join_class 属 BASE 能力）。
  const klass = input.classes.createClass(teacherId, {
    name: "德语 A1 班",
    description: "第一学期基础班",
  });
  const invitation = input.classes.issueInvitation(teacherId, klass.class_id, { maxUses: 10 });
  input.classes.redeemInvitation(invitation.code, ACCOUNTS.learner);

  // 3) 教师分配课程（创作者自持 → auto_free → 全员立即授权，真实分配门禁）。
  input.assignments.assign(teacherId, klass.class_id, {
    listing_id: published.listing.listing_id,
    dlc_id: published.listing.dlc_ref.dlc_id,
    pricing_model: "free",
    publisher_id: teacherId,
  });

  // 4) 参考内容组发布两个元数据 listing（真实发布路径；供市场浏览/获取演示）。
  publishReference(input.market, ACCOUNTS.reference, {
    dlc_id: "dlc.reference.fsi",
    title: "FSI 德语 A1 课程包",
    summary: "美国外交学院 FSI 风格的德语入门课程（参考内容，元数据条目）。",
    tags: ["基础", "旅行"],
  });
  publishReference(input.market, ACCOUNTS.reference, {
    dlc_id: "dlc.reference.hotel",
    title: "酒店入住场景训练",
    summary: "办理入住、询问设施与礼貌回应的场景训练（参考内容，元数据条目）。",
    tags: ["旅行", "场景"],
  });

  return {
    publishedDlcId: published.listing.dlc_ref.dlc_id,
    publishedDraftId: draft.draft_id,
    classId: klass.class_id,
    invitationCode: invitation.code,
  };
}

function publishReference(
  market: MarketService,
  publisherId: string,
  spec: { dlc_id: string; title: string; summary: string; tags: string[] },
): void {
  market.publish(publisherId, {
    dlc_ref: {
      dlc_id: spec.dlc_id,
      version: "0.1.0",
      sha256: createHash("sha256").update(`seed:${spec.dlc_id}`).digest("hex"),
    },
    title: spec.title,
    summary: spec.summary,
    language: "de",
    difficulty: "A1",
    tags: spec.tags,
    pricing: { model: "free" },
  });
}

// ---------------------------------------------------------------------------
// 单例存取（server 与测试共用；resetBackend 清空并重建）。
// ---------------------------------------------------------------------------

let current: Promise<ApiBackend> | null = null;

export function getBackend(): Promise<ApiBackend> {
  current ??= createBackend();
  return current;
}

export function resetBackend(): Promise<ApiBackend> {
  current = createBackend();
  return current;
}
