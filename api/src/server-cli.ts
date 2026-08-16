// LLOS API 本地启动入口（T-037 纵向切片）。
//
// 用法：
//   pnpm --filter @llos/api build
//   pnpm --filter @llos/api start        # 默认 http://127.0.0.1:8787
//   $env:PORT=9000; pnpm --filter @llos/api start   # 覆盖端口
//
// 前端开发：vite dev server 的 /api 代理转发到本服务
// （frontend/apps/web/vite.config.ts server.proxy）。

import { createBackend } from "./backend.js";
import { createRpcHandler } from "./rpc.js";
import { createHttpApiServer } from "./server.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);

void createBackend()
  .then((backend) => {
    const handler = createRpcHandler(() => Promise.resolve(backend));
    const server = createHttpApiServer(handler, { host, port });
    server.listen(port, host, () => {
      console.log(`[llos/api] listening on http://${host}:${port}/api/rpc`);
    });
  })
  .catch((err: unknown) => {
    console.error("[llos/api] backend bootstrap failed:", err);
    process.exit(1);
  });
