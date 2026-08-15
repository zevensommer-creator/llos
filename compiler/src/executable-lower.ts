import type { DLCManifest, LearningIR } from "@llos/contracts";
import { canonicalJson, sha256Hex } from "./hash.js";
import { CompilationError } from "./errors.js";
import type { MaterialArtifactRef, ValidatedMaterial } from "./material-validate.js";
import type { ModeStepDef, TrainingModes } from "./training-modes.js";
import { RUNTIME_VERSION } from "./runtime-version.js";

const CAPTURE_TIMEOUT_MS = 30_000;
const CAPTURE_MAX_LENGTH = 500;
const MIN_CONFIDENCE = 0.8;
const FEEDBACK_TEMPLATE_PATH = "templates/feedback-generic";
const REVIEW_INTERVAL = "PT24H";
const STOP_STEP_ID = "session.stop";

interface PedagogicalProgramView {
  activity_plan: {
    stage_id: string;
    mode_ref: string;
    claim_refs: string[];
    repeat?: number;
    time_budget_ms?: number;
  }[];
}

interface LowerContext {
  seed: number;
  now: () => string;
  manifestHash: string;
  completedPasses: { id: string; version: string }[];
  resolveTemplate?: (uri: string) => { content: string } | undefined;
  /** 专家模式自定义训练模式；无映射的 stage 走内置默认链。 */
  trainingModes?: TrainingModes;
}

const ON_PROVIDER_FAILURE: Record<string, string> = {
  pause_session: "stop_session",
  skip_activity: "skip_activity",
  offline_fallback: "fallback",
  stop_session: "stop_session",
};

export function lowerExecutable(
  pedagogical: LearningIR,
  validated: ValidatedMaterial,
  manifest: DLCManifest,
  ctx: LowerContext,
): LearningIR {
  const passId = "executable.lower";
  const program = pedagogical.program as PedagogicalProgramView;
  const stages = program.activity_plan;
  const framesById = new Map(validated.pack.semantic_frames.map((f) => [f.id, f]));

  const templateUri = `artifact://dlc/${manifest.dlc_id}/${FEEDBACK_TEMPLATE_PATH}`;
  const templateRef = resolveTemplateRef(templateUri, ctx, passId);

  const steps: Record<string, unknown>[] = [];
  let totalMs = 0;

  stages.forEach((stage, index) => {
    const frame = framesById.get(stage.stage_id);
    const title = frame?.titles?.[0]?.text ?? stage.stage_id;
    const referenceFact = frame?.facts.find((f) => f.predicate === "surface_pattern");
    const referenceText =
      referenceFact && referenceFact.object.kind === "string"
        ? referenceFact.object.string
        : undefined;
    const claims = stage.claim_refs;
    const modeDef = ctx.trainingModes?.modes.get(stage.mode_ref);
    const nextAfterStage =
      index + 1 < stages.length ? `${stages[index + 1].stage_id}.present` : STOP_STEP_ID;

    const stageFacts = {
      modeRef: stage.mode_ref,
      title,
      referenceText,
      claims,
      templateRef,
      metricRef: `${manifest.dlc_id}:metric/typed_answer_accuracy`,
    };

    const stageSteps = modeDef
      ? lowerCustomStage(stage.stage_id, modeDef, stageFacts)
      : lowerDefaultStage(stage.stage_id, stageFacts);

    // 序列尾部衔接：默认链/自定义链最后一步都是 schedule，统一指到下一 stage。
    const tail = stageSteps[stageSteps.length - 1];
    tail.next = nextAfterStage;
    steps.push(...stageSteps);
    totalMs += stage.time_budget_ms ?? 0;
  });

  steps.push({
    step_id: STOP_STEP_ID,
    primitive: "stop",
    stop: { outcome: "success" },
  });

  const executableProgram = {
    session_policy: {
      max_duration_ms: totalMs,
      max_provider_cost_usd: manifest.budgets.max_cost_usd,
      max_iterations: steps.length,
      on_provider_failure: ON_PROVIDER_FAILURE[manifest.degradation_policy.on_provider_failure],
      offline_allowed: manifest.degradation_policy.offline_allowed ?? true,
    },
    entry_step_id: steps[0]?.step_id ?? STOP_STEP_ID,
    steps,
    stop_conditions: [
      {
        fact: "session.elapsed_ms",
        operator: "gte",
        value: { kind: "int", int: totalMs },
      },
    ],
  };

  const idSeed = canonicalJson(pedagogical);
  const irVersion = manifest.output_ir.schema_id.split(":").pop() ?? "0.2.0";

  return {
    schema_version: "0.2.0",
    ir_id: `ir.executable.${sha256Hex(idSeed).slice(0, 16)}`,
    ir_version: irVersion,
    ir_kind: "executable_session",
    language: pedagogical.language,
    created_at: ctx.now(),
    compiler: {
      dlc_id: manifest.dlc_id,
      dlc_version: manifest.version,
      runtime_version: RUNTIME_VERSION,
    },
    source_refs: [validated.sourceRef],
    random_seed: ctx.seed,
    claims: pedagogical.claims,
    program: executableProgram,
    provenance: {
      input_hashes: [validated.packHash, ctx.manifestHash],
      passes: [
        ...ctx.completedPasses.map((p) => ({ ...p, status: "completed" as const })),
        {
          id: passId,
          version: manifest.passes.find((p) => p.id === passId)?.version ?? "0.0.0",
          status: "completed",
        },
      ],
      compiled_at: ctx.now(),
    },
  };
}

