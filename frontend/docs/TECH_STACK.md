# TECH_STACK — 前端技术栈记录

> 版本：0.1（UI-0 冻结框架，具体版本号在 UI-1 初始化时锁定） · 日期：2026-08-15
> 规则来源：`docs/adr/ADR-FRONTEND-STACK.md`

## 选型规则

1. 首次初始化时选择当时的**稳定版本**；不使用 alpha/beta/canary。
2. 默认 `pnpm workspace`；仓库若已有唯一包管理器，先提交差异报告，不得混用。
3. 只提交一个 lockfile。
4. 大版本升级单独提交，不与业务功能混合。
5. 每类问题只选一个主要库；第三方库必须在本文件登记用途。

## 已冻结决策

| 层 | 选择 | 备注 |
| --- | --- | --- |
| 移动端框架 | React Native + Expo | 与 Android 共用一个工程，产出 iOS/Android 原生构建物 |
| 电脑端框架 | React Web | 电脑工作台，宽屏验收 |
| 语言 | TypeScript（strict） | 全 workspace |
| 包管理 | pnpm workspace | 单一 lockfile |
| 移动路由 | Expo Router | ADR-FRONTEND-STACK 已定 |
| 网络访问 | packages/api-client | 页面禁止散落 fetch |
| 类型来源 | packages/contracts | docs/contracts v0.2.0 schema 生成；UI-4 接入 |
| 设计令牌 | packages/design-tokens | tokens.json 单一来源，生成 RN/CSS 产物 |
| 原生能力 | expo-audio / expo-file-system / expo-secure-store / expo-notifications | SecureStore 仅存小型秘密 |
| 构建流程 | EAS 或等价 | 托管与否待 Human 决定 |

## 待 UI-1 初始化锁定

| 事项 | 状态 |
| --- | --- |
| React Native / Expo 精确版本 | 初始化时锁定并记录日期与理由 |
| React / React Web 精确版本 | 同上 |
| 状态管理库（每类一个） | 待选 |
| 表单库（每类一个） | 待选 |
| 查询库（每类一个） | 待选 |
| 表格库（desktop，每类一个） | 待选 |
| 组件目录 | Storybook 或等价 |
| lint / format / test 工具链 | 待选 |

## 共享与隔离

**共享**：contracts、api-client、permissions、domain、design-tokens、i18n、test-fixtures、test-utils。

**不共享**：页面级组件、导航结构、移动录音控件、desktop data grid、Studio 编辑器、移动手势、电脑拖拽行为。

依赖方向：`apps/mobile`、`apps/web` → `packages/api-client` → `packages/contracts`；共享包不得反向依赖 app；`domain` 不得导入 RN/DOM/浏览器/Expo API。

## 第三方库登记表

| 库 | 版本 | 用途 | 引入日期 |
| --- | --- | --- | --- |
| （UI-1 起登记） | | | |
