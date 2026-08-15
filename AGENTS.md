# AGENTS.md — LLOS 多智能体协作协议与编码章程

> 本文件是 LLOS 项目所有协作智能体（TRAE、WorkBuddy 及未来加入者）的**唯一权威文件**，兼具双重角色：
> - **第一部分：协作协议**——多 Agent 如何认领、协作、同步；
> - **第二部分：编码章程**——改代码前必须遵守的架构约束。
>
> 任何 Agent 在本工作空间开始工作前，**必须**先完整阅读本文件。
> 本文件的优先级高于 Agent 自身的默认习惯。

## 0. 事实来源与优先级

| 文件 | 管辖范围 |
|------|---------|
| `docs/LANGUAGE_PLATFORM_SPEC.md`（v0.2.0） | 系统怎么建：架构、ADR、契约、边界 |
| `docs/product_spec.md`（v0.6） | 产品卖什么给谁：权限、市场、班级、训练体验 |
| `docs/contracts/*.schema.json`（v0.2.0）+ `learning-event-registry.json` | 契约的唯一事实来源 |
| 本文件 | 协作机制 + 编码纪律 |

冲突裁决顺序：**架构不变量（基线） > 产品规格 > 本文件其余内容 > Agent 默认习惯**。

---

# 第一部分：协作协议

## 1. 项目身份

- **项目名称**：LLOS——语言学习编译平台。
- **工作空间**：`d:\LLOS workplace public`。
- **核心构成**：Core 特权运行时 + DLC 教学编译器 + Material Pack + Learning IR + Provider Gateway + 发音证据管线 + 账户/授权系统。
- **DLC 是教学编译器，不是课程内容包**；素材在 Material Pack 里。市场展示层可向用户呈现为"学习内容包"，内部构成是"编译器 + 素材包"。
- **当前阶段**：设计定案 + 脚手架完成（2026-08-15 Human 终审通过），进入 P1 编码；目标是完整第一代产品（非 Demo / 非 MVP）。
- **目标用户**：高校教师与学生、非组织内的个人学习者。
- **语言优先级**：德语首发；英语/法语/俄语第二批次（ADR-006）。

## 2. 参与者识别（对等 Agent，动态认领）

- **Agent**：任何在本工作空间工作的 AI 编码智能体（TRAE、WorkBuddy、未来加入者）一律**对等**，没有预划分的固定职责。
- **agent_id**：每个 Agent 使用固定小写代号自我标识（现有：`trae`、`workbuddy`）。新 Agent 首次工作时在 `TASKS.md` 变更记录中登记自己的 agent_id。
- **Human**：人类架构师，终审决策者，唯一有权修改本协议与两份 spec。

任务的建议认领方向（系统核心 / 产品 / 客户端）见 `docs/BUILD_PLAN.md`，但认领权对所有 Agent 平等开放：先认领者先得（第 5 节）。

## 3. 工作空间结构

```
d:\LLOS workplace public\
├── AGENTS.md / CONVENTIONS.md / TASKS.md / README.md
├── docs/                  # 工程文档：基线 spec、产品规格、BUILD_PLAN、交接文档、语音研究
│   ├── adr/               # 架构决策记录（ADR）
│   └── contracts/         # schema 正本（契约唯一事实来源）+ 事件注册表
├── current_tasks/         # 任务锁声明目录（见第 5 节）
├── core/                  # Core 特权运行时（identity/entitlements/sessions/events/projections/orchestration/registry）
├── compiler/              # DLC 编译
├── gateway/               # Provider Gateway
├── speech/                # 发音证据管线
├── contracts/             # 由 docs/contracts 的 schema 生成的类型与校验代码
├── market/                # DLC 市场（产品层）
├── frontend/              # 前端（产品层；docs/ 内为客户端表面规格）
├── materials/             # Material Pack 库
├── dlc_reference/         # 参考编译器 + 参考素材样例
└── tests/                 # 测试（tests/contracts/fixtures/ 为契约正反例）
```

