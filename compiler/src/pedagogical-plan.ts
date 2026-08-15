import type { DLCManifest, LearningIR } from "@llos/contracts";
import { sha256Hex } from "./hash.js";
import { CompilationError } from "./errors.js";
import type { ValidatedMaterial } from "./material-validate.js";
import type { TrainingModes } from "./training-modes.js";
import { RUNTIME_VERSION } from "./runtime-version.js";

const FRAME_MODE: Record<string, string> = {
  scenario: "mode.substitution_drill",
  argument_structure: "mode.valence_cloze",
};

const MODE_CLAIM_SUFFIX: Record<string, string> = {
  "mode.substitution_drill": "checkin_dialogue",
  "mode.valence_cloze": "verb_valence_dative",
  "mode.construction_drill": "polite_request_construction",
};

const REPEAT = 3;
const TIME_BUDGET_MS = 60_000;
const MIN_CONFIDENCE = 0.8;

export interface PlanContext {
  manifestHash: string;
  seed: number;
  now: () => string;
  completedPasses: { id: string; version: string }[];
  /** 专家模式自定义训练模式（可选）；mode_ref 的 lower 见 spec §4.3。 */
  trainingModes?: TrainingModes;
}

export function planPedagogical(
  validated: ValidatedMaterial,
  manifest: DLCManifest,
  ctx: PlanContext,
): LearningIR {
  const passId = "pedagogical.plan";
  if (!manifest.claims || manifest.claims.length === 0) {
    throw new CompilationError(
      "manifest_reference_broken",
      passId,
      "DLC manifest declares no claims; nothing to teach",
    );
  }
  const claimBindings = manifest.claims.map((c) => ({
    claim_ref: c.claim_ref,
    evidence_policy_ref: c.evidence_policy_ref,
    evidence_policy_version: c.evidence_policy_version,
    descriptor: { display_name: c.display_name ?? c.claim_ref },
  }));
  const claimRefs = claimBindings.map((c) => c.claim_ref);

  const activityPlan = validated.pack.semantic_frames.map((frame) => {
    const mode = modeForFrame(frame.frame_type, frame.id, ctx.trainingModes);
    return {
      stage_id: frame.id,
      mode_ref: mode,
      claim_refs: claimRefsForMode(manifest, mode, passId, ctx.trainingModes),
      repeat: REPEAT,
      time_budget_ms: TIME_BUDGET_MS,
    };
  });

  const dimensions = claimRefs.map((ref, i) => ({
    id: `dim.${ref.split(":claim/")[1]}`,
    weight: i === 0 ? 0.4 : 0.3,
    evidence_required: true,
    minimum_measurement_confidence: MIN_CONFIDENCE,
  }));

  const program = {
    theory_profile: manifest.theory_profile.map((t) => ({ id: t.id, role: t.role })),
    claim_refs: claimRefs,
    prerequisites: [],
    activity_plan: activityPlan,
    assessment_plan: {
      dimensions,
      abstention_allowed: true,
    },
    remediation: [
      {
        trigger: {
          fact: "observation.measurement_confidence",
          operator: "lt",
          value: { kind: "float", float: MIN_CONFIDENCE },
        },
        action: "repeat",
      },
    ],
  };

  const idSeed = `${validated.packHash}|${ctx.manifestHash}|${ctx.seed}|pedagogical`;
  const irVersion = manifest.output_ir.schema_id.split(":").pop() ?? "0.2.0";

  return {
    schema_version: "0.2.0",
    ir_id: `ir.pedagogical.${sha256Hex(idSeed).slice(0, 16)}`,
    ir_version: irVersion,
    ir_kind: "pedagogical",
    language: validated.language,
    created_at: ctx.now(),
    compiler: {
      dlc_id: manifest.dlc_id,
      dlc_version: manifest.version,
      runtime_version: RUNTIME_VERSION,
    },
    source_refs: [validated.sourceRef],
    random_seed: ctx.seed,
    claims: claimBindings as LearningIR["claims"],
    program,
    provenance: {
      input_hashes: [validated.packHash, ctx.manifestHash],
      passes: [
        ...ctx.completedPasses.map((p) => ({ ...p, status: "completed" as const })),
        { id: passId, version: passVersionOf(manifest, passId), status: "completed" },
      ],
      compiled_at: ctx.now(),
    },
  };
}

function passVersionOf(manifest: DLCManifest, passId: string): string {
  const pass = manifest.passes.find((p) => p.id === passId);
  return pass?.version ?? "0.0.0";
}

function modeForFrame(frameType: string, stageId: string, modes?: TrainingModes): string {
  // 专家模式：stage_modes 里的显式映射优先于内置 frame_type 默认。
  const staged = modes?.stage_modes.get(stageId);
  if (staged) return staged;
  return FRAME_MODE[frameType] ?? "mode.construction_drill";
}

function claimRefsForMode(
  manifest: DLCManifest,
  mode: string,
  passId: string,
  modes?: TrainingModes,
): string[] {
  const suffix = modes?.modes.get(mode)?.claim_suffix ?? MODE_CLAIM_SUFFIX[mode];
  const claimRef = `${manifest.dlc_id}:claim/${suffix}`;
  if (!manifest.claims?.some((c) => c.claim_ref === claimRef)) {
    throw new CompilationError(
      "manifest_reference_broken",
      passId,
      `mode ${mode} requires claim ${claimRef} which the manifest does not declare`,
    );
  }
  return [claimRef];
}
