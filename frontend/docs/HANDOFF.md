# HANDOFF — 前端/UI 工作线交接包（trae → kimi）

> 交接日期：2026-08-16 · 移出方：trae · 接收方：kimi（Kimi K3） · 批准：Human
> 依据：AGENTS.md v3.0 对等 Agent 动态认领；本文件是前端工作线的所有权交接包与验收门。

## 1. 交接范围

| 项 | 所有权 |
|----|--------|
| `frontend/apps/`（mobile + web） | kimi |
| `frontend/packages/`（design-tokens、api-client 及后续共享包） | kimi |
| `frontend/docs/`（TECH_STACK、HANDOFF；CLIENT_SURFACE_SPEC / VIEW_MODELS / ACCESSIBILITY / FIGMA_HANDOFF 冻结稿） | kimi 维护（冻结稿变更需 Human） |
| UI-2 ~ UI-6 全部客户端任务 | kimi |
| `.npmrc`（node-linker=hoisted）、CI 中前端部分 | kimi |
| **不转出**：`docs/contracts/`（冻结，ADR 门控）、`contracts/`（代码生成管线）、`core/`、`gateway/`、`compiler/` | trae / 其他 Agent |

## 2. 当前状态（截至 b5c4b76，main）

- UI-1 已完成并合并 main：Expo 57 移动 App Shell（四标签 + 班级标签按 `create_class` 显隐）、Vite 8 + React 19 电脑工作台、design-tokens（tokens.json → CSS 变量 + 冻结 CJS）、api-client（Mock adapter）、GitHub Actions CI。
- 全 workspace 86 测试通过（前端线：design-tokens 3 + api-client 3）。
- 版本锁定与升级规则见 `frontend/docs/TECH_STACK.md` v0.2（**必读**：Expo 配套版本以 `expo/bundledNativeModules.json` 为准）。

## 3. 环境陷阱（部落知识清单——此前只存在于 trae 会话记忆）

| 陷阱 | 规避方式 |
|------|---------|
| `pnpm`/`node` 不在 PATH | Node 在 `E:\New Folder`（v24.16.0）。先 `$env:Path = "E:\New Folder;$env:Path"` 再 `corepack pnpm …`；或让 Human 写入用户 PATH |
| git 不在 PATH | 用绝对路径 `E:\Git\bin\git.exe` |
| npm 官方源偶发 ECONNRESET | 直接**原命令重试**（通常一次成功）；不要换镜像源 |
| PowerShell 5.1 | 不支持 `&&` 与 heredoc；中文提交信息用 `-F 文件`（注意 `Set-Content -Encoding UTF8` 会加 BOM，用无 BOM 写入） |
| Expo 版本漂移 | 只升 expo 不升 RN 必炸；改依赖后 `pnpm exec expo install --check`（离线时对照 bundledNativeModules.json） |
| pnpm 供应链策略 | `pnpm-workspace.yaml` 尾部 `minimumReleaseAgeExclude` 由 pnpm 自动增删，勿手工编辑 |

## 4. 依赖地图

```text
上游（不可绕过）：
  docs/contracts/*.schema.json（冻结；变更走 ADR + Human）
    → contracts/（@llos/contracts：15 schema 类型/校验器，trae 维护）
      → frontend/packages/api-client（UI-4 时接入真实类型替换临时类型）
  frontend/docs/CLIENT_SURFACE_SPEC.md（UI 冻结规格：权限公式/信息架构/录音状态机/离线）
  frontend/docs/TECH_STACK.md（版本与第三方库登记，kimi 维护）

下游：
  UI-4 依赖 trae 的 @llos/contracts 类型生成（已完成，见 T-014）
  UI-5 对齐 P4-P7 产品层（市场/班级/Studio——尚未开工）

协调通道：TASKS.md（看板）+ Git；跨线冲突 Human 裁决。
```

## 5. 验收门（Acceptance Gate）

**交接在 kimi 独立完成以下全部动作前不算关闭**（Iron Law：不能只收文档）：

| # | 门 | 通过标准 | 状态 |
|---|-----|---------|------|
| G1 | 环境独立可跑 | kimi 在自己会话中执行 `pnpm install` → `pnpm -r build` → `pnpm -r test` → `pnpm -r typecheck` 全绿 | ✅ 2026-08-16：全 workspace 262 测试 + build/typecheck 全绿（api-client 20 测试含新增 17） |
| G2 | 独立改码验证 | kimi 独立完成 UI-2 全量实现（七态模型 + 四旅程），流水线全绿，提交并入 main | ✅ 2026-08-16：提交 bb40ff9（24 文件，全在 frontend/）+ a56d7cf。注：本地 .git 分支创建损坏（refs 写不进去），经 Human 指示直提 main，未走 feature/kimi-* 分支 |
| G3 | 认领登记 | 在 TASKS.md 变更记录登记 agent_id `kimi`；认领 T-017 并创建锁文件 | ✅ 2026-08-16：TASKS.md 认领（doing→done）+ T-017__kimi.lock 建/删全程留痕 |
| G4 | CI 确认 | GitHub Actions 首跑结果核对（确认绿或登记阻塞） | ✅ 2026-08-16：trae 代核（kimi 工具无法读 Actions）——GitHub API 查 12 次 run 全 success，含 kimi 首跑 run 10（a56d7cf）与最新 run 12（caa304d） |

**阻塞项登记（Blocker Register）**：

| ID | 阻塞项 | 责任人 | 状态 |
|----|--------|--------|------|
| B1 | CI 首跑尚未人工核对 | kimi（G4） | closed 2026-08-16：trae 代核，12 次 run 全 success（含首跑 run 10） |
| B2 | Figma 本体 FIGMA_PENDING（外部资产，不阻塞 UI-2 Mock） | Human | open |
| B3 | CLIENT_SURFACE_SPEC §13 八项真机决策待 Human（不阻塞 UI-2，阻塞 UI-3） | Human | open |

G4 确认后交接关闭：kimi 在本文件登记 `transferred: 2026-08-16`。

**transferred: 2026-08-16** — G1–G3 由 kimi 独立完成，G4 因 kimi 工具无法读取 Actions 结果，经 Human 指示由 trae 代核关闭（12 次 CI run 全 success）。交接门全部关闭。kimi 离席后前端工作线暂由 trae 代管（T-026 起，见 TASKS.md）。

## 6. 下一步（UI-2，任务号见 TASKS.md T-017）

四条 Mock 旅程（聊天 / 学习 / 教师助手 / 电脑工作台），每条覆盖：正常、空白、加载、权限不足、离线、可恢复失败、不可恢复失败。规则：
- 只用 `@llos/api-client` 接口，页面禁止散落 fetch；
- ChatSession 永不显示学习进度（CLIENT_SURFACE_SPEC §6）；
- 显隐只是体验层，写操作服务端重新授权（§2）；
- 临时类型不得再扩——需要新字段先提 TASKS.md（UI-4 换契约类型时少返工）。

## 7. 协作要点（AGENTS.md v3.0 摘要）

- 先读 `AGENTS.md` 全文再动手；认领：TASKS.md 置 doing + `current_tasks/<T-xxx>__kimi.lock`（touched_paths）；
- 分支 `feature/kimi-<描述>`；每子任务即 commit + push；每日 merge main；
- 提交信息 `<类型>: <一句话> (T-<任务号>)`；
- 红线：不绕过 schema、不让 LLM 写学习状态、素材不进 DLC、品牌名不进业务代码。
