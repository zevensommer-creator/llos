import type { LearningIR, LearningEvent } from "@llos/contracts";
import type { NewLearningEvent } from "../events/store.js";
import { ExecutorError } from "./errors.js";

export const EXECUTOR_ID = "core.session-executor";
export const EXECUTOR_VERSION = "0.1.0";

type TypedObject = Record<string, unknown>;

export interface ExecStepView {
  step_id: string;
  primitive: string;
  display_mode_ref?: string;
  claim_refs?: string[];
  present?: TypedObject;
  capture?: TypedObject;
  capability?: {
    capability: string;
    required: boolean;
    on_failure?: "retry" | "fallback" | "skip" | "stop_session";
  };
  evaluate?: {
    evaluator: { id: string; version: string; kind: string };
    metric_ref?: string;
    minimum_measurement_confidence?: number;
  };
  branch?: {
    cases: { when: ConditionView; target: string }[];
    fallback_target: string;
  };
  feedback?: TypedObject;
  schedule?: { scheduler: "rule_based" | "fsrs_memory"; interval?: string };
  stop?: { outcome: "success" | "aborted"; abort_reason?: string };
  next?: string;
}

export interface ConditionView {
  fact: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists";
  value: TypedObject;
}

export interface ExecProgramView {
  session_policy: {
    max_duration_ms: number;
    max_provider_cost_usd: number;
    max_iterations: number;
    on_provider_failure: "retry" | "fallback" | "skip_activity" | "stop_session";
    offline_allowed?: boolean;
  };
  entry_step_id: string;
  steps: ExecStepView[];
  stop_conditions: ConditionView[];
}

export interface SessionMeta {
  learner_ref: string;
  session_ref: string;
  composition: LearningEvent["composition"];
}

export interface ResponseInput {
  payload_ref: string;
  payload_sha256?: string;
  choice_id?: string;
  latency_ms?: number;
}

export interface EvaluatorResult {
  result_kind: "binary" | "abstention";
  outcome?: "success" | "failure";
  abstention_reason?: string;
  measurement_confidence: number;
}

export type EvaluatorFn = (
  step: ExecStepView,
  input: ResponseInput | undefined,
) => EvaluatorResult;

export type CapabilityRunner = (step: ExecStepView) => { ok: boolean };

export interface ReviewScheduleResult {
  due_at: string;
  interval: string;
}

export interface ExecutorDeps {
  append: (event: NewLearningEvent) => unknown;
  clock: () => string;
  evaluators: Record<string, EvaluatorFn>;
  capabilityRunner?: CapabilityRunner;
  fsrsScheduler?: (claimRef: string, now: string) => ReviewScheduleResult;
  onPresented?: (step: ExecStepView) => void;
  onFeedback?: (step: ExecStepView) => void;
}

export type ExecutionState =
  | { status: "not_started" }
  | { status: "awaiting_input"; step_id: string }
  | { status: "completed"; outcome: "success" }
  | { status: "aborted"; abort_reason: string };

const CAPTURE_PRIMITIVES = new Set(["capture_text", "capture_audio", "capture_choice"]);
const RESPONSE_MODE: Record<string, "text" | "audio" | "choice"> = {
  capture_text: "text",
  capture_audio: "audio",
  capture_choice: "choice",
};

const ZERO_ASSISTANCE = { hint_count: 0, retry_count: 0, answer_revealed: false };

export class SessionExecutor {
  readonly #program: ExecProgramView;
  readonly #steps: Map<string, ExecStepView>;
  readonly #meta: SessionMeta;
  readonly #deps: ExecutorDeps;
  readonly #policyByClaim: Map<string, string>;

  #state: ExecutionState = { status: "not_started" };
  #currentStepId?: string;
  #iterations = 0;
  #eventSeq = 0;
  #startedAtMs = 0;
  #lastCaptureTaskRef?: string;
  #lastCaptureMode: "text" | "audio" | "choice" | "mixed" = "text";
  #lastResponse?: ResponseInput;
  #facts = new Map<string, TypedObject>();

