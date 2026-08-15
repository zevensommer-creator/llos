# LLOS 第一代移动端、电脑端与 Figma 实施指令

> 文档类型：TRAE 可执行交接文档  
> 状态：`CLIENT SURFACE / ACCEPTED DRAFT`  
> 日期：2026-08-15  
> 适用范围：iOS、Android、教师移动助手、电脑端 Web、Figma、前端工程和客户端验收  
> 不适用范围：学习闭环、LearningEvent、EvidencePolicy、Core/DLC/素材库三个层级的内部实现；这些内容由另一份核心交接文档规定。

---

## 0. 使用方法与优先级

TRAE 开始前必须同时读取：

1. 仓库中的 `AGENTS.md`；
2. `docs/LANGUAGE_PLATFORM_SPEC.md`；
3. `docs/product_spec.md`；
4. `docs/BUILD_PLAN.md`；
5. `docs/contracts/*.schema.json`；
6. `LLOS_TRAE_HANDOFF_LEARNING_LOOP_AND_8_ISSUES_ZH.md`；
7. 本文档。

如果本文档与核心交接文档发生冲突：

- Core、DLC、素材库、学习事件和学习状态以核心交接文档为准；
- iOS、Android、电脑端、Figma和前端目录以本文档为准；
- 不得由 TRAE 自行选择其中一个版本；必须列出冲突，交由 Human 决定。

本文件的目的不是制作一个页面 Demo，而是为第一代完整产品建立正式客户端。

必须保留以下产品不变量：Core、DLC、素材库是三个独立层级；三者同时工作时才能进入学习模式。DLC 为空时只能进入普通聊天模式，不得产生学习证据或更新学习状态。素材库既可由教师/开发者上传，也可由 LLM 随机生成或按指令生成；上传与发布权限仍必须经过教师或开发者身份授权。

---

## 1. 已采纳且不得擅自改变的技术决策

### 1.1 正式技术组合

```text
设计、流程、高保真原型：Figma
iOS / Android 移动学习端：React Native + Expo + TypeScript
电脑端完整工作台：React Web + TypeScript
共享：contracts、API client、领域逻辑、权限、design tokens、i18n、fixtures
PWA：可选备用入口，不是移动端正式验收标准
```

### 1.2 客户端产品形态

第一代只有三种正式 client surface：

```text
mobile_ios
mobile_android
desktop_web
```

具体规定：

1. `mobile_ios` 和 `mobile_android` 来自同一个 React Native + Expo 工程。
2. 移动端必须生成可安装的 iOS 和 Android 原生构建物。
3. 教师和学习者使用同一个移动 App，根据账户能力动态显示班级入口。
4. 不单独开发教师 App。
5. 电脑端是独立 React Web 工作台，承担完整教师、创作者和管理功能。
6. Expo Web 可以用于开发预览，不能代替真机测试。
7. PWA 可以作为浏览器备用入口，不能宣称其等于 iOS/Android 成品。

### 1.3 禁止自行更换的技术方向

未经 Human 通过 ADR 批准，TRAE 不得：

- 将移动端改成纯 PWA；
- 将移动端改成 Flutter；
- 将移动端改成 Capacitor；
- 分别建立完整 Swift 与 Kotlin 产品工程；
- 用移动端页面直接拉伸出电脑 Studio；
- 用 Figma Make 或其他生成器直接产生未经审查的生产代码；
- 让移动客户端直接调用 LLM、ASR、TTS 或其他 Provider；
- 在客户端本地保存 BYOK 明文密钥；
- 在前端自行计算掌握度；
- 直接查询 LearningEvent store；
- 使用屏幕宽度或 User-Agent 授予权限。

### 1.4 版本与包管理器

精确版本在首次初始化时选择当时的稳定版本，必须遵守：

1. 不使用 alpha、beta、canary；
2. 默认使用 `pnpm workspace`；
3. 仓库如果已有唯一包管理器，先提交差异报告，不能混用；
4. 提交唯一 lockfile；
5. 在 `frontend/docs/TECH_STACK.md` 记录版本、日期和选择理由；
6. 大版本升级必须单独提交，不能和业务功能混合。