interface StageFacts {
  modeRef: string;
  title: string;
  referenceText?: string;
  claims: string[];
  templateRef: MaterialArtifactRef;
  metricRef: string;
}

function lowerDefaultStage(stageId: string, f: StageFacts): Record<string, unknown>[] {
  const present: Record<string, unknown> = {
    step_id: `${stageId}.present`,
    primitive: "present",
    display_mode_ref: f.modeRef,
    claim_refs: f.claims,
    present: {
      prompt: `Übung: ${f.title}`,
      ...(f.referenceText ? { reference_text: f.referenceText } : {}),
    },
    next: `${stageId}.capture`,
  };
  const capture = {
    step_id: `${stageId}.capture`,
    primitive: "capture_text",
    claim_refs: f.claims,
    capture: { timeout_ms: CAPTURE_TIMEOUT_MS, max_length: CAPTURE_MAX_LENGTH },
    next: `${stageId}.evaluate`,
  };
  const evaluate = {
    step_id: `${stageId}.evaluate`,
    primitive: "evaluate",
    claim_refs: f.claims,
    evaluate: {
      evaluator: { id: "eval.typed_answer", version: "0.1.0", kind: "rule" },
      metric_ref: f.metricRef,
      minimum_measurement_confidence: MIN_CONFIDENCE,
    },
    next: `${stageId}.feedback`,
  };
  const feedback = {
    step_id: `${stageId}.feedback`,
    primitive: "feedback",
    claim_refs: f.claims,
    feedback: { template_ref: f.templateRef },
    next: `${stageId}.schedule`,
  };
  const schedule = {
    step_id: `${stageId}.schedule`,
    primitive: "schedule",
    claim_refs: f.claims,
    schedule: { scheduler: "rule_based", interval: REVIEW_INTERVAL },
    next: STOP_STEP_ID,
  };
  return [present, capture, evaluate, feedback, schedule];
}

/**
 * 专家模式：按 DLC 声明的模式模板把 stage lower 成闭合原语序列。
 * 评估器/反馈模板/指标由编译器统一注入（证据与复习不变量不交给作者）；
 * 作者只决定原语序列与作答形态参数（spec §4.3：mode_ref 必须被 lower）。
 */
function lowerCustomStage(
  stageId: string,
  mode: { mode_ref: string; steps: ModeStepDef[] },
  f: StageFacts,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  mode.steps.forEach((def, j) => {
    const stepId = def.primitive === "present" ? `${stageId}.present` : `${stageId}.${j}.${def.primitive}`;
    const nextId = j + 1 < mode.steps.length
      ? mode.steps[j + 1].primitive === "present"
        ? `${stageId}.present`
        : `${stageId}.${j + 1}.${mode.steps[j + 1].primitive}`
      : "";
    const base: Record<string, unknown> = {
      step_id: stepId,
      primitive: def.primitive,
      claim_refs: f.claims,
      next: nextId,
    };
    switch (def.primitive) {
      case "present":
        base.display_mode_ref = mode.mode_ref;
        base.present = {
          prompt: `${def.prompt_prefix ?? "Übung: "}${f.title}`,
          ...(f.referenceText ? { reference_text: f.referenceText } : {}),
        };
        break;
      case "capture_text":
        base.capture = {
          timeout_ms: def.timeout_ms ?? CAPTURE_TIMEOUT_MS,
          max_length: def.max_length ?? CAPTURE_MAX_LENGTH,
        };
        break;
      case "capture_audio":
        base.capture = {
          timeout_ms: def.timeout_ms ?? CAPTURE_TIMEOUT_MS,
          max_recording_ms: def.max_recording_ms ?? 10_000,
        };
        break;
      case "capture_choice":
        base.capture = { timeout_ms: def.timeout_ms ?? CAPTURE_TIMEOUT_MS };
        break;
      case "evaluate":
        base.evaluate = {
          evaluator: { id: "eval.typed_answer", version: "0.1.0", kind: "rule" },
          metric_ref: f.metricRef,
          minimum_measurement_confidence: MIN_CONFIDENCE,
        };
        break;
      case "feedback":
        base.feedback = { template_ref: f.templateRef };
        break;
      case "schedule":
        base.schedule = { scheduler: "rule_based", interval: def.interval ?? REVIEW_INTERVAL };
        break;
    }
    out.push(base);
  });
  return out;
}

function resolveTemplateRef(
  uri: string,
  ctx: LowerContext,
  passId: string,
): MaterialArtifactRef {
  const resolved = ctx.resolveTemplate?.(uri);
  if (!resolved) {
    throw new CompilationError(
      "template_unresolved",
      passId,
      `feedback template ${uri} could not be resolved`,
    );
  }
  return {
    uri,
    sha256: sha256Hex(resolved.content),
    media_type: "application/json",
  };
}
