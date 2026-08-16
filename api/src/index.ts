// @llos/api 导出（T-037 组合根）。
//
// 用法：
//   const handler = createRpcHandler(getBackend);
//   createHttpApiServer(handler).listen(8787);
//   // 前端 HttpApiClient 指向 /api（vite dev proxy 转发到 8787）。

export { createBackend, getBackend, resetBackend, ACCOUNTS, CAFE_TEXT } from "./backend.js";
export type { ApiBackend, SeedState } from "./backend.js";
export { createRpcHandler } from "./rpc.js";
export type { RpcContext, RpcError, RpcFn, RpcHandler, RpcResult } from "./rpc.js";
export { createHttpApiServer } from "./server.js";
export type { HttpApiServerOptions } from "./server.js";
export { registerPlatformProvider, routeDeterministic, PLATFORM_PROVIDER_ID } from "./platform.js";
export type * from "./wire.js";