---

## 2. 权限与客户端表面的关系

### 2.1 权限公式

```text
effective_operations
= account_capabilities
∩ client_surface_capabilities
∩ resource_entitlements
∩ current_context_constraints
```

含义：

- `account_capabilities`：账号经过验证后拥有的能力；
- `client_surface_capabilities`：当前客户端正式支持的操作；
- `resource_entitlements`：账号对某个 DLC、素材库资源或班级的授权；
- `current_context_constraints`：版本、网络、设备能力、预算和会话模式等约束。

### 2.2 安全规则

- 不显示按钮不等于安全控制；
- 所有写操作必须由服务端重新授权；
- 响应式布局只负责体验，不负责权限；
- 如果未来需要严格限制电脑专属操作，应使用客户端 scope、重新认证、MFA 或等价机制；
- 不得仅根据 User-Agent、屏幕宽度或 CSS 判断权限。

---

## 3. iOS、Android、教师移动端与电脑端功能矩阵

| 功能 | 移动学习者 | 移动教师 | 电脑端 Web |
| --- | --- | --- | --- |
| 普通聊天 | 完整 | 完整 | 完整 |
| LearningSession | 完整 | 完整 | 完整 |
| 录音、播放、语音反馈 | 完整 | 完整 | 完整，允许能力降级 |
| 复习提醒和深层链接 | 完整 | 完整 | 可选 |
| 离线素材和断点恢复 | 完整 | 完整 | 可选 |
| 查看个人学习状态 | 完整 | 完整 | 完整 |
| 浏览市场 | 完整 | 完整 | 完整 |
| 使用免费或已授权内容 | 完整 | 完整 | 完整 |
| 付费获取 | 等待商店合规 ADR | 等待商店合规 ADR | 完整 |
| 加入班级 | 完整 | 完整 | 完整 |
| 创建班级 | 不显示 | 允许 | 完整 |
| 邀请码/二维码 | 不显示 | 生成和分享 | 完整 |
| 发布班级通知 | 不显示 | 允许 | 完整 |
| 分配已发布的学习组合 | 不显示 | 单次分配 | 完整 |
| 修改截止日期 | 不显示 | 单次修改 | 完整 |
| 查看班级概览 | 不显示 | 摘要 | 完整 |
| 查看学生投影 | 不显示 | 授权范围内摘要 | 完整 |
| 高级统计和导出 | 不显示 | 仅摘要 | 完整 |
| 批量成员管理 | 不显示 | 不提供 | 完整 |
| 班级批量购买 | 不显示 | 不提供 | 完整 |
| 查看自己的 DLC/素材状态 | 不显示 | 允许 | 完整 |
| 以学习者身份预览 | 不适用 | 允许 | 完整 |
| 创建、编辑、测试 DLC | 不显示 | 不提供 | 完整 |
| 上传、编辑、发布素材 | 不显示 | 不提供 | 完整 |
| Studio、BYOK | 不显示 | 不提供 | 完整 |
| 审核、用户、系统配置 | 不显示 | 不提供 | 完整 |

### 3.1 教师移动端定位

教师移动端是“随身班级助手”，不是缩小版电脑后台。

教师账号仍拥有全部学习者功能，额外显示“班级”。建议底部导航：

```text
首页 / 学习 / 市场 / 班级 / 我的
```

教师移动首页至少显示：

- 今日待处理事项；
- 即将到期和已逾期任务；
- 班级完成率异常；
- 新成员通知；
- DLC/素材版本或可用性异常；
- 快捷发布通知；
- 快捷生成并分享邀请码/二维码；
- 分配已发布且已授权的学习组合；
- 以学习者身份预览；
- “请在电脑端完成”的高级功能说明。

### 3.2 电脑端专属工作

以下工作必须在电脑端完成：

- DLC Studio；
- DLC 创建、编辑、测试和发布；
- 素材上传、整理、版本和发布；
- BYOK；
- 批量成员管理；
- 复杂学习顺序；
- 高级统计和导出；
- 批量购买；
- 内容审核；
- 用户和系统管理。

---

## 4. 移动端信息架构与完整流程

