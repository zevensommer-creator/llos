# AGENTS.md — LLOS 多智能体协作协议与编码章程

> 本文件是 LLOS 项目所有协作智能体（TRAE、WorkBuddy 及未来加入者）的**唯一权威文件**，兼具双重角色：
> - **第一部分：协作协议**——多 Agent 如何分工、认领、同步（基线未覆盖，沿用旧协议并适配）；
> - **第二部分：编码章程**——改代码前必须遵守的架构约束（来自 v0.1.0 编码章程，冲突时以它为准）。
>
> 任何 Agent 在本工作空间开始工作前，**必须**先完整阅读本文件。
> 本文件的优先级高于 Agent 自身的默认习惯。

## 0. 事实来源与优先级

| 文件 | 管辖范围 |
|------|---------|
| `docs/LANGUAGE_PLATFORM_SPEC.md`（v0.1.1） | 系统怎么建：架构、ADR、契约、边界 |
| `docs/product_spec.md` | 产品卖什么给谁：权限、市场、班级、训练体验 |
| `docs/contracts/*.schema.json` | v0.1 契约的唯一事实来源 |
| 本文件 | 协作机制 + 编码纪律 |

冲突裁决顺序：**架构不变量（基线） > 产品规格 > 本文件其余内容 > Agent 默认习惯**。

---

# 第一部分：协作协议

## 1. 项目身份

- **项目名称**：LLOS——语言学习编译平台。
- **工作空间**：`d:\LLOS workplace public`。
- **核心构成**：Core 特权运行时 + DLC 教学编译器 + Material Pack + Learning IR + Provider Gateway + 发音证据管线 + 账户/授权系统。
- **DLC 是教学编译器，不是课程内容包**；素材在 Material Pack 里。市场展示层可向用户呈现为"学习内容包"，内部构成是"编译器 + 素材包"。
- **当前阶段**：完整第一代产品（非 Demo / 非 MVP）。
- **目标用户**：高校教师与学生、非组织内的个人学习者。
- **语言优先级**：德语首发；英语/法语/俄语第二批次（ADR-006）。

## 2. 参与者识别

| 代号 | Agent | 职责 |
|------|-------|------|
| **TRAE** | 本工作空间驻留的 AI 编码智能体 | Core 特权运行时、编译器、Gateway、语音管线、契约、docs |
| **WorkBuddy** | 腾讯 HY3 模型驱动的智能体 | DLC 市场、前端界面、测试、产品文档 |
| **Human** | 人类架构师 | 终审决策者，唯一有权修改本协议与规范 |

> 每个 Agent 开始工作时，应在 `TASKS.md` 登记自己的代号与当前任务。

## 3. 工作空间结构（适配基线模块边界）

```
d:\LLOS workplace public\
├── AGENTS.md / CONVENTIONS.md / TASKS.md / README.md
├── docs/                  # 工程文档：spec、产品规格、决策档案、语音研究
│   └── contracts/         # 六份 schema（契约唯一事实来源）
├── current_tasks/         # 任务锁声明目录（见第 5 节）
├── core/                  # Core 特权运行时（identity/entitlements/sessions/events/projections/orchestration/registry）
├── compiler/              # DLC 编译
├── gateway/               # Provider Gateway
├── speech/                # 发音证据管线
├── contracts/             # 由 docs/contracts 的 schema 生成的类型与校验代码
├── market/                # DLC 市场（产品层）
├── frontend/              # 前端界面（产品层）
├── materials/             # Material Pack 库
├── dlc_reference/         # 参考编译器 + 参考素材样例
└── tests/                 # 测试
```

> 适配说明：旧结构的 `src/` 前缀取消，采用基线的顶层模块布局；`market/`、`frontend/` 为基线未覆盖的产品层模块，沿用旧协议保留。

## 4. 文件所有权（Ownership，按新布局重映射）

| 路径 | 所有者 | 说明 |
|------|--------|------|
| `AGENTS.md` / `CONVENTIONS.md` / `TASKS.md` | Human | 改前需 Human 批准 |
| `docs/` | TRAE | 含 `docs/contracts/` 的 schema 正本；契约变更须走 ADR + schema 版本号升级 + Human 批准 |
| `core/` | TRAE | Core 特权运行时 |
| `compiler/` | TRAE | DLC 编译 |
| `gateway/` | TRAE | Provider Gateway |
| `speech/` | TRAE | 发音证据管线 |
| `contracts/` | TRAE | 生成代码，随 schema 变更 |
| `market/` | WorkBuddy | DLC 市场（产品层） |
| `frontend/` | WorkBuddy | 前端界面（产品层） |
| `materials/` / `dlc_reference/` | TRAE | 参考编译器与素材样例 |
| `tests/` | WorkBuddy | 测试套件统筹；各模块所有者提交改动时附带的契约测试也落入 `tests/` |

**规则**：
- Agent A 想修改 Agent B 拥有的文件，**必须**先在 `TASKS.md` 登记并等待 B 确认，或通过 Git 提交让 Human/对方 review。
- 绝不同时并发修改同一文件。冲突由文件所有者裁决。

## 5. 任务认领协议（Task Claim）

