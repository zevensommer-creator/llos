import { useEffect, useMemo, useState } from "react";
import type { Account, LoadScenario } from "@llos/api-client";
import { API_MODE, createApiClient } from "./apiClient";
import { JourneyHost } from "./components/JourneyHost";
import { ChatJourney } from "./journeys/ChatJourney";
import { LearningJourney } from "./journeys/LearningJourney";
import { WorkbenchJourney } from "./journeys/WorkbenchJourney";
import { MarketJourney } from "./market/MarketJourney";
import { ClassJourney } from "./classes/ClassJourney";
import { StudioJourney } from "./studio/StudioJourney";
import type { AccountKind } from "./hooks/useJourneyState";

// Web（desktop_web）呈现六个视图：聊天 / 学习 / 市场 / 班级 / 创作 / 电脑工作台。
// 教师助手为移动端旅程（CLIENT_SURFACE_SPEC §4），在 mobile app 呈现。
// 市场/班级/创作不是七态旅程（T-026/T-029/T-032）：它们是带交互流程的页面，独立渲染。
type WebView = "chat" | "learning" | "market" | "classes" | "studio" | "workbench";

const WEB_TABS: readonly { id: WebView; label: string }[] = [
  { id: "chat", label: "聊天" },
  { id: "learning", label: "学习" },
  { id: "market", label: "市场" },
  { id: "classes", label: "班级" },
  { id: "studio", label: "创作" },
  { id: "workbench", label: "电脑工作台" },
];

const SCENARIOS: readonly { id: LoadScenario; label: string }[] = [
  { id: "normal", label: "正常" },
  { id: "empty", label: "空白" },
  { id: "loading", label: "加载" },
  { id: "permission_denied", label: "权限不足" },
  { id: "offline", label: "离线" },
  { id: "error_recoverable", label: "可恢复失败" },
  { id: "error_unrecoverable", label: "不可恢复失败" },
];

function App() {
  const [view, setView] = useState<WebView>("chat");
  const [scenario, setScenario] = useState<LoadScenario>("normal");
  const [accountKind, setAccountKind] = useState<AccountKind>("learner");
  const [reloadKey, setReloadKey] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);

  // 市场流程需要跨视图共享状态（获取/评价），复用同一 client 实例；
  // VITE_API_MODE=mock 时 client 随场景重建（七态演示）；real 时忽略场景。
  const client = useMemo(() => createApiClient(accountKind, scenario), [accountKind, scenario]);

  useEffect(() => {
    void client.getAccount().then(setAccount);
  }, [client]);

  const retry = () => setReloadKey((k) => k + 1);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">LLOS 工作台</div>
        <div className="header-controls">
          <label className="control">
            账户
            <select value={accountKind} onChange={(e) => setAccountKind(e.target.value as AccountKind)}>
              <option value="learner">学习者</option>
              <option value="teacher">教师</option>
            </select>
          </label>
          {API_MODE === "mock" ? (
            <label className="control">
              场景（七态演示）
              <select value={scenario} onChange={(e) => setScenario(e.target.value as LoadScenario)}>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="account">{account ? account.display_name : "加载中"}</div>
        </div>
      </header>

      <nav className="journey-nav">
        {WEB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`nav-tab ${view === tab.id ? "nav-tab--active" : ""}`}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="workbench">
        {view === "chat" ? (
          <JourneyHost journey="chat" client={client} reloadKey={reloadKey} account={account} onRetry={retry}>
            {(data) => <ChatJourney data={data} />}
          </JourneyHost>
        ) : null}
        {view === "learning" ? (
          <JourneyHost journey="learning" client={client} reloadKey={reloadKey} account={account} onRetry={retry}>
            {(data) => <LearningJourney data={data} />}
          </JourneyHost>
        ) : null}
        {view === "market" ? (
          <MarketJourney client={client} onStartTraining={() => setView("learning")} />
        ) : null}
        {view === "classes" ? (
          <ClassJourney client={client} onStartTraining={() => setView("learning")} />
        ) : null}
        {view === "studio" ? (
          <StudioJourney client={client} onOpenMarket={() => setView("market")} />
        ) : null}
        {view === "workbench" ? (
          <JourneyHost journey="workbench" client={client} reloadKey={reloadKey} account={account} onRetry={retry}>
            {(data, acc) => <WorkbenchJourney data={data} account={acc} onOpenMarket={() => setView("market")} />}
          </JourneyHost>
        ) : null}
      </main>
    </div>
  );
}

export { App };