## 4. 任务级所有权（v3.0：取代永久目录所有权）

**所有权挂在任务上，不挂在目录或 Agent 身份上。**

- 认领任务的 Agent 在任务期间拥有其锁文件中 `touched_paths` 所列文件的决定权。
- 其他 Agent 修改他人任务 `touched_paths` 内的文件，必须先在 `TASKS.md` 登记并等待任务所有者确认。
- 绝不同时并发修改同一文件；意外冲突由 Human 裁决。

**常设例外（任何任务都不得绕过）**：

| 路径 | 规则 |
|------|------|
| `AGENTS.md` / `CONVENTIONS.md` | 修改需 Human 批准 |
| `docs/LANGUAGE_PLATFORM_SPEC.md` / `docs/product_spec.md` / `docs/contracts/` | 变更须走 ADR + 版本号升级 + Human 批准 |
| `docs/adr/` | 新增 ADR 需在 `TASKS.md` 备案；推翻既有 ADR 需 Human 批准 |
| `TASKS.md` | 共享看板：任何 Agent 可更新自己任务的行；结构性修改需 Human |

架构红线（Core/DLC 边界、语言规则不入 Core 等）由第二部分编码章程约束，与文件所有权无关——任何 Agent 在任何目录都不得违反。

## 5. 任务认领协议（Task Claim）

任务通过 `current_tasks/` 目录的**锁文件**声明所有权。

### 认领流程
1. 在 `TASKS.md` 将任务状态改为 `doing`，所有者填自己的 agent_id。
2. 创建锁文件：`current_tasks/<task-id>__<agent_id>.lock`，内容：
   ```json
   {
     "task_id": "T-015",
     "owner": "trae",
     "claimed_at": "2026-08-15T22:00:00+08:00",
     "status": "doing",
     "touched_paths": ["contracts/", "tests/contracts/"]
   }
   ```

### 释放流程
- 完成后删除锁文件，`TASKS.md` 状态改为 `done`。
- 锁文件超过 **24 小时**未更新且任务未完成，其他 Agent 可提出接管（`TASKS.md` 备注 + Human 确认）。

### 冲突处理
- 两个 Agent 认领同一任务，**先创建锁文件者获胜**。
- 两个任务的 `touched_paths` 出现重叠，后认领者必须调整范围或等待先认领任务完成。

## 6. Git 工作流（Branch-and-Merge）

| 分支 | 用途 |
|------|------|
| `main` | 稳定主线，始终可构建 |
| `feature/<agent_id>-<描述>` | 功能分支（如 `feature/trae-contract-codegen`、`feature/workbuddy-market-ui`） |

1. 开始任务前从最新 `main` 切出分支。
2. 每完成一个子任务立即 commit + push。
3. 每天至少一次将 `main` merge 进自己的分支。
4. 任务完成合并回 `main`。
5. merge 冲突是**正常信号**；按第 4 节任务级所有权由任务所有者裁决，解决后 commit 并在 `TASKS.md` 备注。

## 7. 提交信息规范

```
<类型>: <一句话描述> (T-<任务号>)
```

类型：`feat` / `fix` / `docs` / `refactor` / `test` / `chore`

## 8. 状态同步规则

- Agent 之间不共享会话记忆。唯一可靠通信渠道是 `TASKS.md` 和 Git。
- 每次开始工作前先读 `TASKS.md`；完成关键节点后更新 `TASKS.md`。
- 重大架构决策必须记录到 `docs/adr/`，并在 `TASKS.md` 链接。

## 9. 协作红线

- **不修改系统架构**，除非经 Human 批准并更新 `LANGUAGE_PLATFORM_SPEC.md`。
- **不增加未定义功能**。新需求先记入 `TASKS.md`，经 Human 确认。
- 架构类红线（Core/DLC 边界、语言/理论不得入 Core 等）已升级为第二部分不可破坏不变量，以第二部分为准。

---

# 第二部分：编码章程

