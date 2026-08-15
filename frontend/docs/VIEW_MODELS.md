# VIEW_MODELS — ViewModel 与 API 边界规格

> 版本：0.1（UI-0 冻结稿） · 日期：2026-08-15
> 上游：`docs/LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md` §9

## 1. 强制 ViewModel 清单

```text
SessionViewModel
ActivityViewModel
FeedbackViewModel
LearningStateSummary
MaterialSnapshotSummary
CreatorCapabilityViewModel
EntitlementViewModel
ClassProgressSummary
TeacherMobileDashboardViewModel
SyncQueueStatusViewModel
```

正式类型由 `packages/contracts`（schema 生成）提供；UI-4 前使用 fixtures 驱动的 Mock 类型，Mock 与真实 API 使用相同 ViewModel。

## 2. LearningStateSummary 形状

```json
{
  "claim_id": "claim.example",
  "status": "provisional",
  "display_label": "暂时达到当前标准",
  "reason_summary": "需要在另一次会话中完成复测",
  "next_action": "review_later",
  "policy_ref": "policy.example@0.2.0",
  "updated_at": "2026-08-15T12:00:00Z"
}
```

`status` 与 Contract v0.2 对齐：`not_yet / provisional / learned / uncertain / lapsed`（MasteryDecision），投影证据状态为 `no_evidence / insufficient / supported / conflicted / stale`（LearnerStateProjection）。UI 展示版本化、可撤销的状态，永不显示"永久学会"。

## 3. 前端禁止事项

- 将 `provisional` 显示为永久学会；
- 自行重新计算 EvidencePolicy；
- 显示没有理论和证据依据的统一 mastery 百分比；
- 把评价器 abstain 显示为学习者失败；
- 客户端本地判定 mastery；
- 直接查询 LearningEvent store。

## 4. API client 规则

- 网络调用集中在 `packages/api-client`；页面禁止散落 `fetch`；
- 请求与响应执行运行时 schema 校验；
- 错误映射成稳定类型；
- 创建和提交操作使用幂等键（上传重试不得产生重复 LearningEvent）；
- Mock 与真实 API 使用相同 ViewModel；
- Provider 与密钥不暴露给客户端。

## 5. 移动端 DeviceProfile（预检提交，类型化）

```json
{
  "client_surface": "mobile_ios",
  "screen_class": "phone",
  "microphone": "granted",
  "audio_output": "available",
  "camera": "not_requested",
  "network": "online",
  "offline_cache": true,
  "input_methods": ["touch", "voice", "keyboard"],
  "accessibility": {
    "font_scale": 1.0,
    "screen_reader": false,
    "reduce_motion": false
  }
}
```

具体枚举由正式 schema 决定；客户端只报告设备能力，不修改教学目标。