### 4.1 移动端主要导航

```text
首页
├── 继续学习
├── 待复习
├── 最近聊天
├── 下载内容
└── 教师摘要（有权限时）

学习
├── 当前学习组合
├── LearningSession
├── 历史与状态
└── 离线内容

市场
├── 浏览
├── 搜索/筛选
├── 详情
└── 已获得内容

班级（有权限时）
├── 班级列表
├── 班级概览
├── 学生摘要
├── 通知
├── 分配内容
└── 邀请码

我的
├── 账户
├── 通知
├── 下载和空间
├── 数据与隐私
└── 设备与权限
```

### 4.2 必须设计和实现的学习流程

1. 注册、登录和恢复账号；
2. ChatSession；
3. 选择或获取 DLC 与素材组合；
4. LearningSession 预检；
5. 文本、选择、听力和语音活动；
6. 麦克风授权；
7. 麦克风拒绝后的替代活动或明确暂停；
8. 反馈；
9. 评价器 abstain；
10. Provider 不可用；
11. 离线；
12. 会话中断与恢复；
13. 学习状态；
14. 延迟复测和提醒；
15. 加入班级；
16. 教师班级助手。

### 4.3 ChatSession 与 LearningSession

两个模式必须在标题、导航、状态和事件上明确区分。

ChatSession：

- DLC 为空；
- 可以聊天和引用素材；
- 不显示学习进度；
- 不生成掌握度或复习安排。

LearningSession：

- 必须存在有效 DLC 和 MaterialSnapshot；
- 显示当前学习组合；
- 显示学习活动、反馈和可解释状态；
- 允许产生学习证据并由 Core 更新投影。

不得在普通聊天后显示“本次掌握度”。

---

## 5. Figma 文件和交付规范

### 5.1 Figma 页面结构

```text
00 Cover & Decisions
01 Foundations
02 Tokens
03 Components
04 Mobile Learner - iOS
05 Mobile Learner - Android
06 Mobile Teacher Companion
07 Desktop Web
08 User Flows
09 Empty Loading Error Recovery
10 Accessibility
11 Ready for Dev
12 Archive
```

要求：

- 不得把所有画板放在一个页面；
- 废弃设计移动到 Archive；
- 废弃设计标明日期和原因；
- Ready for Dev 只放已经冻结的画板；
- 不得虚构不存在的 Figma 链接。

### 5.2 Foundations

必须定义：

- 语义颜色；
- 字体层级；
- 动态字体；
- 4/8pt 间距体系；
- 圆角、边框和阴影；
- 图标尺寸；
- 动效和 reduced motion；
- iOS Safe Area；
- Android 系统栏；
- desktop breakpoints；
- focus、hover、pressed、disabled、selected；
- success、warning、error、abstained、offline。

### 5.3 设计 Tokens

代码中的 Tokens 保存于：

```text
frontend/packages/design-tokens/tokens.json
```

由该文件生成 React Native 和 CSS 变量所需产物。

禁止：

- 在页面中散落手写颜色；
- 在 Figma 和代码中使用不同名称表达同一 Token；
- 只复制 Figma 色值而不维护映射；
- 用 Figma Make 生成代码替代正式组件。

### 5.4 组件状态

每个交互组件至少覆盖：

```text
default
pressed
focused
disabled
loading
error（适用时）
selected（适用时）
```

每个数据页面至少覆盖：

```text
loading
empty
ready
partial
offline
permission_denied
provider_unavailable
recoverable_error
fatal_error
```

### 5.5 Figma与代码边界

- Figma：视觉、布局和交互流程；
- schema：数据和状态语义；
- Storybook/组件代码：真实组件行为；
- 自动化测试：验收事实。

如果执行 Agent 无法使用 Figma，应先完成 `frontend/docs/FIGMA_HANDOFF.md` 和页面规格，并标记 `FIGMA_PENDING`，不得谎称已经建立 Figma 文件。

---

## 6. 前端仓库结构

在现有 `frontend/` 下建立 workspace：

