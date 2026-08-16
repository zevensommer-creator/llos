# ADR-014：Studio 真实 API 纵向切片（组合根 + JSON-RPC over HTTP + 去 Mock 开关）

- **状态**：提议（T-037 交付，待 GLM 终验后 fast-forward 合并）
- **日期**：2026-08-16
- **影响契约**：无（非破坏性 ADR；不修改任何 schema，不触碰 Core/DLC 边界）
- **关联**：T-037、ADR-BACKEND-STACK、ADR-CLIENT-SURFACES、ADR-FRONTEND-STACK、架构基线 §2/§3

## 背景

T-017（UI-2）以来前端依赖 `MockApiClient` 演示七态，P6/P7 的服务端能力（市场、班级、BYOK、Studio 草稿/发布/修订/下架）只有独立包测试，没有一条「真实 HTTP 请求 → 域服务 → 前端 ViewModel」的纵向切片。T-037 的目标是打通该切片：新增 `api/` 组合根聚合真实域服务，`HttpApiClient` 以 fetch 指向真实端点，`VITE_API_MODE` 在 mock 与 real 之间切换，且写操作在服务端重新授权、BYOK 明文零泄漏。

## 决策

### 1. `api/` 组合根：复用域服务，不复制业务规则

- 新建 workspace 包 `@llos/api`，聚合 `@llos/core`（账户/授权/事件/会话/BYOK/班级/分配/通知/投影）、`@llos/market`、`@llos/gateway`（Provider 注册表）、`@llos/studio`（草稿/发布）。
- 存储用各包的 InMemory 实现（与核心包测试同源），组合根只负责装配与种子，不包含任何业务规则实现。
- 种子数据刻意走真实服务路径（createDraft → confirm → publishDraft → createClass → issueInvitation → redeemInvitation → assign），保证「演示数据」与「用户数据」经过完全相同的门禁与校验。

### 2. JSON-RPC over HTTP（借鉴开源方法表模式）

- 零第三方依赖的 `node:http` 外壳：`POST /api/rpc` → 判别联合 `{ok:true,result} | {ok:false,error}`；`GET /health` 供 CI/本地探活；body 超 1MB 返回 413。
- 方法表（MethodMap）模式借鉴 MIT 许可的 `tinyjsonrpc-server`：统一 `registerMethods` 式路由、`requestContext` 携带身份、传输层错误收敛为稳定错误码（`invalid_request / method_not_found / session_expired / unknown`）。
- 与 tinyjsonrpc-server 的关键差异：域错误不落在 RPC 错误层，而是在方法内部映射为 result outcome（判别联合），保证前端只消费稳定 ViewModel。

### 3. Wire 类型 1:1 镜像，RPC 层零业务逻辑

- `api/src/wire.ts` 是客户端 `types.ts` 的 1:1 镜像；`HttpApiClient` 只做 transport，不做 remap。
- 域逻辑全部留在域服务；RPC 层只做参数解析（`asObj/s/sOpt/nOpt`）与 outcome 映射。
- 必需映射显式记录：市场 `purchase` → 前端 `one_time`；`ByokEntryView.registered_at` → `created_at`；`startRevision` 从 `manifest.dlc_id` 解析已发布草稿；`listStudioDlcs` = 已发布草稿筛选。

### 4. HttpApiClient + VITE_API_MODE 去 Mock 开关

- `frontend/packages/api-client/src/http.ts` 实现 `ApiClient` 接口全部 40 个方法（fetch + 10s 超时 + AbortController）。
- `frontend/apps/web/src/apiClient.ts` 工厂：`VITE_API_MODE === "real"` 时注册 `HttpApiClient`（账户 id 按 `accountKind` 映射），否则 `MockApiClient`（scenario 用于七态演示）。
- vite dev proxy：`/api` → `http://127.0.0.1:8787`；`pnpm --filter @llos/api start` 启动真实端点；`pnpm --filter @llos/app-web dev:real`（`vite --mode real`，加载 `.env.real`）进入真实模式。

### 5. 服务端重新授权（隐藏按钮只是表现层）

- capability 检查在域服务内部：`createDraft`（create_dlc_draft）、`publishDraft`（publish_dlc）、`createClass`（create_class）、`redeemInvitation`（join_class）。
- 种子教师账户由组合根（系统自身）按产品 §2.4 管理员流程授予 `create_class`；`publish_dlc` 属 BASE 能力。

### 6. BYOK 零泄漏

- `ByokVault.list()` 只返回掩码视图（`前3…后4`）；明文密钥仅作为请求参数单向传输，任何响应不含明文。
- 集成测试断言 `!JSON.stringify(result).includes(secret)`。

### 7. 网络/域错误 → 稳定 ApiErrorCode

- 网络失败/超时 → `network_timeout`；非 2xx → `unknown`；`session_expired` 透传；其余域错误落在 result outcome 内（如 `not_found/state_invalid/capability_missing/...`），前端按 `ApiErrorCode` 五值稳定处理。

### 8. 确定性平台 Provider（不依赖模型品牌）

- `api/src/platform.ts` 注册 schema 合法的平台 Provider（`material.generation` + operations `structure/generate/ocr`），descriptor 枚举值严格镜像 `gateway/src/byok.ts` 已验证值。
- `routeDeterministic()`：OCR → base64→UTF-8 确定性解码；其余 → `deterministicStructureTransport` 行协议（Szenario/Valenz/Konstruktion）。
- BYOK 通过 `prefer_provider_ids` 优先路由，平台侧为 fallback（不变量 4：业务代码只请求 capability，不依赖品牌）。

## 验证

- `api/` 集成测试 10/10 通过：health；传输层错误；组合根种子与授权；Studio 全流程（text-ingest→edit→confirm→sandbox→publish→list）；OCR base64 摄入；服务端重授权反例（learner 的 create_class/publish_dlc 被拒）；市场（免费获取/重复获取/已下架/详情/评价门禁）；班级全流程（邀请→加入→重复加入→公告→详情→统计）；BYOK 零泄漏；修订（状态 `structured` 保留 units）。
- HTTP 冒烟：真实 server-cli 启动 → `/health`、`home.overview`、`studio.dlcs.list`、经 vite dev proxy 的 `market.list` 全部返回真实域数据。
- 全 workspace：`@llos/api` build、`@llos/api-client` build、`@llos/app-web` typecheck + vite build 全部绿。

## 兼容性

- 非破坏性：无 schema 变更、无 Core/DLC 边界变更、无既有契约改动。
- `MockApiClient` 保留：`VITE_API_MODE` 缺省为 mock，七态演示场景不受影响。
- `@llos/api-client` 不依赖 `@llos/api`（HttpApiClient 只使用自身 `types.ts`），跨包类型绑定最小化。

## 风险与后续

- InMemory 存储 + 确定性 Provider 意味着本切片是「结构真实、算力占位」：Provider 真实化（P8/Gateway 后续）时只需替换 adapter，RPC/wire/前端契约不动。
- 浏览器级 E2E（Playwright）与 `verify:p7` 门禁在 T-038 落地。
