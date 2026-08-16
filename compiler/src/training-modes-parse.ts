import { CompilationError } from "./errors.js";

// 自定义训练模式（BUILD_PLAN P7 / product_spec §6.6 专家模式）。
//
// 本文件是训练模式定义的**纯解析**入口：不依赖 node:crypto，可在浏览器侧
// （api-client Mock / Studio 前端）与编译器共用同一套守卫，消除"两套 parser
// 各自漂移"的风险（T-036 审计第 8 条）。信封解析与内容哈希在 training-modes.ts。
//
// 契约定位：learning-ir 的 mode_ref 是"DLC 层高层训练模式"，Core 永不解释
// （spec §4.3）；manifest 的 extensions 信封（schema_id + 版本 + payload_ref）
// 是 DLC 携带自定义声明的唯一合法通道。训练模式定义 = 把 mode_ref lower 成
// 闭合原语 step 序列的模板，由编译器执行 lower，运行时原语集不变。

export const TRAINING_MODES_EXTENSION_KEY = "llos.training-modes";
export const TRAINING_MODES_URI_SUFFIX = "templates/training-modes";

/** 显式支持的训练模式信封 schema 版本（未声明版本一律拒绝，防止静默漂移）。 */
export const SUPPORTED_TRAINING_MODES_SCHEMA_VERSIONS: readonly string[] = ["0.1.0"];

/**
 * 第一代受限原语集：专家模式可组合的 step 类型。
 *
 * 审计（T-036）：capture_audio / capture_choice 此前出现在白名单，但 lower 后
 * 分别落到 eval.typed_answer（错误 evaluator）与缺失 choices_ref，属于"表面支持、
 * 实际不可运行"。按"缩小白名单但语义正确"原则，第一代仅保留 capture_text。
 */
export type ModeStepPrimitive =
  | "present"
  | "capture_text"
  | "evaluate"
  | "feedback"
  | "schedule";

const ALLOWED_PRIMITIVES: readonly ModeStepPrimitive[] = [
  "present",
  "capture_text",
  "evaluate",
  "feedback",
  "schedule",
];

const CAPTURE_PRIMITIVES: readonly string[] = ["capture_text"];

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ISO_DURATION_RE = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** 复习间隔必须是正的 ISO-8601 时长（T-036：拒绝零/空时长边界，如 "PT0S"、"P"）。 */
function isPositiveDuration(value: string): boolean {
  const m = ISO_DURATION_RE.exec(value);
  if (!m) return false;
  const days = m[1] ? Number(m[1]) : 0;
  const hours = m[2] ? Number(m[2]) : 0;
  const minutes = m[3] ? Number(m[3]) : 0;
  const seconds = m[4] ? Number(m[4]) : 0;
  return days + hours + minutes + seconds > 0;
}

// 参数边界（T-036：此前只有下界、无上界，且未用 safe-integer 收紧）。
const MODES_MIN = 1;
const MODES_MAX = 20;
const STEPS_MIN = 3;
const STEPS_MAX = 10;
const PROMPT_PREFIX_MAX = 200;
const TIMEOUT_MS_MIN = 1000;
const TIMEOUT_MS_MAX = 1_800_000; // 30 分钟
const MAX_LENGTH_MIN = 1;
const MAX_LENGTH_MAX = 100_000;

// 未知字段严格白名单（T-036：手写 parser 忽略未知字段会静默吞掉拼写错误）。
const ROOT_KEYS: ReadonlySet<string> = new Set(["modes", "stage_modes"]);
const MODE_KEYS: ReadonlySet<string> = new Set(["mode_ref", "claim_suffix", "steps"]);
const STEP_KEYS: ReadonlySet<string> = new Set([
  "primitive",
  "prompt_prefix",
  "timeout_ms",
  "max_length",
  "interval",
]);

export interface ModeStepDef {
  primitive: ModeStepPrimitive;
  prompt_prefix?: string;
  timeout_ms?: number;
  max_length?: number;
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

function assertNoUnknownKeys(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  what: string,
  fail: (detail: string) => Error,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw fail(`${what}包含不支持的字段时间：${key}`);
    }
  }
}

/**
 * 系统边界：模式定义是 DLC 作者提供的输入，逐字段严格校验后才进编译。
 *
 * 守卫规则（第一代）：
 * - 序列以 present 开始、以 schedule 结束（复习计划不变量）；
 * - 恰好一个 capture_*（第一代仅 capture_text），其后必须紧跟 evaluate
 *   （学习事件是事实：先有应答才有观察，观察必须绑定证据政策）；
 * - 恰好一个 evaluate 与 feedback；
 * - 原语只在受限白名单内；
 * - 字段未知一律拒绝；参数有下界与上界且必须为 safe-integer。
 *
 * @param stages 可选——素材包 stage 集合；提供时 stage_modes 的键必须存在其中，
 *   否则无法把训练模式绑定到真实课程单元。
 */
