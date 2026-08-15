# LLOS 第一代实施分步计划（BUILD_PLAN）

> **目的**：编码开始前的最后准备文档。把已定案的产品与架构设计拆解为可执行步骤，明确每步的目标、交付物、验收标准、负责者与依赖。
> **范围**：仅第一代产品（第二批次语言与平台算力计费不在范围内，见 P9）。
> **版本**：1.2 · **日期**：2026-08-15 · **维护**：Human + TRAE
> **上游文档**：[`LANGUAGE_PLATFORM_SPEC.md`](./LANGUAGE_PLATFORM_SPEC.md)（怎么建）· [`product_spec.md`](./product_spec.md)（建什么）· `../AGENTS.md`（建的纪律）· [`LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md`](./LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md)（客户端线）
>
> **v1.1 变更**：新增 P0.5 契约冻结（契约已全量升至 v0.2.0：15 份 schema + 事件注册表）；新增主线 C 客户端线（UI-0~UI-6）；前端路径定为"电脑 Web 先行交付、移动端以真机为验收、PWA 仅为备用入口"；分工由固定指派改为动态认领（AGENTS.md v3.0）。
> **v1.2 变更**：2026-08-15 Human 复审：总体通过，契约冻结批准生效；新增 **P0.5.1 契约一致性 hotfix**（material-pack/session-composition/material-snapshot 升 0.2.1，ADR-013），状态词汇两层统一，过期任务锁清理。

---

## 0. 剩余小待决项的默认决策（待 Human 一并确认）

| 事项 | 默认决策 | 理由 |
|------|---------|------|
| 间隔重复算法 | **FSRS**（开源 py-fsrs/ts-fsrs 实现），数据冷启动期回退 SM-2 | 比 SM-2 现代，Anki 已采用，天然支持复习时间表预测 |
| 学习数据归属 | 数据归学习者；可导出、可删除；教师仅可见班级投影；音频默认处理后不留存（留存需单独同意） | 与基线隐私框架一致 |
| 强制下架的既有用户 | 保留访问权，不退款（第一代简化） | 买断用户不应失权；退款引入财务复杂度 |
| 平台算力计费 | 推迟到 P6，BYOK 先行 | 不阻塞起步编码 |

> 已定案（不再待决）：四条用户旅程已在 `product_spec.md` v0.6 §3.3 冻结；移动端付费获取（IAP）商店合规列入 Human 决策清单（客户端交接文档 §13）。

---

## 1. 总体策略

- **闭环优先，再铺广度**：P2 完成"单机学习闭环"，此后所有步骤都是该闭环的扩展。
- **三条主线**：
  - 主线 A（系统核心）：契约 → Core 事件 → 编译器 → 训练 → 语音；
  - 主线 B（产品层）：账户 → 市场 → 班级 → Studio → 计费；
  - 主线 C（客户端线）：UI-0 规格 → UI-1 骨架 → UI-2 Mock 旅程 → UI-3 真机 → UI-4 契约接入 → UI-5 电脑工作台 → UI-6 质量门。
- **动态认领**：阶段负责者不再固定指派给特定 Agent，按 `AGENTS.md` v3.0 在 `TASKS.md` 动态认领；下文"负责"列为建议认领方向。
- **非代码线提前启动**：支付资质、素材整理、GitHub 留档从 P0 起与编码并行。

---

## 2. 分步详情

### P0 准备期（非代码并行线，立即启动）

| 事项 | 负责 | 产出 |
|------|------|------|
| 支付资质申请（微信/支付宝商户） | Human | 商户号（P8 前置，周期长，最早启动） |
| GitHub 仓库留档 + 配置 remote | Human | 远程仓库可 push |
| FSI 德语素材整理 | Human + TRAE | 素材清单 + 公有领域确认 |
| DeepSeek Harness 多 Provider 接口调研 | TRAE | 可复用性结论（服务 P6 BYOK） |

