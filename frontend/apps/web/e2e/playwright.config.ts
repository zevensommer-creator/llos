// T-038 Playwright 桌面 Web E2E 配置。
//
// 真实 API 模式纵向切片：真实启动 @llos/api（组合根 + JSON-RPC over HTTP）
// 与 vite dev server（--mode real，/api 代理到 8787），浏览器经真实
// HTTP API + Gateway adapter 走完整链路；Provider 为确定性实现
// （OCR 为 base64 解码，无真实网络 OCR 引擎）。
//
// 运行：
//   pnpm e2e:p7:web                    （根目录脚本 → 本配置）
//   $env:CI="1"; pnpm e2e:p7:web        （CI 语义：不复用既有 server）
//
// trace 在失败时保留于 frontend/apps/web/test-results/（CI 上传 artifact）。

import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const WEB_PKG = fileURLToPath(new URL("..", import.meta.url));
// 本机 node 不在 PATH（E:\New Folder\node.exe）；CI 上存在全局 node。
const LOCAL_NODE = "E:/New Folder/node.exe";
const nodeBin = existsSync(LOCAL_NODE) ? `"${LOCAL_NODE}"` : "node";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // 共享同一组合根进程：全串行避免状态互相干扰
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${nodeBin} api/dist/server-cli.js`,
      cwd: ROOT,
      url: "http://127.0.0.1:8787/health",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      // vite 以 web 包为 root（含 index.html）；--host 127.0.0.1 保证与 baseURL 同栈可达
      command: `${nodeBin} node_modules/vite/bin/vite.js --mode real --host 127.0.0.1 --port 5173 --strictPort`,
      cwd: WEB_PKG,
      url: "http://127.0.0.1:5173",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
