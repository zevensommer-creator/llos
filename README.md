# LLOS — 语言学习编译平台

**Language Learning Compilation Platform**：一个可商用、可扩展的语言学习平台。DLC 是教学编译器，素材在 Material Pack 里，Core 特权运行时把两者编译成 Learning IR 并执行训练。

## 核心理念

- **DLC 是编译器，不是课程内容包**：素材回答"学什么"，DLC 回答"怎么教"。
- **LLOS 不是聊天机器人**，是训练系统：AI 执行由语言学理论设计的训练流程。
- **差异化竞争力**：DLC + 语言学理论 + 训练算法，而非 AI 本身。
- **德语首发**；英语/法语/俄语第二批次。

## 目标用户

- 高校语言教师与学生
- 非组织内的个人学习者（自由学习者）

## 关键文档（阅读顺序）

| 文档 | 内容 |
|------|------|
| [`AGENTS.md`](AGENTS.md) | 唯一权威文件：多 Agent 协作协议 + 编码章程（开始任何工作前必读） |
| [`docs/LANGUAGE_PLATFORM_SPEC.md`](docs/LANGUAGE_PLATFORM_SPEC.md) | 架构基线 v0.1.2：系统怎么建（ADR、契约、边界） |
| [`docs/product_spec.md`](docs/product_spec.md) | 产品规格 v0.5：产品卖什么给谁（权限/市场/班级/Studio/训练） |
| [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) | 第一代实施分步计划 P0-P9（编码前最后准备） |
| [`docs/contracts/`](docs/contracts/) | 六份 schema（v0.1 契约唯一事实来源） |
| [`CONVENTIONS.md`](CONVENTIONS.md) | 代码与文档规范 |
| [`TASKS.md`](TASKS.md) | 任务看板（协作真相源） |

## 目录结构

```
├── AGENTS.md / CONVENTIONS.md / TASKS.md / README.md
├── docs/              # 工程文档 + docs/contracts/（schema 正本）
├── current_tasks/     # 任务锁目录
├── core/              # Core 特权运行时
├── compiler/          # DLC 编译
├── gateway/           # Provider Gateway
├── speech/            # 发音证据管线
├── contracts/         # schema 生成的类型与校验代码
├── market/            # DLC 市场（产品层）
├── frontend/          # 前端界面（产品层）
├── materials/         # Material Pack 库
├── dlc_reference/     # 参考编译器 + 参考素材样例
└── tests/             # 测试
```

## 当前状态

- 设计阶段完成：架构基线 + 产品规格 + 实施分步计划已定案，待 Human 审核后开始编码。
- 协作方：TRAE（系统核心）、WorkBuddy（产品层）、Human（终审）。