### P0.5 契约冻结（v0.2.0，随本计划一并送审）

- **目标**：契约定型并冻结，作为一切代码的 ABI 基线。
- **已完成（2026-08-15）**：
  - 6 份旧 schema 升至 0.2.0：清除任意 JSON 逃逸口、固定语言学枚举改为 claim/policy 引用、扩展字段统一 ExtensionEnvelope；
  - 新增 9 份 schema：session-composition、learning-claim、evidence-policy、learning-observation、learning-event、learner-state-projection、mastery-decision、material-request、material-snapshot；
  - 学习事件类型闭合注册表 `learning-event-registry.json`（schema enum 为其镜像）；
  - 核心子集 fixtures（正例 + 红线反例）：`tests/contracts/fixtures/`。
- **剩余**：~~Human 冻结批准~~（已批准，2026-08-15 复审通过，随 P0.5.1 落实生效）；fixtures 扩至全量（P1 内完成）。
- **冻结后规则**：schema 变更走 ADR + schema 版本号升级 + Human 批准；`contracts/` 生成代码只随 schema 变更。

### P0.5.1 契约一致性 hotfix（ADR-013，已完成 2026-08-15）

- **来源**：Human 复审意见（三个严重 + 术语 + 文档状态）。
- **修复**：
  1. `material-pack` 0.2.1：新增必填 `distribution_scope`（internal/public）；`license` 改为 public 分发时必填（包级 + 资产级），内部第一代不再被版权字段阻塞（ADR-012 落实）；
  2. `session-composition` 0.2.1：六个就绪门全部 `const: true`——未就绪组合无法通过 schema，只能以类型化错误拒绝创建（三层就绪门契约强制）；
  3. `material-snapshot` 0.2.1：`source=generated_random/generated_instructed` 必须携带 `generation`（Provider/模型版本/模板版本），`generated_random` 还必须携带 `random_seed`（生成溯源落地）；
  4. 状态词汇两层统一：判定态（MasteryDecision）与证据态（Projection）在客户端验收中分开命名，不得混用；
  5. 文档状态与任务锁同步：product_spec 待决表更新、T-003 过期锁删除。
- **验收**：fixtures 新增 5 例（readiness=false 拒绝、生成素材缺溯源拒绝、internal 无 license 通过、public 无 license 拒绝、带溯源生成快照通过），全部 18 例通过校验。

### P1 契约代码化与系统骨架（对应基线 Phase 1）

- **前置**：P0.5 冻结批准。
- **目标**：schema 变代码，Core 事件与 Gateway 骨架立起来。
- **交付**：
  - `contracts/` 生成管线（15 份 schema + 注册表 → 类型 + 校验代码）；
  - 契约校验 harness：fixtures 全量跑通（valid 通过 / invalid 拒绝）；
  - `core/events`：追加式事件存储 + 确定性 reducer + 投影框架；
  - `core/identity`、`core/entitlements` 骨架；
  - `gateway/`：Provider descriptor 注册 + Fake Provider。
- **验收**：测试矩阵第 1、5、6 项通过；每份 schema 有正例/反例校验测试。
- **负责（建议认领）**：系统核心方向。

### P2 单机学习闭环（核心里程碑）

- **目标**：一个学习者能跑通完整学习循环。
- **交付**：
  - `materials/`：FSI 德语参考素材包（公有领域）；
  - `dlc_reference/`：参考 DLC 编译器（FSI 替换 + 配价挖空 + 构式训练模式）；
  - `compiler/`：material.validate → pedagogical.plan → executable.lower；
  - 训练执行引擎（执行 DLC 声明的训练模式）；
  - FSRS 间隔重复调度器 + 学习曲线 + 薄弱点推荐 + 自适应难度。
- **验收**：golden test（参考素材包 + 参考 DLC → 预期 IR）；测试矩阵第 2、3、4 项；CLI 验证完整循环。
- **负责（建议认领）**：系统核心方向（德语教学内容 Human 主导，AI 辅助结构化）。
- **备注**：本步起收集发音校准录音样本，为 P3 备料。

