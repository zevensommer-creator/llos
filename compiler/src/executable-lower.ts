import type { DLCManifest, LearningIR } from "@llos/contracts";
import { canonicalJson, sha256Hex } from "./hash.js";
import { CompilationError } from "./errors.js";
import type { MaterialArtifactRef, ValidatedMaterial } from "./material-validate.js";
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
    const present: Record<string, unknown> = {
      step_id: `${stage.stage_id}.present`,
      primitive: "present",
      display_mode_ref: stage.mode_ref,
      claim_refs: claims,
      present: {
        prompt: `Übung: ${title}`,
        ...(referenceText ? { reference_text: referenceText } : {}),
      },
      next: `${stage.stage_id}.capture`,
    };
    const capture = {
      step_id: `${stage.stage_id}.capture`,
      primitive: "capture_text",
      claim_refs: claims,
      capture: { timeout_ms: CAPTURE_TIMEOUT_MS, max_length: CAPTURE_MAX_LENGTH },
      next: `${stage.stage_id}.evaluate`,
    };
    const evaluate = {
      step_id: `${stage.stage_id}.evaluate`,
      primitive: "evaluate",
      claim_refs: claims,
      evaluate: {
        evaluator: { id: "eval.typed_answer", version: "0.1.0", kind: "rule" },
        metric_ref: `${manifest.dlc_id}:metric/typed_answer_accuracy`,
        minimum_measurement_confidence: MIN_CONFIDENCE,
      },
      next: `${stage.stage_id}.feedback`,
    };
    const feedback = {
      step_id: `${stage.stage_id}.feedback`,
      primitive: "feedback",
      claim_refs: claims,
      feedback: { template_ref: templateRef },
      next: `${stage.stage_id}.schedule`,
    };
    const nextAfterSchedule =
      index + 1 < stages.length ? `${stages[index + 1].stage_id}.present` : STOP_STEP_ID;
    const schedule = {
      step_id: `${stage.stage_id}.schedule`,
      primitive: "schedule",
      claim_refs: claims,
      schedule: { scheduler: "rule_based", interval: REVIEW_INTERVAL },
      next: nextAfterSchedule,
    };
    steps.push(present, capture, evaluate, feedback, schedule);
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
