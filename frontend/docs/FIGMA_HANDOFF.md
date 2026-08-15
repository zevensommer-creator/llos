# FIGMA_HANDOFF — Figma 交付规范

> 状态：**FIGMA_PENDING**（尚未创建 Figma 文件；不得虚构链接） · 版本：0.1 · 日期：2026-08-15
> 上游：`docs/LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md` §5

## 1. Figma 页面结构（创建时必须遵循）

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

规则：
- 不得把所有画板放在一个页面；
- 废弃设计移入 Archive，标明日期和原因；
- Ready for Dev 只放已冻结画板；
- 不虚构不存在的 Figma 链接；本文件在 Figma 文件建立前保持 FIGMA_PENDING。

## 2. Foundations 必须定义

语义颜色；字体层级；动态字体；4/8pt 间距体系；圆角、边框、阴影；图标尺寸；动效与 reduced motion；iOS Safe Area；Android 系统栏；desktop breakpoints；focus/hover/pressed/disabled/selected 状态；success/warning/error/**abstained**/offline 状态色。

## 3. 设计 Tokens

代码侧唯一来源：`frontend/packages/design-tokens/tokens.json`，由它生成 React Native 与 CSS 变量产物。

禁止：
- 页面散落手写颜色；
- Figma 与代码用不同名称表达同一 Token；
- 只复制 Figma 色值而不维护映射；
- 用 Figma Make 生成代码替代正式组件。

## 4. 组件状态覆盖

每个交互组件至少：default / pressed / focused / disabled / loading / error（适用时）/ selected（适用时）。

每个数据页面至少：loading / empty / ready / partial / offline / permission_denied / provider_unavailable / recoverable_error / fatal_error。

## 5. Figma 与代码边界

- Figma：视觉、布局、交互流程；
- schema：数据和状态语义；
- Storybook/组件代码：真实组件行为；
- 自动化测试：验收事实。

Figma 生成代码未经审查不得进入生产构建；Figma、Tokens 与代码组件名称必须存在映射（验收测试第 24、25 条）。

## 6. 待办

| 事项 | 状态 |
| --- | --- |
| Figma 席位、文件所有权、审批流程 | 待 Human 决定（不阻塞 UI-0/UI-1） |
| Figma 文件创建 | 待 Human 决定后执行，届时更新本文件状态 |
