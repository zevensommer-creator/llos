import type { DLCManifest } from "@llos/contracts";
import { sha256Hex } from "./hash.js";
import { CompilationError } from "./errors.js";
import {
  parseTrainingModes,
  SUPPORTED_TRAINING_MODES_SCHEMA_VERSIONS,
  TRAINING_MODES_EXTENSION_KEY,
  TRAINING_MODES_URI_SUFFIX,
} from "./training-modes-parse.js";

// 信封解析与内容哈希（依赖 node:crypto，仅编译器侧使用）。
// 纯解析守卫见 training-modes-parse.ts（浏览器安全，供 api-client 复用）。

export * from "./training-modes-parse.js";

const PASS_ID = "executable.lower";

/** 从 manifest extensions 解析训练模式定义；未声明时返回 undefined（走内置默认链）。 */
export function loadTrainingModes(
  manifest: DLCManifest,
  resolveTemplate: ((uri: string) => { content: string } | undefined) | undefined,
  stages?: ReadonlySet<string>,
): ReturnType<typeof parseTrainingModes> | undefined {
  const envelope = (manifest.extensions as Record<string, unknown> | undefined)?.[
    TRAINING_MODES_EXTENSION_KEY
  ] as
    | { schema_id?: unknown; schema_version?: unknown; payload_ref?: { uri?: string; sha256?: string } }
    | undefined;
  if (!envelope) return undefined;

  // 信封严格校验（T-036：此前只校验 payload_ref 的 uri/hash，schema_id 与
  // 版本未校验，可能把其它扩展误当作训练模式解析）。
  if (envelope.schema_id !== TRAINING_MODES_EXTENSION_KEY) {
    throw new CompilationError(
      "training_modes_invalid",
      PASS_ID,
      "训练模式扩展的 schema_id 不正确",
    );
  }
  if (
    typeof envelope.schema_version !== "string" ||
    !SUPPORTED_TRAINING_MODES_SCHEMA_VERSIONS.includes(envelope.schema_version)
  ) {
    throw new CompilationError(
      "training_modes_invalid",
      PASS_ID,
      `训练模式扩展的 schema_version 不受支持（支持：${SUPPORTED_TRAINING_MODES_SCHEMA_VERSIONS.join(", ")}）`,
    );
  }
  const uri = envelope.payload_ref?.uri;
  const expected = envelope.payload_ref?.sha256;
  if (typeof uri !== "string" || typeof expected !== "string") {
    throw new CompilationError(
      "training_modes_invalid",
      PASS_ID,
      "训练模式扩展声明缺少资源引用（payload_ref）",
    );
  }
  const expectedUri = `artifact://dlc/${manifest.dlc_id}/${TRAINING_MODES_URI_SUFFIX}`;
  if (uri !== expectedUri) {
    throw new CompilationError(
      "training_modes_invalid",
      PASS_ID,
      "训练模式定义资源 URI 必须指向当前 DLC 的训练模式产物",
    );
  }
  const resolved = resolveTemplate?.(uri);
  if (!resolved) {
    throw new CompilationError(
      "training_modes_unresolved",
      PASS_ID,
      `训练模式定义资源 ${uri} 无法解析`,
    );
  }
  const actual = sha256Hex(resolved.content);
  if (actual !== expected) {
    throw new CompilationError(
      "training_modes_hash_mismatch",
      PASS_ID,
      `训练模式定义资源 ${uri} 的内容与清单声明的校验值不一致`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(resolved.content);
  } catch {
    throw new CompilationError(
      "training_modes_invalid",
      PASS_ID,
      "训练模式定义不是有效的 JSON",
    );
  }
  return parseTrainingModes(payload, stages);
}
