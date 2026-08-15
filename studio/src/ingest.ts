import type { ProviderGateway } from "@llos/gateway";
import { StudioError } from "./errors.js";

// 摄入管线（product_spec §6.2）：任意思想来源 → 格式解析 → 经 Provider
// Gateway 的 AI 结构化（material.generation）→ 结构化单元。业务代码只请求
// capability，不出现模型品牌；BYOK 优先路由由调用方传入 prefer_provider_ids。

export const STRUCTURE_CAPABILITY_ID = "material.generation";
export const STRUCTURE_OPERATION = "structure";
export const OCR_OPERATION = "ocr";

export type PdfTextExtractor = (bytes: Uint8Array) => Promise<string>;

export type IngestSource =
  | { kind: "text"; text: string; language: string; title: string }
  | {
      kind: "pdf";
      bytes: Uint8Array;
      language: string;
      title: string;
      pdfTextExtractor?: PdfTextExtractor;
    }
  | {
      kind: "image";
      bytes: Uint8Array;
      language: string;
      title: string;
      media_type?: string;
    };

export type StructuredFrameType = "scenario" | "argument_structure" | "concept";

export interface StructuredUnit {
  unit_no: number;
  frame_type: StructuredFrameType;
  title: string;
  pattern: string;
  lemma?: string;
}

export interface StructuredMaterial {
  units: StructuredUnit[];
  structured_by: { provider_id: string; model_id?: string };
  input_chars: number;
  /** 图片经 OCR 转文字时记录所用 provider（格式解析步骤溯源）。 */
  ocr_by?: { provider_id: string; model_id?: string };
}

export interface IngestDeps {
  gateway: ProviderGateway;
  /** BYOK 优先（§6.5：Studio AI 辅助默认不消耗平台算力）。 */
  preferProviderIds?: readonly string[];
}

/**
 * 第一代确定性 PDF 端口（Fake 实现，零外部依赖）：把字节按 UTF-8 解码，
 * 允许携带 "%PDF-STUB" 首行标记。真实 PDF 解析在后续任务替换本端口。
 */
export const fakePdfTextExtractor: PdfTextExtractor = async (bytes) => {
  const text = new TextDecoder("utf-8").decode(bytes);
  const stripped = text.replace(/^%PDF-STUB\r?\n/, "");
  return stripped;
};

export async function extractSourceText(
  source: IngestSource,
  deps?: IngestDeps,
): Promise<{ text: string; ocr_by?: { provider_id: string; model_id?: string } }> {
  if (source.kind === "text") return { text: source.text };
  if (source.kind === "pdf") {
    const extractor = source.pdfTextExtractor ?? fakePdfTextExtractor;
    return { text: await extractor(source.bytes) };
  }
  if (!deps) {
    throw new StudioError(
      "ocr_output_invalid",
      "图片读取需要接入模型服务，请稍后重试或改用粘贴文字",
    );
  }
  return ocrImageText(source, deps);
}

/** 图片 → 文字（product_spec §6.2：PNG 含 OCR）：经 gateway 的 ocr 操作，BYOK 优先。 */
async function ocrImageText(
  source: { bytes: Uint8Array; language: string; media_type?: string },
  deps: IngestDeps,
): Promise<{ text: string; ocr_by: { provider_id: string; model_id?: string } }> {
  const result = await deps.gateway.execute({
    capability_id: STRUCTURE_CAPABILITY_ID,
    operation: OCR_OPERATION,
    language: source.language,
    input: {
      kind: "ingest.ocr",
      image_base64: Buffer.from(source.bytes).toString("base64"),
      media_type: source.media_type ?? "image/png",
    },
    ...(deps.preferProviderIds && deps.preferProviderIds.length > 0
      ? { prefer_provider_ids: [...deps.preferProviderIds] }
      : {}),
  });
  return {
    text: parseOcrOutput(result.output, result.provider_id),
    ocr_by: { provider_id: result.provider_id, ...(result.model_id ? { model_id: result.model_id } : {}) },
  };
}

/** 系统边界：OCR 输出是外部数据，必须严格检查形状。 */
export function parseOcrOutput(output: unknown, providerId: string): string {
  if (typeof output !== "object" || output === null) {
    throw ocrError(providerId, "识别结果为空");
  }
  const text = (output as { text?: unknown }).text;
  if (typeof text !== "string") {
    throw ocrError(providerId, "识别结果里没有文字内容");
  }
  return text;
}

function ocrError(providerId: string, detail: string): StudioError {
  return new StudioError(
    "ocr_output_invalid",
    `图片文字识别失败：${detail}。请换一张更清晰的图片，或直接粘贴文字。`,
    [`${detail} (provider ${providerId})`],
  );
}

