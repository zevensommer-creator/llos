# ADR-FRONTEND-STACK：前端技术栈决策

- 状态：Accepted（Human 通过《LLOS 第一代移动端、电脑端与 Figma 实施指令》采纳）
- 日期：2026-08-15
- 决策人：Human
- 上游依据：`docs/LLOS_MOBILE_UI_FIGMA_TRAE_INSTRUCTIONS_ZH.md` §1、§6-§8

## 决策

### 正式技术组合

```text
设计、流程、高保真原型：Figma
iOS / Android 移动学习端：React Native + Expo + TypeScript（strict）
电脑端完整工作台：React Web + TypeScript（strict）
共享：contracts、API client、领域逻辑、权限、design tokens、i18n、fixtures
PWA：可选备用入口，不是移动端正式验收标准
```

### 版本与包管理规则

1. 精确版本在首次初始化时选择当时的稳定版本；不使用 alpha/beta/canary。
2. 默认 `pnpm workspace`；若仓库已有唯一包管理器，先提交差异报告，不得混用。
3. 提交唯一 lockfile。
4. 版本与选择理由记录于 `frontend/docs/TECH_STACK.md`。
5. 大版本升级单独提交，不与业务功能混合。

### 前端仓库结构（frontend/ 下 pnpm workspace）

```text
frontend/
├── apps/
│   ├── mobile/          # React Native + Expo
│   └── web/             # React Web 电脑工作台
├── packages/
│   ├── api-client/      # 唯一网络访问层
│   ├── contracts/       # schema 生成类型和 validator
│   ├── domain/          # 纯领域逻辑，无 UI/平台依赖
│   ├── permissions/     # capability 和 surface 运算
│   ├── design-tokens/   # tokens.json 和生成产物
│   ├── i18n/            # 文案 keys 和语言资源
│   ├── test-fixtures/   # 与 schema 对齐的 Mock 数据
│   └── test-utils/
└── docs/                # 五份客户端规格文档
```

依赖方向：`apps/* → packages/api-client → packages/contracts`；共享 package 不得反向依赖任何 app；`domain` 不得导入 React Native、DOM、浏览器或 Expo API。

### 移动端必要原生能力

`expo-audio`（或正式替代）、`expo-file-system`、`expo-secure-store`（仅小型秘密）、`expo-notifications`、网络状态、iOS Universal Links / Android App Links、权限声明、EAS 或等价构建流程。

### 每类问题只选一个主要库

状态、表单、UI、路由、查询、表格库各选一个稳定方案，禁止重复引入功能重叠框架；第三方库必须在 TECH_STACK.md 说明用途。

## 后果

- 电脑端路由/表单/查询/表格的最终选型在 UI-1 初始化时以技术 ADR 形式补充到 TECH_STACK.md。
- Figma 生成代码未经审查不进入生产构建；执行 Agent 无法访问 Figma 时标记 `FIGMA_PENDING`，不得虚构链接。
