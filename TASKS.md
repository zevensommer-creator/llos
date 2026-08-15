# TASKS.md — 任务看板（协作真相源）

> 这是所有 Agent 共享的任务看板，是协作的**核心真相源**。
> 开始工作前先读本文件；完成任务后必须更新本文件。
> 认领规则见 `AGENTS.md` v3.0（对等 Agent 动态认领，owner 填 agent_id）。

---

## 任务状态说明

| 状态 | 含义 |
|------|------|
| `todo` | 待认领 |
| `doing` | 进行中（认领后置为此状态） |
| `blocked` | 被阻塞（需说明原因） |
| `done` | 已完成 |
| `review` | 待 Human/对方 review |

---

## 当前任务

| ID | 任务 | 状态 | 所有者 | 优先级 | 依赖 | 备注 |
|----|------|------|--------|--------|------|------|
| T-001 | 搭建协作基础设施（AGENTS/CONVENTIONS/TASKS/README） | done | trae | 高 | — | 已完成 |
| T-002 | 初始化 Git 仓库并提交初始文件 | done | trae | 高 | T-001 | 已完成；Git 路径 `E:\Git\bin\git.exe`；remote `github.com/zevensommer-creator/llos` |
| T-003 | 制定 LLOS 完整第一代产品工程书 | done | trae | 高 | — | 2026-08-15 Human 终审通过（"开始吧"），设计阶段关闭 |
| T-004 | 定义 DLC 市场分类与发现机制 | todo | 待认领 | 中 | T-014 | 由 BUILD_PLAN P4 覆盖；借鉴 Steam Workshop |
| T-005 | 设计账户体系（多用户类型：教师/学生/自由学习者） | todo | 待认领 | 中 | T-014 | 由 BUILD_PLAN P4 覆盖；能力点模型见 product_spec §2 |
| T-006 | 补齐协作环境（目录结构/.gitignore/docs 归档/远程备份） | done | workbuddy | 高 | T-002 | 经 Human 批准执行 |
| T-007 | 工作空间整理：导出/暂存文件夹、历史归档与废稿分离、目录结构对齐 | done | trae | 中 | T-003 | 经 Human 指示执行；废稿与归档均附 README 注明 |
| T-008 | 架构基线 v0.2.0 破坏性升级 | done | trae | 高 | T-003 | 会话模式/三层就绪门/证据中心学习闭环/ADR-010~012；依据两份 Human 意见文档 |
| T-009 | 契约全量升至 v0.2.0 | done | trae | 高 | T-008 | 6 份旧 schema 修订 + 9 份新增 + learning-event-registry.json（闭合注册表） |
| T-010 | UI-0 规格冻结（客户端表面） | done | trae | 高 | T-003 | frontend/docs 五件套 + ADR-CLIENT-SURFACES + ADR-FRONTEND-STACK；Figma 文件本体未建（FIGMA_PENDING）；§13 八项真机决策待 Human |
| T-011 | 产品/计划/协议文档同步更新 | done | trae | 高 | T-008/009/010 | product_spec v0.6 + BUILD_PLAN v1.1（P0.5 + 主线 C）+ AGENTS v3.0（动态认领）+ README |
| T-012 | 契约 fixtures 核心子集 | done | trae | 中 | T-009 | tests/contracts/fixtures/：5 类 schema 正例 + 红线反例；全量扩至 P1 |
| T-013 | GitHub 推送留档（本轮全部变更） | done | trae | 高 | T-008~T-012 | 提交 5e4667d 已推送（48 文件）；设计阶段留档关闭 |
| T-014 | P1：契约代码化管线 + Core/Gateway 骨架 | done | trae | 高 | T-016 | pnpm monorepo；@llos/contracts（15 schema 代码生成 + ajv 校验器 + 53 测试）；@llos/core（追加式事件存储/确定性 reducer/投影/identity/entitlements，18 测试）；@llos/gateway（descriptor 注册表/capability 解析/Fake Provider/fallback，9 测试）；后端栈 TS 全栈（ADR-BACKEND-STACK） |
| T-015 | UI-1：前端工程骨架 | done | trae | 高 | T-013 | frontend/apps（Expo 57 移动 App Shell + Vite/React Web 工作台）+ frontend/packages（design-tokens 生成 RN/CSS + api-client Mock adapter）；班级入口按 create_class 显隐；CI（build/test/typecheck）；版本锁定见 TECH_STACK v0.2 |
| T-016 | P0.5.1 契约一致性 hotfix（ADR-013） | done | trae | 高 | T-013 | Human 复审三严重问题修复：material-pack/session-composition/material-snapshot 升 0.2.1；状态词汇两层统一；T-003 过期锁删除；18 例 fixtures 全通过 |
| T-017 | UI-2：Mock 四旅程 | doing | kimi | 高 | T-015 | Human 指派前端线移交 kimi（Kimi K3）；聊天/学习/教师助手/电脑工作台 × 正常/空白/加载/权限不足/离线/可恢复/不可恢复；交接包见 frontend/docs/HANDOFF.md（验收门 G1-G4） |
| T-018 | P2a：编译器管线 + golden test | done | trae | 高 | T-014 | 已合并 main（cb1b6f6 + 47e159c）；@llos/compiler 三段管线（material.validate → pedagogical.plan → executable.lower，12 类型化错误码）；参考素材 de-hotel-checkin + 参考 DLC de.fsi-construction；30 测试（golden ×2/确定性/素材门 ×7/manifest 反例 ×7）；全 workspace 116 测试 + typecheck 绿；锁已释放。遗留 follow-up：claim 权重归一化、零框架包边界 |
| T-019 | P2b：训练执行引擎 + FSRS 调度器 | done | trae | 高 | T-018 | 已合并 main（82e3c35 + b7d03b0）；core/src/runtime SessionExecutor（12 原语闭集、注册表事件产出、branch 条件路由、迭代/时长硬上限→typed abort、能力失败降级、$complete/$stop 终止符）+ core/src/scheduler FSRS（ts-fsrs 5.4，事件流重放重建 Card，低置信观察过滤）；25 新测试；.gitattributes 强制 LF（修复 T-018 golden 跨平台行尾缺陷）；全 workspace 141 测试绿；锁已释放。follow-up：SM-2 冷启动回退、branch 事实集扩展 |
| T-020 | P2c：掌握判定引擎 + 学习曲线/薄弱点/难度投影 + CLI 完整循环 | done | trae | 高 | T-019 | 已合并 main（8d9cd51 + 6d3db5f）；core/src/policy/mastery（Evidence Policy 确定性解释器，五态判定 not_yet/provisional/learned/uncertain/lapsed + reason codes + supersedes 链 + 保留期延迟成功检测）+ 三投影（curve 按天分桶/weak-spots 可解释排序含逾期复习/difficulty tier）+ scripts/demo-loop.mjs（`pnpm demo:loop`：编译→两轮执行→判定→投影→FSRS，37 事件闭环）；24 新测试（mastery 12 + projections 12）；全 workspace 161 测试 + typecheck 绿；锁已释放 |

