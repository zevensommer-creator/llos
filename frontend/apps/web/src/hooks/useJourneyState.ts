import { useEffect, useState } from "react";
import {
  type ApiClient,
  type ChatSessionView,
  type JourneyId,
  type LearningSessionView,
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
  [K in JourneyId]: (c: ApiClient) => Promise<LoadState<JourneyDataMap[K]>>;
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
  client: ApiClient,
  reloadKey: number,
): LoadState<JourneyDataMap[K]> | null {
  const [state, setState] = useState<LoadState<JourneyDataMap[K]> | null>(null);

  useEffect(() => {
    let live = true;
    void JOURNEY_LOADERS[journey](client).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [journey, client, reloadKey]);

  return state;
}