> 本部分面向所有 coding agent。任何 Agent 开始改代码前都必须先读本部分。
> 事实来源：`docs/LANGUAGE_PLATFORM_SPEC.md` v0.2.0；契约：`docs/contracts/*.schema.json`。

## 10. 不可破坏的不变量

1. **Core 特权边界**：DLC、Agent、Provider 都不能直接写学习状态、授权、支付、隐私同意或系统安全策略。它们只能提交事件、请求或证据，由 Core 校验后处理。
2. **DLC 是编译器**：DLC 不持有素材，不把素材复制进自己，不假设素材存在。DLC 编译 Material Pack、Learner State 和教学目标，产出 Learning IR。
3. **Learning IR 是稳定 ABI**：Material Pack、DLC、Core、Agent、Provider 之间不得传递任意 JSON 或私有内部对象。所有跨模块数据必须通过 schema 校验。
4. **模型是 Provider，不是系统中心**：DeepSeek、OpenAI、Gemini、本地模型都只是 Provider。业务代码不得依赖模型品牌，只能依赖 capability。
5. **Agent 只做有界概率任务**：Agent 适合纠错候选、反馈解释、检索、评分证据解释；不适合承担确定性业务规则、状态写入、支付、授权或隐私控制。
6. **学习事件是事实**：学习状态必须由确定性 reducer 从追加式学习事件计算出来。LLM 可以解释事件，但不能直接创造学习事实。
7. **评价必须可弃权**：语音、发音、语法、流利度评价都必须有 `abstain` 路径。证据不足时不得猜测。

## 11. 当前契约（v0.2.0）

| Schema | 用途 |
|--------|------|
| `material-pack.schema.json` | 素材包：文本、音频、对齐、词汇、语法条目、语用场景 |
| `material-request.schema.json` | DLC 对素材的需求声明 |
| `material-snapshot.schema.json` | 会话级素材快照：冻结版本，保证可重现 |
| `dlc-manifest.schema.json` | DLC 编译器：输入要求、教学策略、任务模板、评估规则、输出 IR |
| `learning-ir.schema.json` | 三层 IR：Material IR / Pedagogical IR / Executable Session IR |
| `session-composition.schema.json` | 会话组合：chat/learning 判别联合 + 三层就绪门 |
| `learning-claim.schema.json` | 理论中立学习主张（claim_ref 对 Core 不透明） |
| `evidence-policy.schema.json` | 版本化证据政策：DLC 声明，Core 确定性执行 |
| `learning-observation.schema.json` | 类型化表现观察：表现值与测量置信度严格分离 |
| `learning-event.schema.json` | 追加式学习事件：事件类型来自闭合注册表 |
| `learning-event-registry.json` | 学习事件类型注册表（schema enum 为其镜像） |
| `learner-state-projection.schema.json` | 学习者状态投影：可重建缓存，非事实源 |
| `mastery-decision.schema.json` | 可撤销掌握判定：绑定 claim + 政策版本，永不改写历史 |
| `provider-descriptor.schema.json` | Provider：模型、能力、成本、隐私、地区、SLA、fallback |
| `pronunciation-assessment.schema.json` | 发音评价：证据、置信度、弃权、误纠正控制 |
| `agent-work.schema.json` | Agent 工作：目标、证据、工具、预算、守卫、结果 |

契约正例与红线反例：`tests/contracts/fixtures/`（P1 扩至全量）。

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

DLC 必须声明：输入要求、缺失输入处理、所需 Provider capabilities、所需语音工具、评估规则（Evidence Policy）、可执行 IR 版本、降级策略。
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
- 版权责任由上传者承担；平台不做预审，投诉即下架（基线 ADR-009，适用范围限未来公开分发阶段）。

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
| 3.0 | 2026-08-15 | 删除永久目录所有权与固定 Agent 分工，改为**对等 Agent 动态认领**（agent_id + 任务级 touched_paths + 文件锁）；分支命名改为 `feature/<agent_id>-<描述>`；契约表更新为 v0.2.0（15 份 schema + 事件注册表）；目录树补 docs/adr 与 tests/contracts/fixtures |