```text
frontend/
├── apps/
│   ├── mobile/                 # React Native + Expo
│   └── web/                    # React Web 电脑工作台
├── packages/
│   ├── api-client/             # 唯一网络访问层
│   ├── contracts/              # schema 生成类型和 validator
│   ├── domain/                 # 纯领域逻辑，无 UI/平台依赖
│   ├── permissions/            # capability 和 surface 运算
│   ├── design-tokens/          # tokens.json 和生成产物
│   ├── i18n/                   # 文案 keys 和语言资源
│   ├── test-fixtures/          # 与 schema 对齐的 Mock 数据
│   └── test-utils/
├── docs/
│   ├── CLIENT_SURFACE_SPEC.md
│   ├── TECH_STACK.md
│   ├── FIGMA_HANDOFF.md
│   ├── VIEW_MODELS.md
│   └── ACCESSIBILITY.md
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

### 6.1 可以共享

- contracts；
- API client；
- 权限算法；
- 纯领域函数；
- design tokens；
- i18n keys；
- fixtures；
- 测试工具。

### 6.2 默认不共享

- 页面级组件；
- 导航结构；
- 移动录音控件；
- desktop data grid；
- Studio 编辑器；
- 移动手势；
- 电脑拖拽行为。

### 6.3 依赖方向

```text
apps/mobile ─┐
             ├─> packages/api-client ─> packages/contracts
apps/web ────┘

apps/mobile ─┐
             ├─> packages/domain / permissions / tokens / i18n
