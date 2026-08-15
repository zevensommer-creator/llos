# 契约 Fixtures（正例 + 红线反例）

> 对象：`docs/contracts/*.schema.json` v0.2.0。
> 状态：**核心子集**（session-composition / learning-event / learning-observation / evidence-policy / mastery-decision）；P1 扩至全量 15 份 schema（BUILD_PLAN P0.5 剩余项）。

## 命名约定

- `valid_*.json`：必须通过对应 schema 校验；
- `invalid_*.json`：必须被对应 schema 拒绝（红线反例）。

## 运行校验

```bash
uv run --with jsonschema python tests/contracts/validate_fixtures.py
```

期望输出：`checked=N failures=0`。

## 红线反例清单（schema 层拒绝）

| 文件 | 红线 |
|------|------|
| `session-composition/invalid_chat_with_dlc.json` | chat 模式携带 DLC——聊天会话永不产生学习状态（spec §2.6） |
| `learning-event/invalid_unregistered_event_type.json` | 事件类型不在闭合注册表——任何 Agent/Provider 不得发明事件名（spec §5.3） |
| `learning-event/invalid_chat_mode_event.json` | chat 活动进入学习事件流——聊天永不进入学习 reducer（spec §2.5） |
| `learning-observation/invalid_binary_missing_confidence.json` | 表现观察缺少测量置信度——表现与置信度必须分离且同时在场（spec §4.4/§5.2） |
| `evidence-policy/invalid_missing_confidence_gate.json` | 证据政策缺少 `minimum_measurement_confidence` 门——评价器可靠性门是强制项（spec §5.5） |
| `mastery-decision/invalid_permanent_score.json` | 永久布尔 + 聚合掌握分（`learned:true` + `mastery_score:0.86`）——禁止作为事实源存储（spec §5.1/§5.4） |

## schema 无法表达、须由 Core 测试保证的语义红线

1. `performance` 与 `measurement_confidence` 语义不可互换（值域检查之外的业务断言）；
2. `abstention` 观察永不计入支持或反驳（EvidencePolicy abstention_handling 执行正确性）；
3. 事件注册表与 `learning-event.schema.json` enum 保持镜像（注册表变更须同步 schema 版本）；
4. `learner-state-projection` 可由事件流 + reducer 版本逐字段重建（重放一致性）；
5. `mastery.decision_made` 事件只能由 Core 策略解释器产生（DLC/Agent/Provider 无写入路径）。

## 占位符说明

fixtures 中的 `sha256` 值为占位符（`0123456789abcdef…` 循环），仅满足格式约束；真实产物必须携带实际内容哈希。
