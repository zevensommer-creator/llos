# ADR-CLIENT-SURFACES：第一代客户端表面决策

- 状态：Accepted（Human 通过《LLOS 第一代移动端、电脑端与 Figma 实施指令》采纳）
- 日期：2026-08-15
- 决策人：Human
- 上游依据：`docs/LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md` §1-§4

## 背景

第一代产品需要正式客户端。此前 BUILD_PLAN v1.0 曾以 PWA 作为学生端与市场 UI 的交付形态；该方案与本 ADR 冲突，以本 ADR 为准。

## 决策

1. 第一代只有三种正式 client surface：

```text
mobile_ios
mobile_android
desktop_web
```

2. `mobile_ios` 与 `mobile_android` 来自同一个 React Native + Expo 工程；必须产出可安装的原生构建物。
3. 教师与学习者使用同一移动 App，按账户能力动态显示班级入口；不单独开发教师 App。
4. 电脑端是独立 React Web 工作台，承担完整教师、创作者与管理功能。
5. PWA 仅作浏览器备用入口，不是移动端验收标准。
6. Expo Web 仅用于开发预览，不能替代真机测试。

## 权限公式

```text
effective_operations
= account_capabilities
∩ client_surface_capabilities
∩ resource_entitlements
∩ current_context_constraints
```

- 隐藏按钮不是安全控制；所有写操作由服务端重新授权。
- 响应式布局只负责体验，不负责权限。
- 禁止依据 User-Agent、屏幕宽度或 CSS 授予权限。

## 禁止事项（未经 Human ADR 批准不得变更）

- 移动端改纯 PWA / Flutter / Capacitor；
- 分别建立 Swift 与 Kotlin 双工程；
- 移动页面直接拉伸为电脑 Studio；
- 移动客户端直接调用 LLM/ASR/TTS 等 Provider；
- 客户端本地保存 BYOK 明文密钥；
- 前端自行计算掌握度或直接查询 LearningEvent store。

## 后果

- BUILD_PLAN v1.0 中 P4 的"PWA 学生端"表述作废，由 UI 阶段（UI-0~UI-6）替代。
- 移动端验收必须包含 iOS/Android 真机内部构建。
- 班级、Studio、BYOK、批量管理、审核等电脑专属能力按功能矩阵执行（见 frontend/docs/CLIENT_SURFACE_SPEC.md）。

## 待 Human 决定（不阻塞 UI-0/UI-1）

商店合规内购路径、开发者账号、平板布局、最低系统版本、EAS 托管与否、测试设备矩阵、生产崩溃/日志服务、Figma 席位与审批流程（见上游指令 §13）。
