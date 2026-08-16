import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// T-037 纵向切片：真实 API 模式（VITE_API_MODE=real / vite --mode real）下，
// HttpApiClient 以相对路径 /api/rpc 请求，由 dev server 代理转发到
// 本地 api 组合根（@llos/api server-cli，默认 127.0.0.1:8787）。
// mock 模式（默认）不经过代理，纯前端演示。
export default defineConfig({
  plugins: [react()],
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
