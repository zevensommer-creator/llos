# 契约 Fixtures（正例 + 红线反例）

> 对象：`docs/contracts/*.schema.json`（v0.2.0；material-pack / session-composition / material-snapshot 为 v0.2.1，ADR-013）。
> 状态：**全量 15 份 schema 均有正例/反例**（T-014，2026-08-15 完成）。35 个 fixture 用例 + 注册表镜像测试，由 `@llos/contracts` 的 node:test harness 驱动。

## 命名约定

- `valid_*.json`：必须通过对应 schema 校验；
- `invalid_*.json`：必须被对应 schema 拒绝（红线反例）。
- dlc-manifest / provider-descriptor / pronunciation-assessment / agent-work 的正例提取自各 schema 内嵌 `examples`；learning-ir 正例在内嵌 example 基础上修正了 `display_mode_ref`（见下文"已知问题"）。

## 运行校验

```bash
# 主 harness（TS 契约包，ajv draft 2020-12，与 schema 正本同标准）
pnpm --filter @llos/contracts test

# 旧 Python 校验器（保留作交叉验证）
uv run --with jsonschema python tests/contracts/validate_fixtures.py
```

期望输出：`fail 0`。

## 红线反例清单（schema 层拒绝）

| 文件 | 红线 |
|------|------|
| `session-composition/invalid_chat_with_dlc.json` | chat 模式携带 DLC——聊天会话永不产生学习状态（spec §2.6） |
| `learning-event/invalid_unregistered_event_type.json` | 事件类型不在闭合注册表——任何 Agent/Provider 不得发明事件名（spec §5.3） |
| `learning-event/invalid_chat_mode_event.json` | chat 活动进入学习事件流——聊天永不进入学习 reducer（spec §2.5） |
| `learning-observation/invalid_binary_missing_confidence.json` | 表现观察缺少测量置信度——表现与置信度必须分离且同时在场（spec §4.4/§5.2） |
| `evidence-policy/invalid_missing_confidence_gate.json` | 证据政策缺少 `minimum_measurement_confidence` 门——评价器可靠性门是强制项（spec §5.5） |
| `mastery-decision/invalid_permanent_score.json` | 永久布尔 + 聚合掌握分（`learned:true` + `mastery_score:0.86`）——禁止作为事实源存储（spec §5.1/§5.4） |
| `session-composition/invalid_readiness_not_ready.json` | 就绪门含 false 的 LearningSession——三层就绪门由 schema 强制，未就绪只能以类型化错误拒绝创建（ADR-013） |
| `material-snapshot/invalid_generated_missing_provenance.json` | `source=generated_random` 缺 `generation` 溯源（Provider/模型版本/种子）——LLM 产出永不脱离溯源进入编译输入（ADR-013） |
| `material-pack/invalid_public_no_license.json` | `distribution_scope=public` 缺 license——公开分发必须声明版权（ADR-012/013） |
| `material-request/invalid_empty_sources.json` | `allowed_sources` 为空——素材请求必须声明至少一个允许来源，缺来源即失败而非静默降级（spec §2.6/§2.7） |
| `dlc-manifest/invalid_silent_chat_degradation.json` | `missing_input_handling="degrade_to_chat"`——素材缺失永不静默降级为聊天（spec §2.6） |
| `learning-ir/invalid_evaluate_without_claims.json` | evaluate/emit_observation 步骤缺 `claim_refs`——观察必须绑定理论中立 claim，不得产生无归属评估（spec §4.3/§5.2） |
| `learning-claim/invalid_unnamespaced_claim_ref.json` | `claim_ref` 缺 `namespace:claim/name` 结构——claim 对 Core 不透明但必须结构可路由（spec §4.2） |
| `learner-state-projection/invalid_mastery_wording_state.json` | `evidence_state="mastered"`——投影只有证据状态枚举，掌握措辞只能来自 MasteryDecision（spec §5.2/§5.4） |
| `provider-descriptor/invalid_brand_in_capability_id.json` | capability_id 含模型品牌（`gpt-4o.feedback`）——业务代码只见 capability，不见品牌（AGENTS.md §15） |
| `pronunciation-assessment/invalid_issue_without_evidence.json` | issue 的 `evidence_refs` 为空——发音问题必须有证据支撑；证据不足走弃权，不猜测（AGENTS.md §16） |
| `agent-work/invalid_completed_without_artifacts.json` | `status=completed` 但无 artifacts——完成的 Agent 工作必须有 schema 校验的产出物（spec §4.4） |

对应的放宽正例（内部第一代不因版权字段阻塞，ADR-012）：`material-pack/valid_internal_no_license.json`、`material-snapshot/valid_generated_with_provenance.json`。

## schema 无法表达、须由 Core 测试保证的语义红线

1. `performance` 与 `measurement_confidence` 语义不可互换（值域检查之外的业务断言）；
2. `abstention` 观察永不计入支持或反驳（EvidencePolicy abstention_handling 执行正确性）；
3. 事件注册表与 `learning-event.schema.json` enum 保持镜像（注册表变更须同步 schema 版本）——已由 `contracts/test/registry.test.js` 机器强制；
4. `learner-state-projection` 可由事件流 + reducer 版本逐字段重建（重放一致性）——由 `core` reducer 重放测试保证；
5. `mastery.decision_made` 事件只能由 Core 策略解释器产生（DLC/Agent/Provider 无写入路径）。

## 已知问题（待 Human 裁决）

- `learning-ir.schema.json` 的内嵌 example 中 `display_mode_ref: "dlc.de.fsi-construction:mode/read_aloud"` 含 `/`，不符合 `Identifier` pattern（`^[A-Za-z0-9][A-Za-z0-9._:-]*$`），即 **example 不通过自身 schema 校验**。fixture 正例已改用合法 `Identifier`（`fsi-construction.mode-read-aloud`）。是否引入专门的 `ModeRef` 类型（与 ClaimRef/PolicyRef 的 `ns:kind/name` 风格统一）需走 ADR + schema 版本升级 + Human 批准（docs/contracts 常设例外）。已备案 TASKS.md。

## 占位符说明

fixtures 中的 `sha256` 值为占位符（`0123456789abcdef…` 循环），仅满足格式约束；真实产物必须携带实际内容哈希。