### P3 发音证据管线（对应基线 Phase 2-4）

- **目标**：朗读模式发音证据闭环，保守弃权。
- **交付**：`speech/` 全链——Silero VAD → faster-whisper → MFA German 对齐 → GOP → Praat 韵律 → 德语校准器 → 结构化评价 → 弃权路径；Piper TTS Provider（仅示范朗读）。
- **验收**：测试矩阵第 7、8 项；误纠正率测试；德语专项（长短元音、前圆唇元音、ich/ach-Laut、词尾清化）有测试用例；满足基线 9.6 朗读上线门槛。
- **负责（建议认领）**：系统核心方向。
- **风险**：校准数据量不足；对策为小规模人工评分集 + 迭代校准。

### P4 产品化：账户 + 市场（免费版）

- **前置**：四条旅程已冻结（`product_spec.md` §3.3）；UI-2 Mock 旅程完成。
- **交付**：
  - `core/identity` 完整（注册/登录）+ 能力点体系 + 邀请码链；
  - `market/`：浏览/搜索/筛选（语言/评分/下载量/难度）/自由标签/评价；
  - 免费获取与授权（entitlements）；
  - `frontend/`：学生端 + 市场 UI（desktop_web 先行交付；移动端同步推进 UI-3 真机验证，PWA 仅为浏览器备用入口，不作移动验收标准）。
- **验收**：E2E——新用户注册 → 市场免费获取参考 DLC → 完成训练 → 可评价。
- **负责（建议认领）**：系统核心方向（账户/授权）+ 产品方向（市场/前端）。

### P5 班级系统

- **交付**：班级 CRUD + 邀请码进出 + DLC 分配（免费自动获得 + 付费 C 方案框架）+ 顺序与截止日期 + 通知 + 统计投影。
- **验收**：E2E——教师建班 → 生成邀请码 → 学生加入 → 分配参考 DLC → 教师查看统计。
- **负责（建议认领）**：系统核心方向（core）+ 产品方向（UI）。

### P6 Studio v1 + BYOK

- **交付**：
  - 向导模式：文字 + PDF 输入 → 摄入管线（解析 → 经 gateway 的 AI 结构化）→ 表单确认 → 试用（沙箱）→ 发布；
  - BYOK 密钥管理（gateway 统一保管 + 隐私级别声明）；
  - 版本隐形管理 + 全自动更新 + 下架规则 + 创作者告知义务。
- **验收**：E2E——非技术教师从零发布一个免费 DLC，在市场可获取、可训练。
- **负责（建议认领）**：产品方向（UI）+ 系统核心方向（摄入管线/gateway）。

### P7 Studio v2：摄入扩展与专家模式

- **交付**：PNG/OCR 摄入；专家模式（直接编辑 manifest、自定义训练模式）；模板加速器。
- **验收**：OCR 摄入测试通过；专家模式可发布自定义训练模式的 DLC。
- **负责（建议认领）**：产品方向（UI）+ 系统核心方向（OCR/管线）。

### P8 计费

- **前置**：P0 支付资质完成。
- **交付**：买断/订阅/免费码（永久/限期）；支付通道接入；班级成员免费联动；付费分配 C 方案启用。
- **验收**：支付沙箱 E2E；订单/授权路径测试；下架保留既有用户权利路径测试。
- **负责（建议认领）**：系统核心方向（core/支付）+ 产品方向（UI）。

### 主线 C：客户端线（UI-0 ~ UI-6）

> 定义来源：[`LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md`](./LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md) §10；规格见 [`frontend/docs/`](../frontend/docs/)。

