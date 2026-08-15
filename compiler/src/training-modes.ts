import type { DLCManifest } from "@llos/contracts";
import { sha256Hex } from "./hash.js";
import { CompilationError } from "./errors.js";

// 自定义训练模式（BUILD_PLAN P7 / product_spec §6.6 专家模式）。
//
// 契约定位：learning-ir 的 mode_ref 是"DLC 层高层训练模式"，Core 永不解释
// （spec §4.3）；manifest 的 extensions 信封（schema_id + 版本 + payload_ref）
// 是 DLC 携带自定义声明的唯一合法通道。训练模式定义 = 把 mode_ref lower 成
// 闭合原语 step 序列的模板，由编译器执行 lower，运行时原语集不变。

export const TRAINING_MODES_EXTENSION_KEY = "llos.training-modes";
export const TRAINING_MODES_URI_SUFFIX = "templates/training-modes";

/** 第一代受限原语集：专家模式可组合的 step 类型（stop/branch 等运行时原语不在其列）。 */
export type ModeStepPrimitive =
  | "present"
  | "capture_text"
  | "capture_audio"
  | "capture_choice"
  | "evaluate"
  | "feedback"
  | "schedule";

const ALLOWED_PRIMITIVES: readonly ModeStepPrimitive[] = [
  "present",
  "capture_text",
  "capture_audio",
  "capture_choice",
  "evaluate",
  "feedback",
  "schedule",
];

const CAPTURE_PRIMITIVES: readonly string[] = ["capture_text", "capture_audio", "capture_choice"];

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ISO_DURATION_RE = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export interface ModeStepDef {
  primitive: ModeStepPrimitive;
  prompt_prefix?: string;
  timeout_ms?: number;
  max_length?: number;
  max_recording_ms?: number;
  interval?: string;
}

export interface TrainingModeDef {
  mode_ref: string;
  claim_suffix: string;
  steps: ModeStepDef[];
}

export interface TrainingModes {
  modes: Map<string, TrainingModeDef>;
  stage_modes: Map<string, string>;
}

const PASS_ID = "executable.lower";

/**
 * 系统边界：模式定义是 DLC 作者提供的输入，逐字段严格校验后才进编译。
 * 守卫规则（第一代）：
 * - 序列以 present 开始、以 schedule 结束（复习计划不变量）；
 * - 恰好一个 capture_*，其后必须紧跟 evaluate（学习事件是事实：先有应答
 *   才有观察，观察必须绑定证据政策）；
 * - 恰好一个 evaluate 与 feedback；
 * - 原语只在受限白名单内。
 */
