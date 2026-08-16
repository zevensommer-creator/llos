// node:http JSON-RPC 传输层（T-037 纵向切片）。
//
// 零第三方依赖的 HTTP 外壳：POST /api/rpc → JSON 请求体交给 RpcHandler，
// 响应永远 200 + 判别联合（{ok:true,result} | {ok:false,error}）；
// GET /health 供 CI/本地探活。开发环境由 vite dev proxy 转发 /api。

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RpcHandler, RpcResult } from "./rpc.js";

export interface HttpApiServerOptions {
  host?: string;
  port?: number;
}

export function createHttpApiServer(handler: RpcHandler, options: HttpApiServerOptions = {}): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0];

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && path === "/health") {
      writeJson(res, 200, { ok: true, service: "llos-api", version: "0.1.0" });
      return;
    }

    if (req.method === "POST" && path === "/api/rpc") {
      let body = "";
      req.setEncoding("utf-8");
      req.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          writeJson(res, 413, { ok: false, error: { code: "invalid_request", message: "请求体过大" } });
          req.destroy();
        }
      });
      req.on("end", () => {
        let parsed: unknown;
        try {
          parsed = body.length > 0 ? JSON.parse(body) : {};
        } catch {
          writeJson(res, 200, { ok: false, error: { code: "invalid_request", message: "请求体不是有效的 JSON" } });
          return;
        }
        void handler(parsed)
          .then((result: RpcResult) => writeJson(res, 200, result))
          .catch((err: unknown) => {
            console.error("[llos/api] handler rejected:", err);
            writeJson(res, 200, { ok: false, error: { code: "unknown", message: "服务器内部错误" } });
          });
      });
      return;
    }

    writeJson(res, 404, { ok: false, error: { code: "method_not_found", message: "未知路径" } });
  });
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}
