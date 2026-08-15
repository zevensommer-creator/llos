// UI-1 temporary view types. UI-4 replaces these with types generated from
// docs/contracts v0.2.x via @llos/contracts (TECH_STACK: 类型来源 packages/contracts).

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

export interface ApiClient {
  getAccount(): Promise<Account>;
  getHomeOverview(): Promise<HomeOverview>;
  listMarket(): Promise<readonly MarketEntry[]>;
}
