# TASKS.md — 任务看板（协作真相源）

> 这是所有 Agent 共享的任务看板，是协作的**核心真相源**。
> 开始工作前先读本文件；完成任务后必须更新本文件。
> 认领规则见 `AGENTS.md` v3.0（对等 Agent 动态认领，owner 填 agent_id）。

---

## 任务状态说明

| 状态 | 含义 |
|------|------|
| `todo` | 待认领 |
| `doing` | 进行中（认领后置为此状态） |
| `blocked` | 被阻塞（需说明原因） |
| `done` | 已完成 |
| `review` | 待 Human/对方 review |

---

## 当前任务

| ID | 任务 | 状态 | 所有者 | 优先级 | 依赖 | 备注 |
|----|------|------|--------|--------|------|------|
| T-001 | 搭建协作基础设施（AGENTS/CONVENTIONS/TASKS/README） | done | trae | 高 | — | 已完成 |
| T-002 | 初始化 Git 仓库并提交初始文件 | done | trae | 高 | T-001 | 已完成；Git 路径 `E:\Git\bin\git.exe`；remote `github.com/zevensommer-creator/llos` |
| T-003 | 制定 LLOS 完整第一代产品工程书 | done | trae | 高 | — | 2026-08-15 Human 终审通过（"开始吧"），设计阶段关闭 |
| T-004 | 定义 DLC 市场分类与发现机制 | todo | 待认领 | 中 | T-014 | 由 BUILD_PLAN P4 覆盖；借鉴 Steam Workshop |
| T-005 | 设计账户体系（多用户类型：教师/学生/自由学习者） | todo | 待认领 | 中 | T-014 | 由 BUILD_PLAN P4 覆盖；能力点模型见 product_spec §2 |
| T-006 | 补齐协作环境（目录结构/.gitignore/docs 归档/远程备份） | done | workbuddy | 高 | T-002 | 经 Human 批准执行 |
| T-007 | 工作空间整理：导出/暂存文件夹、历史归档与废稿分离、目录结构对齐 | done | trae | 中 | T-003 | 经 Human 指示执行；废稿与归档均附 README 注明 |
| T-008 | 架构基线 v0.2.0 破坏性升级 | done | trae | 高 | T-003 | 会话模式/三层就绪门/证据中心学习闭环/ADR-010~012；依据两份 Human 意见文档 |
| T-009 | 契约全量升至 v0.2.0 | done | trae | 高 | T-008 | 6 份旧 schema 修订 + 9 份新增 + learning-event-registry.json（闭合注册表） |
| T-010 | UI-0 规格冻结（客户端表面） | done | trae | 高 | T-003 | frontend/docs 五件套 + ADR-CLIENT-SURFACES + ADR-FRONTEND-STACK；Figma 文件本体未建（FIGMA_PENDING）；§13 八项真机决策待 Human |
| T-011 | 产品/计划/协议文档同步更新 | done | trae | 高 | T-008/009/010 | product_spec v0.6 + BUILD_PLAN v1.1（P0.5 + 主线 C）+ AGENTS v3.0（动态认领）+ README |
| T-012 | 契约 fixtures 核心子集 | done | trae | 中 | T-009 | tests/contracts/fixtures/：5 类 schema 正例 + 红线反例；全量扩至 P1 |
| T-013 | GitHub 推送留档（本轮全部变更） | doing | trae | 高 | T-008~T-012 | 推送完成后关闭 |
| T-014 | P1：契约代码化管线 | todo | 待认领 | 高 | T-013 | 15 schema + 注册表 → 类型/校验代码 + fixtures harness（BUILD_PLAN P1） |
| T-015 | UI-1：前端工程骨架 | todo | 待认领 | 高 | T-013 | pnpm workspace + Expo + React Web + tokens + CI；可与 T-014 并行（BUILD_PLAN 主线 C） |

---

## 任务认领流程

1. 找到一个 `todo` 状态、且不在 `blocked` 的任务。
2. 在 `current_tasks/` 创建锁文件（格式见 `AGENTS.md` 第 5 节，含 `touched_paths`）。
3. 将本表该任务的"状态"改为 `doing`、"所有者"填自己的 agent_id。
4. 开始工作。
5. 完成后：删除锁文件，将状态改为 `done`，推进下一步。

---

## 已完成任务

| ID | 任务 | 完成时间 | 完成者 |
|----|------|---------|--------|
| T-001 | 搭建协作基础设施 | 2026-08-09 | trae |
| T-002 | 初始化 Git 仓库 | 2026-08-09 | trae |
| T-003 | 第一代产品工程书（设计阶段） | 2026-08-15 | trae（Human 终审） |
| T-006 | 补齐协作环境 | 2026-08-09 | workbuddy |
| T-007 | 工作空间整理 | 2026-08-15 | trae |
| T-008 | 架构基线 v0.2.0 | 2026-08-15 | trae |
| T-009 | 契约 v0.2.0 全量升级 | 2026-08-15 | trae |
| T-010 | UI-0 规格冻结 | 2026-08-15 | trae |
| T-011 | 产品/计划/协议文档同步 | 2026-08-15 | trae |
| T-012 | 契约 fixtures 核心子集 | 2026-08-15 | trae |

---

## 变更记录

| 时间 | 操作者 | 修改内容 |
|------|--------|---------|
| 2026-08-09 | TRAE | 初始化任务看板 |
| 2026-08-09 | WorkBuddy | 登记并完成 T-006（环境补齐，经 Human 批准） |
| 2026-08-15 | TRAE | T-007 完成：新建 导出/ 与 暂存/；删除旧 src/，建模块目录；.gitignore 增加 导出/ |
| 2026-08-15 | TRAE | T-003 转 review：设计阶段完成，待 Human 全套审核 |
| 2026-08-15 | TRAE | Human 终审通过（"开始吧"）：T-003 转 done；登记 T-008~T-015；T-004/T-005 改为待认领（BUILD_PLAN P4 覆盖）；owner 改用小写 agent_id（AGENTS v3.0） |

---

*任务看板 · 最后更新：2026-08-15 · 维护者：所有 Agent + Human*
