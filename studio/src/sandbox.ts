import type { DLCManifest, LearningIR, MaterialPack, MaterialSnapshot } from "@llos/contracts";
import { contentHash, runCompiler } from "@llos/compiler";
import { SessionExecutor, scheduleFsrsReview, type NewLearningEvent } from "@llos/core";
import { StudioError } from "./errors.js";
import { CompilationError } from "@llos/compiler";

// 沙箱试用（product_spec §6.4）：发布前创作者模拟学生完整走一遍训练。
// 编译 → Executable IR → 沙箱运行；事件只进入本地丢弃式收集器，
// 不写真实事件存储——真实学习事件只能由 Core 追加（不变量 6）。

export const SANDBOX_LEARNER_REF = "sandbox.creator-trial";

const DEFAULT_FEEDBACK_TEMPLATE = JSON.stringify({
  schema_version: "0.1.0",
  template_id: "feedback.generic",
  on_correct: { message: "Richtig. Bleiben Sie bei dem Muster und wiederholen Sie es laut." },
  on_retry: { message: "Noch einmal. Achten Sie auf Wortstellung und Valenz." },
});

export interface SandboxTrialReport {
  sandbox: true;
  compiled: true;
  ir_id: string;
  status: "completed" | "aborted";
  outcome?: "success" | "aborted";
  steps_completed: number;
  events_appended: number;
  real_event_store_used: false;
  executed_at: string;
}

export interface SandboxOptions {
  clock?: () => string;
  seed?: number;
  /** 覆盖默认通用反馈模板（测试或创作者自定义）。 */
  feedbackTemplate?: string;
  /** 模拟学员答题结果；默认全部答对。 */
  evaluatorOutcome?: "success" | "failure";
}

export function buildSnapshot(pack: MaterialPack, snapshotId: string, createdAt: string): MaterialSnapshot {
  const packHash = contentHash(pack);
  return {
    schema_version: "0.2.1",
    snapshot_id: snapshotId,
    source: "stored",
    material_ref: {
      uri: `artifact://materials/${pack.pack_id}/${pack.version}`,
      sha256: packHash,
      media_type: "application/json",
      schema_id: "material-pack",
      schema_version: "0.2.1",
    },
    content_sha256: packHash,
    schema_validation: { status: "valid", schema_id: "material-pack", schema_version: "0.2.1" },
    quality_checks: [],
    created_at: createdAt,
    lifecycle: "ephemeral",
  };
}

export function compileDraft(
  pack: MaterialPack,
  manifest: DLCManifest,
  options: SandboxOptions = {},
): { executable: LearningIR; snapshot: MaterialSnapshot } {
  const now = options.clock ?? (() => new Date().toISOString());
  const snapshot = buildSnapshot(pack, `snap.studio.${manifest.dlc_id}.${manifest.version}`, now());
  const template = options.feedbackTemplate ?? DEFAULT_FEEDBACK_TEMPLATE;
  try {
    const { executable } = runCompiler(
      { manifest, snapshot, materialPack: pack },
      {
        clock: now,
        seed: options.seed ?? 0,
        templateResolver: (uri) => (uri.endsWith("feedback-generic") ? { content: template } : undefined),
      },
    );
    if (!executable) {
      throw new StudioError("sandbox_compile_failed", "课程包编译没有产出可运行的训练流程");
    }
    return { executable, snapshot };
  } catch (err) {
    if (err instanceof CompilationError) {
      throw new StudioError(
        "sandbox_compile_failed",
        `试运行前的编译检查未通过，暂时无法试用：${err.message}`,
        [err.code],
      );
    }
    throw err;
  }
}

export function runSandboxTrial(
  pack: MaterialPack,
  manifest: DLCManifest,
  options: SandboxOptions = {},
): SandboxTrialReport {
  const now = options.clock ?? (() => new Date().toISOString());
  const { executable, snapshot } = compileDraft(pack, manifest, options);

  // 丢弃式事件收集器：真实事件存储不参与沙箱。
  const sandboxEvents: NewLearningEvent[] = [];
  const composition = {
    core_version: "0.2.0",
    dlc_ref: { id: manifest.dlc_id, version: manifest.version, sha256: contentHash(manifest) },
    material_snapshot_ref: {
      id: snapshot.snapshot_id,
      version: "1.0.0",
      sha256: snapshot.content_sha256,
    },
    learning_ir_ref: { id: executable.ir_id, version: "0.2.0", sha256: contentHash(executable) },
  };

  const executor = new SessionExecutor(
    executable,
    { learner_ref: SANDBOX_LEARNER_REF, session_ref: `sandbox.${manifest.dlc_id}`, composition },
    {
      append: (event) => {
        sandboxEvents.push(event);
      },
      clock: now,
      evaluators: {
        "eval.typed_answer": () => ({
          result_kind: "binary",
          outcome: options.evaluatorOutcome ?? "success",
          measurement_confidence: 0.92,
        }),
      },
      fsrsScheduler: (claimRef) =>
        scheduleFsrsReview(
          sandboxEvents
            .filter((e) => e.event_type === "observation.recorded" && e.claim_ref === claimRef)
            .map((e) => ({
              occurred_at: e.occurred_at,
              outcome: e.observation?.outcome ?? "success",
              measurement_confidence: e.observation?.measurement_confidence ?? 0.9,
            })),
          now(),
        ),
    },
  );

  let state = executor.start();
  if (state.status === "not_started") {
    throw new StudioError("sandbox_compile_failed", "试用流程异常：训练未能启动");
  }
  let steps = 0;
  const guardLimit = 10_000;
  while (state.status === "awaiting_input" && steps < guardLimit) {
    state = executor.advance({
      payload_ref: `artifact://sandbox/${manifest.dlc_id}/${state.step_id}`,
      payload_sha256: snapshot.content_sha256,
    });
    steps += 1;
  }
  if (state.status === "awaiting_input" || state.status === "not_started") {
    throw new StudioError("sandbox_compile_failed", "试用流程异常：训练步骤未能走到终点");
  }

  return {
    sandbox: true,
    compiled: true,
    ir_id: executable.ir_id,
    status: state.status,
    ...(state.status === "completed" ? { outcome: state.outcome } : {}),
    steps_completed: steps,
    events_appended: sandboxEvents.length,
    real_event_store_used: false,
    executed_at: now(),
  };
}