任务通过 `current_tasks/` 目录的**锁文件**声明所有权。

### 认领流程
1. 在 `TASKS.md` 将任务状态改为 `doing`，所有者填自己代号。
2. 创建锁文件：`current_tasks/<task-id>__<owner>.lock`，内容：
   ```json
   {
     "task_id": "T-014",
     "owner": "TRAE",
     "claimed_at": "2026-08-09T10:00:00+08:00",
     "status": "doing"
   }
   ```

### 释放流程
- 完成后删除锁文件，`TASKS.md` 状态改为 `done`。
- 锁文件超过 **24 小时**未更新且任务未完成，其他 Agent 可提出接管（`TASKS.md` 备注 + Human 确认）。

### 冲突处理
- 两个 Agent 认领同一任务，**先创建锁文件者获胜**。

## 6. Git 工作流（Branch-and-Merge）

| 分支 | 用途 |
|------|------|
| `main` | 稳定主线，始终可构建 |
| `feature/trae-<描述>` | TRAE 的功能分支 |
| `feature/workbuddy-<描述>` | WorkBuddy 的功能分支 |

1. 开始任务前从最新 `main` 切出分支。
2. 每完成一个子任务立即 commit + push。
3. 每天至少一次将 `main` merge 进自己的分支。
4. 任务完成合并回 `main`。
5. merge 冲突是**正常信号**；按第 4 节所有权表由文件所有者裁决，解决后 commit 并在 `TASKS.md` 备注。

## 7. 提交信息规范

```
<类型>: <一句话描述> (T-<任务号>)
```

类型：`feat` / `fix` / `docs` / `refactor` / `test` / `chore`

## 8. 状态同步规则

- Agent 之间不共享会话记忆。唯一可靠通信渠道是 `TASKS.md` 和 Git。
- 每次开始工作前先读 `TASKS.md`；完成关键节点后更新 `TASKS.md`。
- 重大架构决策必须记录到 `docs/`（走 ADR），并在 `TASKS.md` 链接。

## 9. 协作红线（基线未覆盖的协作类约束，沿用旧协议）

- **不修改系统架构**，除非经 Human 批准并更新 `LANGUAGE_PLATFORM_SPEC.md`。
- **不增加未定义功能**。新需求先记入 `TASKS.md`，经 Human 确认。
- 架构类红线（Core/DLC 边界、语言/理论不得入 Core 等）已升级为第二部分不可破坏不变量，以第二部分为准。

---

# 第二部分：编码章程

> 本部分面向 coding agent。任何 Agent 开始改代码前都必须先读本部分。
> 事实来源：`docs/LANGUAGE_PLATFORM_SPEC.md` v0.1.1；契约：`docs/contracts/*.schema.json`。

## 10. 不可破坏的不变量

1. **Core 特权边界**：DLC、Agent、Provider 都不能直接写学习状态、授权、支付、隐私同意或系统安全策略。它们只能提交事件、请求或证据，由 Core 校验后处理。
2. **DLC 是编译器**：DLC 不持有素材，不把素材复制进自己，不假设素材存在。DLC 编译 Material Pack、Learner State 和教学目标，产出 Learning IR。
3. **Learning IR 是稳定 ABI**：Material Pack、DLC、Core、Agent、Provider 之间不得传递任意 JSON 或私有内部对象。所有跨模块数据必须通过 schema 校验。
4. **模型是 Provider，不是系统中心**：DeepSeek、OpenAI、Gemini、本地模型都只是 Provider。业务代码不得依赖模型品牌，只能依赖 capability。
5. **Agent 只做有界概率任务**：Agent 适合纠错候选、反馈解释、检索、评分证据解释；不适合承担确定性业务规则、状态写入、支付、授权或隐私控制。
6. **学习事件是事实**：学习状态必须由确定性 reducer 从追加式学习事件计算出来。LLM 可以解释事件，但不能直接创造学习事实。
7. **评价必须可弃权**：语音、发音、语法、流利度评价都必须有 `abstain` 路径。证据不足时不得猜测。

## 11. 当前契约

| Schema | 用途 |
|--------|------|
| `material-pack.schema.json` | 素材包：文本、音频、对齐、词汇、语法条目、语用场景 |
| `dlc-manifest.schema.json` | DLC 编译器：输入要求、教学策略、任务模板、评估规则、输出 IR |
| `learning-ir.schema.json` | 三层 IR：Material IR / Pedagogical IR / Executable Session IR |
| `provider-descriptor.schema.json` | Provider：模型、能力、成本、隐私、地区、SLA、fallback |
| `pronunciation-assessment.schema.json` | 发音评价：证据、置信度、弃权、误纠正控制 |
| `agent-work.schema.json` | Agent 工作：目标、证据、工具、预算、守卫、结果 |

## 12. 模块边界

见第 3 节目录树。关键约束：
- `core/` 是唯一可写学习事件、授权、订阅、隐私同意和系统策略的地方。
- `compiler/` 不得直接访问学习者私有数据，除非 Core 提供已授权输入。
- `gateway/` 是唯一调用外部模型的地方。
- `speech/` 只输出证据和置信度，不输出最终教学事实。
- `market/`、`frontend/` 不得绕过 Core 直接操作学习状态或授权。

