// App 级 ApiClient 工厂（T-037 正式去 Mock）。
//
// VITE_API_MODE=mock（默认）→ MockApiClient（七态演示 + 无后端开发）；
// VITE_API_MODE=real → HttpApiClient（真实域服务，vite dev proxy 转发
// /api 到 @llos/api node:http 服务）。
//
// 服务端账户由认证流程管理；开发缺省映射两个种子账户（learner/teacher），
// 与 @llos/api 组合根种子一致。

import { HttpApiClient, MockApiClient, type ApiClient, type LoadScenario } from "@llos/api-client";
import type { AccountKind } from "./hooks/useJourneyState";

export type ApiMode = "mock" | "real";

export const API_MODE: ApiMode =
  (import.meta.env.VITE_API_MODE as string | undefined) === "real" ? "real" : "mock";

const REAL_ACCOUNT_IDS: Record<AccountKind, string> = {
  learner: "account.mock.learner",
  teacher: "account.mock.teacher",
};

/** 生成 ApiClient。scenario 仅 mock 模式有效（七态演示）；real 模式忽略。 */
export function createApiClient(accountKind: AccountKind, scenario: LoadScenario): ApiClient {
  if (API_MODE === "real") {
    return new HttpApiClient({ getAccountId: () => REAL_ACCOUNT_IDS[accountKind] });
  }
  return new MockApiClient({
    account: accountKind,
    scenarios: {
      chat: scenario,
      learning: scenario,
      teacher: scenario,
      workbench: scenario,
    },
  });
}
