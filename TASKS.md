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
| T-017 | UI-2：Mock 四旅程 | done | kimi | 高 | T-015 | 已合并 main（bb40ff9）；@llos/api-client 七态 LoadState（正常/空白/加载/权限不足/离线/可恢复/不可恢复）+ 稳定错误类型 + VIEW_MODELS 强制 ViewModel 集 + describeState 呈现描述符（20 测试，新增 17）；web 三旅程（聊天/学习/电脑工作台）与 mobile 三旅程（聊天/学习/教师助手）经统一 StateView 七态渲染；聊天永不显示学习进度（§6）；权限门模拟服务端重新授权（§2）；全 workspace 262 测试 + build/typecheck 绿；锁已释放 |
| T-018 | P2a：编译器管线 + golden test | done | trae | 高 | T-014 | 已合并 main（cb1b6f6 + 47e159c）；@llos/compiler 三段管线（material.validate → pedagogical.plan → executable.lower，12 类型化错误码）；参考素材 de-hotel-checkin + 参考 DLC de.fsi-construction；30 测试（golden ×2/确定性/素材门 ×7/manifest 反例 ×7）；全 workspace 116 测试 + typecheck 绿；锁已释放。遗留 follow-up：claim 权重归一化、零框架包边界 |
| T-019 | P2b：训练执行引擎 + FSRS 调度器 | done | trae | 高 | T-018 | 已合并 main（82e3c35 + b7d03b0）；core/src/runtime SessionExecutor（12 原语闭集、注册表事件产出、branch 条件路由、迭代/时长硬上限→typed abort、能力失败降级、$complete/$stop 终止符）+ core/src/scheduler FSRS（ts-fsrs 5.4，事件流重放重建 Card，低置信观察过滤）；25 新测试；.gitattributes 强制 LF（修复 T-018 golden 跨平台行尾缺陷）；全 workspace 141 测试绿；锁已释放。follow-up：SM-2 冷启动回退、branch 事实集扩展 |
| T-020 | P2c：掌握判定引擎 + 学习曲线/薄弱点/难度投影 + CLI 完整循环 | done | trae | 高 | T-019 | 已合并 main（8d9cd51 + 6d3db5f）；core/src/policy/mastery（Evidence Policy 确定性解释器，五态判定 not_yet/provisional/learned/uncertain/lapsed + reason codes + supersedes 链 + 保留期延迟成功检测）+ 三投影（curve 按天分桶/weak-spots 可解释排序含逾期复习/difficulty tier）+ scripts/demo-loop.mjs（`pnpm demo:loop`：编译→两轮执行→判定→投影→FSRS，37 事件闭环）；24 新测试（mastery 12 + projections 12）；全 workspace 161 测试 + typecheck 绿；锁已释放 |
| T-021 | P3a：发音证据管线骨架 + 质量门/弃权协议 | done | trae | 高 | T-020 | 已合并 main（93ac11e + 7fbde44）；@llos/speech 端口化管线（AudioAnalyzer/VAD/ASR/G2P/Aligner + Fake 引擎零推理成本）；德语画像 de-DE 0.1.0（Stage 0 保守阈值：SNR≥15/完整性≥0.8/对齐覆盖≥0.9）+ G2P 词典 25 词 + 规则回退（ich/ach 分辨、词尾清化、长短元音启发，全部标 uncertain）；PronunciationAssessment 全路径契约组装（45 测试：弃权矩阵 §8.3 ×9 + 质量门 ×10 + G2P ×10 + 匹配 ×7 + 编排确定性/不误拒 ×9）；后端 5 包 200 测试 + typecheck 绿；锁已释放。声学重引擎适配器留后续 |
| T-022 | P3b：GOP/韵律证据 + 德语校准器 + 四专项诊断 | done | trae | 高 | T-021 | 已合并 main（5467542 + 3d513ee，fast-forward）；GopPort/ProsodyPort（Praat 形状：元音时长/F1F2/F0/强度/发音速率）+ Fake 引擎扩展；共享音素表 phones.ts（长短元音类别/前后圆唇对照/清浊尾映射/Stage 0 参考）；四专项诊断（vowel_quantity/front_rounded_vowel/ich_ach_laut/final_devoicing）+ 通用替换回退，全部带 feedback_key 与教学优先级；可接受变体层（r 实现互通/词首 China ch/词尾 -ig→k/-er→ɐ）；证据融合方向敏感（GOP 指控+声学支持标准音→弃权；双证一致→confirmed；单证→suspected；低置信→弃权）；德语校准器三维度（维度级弃权保留）；27 新测试（FCR ≤5% 标注语料门）；全 workspace 8 包 250 测试 + typecheck 绿；锁已释放。遗留 follow-up：阈值待真实声学数据校准（Stage 0 保守值） |
| T-023 | P3c：发音证据入 Core 闭环 + Piper TTS Provider | done | trae | 高 | T-022 | 已合并 main（164e6f9，fast-forward）；发音证据入 Core 闭环完成：core/src/speech/bridge.ts（assessment→观察→observation.recorded 事件，claim 绑定归 DLC，弃权原因码→闭合枚举确定性映射）；gateway 注册 Piper TTS（provider.tts.piper-local，capability 限 tts.demo_reading，内容寻址缓存 Fake adapter，非母语标准红线写入 descriptor）；scripts/speech-metrics.mjs（§13.2 四门全过：precision 1.0/FCR 0.0/对齐 1.0/单证只 suspected）；12 新测试（bridge 7 + piper 5）；全 workspace 262 测试 + typecheck 绿；锁已释放。**P3 阶段（T-021/022/023）全部完成** |
| T-024 | P4a：账户体系完整化（注册/登录/会话 + 授权门 + 邀请码链） | done | trae | 高 | T-023 | 已合并 main（4ac5c6c，fast-forward）；InMemoryCredentialStore（scrypt+随机盐+timingSafeEqual，明文不落库）；InMemorySessionStore（不透明令牌/过期/登出/revokeAllFor）；授权门 grantCapabilityAs/revokeCapabilityAs/setVerificationAs（manage_users 门禁，存储原语保持无策略，§2.4 服务端重授权红线）；InMemoryInvitationStore（create_class 链式传播：仅能力持有者可发码，redeem 授予后可续发；单次/多次用途、仅发放者可撤销，typed InvitationError）；10 新测试；core 80 + 全 workspace 272 测试 + typecheck 绿；锁已释放 |
| T-025 | P4b：市场后端 + 免费获取授权 | done | trae | 高 | T-024 | 已合并 main（ed707e8，fast-forward）；@llos/market 新包（9 包）；MarketService——发布门禁 publish_dlc；listing（语言/难度/自由标签/计费模型+边界校验）；query 筛选（语言主分类+难度+标签 AND+搜索）与排序（newest/rating_desc/downloads_desc）；免费获取→core entitlementStore 永久授权，幂等，resource_ref=dlc/<id> 无版本（§6.7）；评价门禁已获取（§4.3），一用户一评覆盖更新；付费模型 pricing_not_available（P8）；版本更新仅发布者；core 微扩展 entitlements.get() 只读原语；8 新测试；全 workspace 280 测试 + typecheck 绿；锁已释放 |
| T-026 | P4c：学生端 + 市场 UI + E2E 验收 | done | trae | 高 | T-017/T-025 | 已合并 main（7e23edb，fast-forward）；desktop_web 市场闭环：市场页（筛选/搜索/排序）+ DLC 详情 + 免费获取（付费门禁提示 P8）+ 训练入口 + 评价（门禁=已获取，§4.3）；api-client 新增 queryMarket/getMarketListing/acquireListing/submitReview + 模块级市场状态（11 新测试）；scripts/e2e-p4.mjs（`pnpm e2e:p4`）打通 BUILD_PLAN P4 验收门：注册→免费获取参考 DLC→完成训练（compiler+executor 两会话 34 事件）→可评价，8/8 步含三门禁反例；全 workspace 291 测试 + build/typecheck 绿；锁已释放。**P4 阶段（T-024/025/026）全部完成** |
| T-027 | P5a：班级核心——班级 CRUD + 邀请码进出 + 成员管理 | done | trae | 高 | T-024 | 已合并 main（daa5022，fast-forward）；core/src/classes.ts：ClassService——createClass（create_class 门禁）/updateClass/archiveClass（仅创建者，归档后冻结）；班级邀请码（复用邀请码机制：llos-class-*，maxUses/仅发放者撤销，redeem=加入，join_class 门禁，已在班幂等不耗次数，归档班拒入）；removeMember/leaveClass——离班仅撤销 source=class:<id> 的授权（§5.4 个人授权保留），创建者不可被移除/退出；多班级并存；创建者自动为首成员；配套 entitlements 增 source 可选字段 + entitlementsBySource/revokeBySource 原语（存储保持无策略）；16 新测试（core 96）；全 workspace 307 测试 + build/typecheck 绿；锁已释放 |
| T-028 | P5b：DLC 分配 + 顺序/截止 + 通知 + 班级统计投影 | todo | 待认领 | 高 | T-027 | 免费 DLC 分配自动授权（source=class:<id>，后加入成员同步获得）；创作者自有 DLC 班级自动免费（§4.2）；付费 C 方案框架（teacher_purchase 待 P8 / recommend_self_purchase）；先修顺序（仅班级内生效）+ 截止日期（只影响按时完成率，不锁学习权利，§5.5）；教师通知；统计投影从学习事件聚合（成员完成度/班级完成率/薄弱点/时长，前端只读 Core 投影，§5.6） |
| T-029 | P5c：班级 UI + E2E 验收 | todo | 待认领 | 高 | T-017/T-028 | desktop_web：教师建班/邀请码/成员管理/分配/通知/统计 + 学生输码入班/查看分配与截止；api-client Mock 扩展；scripts/e2e-p5.mjs 打通 BUILD_PLAN P5 验收门：教师建班→生成邀请码→学生加入→分配参考 DLC→教师查看统计 |

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
| T-017 | UI-2 Mock 四旅程七态 | 2026-08-16 | kimi |

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
| 2026-08-16 | TRAE | P3 拆三步登记：T-021（管线骨架+质量门/弃权）/ T-022（GOP+诊断）/ T-023（入 Core 闭环+TTS）；T-021 认领 → doing，分支 feature/trae-speech-pipeline，范围 speech/ + pnpm-workspace.yaml；Silero/faster-whisper/MFA/Praat 等 Python 重引擎以类型化端口 + Fake 锁协议，真实适配器后续任务 |
| 2026-08-16 | TRAE | T-021 完成 → review（93ac11e，21 文件 +1902 行）：speech 包 45 新测试全绿（弃权矩阵含 insufficient_speech/asr_disagreement/alignment 双态/provider_failure/语言与模式不支持/降级不弃权）；后端 5 包 200 测试 + typecheck 绿；待 Human 确认合并 |
| 2026-08-16 | Human | 确认 T-021 合并：feature/trae-speech-pipeline → main（93ac11e + 7fbde44，fast-forward）；T-021 置 done，锁已释放；T-022 开工 |
| 2026-08-16 | TRAE | T-022 认领（P3b GOP/韵律 + 校准器 + 四专项诊断）→ doing；分支 feature/trae-speech-gop；范围 speech/（GOP/Prosody 端口 + 校准器 + 诊断 + 可接受变体层 + FCR 测试）；核心控制：issue 需双证据一致（GOP + 独立声学），单证据只 suspected，低置信弃权 |
| 2026-08-16 | TRAE | 事故记录：工作区 `.git` 目录被清空（原因不明，疑似沙箱/同步软件误删），本地仓库元数据丢失；工作树完好。经非破坏性恢复（init + fetch origin + reset origin/main），全部已推送历史无丢失（远程 main ba9951b 含 T-021 收尾）；T-022 分支重建后照常提交 |
| 2026-08-16 | TRAE | T-022 完成 → review（5467542）：GOP/韵律端口 + 四专项诊断 + 可接受变体层 + 校准器（27 新测试，FCR ≤5% 门）；证据融合方向敏感（GOP 指控+声学背书→弃权；双证一致→confirmed；单证→suspected）；全 workspace 8 包 250 测试 + typecheck 绿；待 Human 确认合并 feature/trae-speech-gop |
| 2026-08-16 | Human | 确认 T-022 合并：feature/trae-speech-gop → main（5467542 + 3d513ee，fast-forward）；T-022 置 done，锁已释放；T-023 开工 |
| 2026-08-16 | TRAE | T-023 认领（P3c 发音证据入 Core 闭环 + Piper TTS Provider）→ doing；分支 feature/trae-speech-core-loop；范围 core/src/（发音观察桥接）+ gateway/src/（Piper descriptor + 示范朗读 adapter）+ scripts/（指标 harness）；桥接层原则：speech 输出证据，Core 确定性转换，维度弃权→低置信观察，不伪造测量置信度 |
| 2026-08-16 | TRAE | T-023 完成 → review：core/src/speech 桥接（scored→scalar 观察/abstained→显式弃权/无 claim 绑定跳过/弃权原因码 9 类映射闭合枚举/observation.recorded 事件幂等键去重/经 reducer 直接流转）；gateway Piper TTS（descriptor 契约校验+注册，capability 仅 tts.demo_reading，Fake adapter 内容寻址缓存，§10"非母语教师标准"红线写入 description）；`pnpm metrics:speech` §13.2 Stage 0 四门全过（高置信精确率 1.0≥0.9 / FCR 0.0≤0.05 / 对齐成功率 1.0≥0.95 / 单证据只 suspected）；12 新测试，全 workspace 262 测试 + typecheck 绿；待 Human 确认合并 feature/trae-speech-core-loop |
| 2026-08-16 | Human | 确认 T-023 合并：feature/trae-speech-core-loop → main（164e6f9，fast-forward）；T-023 置 done，锁已释放；**P3 阶段（T-021/022/023）全部完成**；下一步 P4（市场/账户）或 kimi T-017 验收 |
| 2026-08-16 | TRAE | Human 指示登记 P4 并开工：拆三步登记 T-024（账户体系完整化）/ T-025（市场后端+免费获取）/ T-026（学生端+市场 UI+E2E，依赖 kimi T-017）；T-024 认领 → doing，分支 feature/trae-identity-accounts，范围 core/src/（credentials/sessions/invitations + 授权门）+ core/test/；存储原语保持无策略，授权门在服务层（§2.4 服务端重授权红线） |
| 2026-08-16 | TRAE | T-024 完成 → review：credentials（scrypt 64B+16B 盐+timingSafeEqual，明文/空密码边界拒绝）；sessions（randomBytes 32B 不透明令牌，ISO 过期校验，revokeAllFor 支持改密/封禁全端登出）；授权门三函数（CapabilityAdminError typed，未持 manage_users 全拒，现有 identity 原语测试不受影响）；invitations（code llos-inv-*，链式传播验证 A→B→C，maxUses 语义，仅发放者撤销，InvitationError 5 错误码）；10 新测试；全 workspace 272 测试 + typecheck 绿；待 Human 确认合并 feature/trae-identity-accounts |
| 2026-08-16 | Human | 确认 T-024 合并：feature/trae-identity-accounts → main（4ac5c6c，fast-forward）；T-024 置 done，锁已释放；指示开始 T-025（市场后端） |
| 2026-08-16 | TRAE | T-025 认领 → doing：分支 feature/trae-market-backend；范围 market/ 全新 @llos/market 包 + core/src/entitlements.ts（get() 只读原语，锁范围含 core/src/entitlements.ts）；授权写入一律经注入的 core entitlementStore（§12 market 不绕过 Core）；resource_ref=dlc/<dlc_id> 无版本（§6.7） |
| 2026-08-16 | TRAE | T-025 完成 → review：MarketService 单门面（publish/updateVersion/query/view/acquireFree/review/reviewsFor）；修复两处——下载计数 `?? 0` 优先级 bug（会导致计数停 1）、幂等获取改用 entitlements.get() 不刷 granted_at；测试断言修正（rating_desc 语义为平均分降序，5.0>4.5 正确）；8 新测试（发布门禁/边界校验/筛选搜索排序/幂等永久授权/付费拒获取/评价门禁与覆盖更新/聚合排序/版本更新与存量授权）；全 workspace 280 测试 + typecheck 绿；待 Human 确认合并 feature/trae-market-backend |
| 2026-08-16 | Human | 确认 T-025 合并：feature/trae-market-backend → main（ed707e8，fast-forward）；T-025 置 done，锁已释放 |
| 2026-08-16 | TRAE | 仓库整理（Human 指示）：删除远端 9 个已合并 feature 分支（compiler-golden/contract-codegen/identity-accounts/mastery-projections/runtime-executor/speech-core-loop/speech-gop/speech-pipeline/ui-skeleton）+ 本地残留 master 与已合并 identity-accounts；远端仅剩 main + feature/trae-market-backend（合并后亦删） |
| 2026-08-16 | TRAE | 完成 kimi 遗留工作（Human 指示）：① HANDOFF G4 代核关闭——GitHub API 查 12 次 CI run 全 success（含 kimi 首跑 run 10 @ a56d7cf），B1 阻塞项关闭，交接登记 transferred，前端线由 trae 代管；② T-026 认领 → doing，分支 feature/trae-student-market-e2e，范围 frontend/apps/web + scripts/（E2E 验收脚本）+ frontend/packages/api-client |
| 2026-08-16 | kimi | T-017 完成：UI-2 Mock 四旅程七态——@llos/api-client 七态 LoadState（正常/空白/加载/权限不足/离线/可恢复/不可恢复）+ 稳定错误类型 + VIEW_MODELS 强制 ViewModel 集 + describeState 呈现描述符；web（聊天/学习/电脑工作台）与 mobile（聊天/学习/教师助手）六旅程经统一 StateView 渲染；聊天不显示学习进度（§6）；权限门=服务端重新授权模拟（§2）；api-client 20 测试（新增 17）；全 workspace 262 测试 + build/typecheck 绿；提交 bb40ff9 直提 main（本地 .git 分支创建损坏，经 Human 指示直接继续），锁已释放 |
| 2026-08-16 | TRAE | T-026 完成 → review：desktop_web 市场页/DLC 详情/获取流程/训练入口/评价（门禁提示）；api-client 四新方法 + 模块级市场状态 + resetMockMarket（11 新测试，含筛选/排序/幂等获取/付费门禁/评价门禁与覆盖更新）；工作台授权列表改为动态（市场获取 source=free + 班级分配示例）；scripts/e2e-p4.mjs 以真实后端包（core/market/compiler）跑 P4 验收门 8/8 步（注册/登录→发布门禁反例→免费获取幂等→付费门禁反例→评价门禁反例→两会话训练 34 事件→评价覆盖更新）；根 package.json 增 @llos/market devDep 与 e2e:p4 脚本；全 workspace 291 测试 + build/typecheck 绿；待 Human 确认合并 feature/trae-student-market-e2e |
| 2026-08-16 | Human | 确认 T-026 合并：feature/trae-student-market-e2e → main（7e23edb，fast-forward）；T-026 置 done，锁已释放，合并后分支已删；同时补推了 T-025 漏推的 ed707e8（此前 origin/main 停在 caa304d）。**P4 阶段全部完成** |
| 2026-08-16 | TRAE | Human 指示开始 P5（班级系统）：按 P4 三步模式登记 T-027（班级核心：CRUD+邀请码进出+成员管理）/ T-028（分配+顺序截止+通知+统计投影）/ T-029（班级 UI+E2E 验收）；T-027 认领 → doing，分支 feature/trae-class-core，范围 core/src/（classes.ts 新增 + entitlements.ts source 扩展）+ core/test/ |
| 2026-08-16 | TRAE | T-027 完成 → review：ClassService（create/update/archive 创建者门禁，归档后冻结更新与招新）；班级邀请码 llos-class-*（maxUses/仅发放者撤销/redeem=加入，join_class 门禁，已在班幂等不耗次数）；removeMember/leaveClass 离班语义——仅撤销 source=class:<id> 授权（§5.4 个人已付费/已获取保留），创建者不可移除或退出；多班级并存互不牵连；entitlements 增 source 可选字段 + entitlementsBySource/revokeBySource（存储原语保持无策略，策略在 ClassService）；16 新测试（门禁反例 ×4/幂等加入/多用途码/归档拒入/§5.4 撤销语义 ×3/多班级隔离）；core 96 + 全 workspace 307 测试 + build/typecheck 绿；待 Human 确认合并 feature/trae-class-core |
| 2026-08-16 | Human | 确认 T-027 合并：feature/trae-class-core → main（daa5022，fast-forward）；T-027 置 done，锁已释放，合并后分支已删；指示继续 T-028 |

---

*任务看板 · 最后更新：2026-08-16 · 维护者：所有 Agent + Human*