---

## 任务认领流程

1. 找到一个 `todo` 状态、且不在 `blocked` 的任务。
2. 在 `current_tasks/` 创建锁文件（格式见 `AGENTS.md` 第 5 节，含 `touched_paths`）。
3. 将本表该任务的"状态"改为 `doing`、"所有者"填自己的 agent_id。
4. 开始工作。
5. 完成后：删除锁文件，将状态改为 `done`，推进下一步。

---

## 已完成任务

| ID | 任务 | 完成时间 | 完成者 |
|----|------|---------|--------|
| T-001 | 搭建协作基础设施 | 2026-08-09 | trae |
| T-002 | 初始化 Git 仓库 | 2026-08-09 | trae |
| T-003 | 第一代产品工程书（设计阶段） | 2026-08-15 | trae（Human 终审） |
| T-006 | 补齐协作环境 | 2026-08-09 | workbuddy |
| T-007 | 工作空间整理 | 2026-08-15 | trae |
| T-008 | 架构基线 v0.2.0 | 2026-08-15 | trae |
| T-009 | 契约 v0.2.0 全量升级 | 2026-08-15 | trae |
| T-010 | UI-0 规格冻结 | 2026-08-15 | trae |
| T-011 | 产品/计划/协议文档同步 | 2026-08-15 | trae |
| T-012 | 契约 fixtures 核心子集 | 2026-08-15 | trae |
| T-013 | GitHub 推送留档 | 2026-08-15 | trae |
| T-016 | P0.5.1 契约一致性 hotfix | 2026-08-15 | trae |
| T-014 | 契约代码化管线 + Core/Gateway 骨架 | 2026-08-16 | trae |
| T-015 | UI-1 前端工程骨架 | 2026-08-16 | trae |

---

## 变更记录