export function parseTrainingModes(
  payload: unknown,
  stages?: ReadonlySet<string>,
): TrainingModes {
  const fail = (detail: string) =>
    new CompilationError("training_modes_invalid", PASS_ID, detail);

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw fail("训练模式定义不是有效对象");
  }
  const root = payload as Record<string, unknown>;
  assertNoUnknownKeys(root, ROOT_KEYS, "训练模式定义", fail);

  const rawModes = root.modes;
  if (!Array.isArray(rawModes) || rawModes.length < MODES_MIN || rawModes.length > MODES_MAX) {
    throw fail(`训练模式列表必须包含 ${MODES_MIN}–${MODES_MAX} 个模式`);
  }
  const modes = new Map<string, TrainingModeDef>();
  for (const [i, raw] of rawModes.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw fail(`第 ${i + 1} 个训练模式不是有效对象`);
    }
    const m = raw as Record<string, unknown>;
    assertNoUnknownKeys(m, MODE_KEYS, `第 ${i + 1} 个训练模式`, fail);
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
    if (!Array.isArray(rawSteps) || rawSteps.length < STEPS_MIN || rawSteps.length > STEPS_MAX) {
      throw fail(`训练模式 ${modeRef} 的步骤序列必须包含 ${STEPS_MIN}–${STEPS_MAX} 步`);
    }
    const steps: ModeStepDef[] = [];
    for (const [j, rawStep] of rawSteps.entries()) {
      if (typeof rawStep !== "object" || rawStep === null || Array.isArray(rawStep)) {
        throw fail(`训练模式 ${modeRef} 的第 ${j + 1} 步不是有效对象`);
      }
      const s = rawStep as Record<string, unknown>;
      assertNoUnknownKeys(s, STEP_KEYS, `训练模式 ${modeRef} 的第 ${j + 1} 步`, fail);
      const primitive = s.primitive;
      if (typeof primitive !== "string" || !ALLOWED_PRIMITIVES.includes(primitive as ModeStepPrimitive)) {
        throw fail(`训练模式 ${modeRef} 的第 ${j + 1} 步类型不受支持（第一代仅支持展示/文字作答/评估/反馈/复习）`);
      }
      const step: ModeStepDef = { primitive: primitive as ModeStepPrimitive };
      if (s.prompt_prefix !== undefined) {
        if (
          typeof s.prompt_prefix !== "string" ||
          s.prompt_prefix.length === 0 ||
          s.prompt_prefix.length > PROMPT_PREFIX_MAX
        ) {
          throw fail(`训练模式 ${modeRef} 的提示语前缀必须是 1–${PROMPT_PREFIX_MAX} 字的文字`);
        }
        step.prompt_prefix = s.prompt_prefix;
      }
      if (s.timeout_ms !== undefined) {
        if (
          typeof s.timeout_ms !== "number" ||
          !Number.isSafeInteger(s.timeout_ms) ||
          s.timeout_ms < TIMEOUT_MS_MIN ||
          s.timeout_ms > TIMEOUT_MS_MAX
        ) {
          throw fail(
            `训练模式 ${modeRef} 的作答时限（timeout_ms）必须是 ${TIMEOUT_MS_MIN}–${TIMEOUT_MS_MAX} 之间的整数（毫秒）`,
          );
        }
        step.timeout_ms = s.timeout_ms;
      }
      if (s.max_length !== undefined) {
        if (
          typeof s.max_length !== "number" ||
          !Number.isSafeInteger(s.max_length) ||
          s.max_length < MAX_LENGTH_MIN ||
          s.max_length > MAX_LENGTH_MAX
        ) {
          throw fail(
            `训练模式 ${modeRef} 的文字作答长度上限必须是 ${MAX_LENGTH_MIN}–${MAX_LENGTH_MAX} 之间的整数`,
          );
        }
        step.max_length = s.max_length;
      }
      if (s.interval !== undefined) {
        if (typeof s.interval !== "string" || !isPositiveDuration(s.interval)) {
          throw fail(
            `训练模式 ${modeRef} 的复习间隔必须是正的时长（如 PT12H，不能为零或空）`,
          );
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
    if (typeof root.stage_modes !== "object" || root.stage_modes === null || Array.isArray(root.stage_modes)) {
      throw fail("stage_modes 必须是对象");
    }
    for (const [stageId, modeRef] of Object.entries(root.stage_modes as Record<string, unknown>)) {
      if (typeof modeRef !== "string" || !modes.has(modeRef)) {
        throw fail(`课程单元 ${stageId} 引用了未定义的训练模式 ${String(modeRef)}`);
      }
      if (stages && !stages.has(stageId)) {
        throw fail(`课程单元 ${stageId} 不存在于素材包中，无法绑定训练模式`);
      }
      stage_modes.set(stageId, modeRef);
    }
  }

  return { modes, stage_modes };
}
