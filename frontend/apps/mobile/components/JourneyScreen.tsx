import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import tokens from "@llos/design-tokens";
import type { JourneyId, LoadScenario } from "@llos/api-client";
import { useAccountKind } from "../app/useAccount";
import { useJourneyState, type JourneyDataMap } from "./journeyState";
import { ScenarioBar } from "./ScenarioBar";
import { StateView } from "./StateView";

interface JourneyScreenProps<K extends JourneyId> {
  journey: K;
  children: (data: JourneyDataMap[K]) => ReactNode;
}

/** 移动端旅程宿主：七态切换条（演示）+ 数据加载 + 统一七态渲染。 */
export function JourneyScreen<K extends JourneyId>({ journey, children }: JourneyScreenProps<K>) {
  const accountKind = useAccountKind();
  const [scenario, setScenario] = useState<LoadScenario>("normal");
  const [reloadKey, setReloadKey] = useState(0);
  const state = useJourneyState(journey, scenario, accountKind, reloadKey);

  return (
    <View style={styles.container}>
      <ScenarioBar value={scenario} onChange={setScenario} />
      <View style={styles.body}>
        <StateView state={state} onRetry={() => setReloadKey((k) => k + 1)}>
          {(data) => children(data)}
        </StateView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.lg },
  body: { flex: 1, marginTop: tokens.space.sm },
});