  constructor(ir: LearningIR, meta: SessionMeta, deps: ExecutorDeps) {
    if (ir.ir_kind !== "executable_session") {
      throw new ExecutorError("ir_not_executable", `expected executable_session IR, got ${ir.ir_kind}`);
    }
    this.#program = ir.program as unknown as ExecProgramView;
    this.#steps = new Map(this.#program.steps.map((s) => [s.step_id, s]));
    this.#meta = meta;
    this.#deps = deps;
    this.#policyByClaim = new Map(
      (ir.claims as unknown as { claim_ref: string; evidence_policy_ref: string }[]).map((c) => [
        c.claim_ref,
        c.evidence_policy_ref,
      ]),
    );
  }

  get state(): ExecutionState {
    return this.#state;
  }

  start(): ExecutionState {
    if (this.#state.status !== "not_started") {
      throw new ExecutorError("session_not_started", "start() called on a session that already started");
    }
    this.#startedAtMs = Date.parse(this.#deps.clock());
    this.#emit("learning.session_started", {});
    this.#currentStepId = this.#program.entry_step_id;
    return this.#runAutoSteps();
  }

  advance(input?: ResponseInput): ExecutionState {
    if (this.#state.status === "not_started") {
      throw new ExecutorError("session_not_started", "call start() before advance()");
    }
    if (this.#state.status !== "awaiting_input") {
      throw new ExecutorError("session_already_finished", `session is ${this.#state.status}`);
    }
    const step = this.#requireStep(this.#currentStepId);
    if (!CAPTURE_PRIMITIVES.has(step.primitive)) {
      throw new ExecutorError("capture_input_unexpected", `current step ${step.step_id} is ${step.primitive}`);
    }
    if (!input || !input.payload_ref) {
      throw new ExecutorError("capture_input_missing", `step ${step.step_id} requires { payload_ref }`, step.step_id);
    }
    this.#lastCaptureTaskRef = step.step_id;
    this.#lastCaptureMode = RESPONSE_MODE[step.primitive] ?? "text";
    this.#lastResponse = input;
    this.#emit("learner.response_submitted", {
      task: {
        task_ref: step.step_id,
        response_mode: this.#lastCaptureMode,
        assistance: { ...ZERO_ASSISTANCE },
      },
      payload_ref: input.payload_sha256
        ? { uri: input.payload_ref, sha256: input.payload_sha256, media_type: "application/json" }
        : { uri: input.payload_ref, media_type: "application/json" },
    });
    this.#facts.set("response.submitted", { kind: "bool", bool: true });
    const next = this.#nextOf(step);
    if (next === undefined) return this.#state;
    this.#currentStepId = next;
    return this.#runAutoSteps();
  }

  #runAutoSteps(): ExecutionState {
    for (;;) {
      const step = this.#requireStep(this.#currentStepId);
      this.#iterations += 1;
      if (this.#iterations > this.#program.session_policy.max_iterations) {
        return this.#abort("budget_exhausted", `iteration cap ${this.#program.session_policy.max_iterations} exceeded at ${step.step_id}`);
      }
      const elapsedMs = Date.parse(this.#deps.clock()) - this.#startedAtMs;
      this.#facts.set("session.elapsed_ms", { kind: "int", int: elapsedMs });
      if (elapsedMs >= this.#program.session_policy.max_duration_ms) {
        return this.#abort("timeout", `elapsed ${elapsedMs}ms reached max_duration_ms`);
      }

      switch (step.primitive) {
        case "present":
          this.#emit("activity.presented", {
            task: {
              task_ref: step.step_id,
              response_mode: "text",
              assistance: { ...ZERO_ASSISTANCE },
            },
          });
          this.#deps.onPresented?.(step);
          break;
        case "capture_text":
        case "capture_audio":
        case "capture_choice":
          this.#state = { status: "awaiting_input", step_id: step.step_id };
          return this.#state;
        case "invoke_capability":
          this.#runCapability(step);
          break;
        case "evaluate":
        case "emit_observation": {
          const evaluation = this.#runEvaluator(step);
          const claimRef = this.#claimOf(step);
          const policyRef = this.#requirePolicy(claimRef, step.step_id);
          const observation: TypedObject = {
            observation_id: `obs.${this.#meta.session_ref}.${this.#eventSeq}`,
            result_kind: evaluation.result_kind,
            evidence_group_id: `group.${this.#meta.session_ref}.${step.step_id}`,
            evaluator: step.evaluate!.evaluator,
            measurement_confidence: evaluation.measurement_confidence,
          };
          if (evaluation.result_kind === "binary") {
            observation.outcome = evaluation.outcome ?? "failure";
          } else {
            observation.abstention_reason = evaluation.abstention_reason ?? "insufficient_evidence";
          }
          if (step.evaluate?.metric_ref) observation.metric_ref = step.evaluate.metric_ref;
          this.#emit("observation.recorded", {
            claim_ref: claimRef,
            evidence_policy_ref: policyRef,
            task: {
              task_ref: this.#lastCaptureTaskRef ?? step.step_id,
              response_mode: this.#lastCaptureMode,
              assistance: { ...ZERO_ASSISTANCE },
            },
            observation,
          });
          this.#facts.set("observation.outcome", { kind: "string", string: evaluation.result_kind === "binary" ? evaluation.outcome ?? "failure" : "abstention" });
          this.#facts.set("observation.measurement_confidence", { kind: "float", float: evaluation.measurement_confidence });
          break;
        }
        case "branch": {
          const target = this.#resolveBranch(step);
          this.#currentStepId = target;
          continue;
        }
        case "feedback":
          this.#emit("feedback.presented", step.claim_refs?.length ? { claim_ref: step.claim_refs[0] } : {});
          this.#deps.onFeedback?.(step);
          break;
        case "schedule": {
          const claimRef = this.#claimOf(step);
          const policyRef = this.#requirePolicy(claimRef, step.step_id);
          const now = this.#deps.clock();
          const sched = step.schedule!;
          const result = sched.scheduler === "fsrs_memory"
            ? this.#requireFsrs(claimRef, now, step.step_id)
            : { due_at: addInterval(now, sched.interval ?? "PT24H"), interval: sched.interval ?? "PT24H" };
          this.#emit("review.scheduled", {
            claim_ref: claimRef,
            evidence_policy_ref: policyRef,
            review: { due_at: result.due_at, interval: result.interval, scheduler: sched.scheduler },
          });
          break;
        }
        case "checkpoint":
          break;
        case "stop":
          if (step.stop?.outcome === "aborted") {
            return this.#abort(step.stop.abort_reason ?? "hard_stop", "stop primitive requested abort");
          }
          this.#emit("learning.session_completed", {});
          this.#state = { status: "completed", outcome: "success" };
          return this.#state;
        default:
          return this.#abort(
            "dlc_compile_failed",
            `unknown primitive '${step.primitive}' (IR schema drift; runtime upgrade required)`,
            step.step_id,
          );
      }
      const next = this.#nextOf(step);
      if (next === undefined) return this.#state;
      this.#currentStepId = next;
    }
  }

  #runCapability(step: ExecStepView): void {
    const params = step.capability!;
    const runner = this.#deps.capabilityRunner;
    if (!runner) {
      if (params.required) {
        this.#abort("provider_unavailable", `no capability runner for ${params.capability}`, step.step_id);
        throw new ExecutorError("capability_runner_missing", params.capability, step.step_id);
      }
      return;
    }
    const result = runner(step);
    if (result.ok) return;
    const onFailure = params.on_failure ?? this.#program.session_policy.on_provider_failure;
    if (onFailure === "stop_session") {
      this.#abort("provider_unavailable", `capability ${params.capability} failed`, step.step_id);
      throw new ExecutorError("capability_runner_missing", `${params.capability} failed with stop_session`, step.step_id);
    }
  }

  #runEvaluator(step: ExecStepView): EvaluatorResult {
    const evaluatorId = step.evaluate!.evaluator.id;
    const fn = this.#deps.evaluators[evaluatorId];
    if (!fn) {
      this.#abort("dlc_compile_failed", `evaluator ${evaluatorId} is not registered`, step.step_id);
      throw new ExecutorError("evaluator_unavailable", evaluatorId, step.step_id);
    }
    return fn(step, this.#lastResponse);
  }

  #resolveBranch(step: ExecStepView): string {
    for (const c of step.branch!.cases) {
      if (this.#testCondition(c.when)) return c.target;
    }
    return step.branch!.fallback_target;
  }

  #testCondition(cond: ConditionView): boolean {
    const fact = this.#facts.get(cond.fact);
    if (fact === undefined) return cond.operator === "exists" ? false : false;
    if (cond.operator === "exists") return true;
    return compare(fact, cond.operator, cond.value);
  }

  #claimOf(step: ExecStepView): string {
    const claim = step.claim_refs?.[0];
    if (!claim) {
      this.#abort("dlc_compile_failed", `step ${step.step_id} has no claim_refs`, step.step_id);
      throw new ExecutorError("ir_not_executable", "claim_refs missing", step.step_id);
    }
    return claim;
  }

  #requirePolicy(claimRef: string, stepId: string): string {
    const policy = this.#policyByClaim.get(claimRef);
    if (!policy) {
      this.#abort("dlc_compile_failed", `claim ${claimRef} has no evidence policy binding`, stepId);
      throw new ExecutorError("ir_not_executable", `no policy for ${claimRef}`, stepId);
    }
    return policy;
  }

  #requireFsrs(claimRef: string, now: string, stepId: string): ReviewScheduleResult {
    const scheduler = this.#deps.fsrsScheduler;
    if (!scheduler) {
      this.#abort("dlc_compile_failed", `fsrs_memory scheduler requested but none provided`, stepId);
      throw new ExecutorError("scheduler_unavailable", "fsrs_memory", stepId);
    }
    return scheduler(claimRef, now);
  }

  #nextOf(step: ExecStepView): string | undefined {
    if (!step.next) {
      this.#abort("dlc_compile_failed", `step ${step.step_id} (${step.primitive}) has no next target`, step.step_id);
      throw new ExecutorError("step_not_found", "missing next", step.step_id);
    }
    if (step.next === "$complete" || step.next === "$stop") {
      this.#emit("learning.session_completed", {});
      this.#state = { status: "completed", outcome: "success" };
      return undefined;
    }
    return step.next;
  }

  #requireStep(stepId?: string): ExecStepView {
    const step = stepId ? this.#steps.get(stepId) : undefined;
    if (!step) {
      this.#abort("dlc_compile_failed", `transition targets unknown step '${stepId}'`, stepId);
      throw new ExecutorError("step_not_found", `unknown step ${stepId}`, stepId);
    }
    return step;
  }

  #abort(reason: string, detail: string, stepId?: string): ExecutionState {
    this.#emit("learning.session_aborted", { abort_reason: reason });
    this.#state = { status: "aborted", abort_reason: reason };
    return this.#state;
  }

  #emit(eventType: string, fields: TypedObject): void {
    this.#eventSeq += 1;
    const occurredAt = this.#deps.clock();
    const event = {
      schema_version: "0.2.0",
      event_id: `evt.${this.#meta.session_ref}.${String(this.#eventSeq).padStart(4, "0")}`,
      event_type: eventType,
      occurred_at: occurredAt,
      learner_ref: this.#meta.learner_ref,
      session_ref: this.#meta.session_ref,
      mode: "learning",
      composition: this.#meta.composition,
      idempotency_key: `${this.#meta.session_ref}:${this.#eventSeq}`,
      ...fields,
    } as NewLearningEvent;
    this.#deps.append(event);
  }
}