apps/web ────┘
```

共享 package 不得反向依赖任何 app。`domain` 不得导入 React Native、DOM、浏览器或 Expo API。

---

## 7. 移动 App 工程规格

### 7.1 基础栈

```text
React Native
Expo
TypeScript strict
Expo Router
正式 schema 生成类型
运行时 schema validator
```

第三方库必须在 `TECH_STACK.md` 说明用途。每一类问题只能选择一个主要库，禁止重复引入多个状态、表单或 UI 框架。

### 7.2 原生能力

至少需要：

- `expo-audio` 或正式替代模块；
- `expo-file-system`；
- `expo-secure-store`；
- `expo-notifications`；
- 网络状态能力；
- iOS Universal Links；
- Android App Links；
- iOS/Android权限声明；
- EAS或等价正式构建流程。

SecureStore 只保存令牌、设备绑定等小型秘密。不得用于大型素材、录音或完整事件历史。

### 7.3 DeviceProfile

移动端在学习会话预检时提交类型化 DeviceProfile：

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

具体枚举由正式 schema 决定。客户端只报告设备能力，不修改教学目标。

### 7.4 录音状态机

```text
idle
requesting_permission
permission_denied
ready
recording
paused（平台允许时）
finalizing
queued_for_upload
uploading
uploaded
upload_failed_recoverable
discarded
```

强制要求：

1. 每次录音生成本地 ID 和幂等上传键；
2. 停止录音后先可靠写入本地文件；
3. 文件落盘后才能进入上传队列；
4. 网络中断时保留队列；
5. Core 确认接收后按留存政策删除临时文件；
6. 未经同意不得长期留存录音；
7. 切后台、来电、耳机断开和音频中断必须进入明确状态；
8. 评价器 abstain 与上传失败不能使用同一错误状态。

### 7.5 离线和同步

第一代最低支持：

- 已下载 MaterialSnapshot 可离线打开；
- 只有 `offline_allowed` 的 Learning IR 可离线执行；
- 回答、checkpoint 和待提交请求进入本地队列；
- 联网后按幂等键提交；
- 冲突由 Core 返回类型化结果；
- 客户端不在本地最终判定 mastery；
- 依赖在线 Provider 的活动明确显示无法离线。

素材缓存按 snapshot hash 建索引，提供可见空间管理。缓存存在不等于 entitlement 永久有效。

### 7.6 推送

至少支持：

- 复习到期；
- 班级通知；
- 截止日期；
- 教师班级异常摘要；
- 创作者资产状态通知。

通知 payload 只保存路由必需的非敏感 ID，不携带回答、完整学习记录或音频。打开通知后先鉴权，再读取服务端状态。

### 7.7 平台差异和可访问性

必须在真机验证：

- iOS Safe Area、键盘、系统音频会话；
- Android系统返回、通知渠道和权限；
- 动态字体；
- VoiceOver/TalkBack；
- 色彩对比；
- 不只依赖颜色；
- reduced motion；
- 触控目标；
- 横竖屏政策。

允许使用 `.ios.tsx`、`.android.tsx` 或 Platform API，不要求两个平台像素完全相同。

---

## 8. 电脑端 Web 工程规格

### 8.1 定位

电脑端负责：

- 高密度表格；
- 完整班级管理；
- Studio；
- 素材摄入和版本；
- BYOK；
- 支付和授权；
- 高级统计和导出；
- 审核、用户和系统配置。

### 8.2 基础栈

```text
React Web
TypeScript strict
正式 schema 生成类型和 validator
Storybook或等价组件目录
浏览器端到端测试
```

路由、表单、查询和表格库必须在技术ADR中各选择一个稳定方案。禁止引入多个功能重叠的UI framework。

### 8.3 响应式规则

- 完整工作流以电脑宽度验收；
- 手机浏览器访问电脑专属路由时显示说明、只读摘要或跳转移动App；
- 不在窄屏上开放未经设计的Studio；
- API始终执行服务端权限检查。

---

## 9. ViewModel和API边界

### 9.1 强制ViewModel

前端至少需要：

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

### 9.2 LearningStateSummary示例

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

前端不得：

- 将 `provisional` 显示为永久学会；
- 自行重新计算 EvidencePolicy；
- 显示没有理论和证据依据的统一 mastery 百分比；
- 把评价器 abstain 显示为学习者失败。

### 9.3 API client规则

- 网络调用集中在 `packages/api-client`；
- 页面禁止散落 `fetch`；
- 请求和响应执行运行时校验；
- 错误映射成稳定类型；
- 创建和提交操作使用幂等键；
- Mock与真实API使用相同ViewModel；
- Provider和密钥不暴露给客户端。

---

## 10. 分阶段实施计划

### UI-0：规格冻结

必须创建：

```text
frontend/docs/CLIENT_SURFACE_SPEC.md
frontend/docs/TECH_STACK.md
frontend/docs/FIGMA_HANDOFF.md
frontend/docs/VIEW_MODELS.md
frontend/docs/ACCESSIBILITY.md
docs/adr/ADR-CLIENT-SURFACES.md
docs/adr/ADR-FRONTEND-STACK.md
```

本阶段不写业务页面，先冻结：

- 平台矩阵；
- 导航和页面清单；
- Figma结构；
- ViewModel草案；
- 权限公式；
- PWA备用定位；
- 真机验收定义。

### UI-1：工程骨架

交付：

- pnpm workspace；
- Expo mobile app可启动；
- React Web app可启动；
- shared packages；
- strict TypeScript；
- lint/typecheck/unit test；
- design tokens生成；
- Storybook或组件目录；
- 基础CI。

只实现App Shell、导航、主题、错误边界和Mock adapter，不连接真实学习后端。

### UI-2：Mock驱动四条旅程

1. 普通聊天；
2. 移动学习；
3. 教师移动助手；
4. 电脑教师/创作者工作台。

每条旅程覆盖：

```text
正常
空白
加载
权限不足
离线
可恢复失败
不可恢复失败
```

### UI-3：移动硬能力验证

必须在真实iPhone和Android设备测试：

1. 录音、落盘、上传和删除；
2. 网络中断和队列恢复；
3. 离线MaterialSnapshot和checkpoint；
4. 推送进入指定复习页面；
5. 麦克风拒绝和重新授权；
6. 切后台、来电和音频中断；
7. iOS/Android内部构建和安装。

浏览器、模拟器和Expo Web不能替代真机。

### UI-4：接入Contract v0.2

前置条件：Core契约冻结并能生成类型。

工作：

- 用正式生成类型替换临时类型；
- 用真实API adapter替换Mock adapter；
- 保留fixtures；
- 发现前后端不一致时回到ADR/schema；
- 不修改页面语义来迁就错误后端。

### UI-5：电脑完整工作台

实现：

- 班级；
- Studio；
- 素材；
- 创作者验证；
- 市场和entitlement；
- 统计和导出；
- 支付框架；
- 审核和系统管理。

### UI-6：质量门

- iOS内部构建；
- Android内部构建；
- Web测试部署；
- 四条旅程E2E；
- 可访问性；
- 弱网和离线；
- 越权测试；
- 视觉回归；
- 性能预算；
- 错误追踪；
- Human内部测试准入报告。

---

## 11. 客户端验收测试

1. iOS和Android均能安装正式内部构建，不是浏览器快捷方式。
2. 同一账户在移动端和电脑端获得不同surface能力，账户能力本身不变。
3. 教师移动端显示班级入口，普通学习者不显示。
4. 移动端不能调用Studio发布、BYOK、批量购买、审核和系统配置API。
5. 伪造移动请求调用电脑专属写操作时，服务端拒绝。
6. ChatSession和LearningSession明确区分。
7. 移动端不显示虚假的全局mastery百分比。
8. `provisional`、`satisfied`、`conflicted`、`stale`均有界面。
9. abstain不显示为学习者失败。
10. 麦克风拒绝后存在替代路径或明确暂停。
11. 上传重试不生成重复LearningEvent。
12. App被杀死后，上传队列和checkpoint能恢复。
13. 临时录音按留存政策清理。
14. 未授权用户不能读取他人素材、班级投影或音频。
15. 离线只执行`offline_allowed` IR。
16. 缓存entitlement过期时重新向服务端确认。
17. 通知打开后先鉴权，再进入正确任务。
18. VoiceOver/TalkBack能读取关键控件和反馈。
19. 动态字体不遮挡作答、录音和提交。
20. 平台返回行为不会丢失未提交回答。
21. 教师手机可以建班、发通知、生成邀请码和分配已有组合。
22. 教师手机不能执行完整Studio和批量管理。
23. 手机浏览器不能获得未经设计的电脑完整操作界面。
24. Figma、Tokens和代码组件名称存在映射。
25. Figma生成代码未经审查时不进入生产构建。
26. Web和Mobile均只通过统一API client请求后端。
27. ViewModel校验失败时客户端受控报错，不崩溃。
28. iOS/Android真机完成录音—上传—评价—反馈E2E。
29. 教师手机摘要与电脑端投影一致。
30. 电脑端完成教师、创作者和管理员正式旅程。

---

## 12. 可原样交给TRAE的执行指令

```text
任务名称：LLOS Client Surface v0.1，执行UI-0和UI-1

