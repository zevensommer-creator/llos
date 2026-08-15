# ACCESSIBILITY — 可访问性规格

> 版本：0.1（UI-0 冻结稿） · 日期：2026-08-15
> 上游：`docs/LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md` §5.2、§7.7、§11

## 1. 必须在真机验证

- iOS Safe Area、键盘、系统音频会话；
- Android 系统返回、通知渠道和权限；
- 动态字体（不遮挡作答、录音和提交）；
- VoiceOver / TalkBack 能读取关键控件和反馈；
- 色彩对比；
- 不只依赖颜色传达状态（含 abstained/offline 等语义状态）；
- reduced motion；
- 触控目标尺寸；
- 横竖屏政策（平台返回行为不丢失未提交回答）。

## 2. Foundations 层要求

- 语义颜色含 success / warning / error / **abstained** / offline；
- 动效全部提供 reduced motion 变体；
- 焦点态（focus）在移动与桌面均为必覆盖组件状态；
- 图标尺寸与 4/8pt 间距体系在 tokens.json 中固化。

## 3. 验收挂钩（上游验收测试）

- 第 18 条：VoiceOver/TalkBack 能读取关键控件和反馈；
- 第 19 条：动态字体不遮挡作答、录音和提交；
- 第 20 条：平台返回行为不会丢失未提交回答。

## 4. 实施约束

- 允许 `.ios.tsx`、`.android.tsx` 或 Platform API 处理平台差异，不要求两平台像素完全相同；
- 可访问性属性（标签、角色、状态）纳入组件状态覆盖要求，与 default/pressed/disabled 等状态同等对待；
- Figma `10 Accessibility` 页面与本文档对齐后才能进入 Ready for Dev。