| 时间 | 操作者 | 修改内容 |
|------|--------|---------|
| 2026-08-09 | TRAE | 初始化任务看板 |
| 2026-08-09 | WorkBuddy | 登记并完成 T-006（环境补齐，经 Human 批准） |
| 2026-08-15 | TRAE | T-007 完成：新建 导出/ 与 暂存/；删除旧 src/，建模块目录；.gitignore 增加 导出/ |
| 2026-08-15 | TRAE | T-003 转 review：设计阶段完成，待 Human 全套审核 |
| 2026-08-15 | TRAE | Human 终审通过（"开始吧"）：T-003 转 done；登记 T-008~T-015；T-004/T-005 改为待认领（BUILD_PLAN P4 覆盖）；owner 改用小写 agent_id（AGENTS v3.0） |
| 2026-08-15 | TRAE | Human 复审 hotfix（ADR-013）：T-016 登记并完成——三份契约升 0.2.1、状态词汇统一、待决表更新、T-003 过期锁删除；T-014/T-015 解除阻塞 |
| 2026-08-16 | TRAE | T-014 完成：pnpm monorepo + @llos/contracts（代码生成/校验器/53 测试）+ @llos/core（events/identity/entitlements，18 测试）+ @llos/gateway（注册表/Fake Provider/fallback，9 测试）；.gitignore 增加 dist/；锁文件已释放 |
| 2026-08-16 | TRAE | T-014 推送并合并 main（6e5ff6c + f23899b）；T-015 认领并完成：UI-1 前端骨架（apps/mobile Expo 57 + apps/web Vite + design-tokens + api-client Mock + CI），86 测试全通过；TECH_STACK v0.2 版本锁定；锁文件已释放 |
| 2026-08-16 | Human | 前端/UI 工作线移交新 Agent kimi（Kimi K3）：UI-2 起由 kimi 认领；交接包 frontend/docs/HANDOFF.md（含验收门 G1-G4 与阻塞项登记）；T-017 登记 |
| 2026-08-16 | kimi | 认领 T-017（UI-2 Mock 四旅程）→ doing；G1 环境验证：前端线独立全绿（build/test/typecheck 通过，前端 6 测试过）。**发现 main 整体构建红**：@llos/compiler（T-018，trae 的 doing 任务，其 touched_paths）TS 报错未过——不属本任务范围，按 AGENTS §4 不改，需 trae 修复或挪 feature 分支 |
| 2026-08-16 | TRAE | T-018 完成 → review：@llos/compiler 三段管线 + 参考素材/参考 DLC + 30 测试（golden ×2/确定性/素材门/manifest 反例）；回应 kimi 登记项——编译器 typecheck 已绿，全 workspace 116 测试通过；分支 feature/trae-compiler-golden 推送待审，合并 main 后释放锁 |
| 2026-08-16 | Human | 确认 T-018 合并：feature/trae-compiler-golden → main（cb1b6f6 + merge 47e159c）；T-018 置 done，锁已释放；下一步 T-019 |
| 2026-08-16 | TRAE | T-019 认领（P2b 训练执行引擎 + FSRS 调度器）→ doing；分支 feature/trae-runtime-executor；范围 core/src/runtime + core/src/scheduler；SM-2 冷启动回退记为 follow-up（ts-fsrs 默认权重即冷启动策略） |
| 2026-08-16 | TRAE | T-019 完成 → review：SessionExecutor + FSRS（25 新测试）；发现并修复 T-018 遗留跨平台缺陷——autocrlf 把模板检出为 CRLF 致 golden 哈希漂移，Linux CI 必红；新增 .gitattributes（* text=auto eol=lf）根因修复；全 workspace 141 测试绿 |
| 2026-08-16 | Human | 确认 T-019 合并：feature/trae-runtime-executor → main（82e3c35 + merge b7d03b0）；T-019 置 done，锁已释放；P2 剩余（学习曲线/薄弱点推荐/自适应难度）待登记 |
| 2026-08-16 | TRAE | T-020 认领（P2c 掌握判定 + 三投影 + CLI 完整循环）→ doing；分支 feature/trae-mastery-projections；范围 core/src/policy + core/src/projections + scripts/ |
| 2026-08-16 | TRAE | T-020 完成 → review：mastery 五态判定 + 24 新测试；CLI `pnpm demo:loop` 打通 P2 验收完整循环（16 步 IR → 两轮会话 34 事件 → 3 claims learned → FSRS P7D 复习 → 37 事件封存）；全 workspace 161 测试绿 |
| 2026-08-16 | Human | 确认 T-020 合并：feature/trae-mastery-projections → main（8d9cd51 + merge 6d3db5f）；T-020 置 done，锁已释放；**P2 阶段（T-018/019/020）全部完成**，下一步 P3 发音证据管线待登记 |

---

*任务看板 · 最后更新：2026-08-16 · 维护者：所有 Agent + Human*