function compare(a: TypedObject, operator: ConditionView["operator"], b: TypedObject): boolean {
  const av = scalarOf(a);
  const bv = scalarOf(b);
  if (av === undefined || bv === undefined) return false;
  if (typeof av === "number" && typeof bv === "number") {
    switch (operator) {
      case "eq": return av === bv;
      case "neq": return av !== bv;
      case "gt": return av > bv;
      case "gte": return av >= bv;
      case "lt": return av < bv;
      case "lte": return av <= bv;
      default: return false;
    }
  }
  switch (operator) {
    case "eq": return av === bv;
    case "neq": return av !== bv;
    case "in": return Array.isArray(bv) ? bv.includes(av) : false;
    default: return false;
  }
}

function scalarOf(v: TypedObject): string | number | boolean | unknown[] | undefined {
  switch (v.kind) {
    case "string": return v.string as string;
    case "int":
    case "float": return (v.int ?? v.float) as number;
    case "bool": return v.bool as boolean;
    default: return undefined;
  }
}

export function addInterval(isoNow: string, isoDuration: string): string {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(isoDuration);
  if (!m) throw new TypeError(`unsupported ISO duration: ${isoDuration}`);
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  const seconds = Number(m[4] ?? 0);
  const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  return new Date(Date.parse(isoNow) + totalSeconds * 1000).toISOString();
}
