# TECH_STACK — 前端技术栈记录

> 版本：0.2（UI-1 初始化锁定） · 日期：2026-08-16
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
| 包管理 | pnpm workspace | 单一 lockfile；`.npmrc` 设 `node-linker=hoisted`（Expo/Metro 对符号链接 node_modules 的兼容要求） |
| 移动路由 | Expo Router | ADR-FRONTEND-STACK 已定 |
| 网络访问 | packages/api-client | 页面禁止散落 fetch |
| 类型来源 | packages/contracts | docs/contracts v0.2.0 schema 生成；UI-4 接入 |
| 设计令牌 | packages/design-tokens | tokens.json 单一来源，生成 RN/CSS 产物 |
| 原生能力 | expo-audio / expo-file-system / expo-secure-store / expo-notifications | SecureStore 仅存小型秘密 |
| 构建流程 | EAS 或等价 | 托管与否待 Human 决定 |

## UI-1 初始化锁定（2026-08-16，npm 当日最新稳定版）

| 事项 | 锁定结果 | 理由 |
| --- | --- | --- |
| Expo | ~57.0.13（SDK 57） | 当日最新稳定 SDK；配套版本以 `expo/bundledNativeModules.json` 为准（react-native 0.86.2、safe-area-context ~5.7.0、screens ~4.26.0、worklets 0.10.1） |
| React Native | 0.86.2 | SDK 57 官方配对版本（npm 最新 0.87.0 不配对，已回退） |
| React / React DOM | 19.2.8 | 当日最新稳定版；RN 0.86 配对 React 19.2 |
| React Web 构建 | Vite 8.2.1 + @vitejs/plugin-react | 当日最新稳定版 |
| TypeScript | ^5.7.0（与后端包同主版本） | npm 最新 7.0（tsgo）暂缓：与后端保持同一主版本，避免双工具链 |
| 状态管理库 | UI-2 选型 | App Shell 尚无状态需求 |
| 表单/查询/表格库 | UI-2/UI-5 选型 | 同上 |
| lint / format / test 工具链 | UI-2 选型（node:test 已用于共享包） | App Shell 阶段仅 typecheck |
| CI | GitHub Actions：install → build → test → typecheck | `.github/workflows/ci.yml` |

## 共享与隔离

**共享**：contracts、api-client、permissions、domain、design-tokens、i18n、test-fixtures、test-utils。

**不共享**：页面级组件、导航结构、移动录音控件、desktop data grid、Studio 编辑器、移动手势、电脑拖拽行为。

依赖方向：`apps/mobile`、`apps/web` → `packages/api-client` → `packages/contracts`；共享包不得反向依赖 app；`domain` 不得导入 RN/DOM/浏览器/Expo API。

## 第三方库登记表

| 库 | 版本 | 用途 | 引入日期 |
| --- | --- | --- | --- |
| expo | ~57.0.13 | 移动端框架与工具链 | 2026-08-16 |
| expo-router | ~57.0.13 | 移动路由（文件式） | 2026-08-16 |
| react-native | 0.86.2 | 移动运行时 | 2026-08-16 |
| react / react-dom | 19.2.8 | UI 运行时（移动/电脑） | 2026-08-16 |
| react-native-safe-area-context | ~5.7.0 | Expo Router 依赖 | 2026-08-16 |
| react-native-screens | ~4.26.0 | Expo Router 依赖 | 2026-08-16 |
| react-native-worklets | 0.10.1 | expo-modules-core peer 要求 | 2026-08-16 |
| vite | 8.2.1 | 电脑端构建 | 2026-08-16 |
| @vitejs/plugin-react | ^5.0.0 | Vite React 支持 | 2026-08-16 |
| typescript | ^5.7.0 | 类型系统 | 2026-08-16 |

## 备注

- pnpm 11 `minimumReleaseAgeExclude`（pnpm-workspace.yaml 尾部）为 pnpm 供应链策略自动维护的"新发布版本豁免清单"，随依赖升级自动增删，不手工编辑。
- Expo 依赖升级后必须跑 `pnpm exec expo install --check`（或对照 `bundledNativeModules.json`）核对配套版本，禁止只升 expo 不升 RN。
