import type { ReactNode } from "react";
import type { Account, ApiClient, JourneyId } from "@llos/api-client";
import { StateView } from "./StateView";
import { useJourneyState, type JourneyDataMap } from "../hooks/useJourneyState";

interface JourneyHostProps<K extends JourneyId> {
  journey: K;
  client: ApiClient;
  reloadKey: number;
  account: Account | null;
  onRetry: () => void;
  children: (data: JourneyDataMap[K], account: Account | null) => ReactNode;
}

/**
 * 按字面量 journey 泛型收窄数据类型的宿主组件：
 * 负责加载七态 + 统一渲染，把 ready 数据交给具体旅程组件。
 * client 由 App 注入（Mock 或 HttpApiClient，VITE_API_MODE 决定）。
 */
export function JourneyHost<K extends JourneyId>(props: JourneyHostProps<K>) {
  const { journey, client, reloadKey, account, onRetry, children } = props;
  const state = useJourneyState(journey, client, reloadKey);
  return (
    <StateView state={state} onRetry={onRetry}>
      {(data) => children(data, account)}
    </StateView>
  );
}
