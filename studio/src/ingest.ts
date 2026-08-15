import type { ProviderGateway } from "@llos/gateway";
import { StudioError } from "./errors.js";

// 摄入管线（product_spec §6.2）：任意思想来源 → 格式解析 → 经 Provider
// Gateway 的 AI 结构化（material.generation）→ 结构化单元。业务代码只请求
// capability，不出现模型品牌；BYOK 优先路由由调用方传入 prefer_provider_ids。

export const STRUCTURE_CAPABILITY_ID = "material.generation";
export const STRUCTURE_OPERATION = "structure";

export type PdfTextExtractor = (bytes: Uint8Array) => Promise<string>;

export type IngestSource =
  | { kind: "text"; text: string; language: string; title: string }
  | {
      kind: "pdf";
      bytes: Uint8Array;
      language: string;
      title: string;
      pdfTextExtractor?: PdfTextExtractor;
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

export async function extractSourceText(source: IngestSource): Promise<string> {
  if (source.kind === "text") return source.text;
  const extractor = source.pdfTextExtractor ?? fakePdfTextExtractor;
  return extractor(source.bytes);
}

export async function ingestSource(source: IngestSource, deps: IngestDeps): Promise<StructuredMaterial> {
  const text = (await extractSourceText(source)).trim();
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
