# ADR-013：契约一致性 Hotfix（P0.5.1）

- **状态**：已批准（2026-08-15，Human 复审意见直接授权）
- **日期**：2026-08-15
- **影响契约**：`material-pack`、`session-composition`、`material-snapshot`（0.2.0 → 0.2.1，其余 12 份维持 0.2.0）
- **关联**：ADR-012（内部第一代暂缓版权运营）、ADR-009（公开分发阶段投诉-下架）、架构基线 §2.6/§2.7

## 背景

Human 对 P0.5 契约冻结的复审确认总体方向通过，但发现三处契约与既定决策不一致的严重漏洞与两处文档状态漂移。

## 决策

### 1. material-pack 0.2.1：分发范围与版权条件化

- 新增必填字段 `distribution_scope`，取值 `internal | public`；
- `license` 从顶层必填中移除，改为条件必填：`distribution_scope=public` 时包级与资产级（Asset 内）license 均必填；
- 落实 ADR-012：内部第一代素材不因缺少版权声明而被契约阻塞；公开分发阶段恢复 ADR-009 全流程。

### 2. session-composition 0.2.1：三层就绪门契约强制

- Readiness 六个字段全部改为 `const: true`；
- 语义：**通过 schema 校验的 LearningSession 必然六门全绿**。未就绪状态以类型化创建错误（如 `session.rejected.readiness.dlc_invalid`）表达，永不序列化为携带 false 的合法实例；
- 该约束不可被业务代码绕过——它是 ABI 的一部分。

### 3. material-snapshot 0.2.1：生成溯源强制

- `source ∈ {generated_random, generated_instructed}` 时 `generation` 必填（provider_id、model_version、template_version）；
- `source = generated_random` 时 `generation.random_seed` 额外必填；
- 落实"LLM 产出永不脱离溯源进入编译输入"。

### 4. 状态词汇两层统一（文档）

- 判定状态（MasteryDecision）：`not_yet / provisional / learned / uncertain / lapsed`；
- 证据状态（LearnerStateProjection）：`no_evidence / insufficient / supported / conflicted / stale`；
- 客户端验收条款修订（交接文档 §11 第 8 条）：两层分开呈现，用户可见的"已学会"措辞只能来自 MasteryDecision。

### 5. 仓库卫生

- 删除过期任务锁 `current_tasks/T-003__TRAE.lock`（任务早已 done）；
- product_spec 待决表更新（隐私/产品边界/间隔重复算法状态推进）；BUILD_PLAN P0.5 冻结批准标记生效。

## 验证

fixtures 新增 5 例：`invalid_readiness_not_ready`（拒绝）、`invalid_generated_missing_provenance`（拒绝）、`invalid_public_no_license`（拒绝）、`valid_internal_no_license`（通过）、`valid_generated_with_provenance`（通过）；全套 18 例通过校验。

## 兼容性

- 0.2.0 → 0.2.1 为收紧式修订（narrowing）：0.2.0 中已合法的"internal 无 license"场景在 0.2.1 才成为合法（放宽+收紧并存），未就绪会话与无溯源生成快照在 0.2.0 中本就不应产生（产品意图），0.2.1 起被 schema 硬性拒绝；
- `contracts/` 生成代码尚未存在（T-014 未开始），无下游破坏。
