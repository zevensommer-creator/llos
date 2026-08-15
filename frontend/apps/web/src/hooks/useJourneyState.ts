import { useEffect, useState } from "react";
import {
  MockApiClient,
  type ChatSessionView,
  type JourneyId,
  type LearningSessionView,
  type LoadScenario,
  type LoadState,
  type TeacherMobileDashboardViewModel,
  type WorkbenchView,
} from "@llos/api-client";

export type AccountKind = "learner" | "teacher";

/** 旅程 → 数据类型映射（类型安全的 Hook 返回）。 */
export interface JourneyDataMap {
  chat: ChatSessionView;
  learning: LearningSessionView;
  teacher: TeacherMobileDashboardViewModel;
  workbench: WorkbenchView;
}

/** 模块级稳定 loader 表（避免 useEffect 依赖抖动导致重复加载）。 */
const JOURNEY_LOADERS: {
  [K in JourneyId]: (c: MockApiClient) => Promise<LoadState<JourneyDataMap[K]>>;
} = {
  chat: (c) => c.loadChatSession(),
  learning: (c) => c.loadLearningSession(),
  teacher: (c) => c.loadTeacherDashboard(),
  workbench: (c) => c.loadWorkbench(),
};

/**
 * 加载某旅程的七态。网络调用集中在 @llos/api-client（页面禁止散落 fetch，§4）。
 * reloadKey 变化会触发重新加载（用于“重试”）。
 */
export function useJourneyState<K extends JourneyId>(
  journey: K,
  scenario: LoadScenario,
  accountKind: AccountKind,
  reloadKey: number,
): LoadState<JourneyDataMap[K]> | null {
  const [state, setState] = useState<LoadState<JourneyDataMap[K]> | null>(null);

  useEffect(() => {
    const client = new MockApiClient({ account: accountKind, scenarios: { [journey]: scenario } });
    let live = true;
    void JOURNEY_LOADERS[journey](client).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [journey, scenario, accountKind, reloadKey]);

  return state;
}