| 阶段 | 内容 | 与主线 A/B 的关系 |
|------|------|------------------|
| UI-0 规格冻结 | frontend/docs 五件套 + 2 份 ADR（平台矩阵/页面清单/Figma 结构/ViewModel/权限公式） | **已完成（2026-08-15）** |
| UI-1 工程骨架 | pnpm workspace + Expo + React Web + shared packages + tokens + CI，仅 App Shell/Mock adapter | 可与 P1 并行（不依赖后端） |
| UI-2 Mock 四旅程 | 聊天/学习/教师助手/电脑工作台，每条覆盖正常/空白/加载/权限不足/离线/可恢复/不可恢复失败 | 依赖 UI-1；先于 P4 |
| UI-3 移动真机验证 | 真机录音/中断/离线快照/推送/麦克风授权/切后台（浏览器与模拟器不算数） | 依赖 UI-2；可与 P2-P4 并行 |
| UI-4 接入契约 v0.2 | 生成类型替换临时类型、真实 API adapter 替换 Mock；不一致回 ADR/schema | 依赖 P1 契约类型生成 |
| UI-5 电脑完整工作台 | 班级/Studio/素材/创作者验证/市场/统计导出/支付框架/审核系统管理 | 对齐 P4-P7 |
| UI-6 质量门 | iOS/Android 内部构建、四旅程 E2E、可访问性、弱网离线、越权、视觉回归、性能预算、Human 准入报告 | 发布前置；含 P8 |

### P9（第一代范围外，仅存档）

第二批次语言（英/法/俄）· 平台算力计费 · 班级讨论区 · 自由表达深度评价。

---

## 3. 依赖与关键路径

```text
P0（并行线：资质/素材/留档）────────────────────────────┐（资质 → P8）
P0.5 契约冻结 → P1 → P2 → P3 → P4 → P5                  │
                      └→ P6 → P7                        │
UI-0（完成）→ UI-1 → UI-2（Mock 旅程）→ UI-3（真机）      │
                 UI-4（契约接入）← P1 类型生成            │
                 UI-5 对齐 P4–P7 → UI-6 质量门 ← P8 ←────┘
```

- **关键路径**：P0.5 → P1 → P2 → P3 → P4（契约到产品化闭环）。
- UI-1 / UI-2 不依赖后端，可与 P1 / P2 并行启动；UI-4 的前置是 P1 契约类型生成。
- P5 / P6 / P7 可在 P4 后穿插并行；P8 同时依赖支付资质与 P5。
- 桌面 Web 先行交付（P4），移动端以 UI-3 真机验收为准；不得把 PWA Demo 当作移动端成品。

---

## 4. 风险与对策（Top 5）

| 风险 | 对策 |
|------|------|
| 发音校准数据不足 | P2 起收集录音；小规模人工评分集迭代 |
| LLM 结构化输出不稳定（Studio 摄入） | 向导模式人工确认步骤 + schema 兜底 + 错误提示教学化 |
| 支付资质周期长 | P0 立即申请 |
| 多 Agent 并发冲突 | AGENTS.md v3.0 任务级所有权 + 锁文件 + Git 分支（动态认领） |
| 参考 DLC 德语内容工作量大 | Human 德语专业主导内容，AI 辅助结构化 |

---

## 5. 与基线 §15 的映射

| 本计划 | 基线 Phase |
|--------|-----------|
| P0.5 + P1 | Phase 1 协议冻结 |
| P3 | Phase 2 语音基础设施 + Phase 3 德语朗读评分 MVP + Phase 4 校准与可靠性 |
| UI-0–UI-6 | 客户端交接文档 §10（客户端表面实施阶段，ADR-CLIENT-SURFACES / ADR-FRONTEND-STACK） |
| P9 | Phase 5 受约束与开放口语（第一代仅朗读 + 部分受约束） |

---

## 6. 执行纪律

- 每一步的完成定义 = `AGENTS.md` §18；测试覆盖 = `AGENTS.md` §19。
- 每步开工前在 `TASKS.md` 登记并创建锁文件；完成后 Git 提交并更新看板。
- 架构级变更走 ADR；产品级变更走 `product_spec.md` 变更历史。
