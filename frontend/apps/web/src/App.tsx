import { useEffect, useState } from "react";
import { MockApiClient, type Account, type CapabilityId } from "@llos/api-client";

interface WorkbenchSection {
  id: string;
  title: string;
  description: string;
  requires?: CapabilityId;
}

// CLIENT_SURFACE_SPEC §5: desktop-only work (Studio, batch, review, admin).
const SECTIONS: readonly WorkbenchSection[] = [
  { id: "chat", title: "普通聊天", description: "ChatSession（DLC 为空）：不产生学习状态" },
  { id: "learning", title: "学习工作台", description: "LearningSession：三层就绪后执行训练与反馈" },
  { id: "market", title: "市场", description: "DLC 与素材的浏览、获取与已购内容" },
  { id: "classes", title: "班级管理", description: "批量成员管理、学习组合分配、截止日期", requires: "create_class" },
  { id: "studio", title: "DLC Studio", description: "DLC 创建、编辑、测试与发布；BYOK", requires: "publish_dlc" },
  { id: "review", title: "审核与用户", description: "内容下架、用户管理、系统配置", requires: "manage_users" },
];

function App() {
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    const client = new MockApiClient();
    void client.getAccount().then(setAccount);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">LLOS 工作台</div>
        <div className="account">{account ? account.display_name : "加载中"}</div>
      </header>
      <main className="workbench">
        <p className="hint">
          UI-1 工程骨架：App Shell + Mock adapter。区域按账户能力显示——显示控制不是安全控制，写操作由服务端重新授权。
        </p>
        <div className="sections">
          {SECTIONS.map((section) => {
            const allowed = !section.requires || account?.capabilities.includes(section.requires);
            return (
              <section
                key={section.id}
                className={`section ${allowed ? "" : "section-locked"}`}
                aria-disabled={!allowed}
              >
                <h2>{section.title}</h2>
                <p>{section.description}</p>
                {!allowed && <p className="locked-note">需要对应能力点（当前为 Mock 学习者账户）</p>}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export { App };
