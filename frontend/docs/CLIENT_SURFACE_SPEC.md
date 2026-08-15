# CLIENT_SURFACE_SPEC — 客户端表面规格

> 版本：0.1（UI-0 冻结稿） · 日期：2026-08-15
> 上游：`docs/LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md`、`docs/adr/ADR-CLIENT-SURFACES.md`、`docs/adr/ADR-FRONTEND-STACK.md`

## 1. 正式 client surface

```text
mobile_ios       # React Native + Expo（与 Android 同工程）
mobile_android   # 同上
desktop_web      # React Web 电脑工作台
```

- PWA：可选备用入口，**不是**移动端验收标准。
- Expo Web：仅开发预览，不替代真机。
- 教师与学习者同一移动 App；教师账号额外显示"班级"入口。不开发独立教师 App。

## 2. 权限公式

```text
effective_operations
= account_capabilities
∩ client_surface_capabilities
∩ resource_entitlements
∩ current_context_constraints
```

安全规则：
- 隐藏按钮不是安全控制；所有写操作由服务端重新授权；
- 响应式布局只负责体验，不负责权限；
- 不得依据 User-Agent、屏幕宽度或 CSS 授予权限；
- 伪造移动请求调用电脑专属写操作时，服务端必须拒绝。

## 3. 功能矩阵（摘自上游指令 §3）

| 功能 | 移动学习者 | 移动教师 | 电脑端 Web |
| --- | --- | --- | --- |
| 普通聊天 / LearningSession | 完整 | 完整 | 完整 |
| 录音、播放、语音反馈 | 完整 | 完整 | 完整（允许降级） |
| 复习提醒、深层链接 / 离线、断点恢复 | 完整 | 完整 | 可选 |
| 查看个人学习状态 / 浏览市场 / 获取免费或已授权内容 / 加入班级 | 完整 | 完整 | 完整 |
| 付费获取 | 等待商店合规 ADR | 等待商店合规 ADR | 完整 |
| 创建班级 / 邀请码 / 班级通知 | 不显示 | 允许 | 完整 |
| 分配学习组合 / 修改截止日期 | 不显示 | 单次操作 | 完整 |
| 班级概览 / 学生投影 / 高级统计 | 不显示 | 摘要 | 完整 |
| 批量成员管理 / 批量购买 | 不显示 | 不提供 | 完整 |
| 查看自己的 DLC/素材状态 / 学习者身份预览 | 不显示 | 允许 | 完整 |
| 创建、编辑、测试 DLC / 上传发布素材 / Studio / BYOK | 不显示 | 不提供 | 完整 |
| 审核、用户、系统配置 | 不显示 | 不提供 | 完整 |

## 4. 移动端信息架构

```text
首页：继续学习 / 待复习 / 最近聊天 / 下载内容 / 教师摘要（有权限时）
学习：当前学习组合 / LearningSession / 历史与状态 / 离线内容
市场：浏览 / 搜索筛选 / 详情 / 已获得内容
班级（有权限时）：班级列表 / 概览 / 学生摘要 / 通知 / 分配内容 / 邀请码
我的：账户 / 通知 / 下载和空间 / 数据与隐私 / 设备与权限
```

教师移动端定位：随身班级助手，非缩小版电脑后台。首页至少显示：今日待处理、到期/逾期任务、班级完成率异常、新成员通知、DLC/素材版本或可用性异常、快捷发布通知、快捷邀请码/二维码、分配已授权组合、学习者身份预览、"请在电脑端完成"的高级功能说明。

## 5. 电脑端专属工作

DLC Studio；DLC 创建/编辑/测试/发布；素材上传、整理、版本、发布；BYOK；批量成员管理；复杂学习顺序；高级统计和导出；批量购买；内容审核；用户和系统管理。

## 6. 会话模式区分

ChatSession（DLC 为空）：可聊天、可引用素材；**不显示学习进度**；不生成掌握度或复习安排；聊天后不得显示"本次掌握度"。

LearningSession（三层就绪）：必须存在有效 DLC 与 MaterialSnapshot；显示学习组合、活动、反馈、可解释状态；允许产生学习证据并由 Core 更新投影。

两模式在标题、导航、状态、事件上明确区分。

## 7. 必须实现的学习流程

注册/登录/恢复账号；ChatSession；选择或获取 DLC 与素材组合；LearningSession 预检；文本/选择/听力/语音活动；麦克风授权；麦克风拒绝后的替代活动或明确暂停；反馈；评价器 abstain；Provider 不可用；离线；会话中断与恢复；学习状态；延迟复测和提醒；加入班级；教师班级助手。

## 8. 录音状态机（移动端）

```text
idle → requesting_permission → (permission_denied | ready)
ready → recording → (paused) → finalizing → queued_for_upload
→ uploading → (uploaded | upload_failed_recoverable)
(discarded 可从多个状态进入)
```

强制要求：本地 ID + 幂等上传键；先落盘后入队；断网保留队列；Core 确认后按留存政策删除临时文件；未经同意不长期留存录音；切后台/来电/耳机断开进入明确状态；abstain 与上传失败不得共用同一错误状态。

## 9. 离线与同步（第一代最低要求）

- 已下载 MaterialSnapshot 可离线打开；
- 仅 `offline_allowed` 的 Learning IR 可离线执行；
- 回答、checkpoint、待提交请求进入本地队列，联网后按幂等键提交；
- 冲突由 Core 返回类型化结果；客户端不在本地判定 mastery；
- 依赖在线 Provider 的活动明确显示无法离线；
- 缓存按 snapshot hash 索引并提供可见空间管理；缓存存在不等于 entitlement 永久有效。

## 10. 推送

复习到期、班级通知、截止日期、教师班级异常摘要、创作者资产状态通知。payload 只含路由必需的非敏感 ID；打开通知先鉴权再读服务端状态。

## 11. 真机验收定义

iOS 与 Android 均能安装正式内部构建（非浏览器快捷方式）；UI-3 硬能力清单（录音落盘上传删除、断网队列恢复、离线 snapshot 与 checkpoint、推送深链、麦克风拒绝重授权、切后台/来电/音频中断、内部构建安装）全部在真实设备完成并留档记录（设备、系统版本、步骤、结果）。
