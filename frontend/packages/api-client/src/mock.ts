import type {
  Account,
  ApiClient,
  CapabilityId,
  HomeCard,
  HomeOverview,
  MarketEntry,
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
}

/**
 * Deterministic, network-free ApiClient for UI-1/UI-2. Real adapter arrives at
 * UI-4 (contracts + real API surface); both apps consume only this interface.
 */
export class MockApiClient implements ApiClient {
  readonly #account: Account;

  constructor(options: MockApiClientOptions = {}) {
    const teacher = options.account === "teacher";
    this.#account = Object.freeze({
      account_id: teacher ? "account.mock.teacher" : "account.mock.learner",
      display_name: teacher ? "王老师（Mock）" : "小夏（Mock）",
      capabilities: Object.freeze(teacher ? TEACHER_EXTRA : BASE_CAPABILITIES),
    });
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
}
