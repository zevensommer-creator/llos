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

export interface JourneyDataMap {
  chat: ChatSessionView;
  learning: LearningSessionView;
  teacher: TeacherMobileDashboardViewModel;
  workbench: WorkbenchView;
}

const JOURNEY_LOADERS: {
  [K in JourneyId]: (c: MockApiClient) => Promise<LoadState<JourneyDataMap[K]>>;
} = {
  chat: (c) => c.loadChatSession(),
  learning: (c) => c.loadLearningSession(),
  teacher: (c) => c.loadTeacherDashboard(),
  workbench: (c) => c.loadWorkbench(),
};

/** 与 web 同源的旅程七态 Hook；网络调用集中在 @llos/api-client（§4）。 */
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
