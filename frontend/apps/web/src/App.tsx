import { useEffect, useState } from "react";
import {
  MockApiClient,
  type Account,
  type JourneyId,
  type LoadScenario,
} from "@llos/api-client";
import { JourneyHost } from "./components/JourneyHost";
import { ChatJourney } from "./journeys/ChatJourney";
import { LearningJourney } from "./journeys/LearningJourney";
import { WorkbenchJourney } from "./journeys/WorkbenchJourney";
import type { AccountKind } from "./hooks/useJourneyState";

// Web（desktop_web）呈现三条旅程：聊天 / 学习 / 电脑工作台。
// 教师助手为移动端旅程（CLIENT_SURFACE_SPEC §4），在 mobile app 呈现。
const WEB_JOURNEYS: readonly { id: JourneyId; label: string }[] = [
  { id: "chat", label: "聊天" },
  { id: "learning", label: "学习" },
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
  const [journey, setJourney] = useState<JourneyId>("chat");
  const [scenario, setScenario] = useState<LoadScenario>("normal");
  const [accountKind, setAccountKind] = useState<AccountKind>("learner");
  const [reloadKey, setReloadKey] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    void new MockApiClient({ account: accountKind }).getAccount().then(setAccount);
  }, [accountKind]);

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
          <div className="account">{account ? account.display_name : "加载中"}</div>
        </div>
      </header>

      <nav className="journey-nav">
        {WEB_JOURNEYS.map((j) => (
          <button
            key={j.id}
            type="button"
            className={`nav-tab ${journey === j.id ? "nav-tab--active" : ""}`}
            onClick={() => setJourney(j.id)}
          >
            {j.label}
          </button>
        ))}
      </nav>

      <main className="workbench">
        {journey === "chat" ? (
          <JourneyHost journey="chat" scenario={scenario} accountKind={accountKind} reloadKey={reloadKey} account={account} onRetry={retry}>
            {(data) => <ChatJourney data={data} />}
          </JourneyHost>
        ) : null}
        {journey === "learning" ? (
          <JourneyHost journey="learning" scenario={scenario} accountKind={accountKind} reloadKey={reloadKey} account={account} onRetry={retry}>
            {(data) => <LearningJourney data={data} />}
          </JourneyHost>
        ) : null}
        {journey === "workbench" ? (
          <JourneyHost journey="workbench" scenario={scenario} accountKind={accountKind} reloadKey={reloadKey} account={account} onRetry={retry}>
            {(data, acc) => <WorkbenchJourney data={data} account={acc} />}
          </JourneyHost>
        ) : null}
      </main>
    </div>
  );
}

export { App };
