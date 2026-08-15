import { createHash } from "node:crypto";
import {
  assertValid,
  type LearningObservation,
  type PronunciationAssessment,
} from "@llos/contracts";
import type { NewLearningEvent } from "../events/store.js";

export const SPEECH_BRIDGE_ID = "core.bridge.pronunciation";
export const SPEECH_BRIDGE_VERSION = "0.1.0";

const SPEECH_EVALUATOR_ID = "speech.pipeline.pronunciation";

// Speech pipeline reason codes (pronunciation-assessment) are an open set;
// the observation contract enum is closed. The bridge maps deterministically
// and falls back to insufficient_evidence instead of guessing a cause.
const ABSTENTION_REASON_MAP: Record<string, LearningObservation["abstention_reason"]> = {
  audio_quality: "audio_quality_low",
  insufficient_speech: "audio_quality_low",
  asr_disagreement: "reference_mismatch_too_large",
  alignment_failed: "alignment_failed",
  alignment_low_confidence: "alignment_failed",
  acceptable_variant_ambiguous: "evaluator_uncertain",
  out_of_calibration_domain: "uncalibrated_domain",
  unsupported_language_feature: "uncalibrated_domain",
  evidence_conflict: "scorer_conflict",
  provider_failure: "insufficient_evidence",
};

export interface SpeechBridgeContext {
  learner_ref: string;
  session_ref: string;
  activity_ref: string;
  observed_at: string;
  evidence_group_id: string;
  claim_bindings: Record<string, string>;
  material_snapshot_ref: LearningObservation["material_snapshot_ref"];
  assistance: LearningObservation["assistance"];
}

export interface ObservationEventContext {
  occurred_at: string;
  mode: NewLearningEvent["mode"];
  composition: NewLearningEvent["composition"];
  evidence_policy_ref: string;
  task: NewLearningEvent["task"];
}

export function mapAbstentionReason(
  reasonCode: string,
): NonNullable<LearningObservation["abstention_reason"]> {
  return ABSTENTION_REASON_MAP[reasonCode] ?? "insufficient_evidence";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Deterministic bridge from a speech PronunciationAssessment to typed
 * LearningObservations (spec §7, §8.3): the pipeline supplies evidence, Core
 * converts it. Each claim-bound dimension yields exactly one observation —
 * scored dimensions become scalar observations with performance and
 * measurement_confidence kept strictly separate; abstained dimensions become
 * explicit abstentions. Dimensions without a claim binding are skipped: claim
 * ownership belongs to the DLC, never to the bridge. Issues never become
 * observations — they feed feedback, not learning facts.
 */
export function toPronunciationObservations(
  assessment: PronunciationAssessment,
  ctx: SpeechBridgeContext,
): LearningObservation[] {
  const assessmentSha = sha256(JSON.stringify(assessment));
  const evidenceArtifact = {
    uri: `artifact://pronunciation-assessment/${assessmentSha}`,
    sha256: assessmentSha,
    media_type: "application/json",
    schema_id: "pronunciation-assessment",
    schema_version: "0.2.0",
  };
  const reasonByAbstentionId = new Map(
    assessment.abstentions.map((a) => [a.abstention_id, a.reason_code]),
  );

  const observations: LearningObservation[] = [];
  for (const dimension of assessment.dimensions) {
    const claimRef = ctx.claim_bindings[dimension.id];
    if (!claimRef) continue;

    const observationId = `obs.pronunciation.${dimension.id}.${sha256(`${assessmentSha}|${dimension.id}`).slice(0, 8)}`;
    const base = {
      schema_version: "0.2.0" as const,
      observation_id: observationId,
      learner_ref: ctx.learner_ref,
      session_ref: ctx.session_ref,
      activity_ref: ctx.activity_ref,
      claim_ref: claimRef,
      material_snapshot_ref: ctx.material_snapshot_ref,
      evidence_group_id: ctx.evidence_group_id,
      response_ref: assessment.audio_ref,
      assistance: ctx.assistance,
      evaluator: {
        id: SPEECH_EVALUATOR_ID,
        version: assessment.provenance.pipeline_version,
        kind: "model" as const,
      },
      provenance: {
        evaluator_run_id: `run.${assessmentSha.slice(0, 16)}`,
        seed: String(assessment.provenance.random_seed),
      },
      observed_at: ctx.observed_at,
    };

    if (dimension.status === "scored" && dimension.score !== undefined) {
      const observation: LearningObservation = {
        ...base,
        result_kind: "scalar",
        metric_ref: `speech:metric/${dimension.id}`,
        value: dimension.score,
        measurement_confidence: dimension.confidence,
        evidence_artifact_ref: evidenceArtifact,
      };
      assertValid("learning-observation", observation);
      observations.push(observation);
    } else if (dimension.status === "abstained") {
      const rawReason = dimension.abstention_ref
        ? reasonByAbstentionId.get(dimension.abstention_ref)
        : undefined;
      const observation: LearningObservation = {
        ...base,
        result_kind: "abstention",
        abstention_reason: mapAbstentionReason(rawReason ?? "evidence_conflict"),
      };
      assertValid("learning-observation", observation);
      observations.push(observation);
    }
    // not_applicable and scored-without-score dimensions carry no claim
    // evidence and are intentionally dropped.
  }
  return observations;
}

const EVENT_PAYLOAD_KEYS = [
  "observation_id",
  "evidence_group_id",
  "evaluator",
  "result_kind",
  "outcome",
  "metric_ref",
  "value",
  "dimensions",
  "latency_ms",
  "evidence_artifact_ref",
  "abstention_reason",
  "measurement_confidence",
] as const;

function toEventPayload(observation: LearningObservation): NewLearningEvent["observation"] {
  const payload: Record<string, unknown> = {};
  for (const key of EVENT_PAYLOAD_KEYS) {
    const value = observation[key];
    if (value !== undefined) payload[key] = value;
  }
  return payload as NewLearningEvent["observation"];
}

/**
 * Wrap observations as append-only observation.recorded events. The payload is
 * reduced to the ObservationPayload field set; learner/session context lives
 * on the event, never duplicated inline. Replaying the same observation
 * reproduces the same idempotency key, so the store dedupes instead of
 * inflating evidence counts.
 */
export function toObservationRecordedEvents(
  observations: readonly LearningObservation[],
  ctx: ObservationEventContext,
): NewLearningEvent[] {
  return observations.map((observation) => {
    const payload = toEventPayload(observation);
    return {
      schema_version: "0.2.0",
      event_id: `evt.observation.${sha256(JSON.stringify(payload)).slice(0, 16)}`,
      event_type: "observation.recorded",
      occurred_at: ctx.occurred_at,
      learner_ref: observation.learner_ref,
      session_ref: observation.session_ref,
      mode: ctx.mode,
      composition: ctx.composition,
      claim_ref: observation.claim_ref,
      evidence_policy_ref: ctx.evidence_policy_ref,
      task: ctx.task,
      observation: payload,
      idempotency_key: `observation.recorded:${observation.observation_id}`,
    };
  });
}