export function parseTrainingModes(payload: unknown): TrainingModes {
  const fail = (detail: string) =>
    new CompilationError("training_modes_invalid", PASS_ID, detail);

  if (typeof payload !== "object" || payload === null) throw fail("训练模式定义不是有效对象");
  const root = payload as Record<string, unknown>;

  const rawModes = root.modes;
  if (!Array.isArray(rawModes) || rawModes.length === 0 || rawModes.length > 20) {
    throw fail("训练模式列表必须包含 1–20 个模式");
  }
  const modes = new Map<string, TrainingModeDef>();
  for (const [i, raw] of rawModes.entries()) {
    if (typeof raw !== "object" || raw === null) {
      throw fail(`第 ${i + 1} 个训练模式不是有效对象`);
    }
    const m = raw as Record<string, unknown>;
    const modeRef = m.mode_ref;
    if (typeof modeRef !== "string" || !IDENTIFIER_RE.test(modeRef)) {
      throw fail(`第 ${i + 1} 个训练模式的名称（mode_ref）无效`);
    }
    if (modes.has(modeRef)) throw fail(`训练模式 ${modeRef} 重复定义`);
    const claimSuffix = m.claim_suffix;
    if (typeof claimSuffix !== "string" || !IDENTIFIER_RE.test(claimSuffix)) {
      throw fail(`训练模式 ${modeRef} 缺少有效的教学主张标识（claim_suffix）`);
    }
    const rawSteps = m.steps;
    if (!Array.isArray(rawSteps) || rawSteps.length < 3 || rawSteps.length > 10) {
      throw fail(`训练模式 ${modeRef} 的步骤序列必须包含 3–10 步`);
    }
    const steps: ModeStepDef[] = [];
    for (const [j, rawStep] of rawSteps.entries()) {
      if (typeof rawStep !== "object" || rawStep === null) {
        throw fail(`训练模式 ${modeRef} 的第 ${j + 1} 步不是有效对象`);
      }
      const s = rawStep as Record<string, unknown>;
      const primitive = s.primitive;
      if (typeof primitive !== "string" || !ALLOWED_PRIMITIVES.includes(primitive as ModeStepPrimitive)) {
        throw fail(`训练模式 ${modeRef} 的第 ${j + 1} 步类型不受支持（第一代仅支持展示/作答/评估/反馈/复习）`);
      }
      const step: ModeStepDef = { primitive: primitive as ModeStepPrimitive };
      if (s.prompt_prefix !== undefined) {
        if (typeof s.prompt_prefix !== "string" || s.prompt_prefix.length === 0 || s.prompt_prefix.length > 200) {
          throw fail(`训练模式 ${modeRef} 的提示语前缀必须是 1–200 字的文字`);
        }
        step.prompt_prefix = s.prompt_prefix;
      }
      if (s.timeout_ms !== undefined) {
        if (typeof s.timeout_ms !== "number" || s.timeout_ms < 1000 || !Number.isInteger(s.timeout_ms)) {
          throw fail(`训练模式 ${modeRef} 的作答时限（timeout_ms）必须是不小于 1000 的整数（毫秒）`);
        }
        step.timeout_ms = s.timeout_ms;
      }
      if (s.max_length !== undefined) {
        if (typeof s.max_length !== "number" || s.max_length < 1 || !Number.isInteger(s.max_length)) {
          throw fail(`训练模式 ${modeRef} 的文字作答长度上限必须是正整数`);
        }
        step.max_length = s.max_length;
      }
      if (s.max_recording_ms !== undefined) {
        if (typeof s.max_recording_ms !== "number" || s.max_recording_ms < 500 || !Number.isInteger(s.max_recording_ms)) {
          throw fail(`训练模式 ${modeRef} 的录音时长上限必须是不小于 500 的整数（毫秒）`);
        }
        step.max_recording_ms = s.max_recording_ms;
      }
      if (s.interval !== undefined) {
        if (typeof s.interval !== "string" || !ISO_DURATION_RE.test(s.interval)) {
          throw fail(`训练模式 ${modeRef} 的复习间隔格式不正确（应为 PT12H 这类时长写法）`);
        }
        step.interval = s.interval;
      }
      steps.push(step);
    }
    const kinds = steps.map((s) => s.primitive);
    if (kinds[0] !== "present") {
      throw fail(`训练模式 ${modeRef} 的第一步必须是向学员展示内容（present）`);
    }
    if (kinds[kinds.length - 1] !== "schedule") {
      throw fail(`训练模式 ${modeRef} 的最后一步必须是安排复习（schedule）`);
    }
    const captures = kinds.filter((k) => CAPTURE_PRIMITIVES.includes(k));
    if (captures.length !== 1) {
      throw fail(`训练模式 ${modeRef} 必须恰好包含一个学员作答步骤`);
    }
    const captureIndex = kinds.findIndex((k) => CAPTURE_PRIMITIVES.includes(k));
    if (kinds[captureIndex + 1] !== "evaluate") {
      throw fail(`训练模式 ${modeRef} 的作答步骤之后必须紧跟评估（evaluate）`);
    }
    if (kinds.filter((k) => k === "evaluate").length !== 1) {
      throw fail(`训练模式 ${modeRef} 必须恰好包含一个评估步骤`);
    }
    if (kinds.filter((k) => k === "feedback").length !== 1) {
      throw fail(`训练模式 ${modeRef} 必须恰好包含一个反馈步骤`);
    }
    modes.set(modeRef, { mode_ref: modeRef, claim_suffix: claimSuffix, steps });
  }

  const stage_modes = new Map<string, string>();
  if (root.stage_modes !== undefined) {
    if (typeof root.stage_modes !== "object" || root.stage_modes === null) {
      throw fail("stage_modes 必须是对象");
    }
    for (const [stageId, modeRef] of Object.entries(root.stage_modes as Record<string, unknown>)) {
      if (typeof modeRef !== "string" || !modes.has(modeRef)) {
        throw fail(`课程单元 ${stageId} 引用了未定义的训练模式 ${String(modeRef)}`);
      }
      stage_modes.set(stageId, modeRef);
    }
  }

  return { modes, stage_modes };
}

/** 从 manifest extensions 解析训练模式定义；未声明时返回 undefined（走内置默认链）。 */
export function loadTrainingModes(
  manifest: DLCManifest,
  resolveTemplate: ((uri: string) => { content: string } | undefined) | undefined,
): TrainingModes | undefined {
  const envelope = (manifest.extensions as Record<string, unknown> | undefined)?.[
    TRAINING_MODES_EXTENSION_KEY
  ] as { payload_ref?: { uri?: string; sha256?: string } } | undefined;
  if (!envelope) return undefined;
  const uri = envelope.payload_ref?.uri;
  const expected = envelope.payload_ref?.sha256;
  if (typeof uri !== "string" || typeof expected !== "string") {
    throw new CompilationError(
      "training_modes_invalid",
      PASS_ID,
      "训练模式扩展声明缺少资源引用（payload_ref）",
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
  return parseTrainingModes(payload);
}