目标：
建立iOS、Android移动学习App，同一App中的教师班级助手，电脑端完整React Web工作台，以及Figma交付规范。目标是第一代完整产品，不是PWA Demo。

第一步：只读检查
1. 阅读AGENTS.md、架构基线、产品规格、BUILD_PLAN、全部contracts、核心交接文档和本文件。
2. 输出当前前端目录、技术栈、未提交修改和任务锁。
3. 不删除或覆盖Human和其他Agent的改动。
4. 如果存在技术栈冲突，先报告，不静默迁移。

第二步：创建规格
必须创建：
- frontend/docs/CLIENT_SURFACE_SPEC.md
- frontend/docs/TECH_STACK.md
- frontend/docs/FIGMA_HANDOFF.md
- frontend/docs/VIEW_MODELS.md
- frontend/docs/ACCESSIBILITY.md
- docs/adr/ADR-CLIENT-SURFACES.md
- docs/adr/ADR-FRONTEND-STACK.md

规格必须写明：
- mobile_ios、mobile_android、desktop_web；
- React Native + Expo + TypeScript；
- React Web + TypeScript；
- Figma页面结构；
- PWA只作备用；
- 教师移动能力与电脑专属能力矩阵；
- 权限公式；
- ViewModel/API边界；
- iOS/Android真机验收。

第三步：初始化工程
1. 使用pnpm workspace；若已有其他唯一包管理器，停止并报告。
2. 创建frontend/apps/mobile Expo TypeScript工程。
3. 创建frontend/apps/web React TypeScript工程。
4. 创建api-client、contracts、domain、permissions、design-tokens、i18n、test-fixtures、test-utils。
5. 开启TypeScript strict。
6. 配置lint、format、typecheck、unit test。
7. 提交唯一lockfile。
8. 不接入生产Provider、支付或密钥。

