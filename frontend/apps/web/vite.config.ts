import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// T-037 纵向切片：真实 API 模式（VITE_API_MODE=real / vite --mode real）下，
// HttpApiClient 以相对路径 /api/rpc 请求，由 dev server 代理转发到
// 本地 api 组合根（@llos/api server-cli，默认 127.0.0.1:8787）。
// mock 模式（默认）不经过代理，纯前端演示。
//
// T-038：workspace 内链接包（@llos/api-client / @llos/compiler）输出为 CJS。
// vite 8（rolldown）的 optimizeDeps 预构建对 getter 风格 CJS 再导出只生成
// `export default`，不产生命名导出互操作，浏览器侧 `new HttpApiClient` 为
// undefined。改为把运行时依赖直接 alias 到 TS 源码（内部私有包，dev/build
// 同构），彻底绕开 CJS 互操作；@llos/design-tokens 仅 CSS 副作用导入，
// 直接按文件路径服务，无需处理。
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@llos/compiler/training-modes-parse",
        replacement: `${ROOT}compiler/src/training-modes-parse.ts`,
      },
      {
        find: /^@llos\/api-client$/,
        replacement: `${ROOT}frontend/packages/api-client/src/index.ts`,
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
