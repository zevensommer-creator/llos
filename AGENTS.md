# AGENTS.md — LLOS 多智能体协作协议

> 本文件是 LLOS 项目所有协作智能体（TRAE、WorkBuddy 及未来加入者）的**唯一权威协作契约**。
> 任何 Agent 在本工作空间开始工作前，**必须**先完整阅读本文件。
> 本文件的优先级高于 Agent 自身的默认习惯。

---

## 1. 项目身份

- **项目名称**：LLOS（Language Learning Operating System，语言学习操作系统）
- **工作空间**：`d:\LLOS workplace public`
- **目标**：构建一个可商用、可扩展的语言学习平台，核心是"DLC（可下载学习内容）市场 + 训练运行时 + 用户账户体系"，借鉴 Steam 的架构（Core/DLC/账户/创意工坊）。
- **当前阶段**：完整第一代产品（非 Demo / 非 MVP）。
- **目标用户**：高校教师与学生、非组织内的个人学习者（自由学习者）。

---

## 2. 参与者识别

| 代号 | Agent | 职责 |
|------|-------|------|
| **TRAE** | 本工作空间驻留的 AI 编码智能体 | 负责核心架构、DLC 运行时、账户体系、协作基础设施 |
| **WorkBuddy** | 腾讯 HY3 模型驱动的智能体 | 负责 DLC 市场、前端界面、测试、文档 |
| **Human** | 人类架构师 | 终审决策者，唯一有权修改本协议 |

> 每个 Agent 在开始工作时，应在 `TASKS.md` 中登记自己的代号与当前任务。

---

## 3. 工作空间结构

```
d:\LLOS workplace public\
├── AGENTS.md              # 本协议文件（最高优先级）
├── CONVENTIONS.md         # 代码与文档规范
├── TASKS.md               # 任务看板（协作的核心真相源）
├── README.md              # 项目总览
├── docs/                  # 工程书、PRD、架构文档
├── current_tasks/         # 任务锁声明目录（见第 5 节）
├── src/                   # 源代码
├── dlc_reference/         # 参考 DLC（德语 FSI+配价+构式）
└── tests/                 # 测试
```

---

## 4. 文件所有权（Ownership）

为避免并发覆盖，每个目录/文件类型有**唯一所有者**。所有者对文件有最终决定权。

| 路径 | 所有者 | 说明 |
|------|--------|------|
| `AGENTS.md` / `CONVENTIONS.md` / `TASKS.md` | Human | 协作基础设施，改前需 Human 批准 |
| `docs/` | TRAE | 架构与工程书文档 |
| `src/core/` | TRAE | 核心运行时、DLC 解析、账户 |
| `src/market/` | WorkBuddy | DLC 市场、分类、发现 |
| `src/frontend/` | WorkBuddy | 学生端、教师端、市场界面 |
| `tests/` | WorkBuddy | 测试用例 |
| `dlc_reference/` | TRAE | 参考 DLC |

**规则**：
- Agent A 想修改 Agent B 拥有的文件，**必须**先在 `TASKS.md` 登记并等待 B 确认，或直接通过 Git 提交让 Human/对方 review。
- 绝不同时并发修改同一文件。冲突由文件所有者裁决。

---

## 5. 任务认领协议（Task Claim）

任务通过 `current_tasks/` 目录的**锁文件**声明所有权，防止两个 Agent 做同一件事。

### 认领流程
1. 在 `TASKS.md` 的任务行，将状态改为 `doing`，所有者填自己代号。
2. 在 `current_tasks/` 创建锁文件，文件名格式：
   ```
   current_tasks/<task-id>__<owner>.lock
   ```
   例如：`current_tasks/T-014__TRAE.lock`
3. 锁文件内容模板（**必须**包含）：
   ```json
   {
     "task_id": "T-014",
     "owner": "TRAE",
     "claimed_at": "2026-08-09T10:00:00+08:00",
     "status": "doing"
   }
   ```

### 释放流程
- 任务完成后，删除锁文件，在 `TASKS.md` 将状态改为 `done`。
- 若锁文件超过 **24 小时**未更新且任务未完成，其他 Agent 可提出接管（在 `TASKS.md` 备注，并经 Human 确认）。

### 冲突处理
- 如果两个 Agent 试图认领同一任务，**先创建锁文件者获胜**。
- 被抢占者应选择其他任务，或与对方协调。

---

## 6. Git 工作流（Branch-and-Merge）

这是多 Agent 协作的**中心协调机制**。

### 分支约定
| 分支 | 用途 |
|------|------|
| `main` | 稳定主线，始终可构建 |
| `feature/trae-<描述>` | TRAE 的功能分支 |
| `feature/workbuddy-<描述>` | WorkBuddy 的功能分支 |

### 流程
1. **开始任务前**：从最新的 `main` 切出分支。
   ```bash
   git checkout main && git pull
   git checkout -b feature/<owner>-<描述>
   ```
2. **每次完成一个子任务**：立即 commit + push。
   ```bash
   git add <相关文件>
   git commit -m "T-014: <一句话描述>"
   git push
   ```
3. **定期同步**：每天至少一次将 `main` merge 进自己的分支，保持最新。
4. **任务完成**：合并回 `main`，并 push。
   ```bash
   git checkout main && git merge <自己的分支>
   git push
   ```

### 冲突处理
- Git merge 冲突是**正常信号**，不代表错误。
- 冲突时，参照第 4 节的所有权表：**文件所有者**决定如何解决。
- 解决后立即 commit，通知对方（在 `TASKS.md` 备注）。

---

## 7. 提交信息规范

提交信息必须清晰描述"做了什么 + 关联任务号"。

```
<类型>: <一句话描述> (T-<任务号>)
```

- 类型：`feat`（功能）/ `fix`（修复）/ `docs`（文档）/ `refactor`（重构）/ `test`（测试）/ `chore`（杂项）
- 示例：`feat: 实现 DLC 解析器入口 (T-014)`

---

## 8. 状态同步规则

- **Agent 之间不共享会话记忆**。唯一可靠的通信渠道是 `TASKS.md` 和 Git。
- 每次开始工作前，**先读 `TASKS.md`** 了解全貌。
- 每次完成关键节点，**更新 `TASKS.md`** 让另一方可见。
- 重大架构决策必须记录到 `docs/`，并在 `TASKS.md` 链接。

---

## 9. 质量标准（协作红线）

- **不修改系统架构**，除非经 Human 批准并更新工程书。
- **不增加未定义功能**。新需求先记入 `TASKS.md`，经 Human 确认。
- **不把具体语言或教学理论硬编码进 Core**。一切语言/理论属于 DLC。
- **LLOS 不是聊天机器人**，是训练系统。任何实现必须服务教学训练流程。
- 每个模块交付时附带：实现目标、文件变化、技术选择、测试方法、已知限制。

---

## 10. 协议更新

- 本协议只能由 Human 修改。
- 任何 Agent 若发现协议缺陷，应在 `TASKS.md` 提出建议，由 Human 决定是否修订。
- 修订后版本号递增，并记录变更历史。

---

*协议版本：1.0 · 最后更新：2026-08-09 · 维护者：Human + TRAE*