第四步：建立设计和Mock边界
1. 创建tokens.json，并生成React Native和CSS变量产物。
2. 创建基础组件状态和Storybook/组件目录。
3. 创建本文规定的ViewModel和合法fixtures。
4. 页面只能通过api-client/Mock adapter访问数据。
5. 禁止散落fetch。
6. 禁止读取LearningEvent store或在客户端计算mastery。

第五步：实现App Shell
Mobile：
- 首页、学习、市场、班级（有权限时）、我的；
- ChatSession和LearningSession明确区分；
- 教师班级助手使用Mock数据。

Desktop：
- 工作台导航；
- 市场、班级、Studio、素材、统计、设置路由；
- 未实现页面必须显示正式Not Implemented状态，不能伪装为已完成。

第六步：移动技术验证
1. 使用Expo正式模块实现录音、本地文件、上传队列Mock、通知deep link和离线checkpoint。
2. 必须在真实iPhone和Android设备测试。
3. Expo Web或浏览器结果不能替代真机。
4. 记录设备、系统版本、步骤和结果。

禁止事项：
- 不得将PWA当作iOS/Android成品。
- 不得改用Flutter、Capacitor或Swift/Kotlin双工程。
- 不得把移动页面拉伸成电脑Studio。
- 不得根据viewport/User-Agent授予权限。
- 不得在移动端提供DLC发布、素材发布、BYOK、批量购买、审核和系统管理。
- 不得在客户端保存BYOK明文或调用Provider。
- 不得把Figma生成代码直接投入生产。
- 不得显示永久统一mastery百分比。
- 不得自行定义Contract v0.2字段。
- 不得修改 Core/DLC/素材库三层边界。

验收输出：
1. 修改文件清单；
2. ADR；
3. 五份frontend/docs；
4. frontend目录树；
5. 依赖选择及理由；
6. lint/typecheck/unit test结果；
7. iOS/Android启动和真机记录；
8. Web启动记录；
9. 已完成和未完成页面；
10. Contract v0.2待集成点；
11. 风险和下一阶段计划。

停止条件：
- 发现已有前端技术栈冲突时停止并报告。
- 无法访问Figma时创建FIGMA_PENDING规格，不得虚构链接。
- Contract v0.2未冻结时继续使用严格Mock，不得猜测后端字段。
- 权限或产品规则不明确时列为Human Decision，不得自行写死。
```

---

## 13. 不阻塞开工但必须由Human决定的事项

以下事项不得由TRAE自行决定：

1. iOS/Android内付费DLC的商店合规路径；
2. App Store和Google Play主体及账号；
3. 第一代是否做平板专用布局；
4. 最低iOS/Android系统版本；
5. 托管EAS或自建构建；
6. 内部测试设备矩阵；
7. 生产崩溃、性能和日志服务；
8. Figma席位、文件所有权和审批流程。

这些问题不阻止UI-0、UI-1和Mock界面开始，但必须在真机验证或正式发布前解决。

---

## 14. 技术依据

- [React Native官方文档](https://reactnative.dev/)
- [React Native环境设置与Expo建议](https://reactnative.dev/docs/environment-setup)
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Expo SecureStore](https://docs.expo.dev/develop/user-interface/store-data/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Expo应用商店提交](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [WebKit：iOS/iPadOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [WebKit Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Figma Prototyping](https://help.figma.com/hc/en-us/articles/360040314193-Guide-to-prototyping-in-Figma)
- [Figma Dev Mode](https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode)

---

## 15. 最终开工判断

允许立即开始：

- UI-0规格；
- Figma结构与页面清单；
- ViewModel草案；
- Tokens；
- Mock fixtures；
- UI-1工程骨架。

Contract v0.2冻结后开始：

- 真实API接入；
- 学习状态展示；
- LearningSession正式数据；
- 班级投影；
- entitlement联调。

不得以任何理由把PWA Demo、浏览器录音测试或静态Figma页面当作iOS/Android第一代成品。
