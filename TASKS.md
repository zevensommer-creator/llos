# TASKS.md — 任务看板（协作真相源）

> 这是所有 Agent 共享的任务看板，是协作的**核心真相源**。
> 开始工作前先读本文件；完成任务后必须更新本文件。

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
| T-001 | 搭建协作基础设施（AGENTS/CONVENTIONS/TASKS/README） | done | TRAE | 高 | — | 已完成 |
| T-002 | 初始化 Git 仓库并提交初始文件 | done | TRAE | 高 | T-001 | 已完成；Git 路径 `E:\Git\bin\git.exe` |
| T-003 | 制定 LLOS 完整第一代产品工程书 | review | TRAE | 高 | — | 设计定案：基线 v0.1.2 + 产品规格 v0.5 + BUILD_PLAN v1.0，待 Human 审核并推送 GitHub 留档后开始编码 |
| T-004 | 定义 DLC 市场分类与发现机制 | todo | WorkBuddy | 中 | T-003 | 借鉴 Steam Workshop |
| T-005 | 设计账户体系（多用户类型：教师/学生/自由学习者） | todo | TRAE | 中 | T-003 | 借鉴 Steam 账户 |
| T-006 | 补齐协作环境（目录结构/.gitignore/docs 归档/远程备份） | done | WorkBuddy | 高 | T-002 | 经 Human 批准执行 |
| T-007 | 工作空间整理：导出/暂存文件夹、历史归档与废稿分离、目录结构对齐基线 §3 | done | TRAE | 中 | T-003 | 经 Human 指示执行；废稿与归档均附 README 注明 |

---

## 任务认领流程

1. 找到一个 `todo` 状态、且不在 `blocked` 的任务。
2. 在 `current_tasks/` 创建锁文件（格式见 `AGENTS.md` 第 5 节）。
3. 将本表该任务的"状态"改为 `doing`、"所有者"填自己代号。
4. 开始工作。
5. 完成后：删除锁文件，将状态改为 `done`，推进下一步。

---

## 已完成任务

| ID | 任务 | 完成时间 | 完成者 |
|----|------|---------|--------|
| T-006 | 补齐协作环境（目录结构/.gitignore/docs 归档/远程备份） | 2026-08-09 | WorkBuddy |

---

## 变更记录

| 时间 | 操作者 | 修改内容 |
|------|--------|---------|
| 2026-08-09 | TRAE | 初始化任务看板 |
| 2026-08-09 | WorkBuddy | 登记并完成 T-006（环境补齐，经 Human 批准）；提示 T-003 状态待 Human 确认（工程书 Word 版已存在于 docs/） |
| 2026-08-15 | TRAE | T-003 转 review：设计阶段完成（架构基线 v0.1.2 含 ADR-009 版权责任制；产品规格 v0.5 含班级/Studio/生命周期/版权；BUILD_PLAN v1.0 分步 P0-P9；AGENTS.md v2.1；README 更新）。待 Human 全套审核后推送 GitHub |
| 2026-08-15 | TRAE | T-007 完成：新建 导出/（16 份审核文件副本）与 暂存/（历史归档 4 件 + 废稿 1 件，均附 README）；删除旧 src/，建 core/compiler/gateway/speech/contracts/market/frontend/materials 模块目录；.gitignore 增加 导出/ |

---

*任务看板 · 最后更新：2026-08-15 · 维护者：所有 Agent + Human*