# LLOS — Language Learning Operating System

**语言学习操作系统**：一个可扩展的语言学习平台，采用"DLC 市场 + 训练运行时 + 账户体系"架构，借鉴 Steam 平台设计。

## 核心理念

- **Core 与 DLC 分离**：核心系统只提供通用能力（用户管理、交互、AI 调用、语音、训练执行、数据记录）。具体语言、教材、教学理论全部属于 DLC。
- **LLOS 不是聊天机器人**，是训练系统：AI 执行由语言学理论设计的训练流程。
- **差异化竞争力**：DLC + 语言学理论 + 训练算法，而非 AI 本身。

## 目标用户

- 高校语言教师与学生
- 非组织内的个人学习者（自由学习者）

## 架构概览

```
用户层
  ↓
前端（学生端 / 教师端 / DLC 市场）
  ↓
API Gateway
  ↓
核心后端（DLC 运行时 / Agent 层 / 训练服务 / 评价服务 / 分析服务）
  ↓
数据层 + DLC Package
```

## 协作

本目录由多个 AI 智能体（TRAE、WorkBuddy）协同开发。协作规则见：

- [`AGENTS.md`](AGENTS.md) — 主协作协议（角色、所有权、任务认领、Git 流程）
- [`CONVENTIONS.md`](CONVENTIONS.md) — 代码与文档规范
- [`TASKS.md`](TASKS.md) — 任务看板（协作真相源）

## 目录结构

```
├── AGENTS.md          # 协作协议
├── CONVENTIONS.md     # 规范
├── TASKS.md           # 任务看板
├── docs/              # 工程书与架构文档
├── current_tasks/     # 任务锁目录
├── src/               # 源码
├── dlc_reference/     # 参考 DLC
└── tests/             # 测试
```

## 当前状态

- 协作基础设施搭建中
- 工程书待制定（完整第一代产品，非 Demo）