import type { ReactNode } from "react";
import type { Account, JourneyId, LoadScenario } from "@llos/api-client";
import { StateView } from "./StateView";
import { useJourneyState, type AccountKind, type JourneyDataMap } from "../hooks/useJourneyState";

interface JourneyHostProps<K extends JourneyId> {
  journey: K;
  scenario: LoadScenario;
  accountKind: AccountKind;
  reloadKey: number;
  account: Account | null;
  onRetry: () => void;
  children: (data: JourneyDataMap[K], account: Account | null) => ReactNode;
}

/**
 * 按字面量 journey 泛型收窄数据类型的宿主组件：
 * 负责加载七态 + 统一渲染，把 ready 数据交给具体旅程组件。
 */
export function JourneyHost<K extends JourneyId>(props: JourneyHostProps<K>) {
  const { journey, scenario, accountKind, reloadKey, account, onRetry, children } = props;
  const state = useJourneyState(journey, scenario, accountKind, reloadKey);
  return (
    <StateView state={state} onRetry={onRetry}>
      {(data) => children(data, account)}
    </StateView>
  );
}