export async function ingestSource(source: IngestSource, deps: IngestDeps): Promise<StructuredMaterial> {
  const extracted = await extractSourceText(source, deps);
  const text = extracted.text.trim();
  if (text.length === 0) {
    throw new StudioError("ingest_source_empty", "没有可读取的内容，请检查粘贴的文字或上传的文件");
  }
  const result = await deps.gateway.execute({
    capability_id: STRUCTURE_CAPABILITY_ID,
    operation: STRUCTURE_OPERATION,
    language: source.language,
    input: { kind: "ingest.structure", text, title: source.title, language: source.language },
    ...(deps.preferProviderIds && deps.preferProviderIds.length > 0
      ? { prefer_provider_ids: [...deps.preferProviderIds] }
      : {}),
  });
  return {
    ...parseStructuredOutput(result.output),
    structured_by: { provider_id: result.provider_id, model_id: result.model_id },
    input_chars: text.length,
    ...(extracted.ocr_by ? { ocr_by: extracted.ocr_by } : {}),
  };
}

/** 系统边界：Provider 输出是外部数据，必须严格检查形状后才进入草稿。 */
export function parseStructuredOutput(output: unknown): { units: StructuredUnit[] } {
  if (typeof output !== "object" || output === null) {
    throw structureError("结构化结果为空");
  }
  const frames = (output as { frames?: unknown }).frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    throw structureError("结构化结果里没有识别出任何课程单元");
  }
  const units: StructuredUnit[] = [];
  frames.forEach((frame, index) => {
    if (typeof frame !== "object" || frame === null) {
      throw structureError(`第 ${index + 1} 个单元不是有效对象`);
    }
    const f = frame as Record<string, unknown>;
    const frameType = f.frame_type;
    const title = f.title;
    const pattern = f.pattern;
    if (frameType !== "scenario" && frameType !== "argument_structure" && frameType !== "concept") {
      throw structureError(`第 ${index + 1} 个单元的类型无法识别`);
    }
    if (typeof title !== "string" || title.trim().length === 0) {
      throw structureError(`第 ${index + 1} 个单元缺少标题`);
    }
    if (typeof pattern !== "string" || pattern.trim().length === 0) {
      throw structureError(`第 ${index + 1} 个单元缺少例句`);
    }
    const lemma = typeof f.lemma === "string" && f.lemma.trim().length > 0 ? f.lemma.trim() : undefined;
    units.push({
      unit_no: index + 1,
      frame_type: frameType,
      title: title.trim(),
      pattern: pattern.trim(),
      ...(lemma ? { lemma } : {}),
    });
  });
  return { units };
}

function structureError(detail: string): StudioError {
  return new StudioError(
    "structure_output_invalid",
    `AI 结构化结果无法使用：${detail}。请在表单里修改后重试，或调整输入内容。`,
    [detail],
  );
}

/**
 * 第一代确定性 OCR Fake（服务 BYOK transport 与测试）：把 base64 图片解码
 * 回字节并按 UTF-8 读出文字，允许携带 "%PNG-STUB" 首行标记模拟 PNG 容器。
 * 真实 OCR（视觉模型）由 parseOcrOutput 消费，后续任务替换本 transport。
 */
export function deterministicOcrTransport(
  request: { input: unknown },
  _context: unknown,
): { text: string } {
  const input = request.input as { image_base64?: unknown; media_type?: unknown } | undefined;
  if (typeof input?.image_base64 !== "string" || input.image_base64.length === 0) {
    throw new Error("ocr fake: image_base64 missing");
  }
  const bytes = Buffer.from(input.image_base64, "base64");
  const text = new TextDecoder("utf-8").decode(bytes);
  return { text: text.replace(/^%PNG-STUB\r?\n/, "") };
}

/**
 * 第一代确定性 Studio transport：按 operation 分派 OCR 与结构化 Fake，
 * 一次图片摄入的两次 gateway 调用（ocr → structure）都留在同一 BYOK provider。
 */
export function deterministicStudioTransport(
  request: { operation?: unknown; input: unknown },
  context: unknown,
): unknown {
  return request.operation === OCR_OPERATION
    ? deterministicOcrTransport(request, context)
    : deterministicStructureTransport(request, context);
}

/**
 * 第一代确定性结构化 Fake（服务 BYOK transport 与测试）：约定每行一个单元，
 * 形如 "Szenario: 标题 | 例句"、"Valenz: 标题 | 例句（可选生词 | lemma）"。
 * 前缀决定 frame_type：Szenario→scenario，Valenz→argument_structure，
 * 其余（含 Konstruktion）→concept。真实模型输出由 parseStructuredOutput 消费。
 */
export function deterministicStructureTransport(
  request: { input: unknown },
  _context: unknown,
): { frames: { frame_type: string; title: string; pattern: string; lemma?: string }[] } {
  const input = request.input as { text?: string } | undefined;
  const text = typeof input?.text === "string" ? input.text : "";
  const frames: { frame_type: string; title: string; pattern: string; lemma?: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const prefix = line.slice(0, sep).trim().toLowerCase();
    const rest = line.slice(sep + 1);
    const parts = rest.split("|").map((p) => p.trim());
    const title = parts[0];
    const pattern = parts[1] ?? title;
    if (title.length === 0 || pattern.length === 0) continue;
    const frameType =
      prefix === "szenario" || prefix === "scenario"
        ? "scenario"
        : prefix === "valenz" || prefix === "valence"
          ? "argument_structure"
          : "concept";
    const lemma = parts[2];
    frames.push({
      frame_type: frameType,
      title,
      pattern,
      ...(lemma && lemma.length > 0 ? { lemma } : {}),
    });
  }
  return { frames };
}
