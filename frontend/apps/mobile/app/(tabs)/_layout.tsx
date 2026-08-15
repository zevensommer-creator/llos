import { Tabs } from "expo-router";
import tokens from "@llos/design-tokens";
import { useAccount } from "../useAccount";

// CLIENT_SURFACE_SPEC §4: 首页/学习/市场/我的；"班级"入口仅在有 create_class 能力时显示。
// 显隐只是体验层；服务端仍重新授权（权限公式 §2）。
export default function TabsLayout() {
  const account = useAccount();
  const canTeach = account?.capabilities.includes("create_class") ?? false;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTintColor: tokens.color.accent,
        tabBarActiveTintColor: tokens.color.accent,
        tabBarInactiveTintColor: tokens.color.ink_secondary,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "首页" }} />
      <Tabs.Screen name="chat" options={{ title: "聊天" }} />
      <Tabs.Screen name="learn" options={{ title: "学习" }} />
      <Tabs.Screen name="market" options={{ title: "市场" }} />
      <Tabs.Screen
        name="classes"
        options={{ title: "班级", href: canTeach ? undefined : null }}
      />
      <Tabs.Screen name="profile" options={{ title: "我的" }} />
    </Tabs>
  );
}
