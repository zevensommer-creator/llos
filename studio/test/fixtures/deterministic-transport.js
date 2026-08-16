// 测试专用确定性 transport（T-036：Fake OCR 只进测试 fixture，不进生产源码）。
//
// deterministicStudioTransport 把一次图片摄入的两次 gateway 调用（ocr → structure）
// 都留在同一 BYOK provider，服务 studio/test 与 scripts/e2e-p7.mjs。真实 OCR 走
// @llos/studio 的 ingest.ocr（经 gateway 路由到视觉模型）；无 Provider 时返回
// typed `provider_unavailable`，而不是这里把 base64 当 UTF-8 解的伪 OCR。
const { deterministicStructureTransport, OCR_OPERATION } = require("../../dist/index.js");

function deterministicOcrTransport(request, _context) {
  const input = request.input;
  if (typeof input?.image_base64 !== "string" || input.image_base64.length === 0) {
    throw new Error("ocr fake: image_base64 missing");
  }
  const bytes = Buffer.from(input.image_base64, "base64");
  const text = new TextDecoder("utf-8").decode(bytes);
  return { text: text.replace(/^%PNG-STUB\r?\n/, "") };
}

function deterministicStudioTransport(request, context) {
  return request.operation === OCR_OPERATION
    ? deterministicOcrTransport(request, context)
    : deterministicStructureTransport(request, context);
}

module.exports = { deterministicOcrTransport, deterministicStudioTransport };