## 13. DLC 编译流程

```text
Material Pack
  ↓ material.validate
Validated Material
  ↓ Learner State + Goal + Entitlements
DLC Compiler
  ↓ pedagogical.plan
Pedagogical IR
  ↓ executable.lower
Executable Session IR
  ↓ Core Runtime
Task / Feedback / Evidence / Learning Events
```

DLC 必须声明：输入要求、缺失输入处理、所需 Provider capabilities、所需语音工具、评估规则、可执行 IR 版本、降级策略。
DLC 不得：嵌入素材、直接调用模型、直接写学习状态、绕过 schema、假设某种语言是唯一语言。

## 14. Material Pack 规则

Material Pack 可以包含：文本、句子、对话、音频、音素/词/句子对齐、词汇、语法条目、语用场景、难度标签、许可证、来源。
Material Pack 不得包含：教学顺序、训练策略、评分策略、学习者数据。
Material Pack 必须可校验、可版本化、可替换。

## 15. Provider Gateway 规则

所有模型调用必须经过 `gateway/`。Provider 必须声明：capability、输入输出 schema、成本、延迟、隐私级别、地区可用性、fallback。
业务代码只能请求 capability，例如：
- `grammar.feedback`
- `sentence.generation`
- `dialogue.partner`
- `error.explanation`
- `material.generation`

禁止在业务代码中出现具体模型品牌。测试必须可用 Fake Provider 替代真实模型。

## 16. 德语发音首发边界

首版重点：朗读/跟读（text-dependent），其次受约束表达。自由表达只给保守的可懂度/流利度证据。
必须覆盖的德语发音问题：长短元音、前圆唇元音、ich-Laut/ach-Laut、词尾清化、元音化、可接受变体。
基线 9.2–9.6 节的音系学细节、数据轨划分与上线门槛为强制要求，此处不重复。

## 17. Agent 执行流程

每个 coding agent 必须按以下流程工作：
1. 找到事实来源（spec + schema）。
2. 复述任务边界。
3. 检查是否触碰 Core 特权、契约、隐私或支付。
4. 给出最小实现计划。
5. 先写契约测试或 golden test。
6. 做最小改动。
7. 运行测试和 schema 校验。
8. 按第 22 节模板交付。

## 18. 完成定义

任务只有在满足以下条件时才算完成：
- schema 校验通过；
- 有契约测试或 golden test；
- 错误、降级和弃权路径有测试；
- Provider 可被 Fake Provider 替代；
- 没有把语言规则写进 Core；
- 没有把素材写进 DLC；
- 没有让 Agent 或 Provider 直接写学习状态；
- 没有引入未声明的任意 JSON 接口；
- 文档说明接口变化和兼容性；
- 不能完成时明确说 blocked，并说明缺什么。

## 19. 测试矩阵

必须覆盖：
1. schema 校验测试；
2. Material Pack 校验测试；
3. DLC 编译 golden test；
4. Learning IR 转换测试；
5. 学习事件 reducer 测试；
6. Provider Gateway fake 测试；
7. 发音证据管线测试；
8. 弃权/降级测试。

禁止只用 happy path 能跑作为验收。

## 20. 安全、隐私和许可证

- 音频和学习记录是个人数据。
- 所有外部调用必须声明隐私级别。
- 未成年人数据必须默认更严格。
- 素材必须有许可证声明字段，由上传者填写。
- 版权责任由上传者承担；平台不做预审，投诉即下架（基线 ADR-009）。

## 21. 禁止模式

1. 不要为了快而跳过 schema。
2. 不要传递未声明的字典或任意 JSON。
3. 不要让 LLM 直接决定学习状态。
4. 不要让 Agent 直接调用外部模型。
5. 不要在 Core 外写学习事件。
6. 不要把素材复制进 DLC。
7. 不要让 DLC 假设某个 Material Pack 一定存在。
8. 不要把发音原始分数直接展示给用户。
9. 不要在证据不足时强行评分。
10. 不要用 Whisper 判断发音质量。
11. 不要用 Piper 音频作为母语教师标准。
12. 不要用 Agent 包装纯确定性转换函数。

## 22. 交付模板

每次交付必须包含：
1. 目标；
2. 边界；
3. 事实来源；
4. 改动；
5. 验证；
6. 兼容性；
7. 风险；
8. 下一步。

如果任务不能完成，必须返回：

```text
status: blocked / partial / failed
reason:
missing:
proposed_next_step:
```

---

# 第三部分：协议更新

- 本协议只能由 Human 修改。
- Agent 发现协议缺陷，在 `TASKS.md` 提出建议，由 Human 决定。
- 修订后版本号递增，并记录变更历史。

## 变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-08-09 | 初版协作协议 |
| 2.0 | 2026-08-15 | 合并编码章程；DLC 定义升级为编译器；目录结构与所有权按基线重映射；交付模板升级为 8 项 |
| 2.1 | 2026-08-15 | §20 许可证条款调整为"上传者声明责任制"（基线 ADR-009） |
