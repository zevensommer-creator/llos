import { createHash } from "node:crypto";
import { assertValid, type LearningEvent, type LearnerStateProjection } from "@llos/contracts";
import type { NewLearningEvent } from "../events/store.js";

export const MASTERY_ESTIMATOR_ID = "core.policy.mastery";
export const MASTERY_REDUCER_VERSION = "0.1.0";

export type MasteryStatus = "not_yet" | "provisional" | "learned" | "uncertain" | "lapsed";

export interface EvidencePolicyView {
  policy_ref: string;
  version: string;
  gates: { minimum_measurement_confidence: number; minimum_performance?: number };
  session_requirements: {
    minimum_distinct_sessions: number;
    minimum_independent_successes: number;
    minimum_delayed_successes: number;
    minimum_delay?: string;
    minimum_context_diversity?: number;
  };
  requires_transfer: boolean;
  requires_automatization: boolean;
  conflict_rules: {
    high_confidence_failure_threshold: number;
    high_confidence_failures_before_lapse: number;
    lapse_requires_distinct_sessions: boolean;
    staleness_window?: string;
  };
  abstention_handling: "count_as_insufficient" | "ignore";
}

export interface MasteryDecision {
  schema_version: string;
  decision_id: string;
  learner_ref: string;
  claim_ref: string;
  evidence_policy_ref: string;
  evidence_policy_version: string;
  status: MasteryStatus;
  reason_codes: string[];
  evidence_refs: string[];
  projection_ref: string;
  evaluated_at: string;
  valid_until?: string;
  reducer_version: string;
  estimator_ref: { id: string; version: string };
  supersedes_decision_id?: string;
}

export interface DecideMasteryInput {
  events: readonly LearningEvent[];
  projection: LearnerStateProjection;
  policy: EvidencePolicyView;
  now: string;
  priorDecision?: { decision_id: string; status: MasteryStatus };
}

interface ObservationRecord {
  at: number;
  event_id: string;
  session_ref: string;
  outcome: "success" | "failure";
  confidence: number;
  unassisted: boolean;
}

export function decideMastery(input: DecideMasteryInput): MasteryDecision {
  const { events, projection, policy, now, priorDecision } = input;
  const reasons: string[] = [];

  const status = decideStatus(events, projection, policy, priorDecision, reasons);

  const decision: MasteryDecision = {
    schema_version: "0.2.0",
    decision_id: makeDecisionId(projection, policy, status, now),
    learner_ref: projection.learner_ref,
    claim_ref: projection.claim_ref,
    evidence_policy_ref: policy.policy_ref,
    evidence_policy_version: policy.version,
    status,
    reason_codes: dedupe(reasons),
    evidence_refs: evidenceRefs(events, projection, policy),
    projection_ref: projection.projection_id,
    evaluated_at: now,
    reducer_version: MASTERY_REDUCER_VERSION,
    estimator_ref: { id: MASTERY_ESTIMATOR_ID, version: MASTERY_REDUCER_VERSION },
    ...(priorDecision ? { supersedes_decision_id: priorDecision.decision_id } : {}),
    ...(policy.conflict_rules.staleness_window
      ? { valid_until: addDuration(now, policy.conflict_rules.staleness_window) }
      : {}),
  };

  assertValid("mastery-decision", decision);
  return decision;
}

function decideStatus(
  events: readonly LearningEvent[],
  projection: LearnerStateProjection,
  policy: EvidencePolicyView,
  priorDecision: DecideMasteryInput["priorDecision"],
  reasons: string[],
): MasteryStatus {
  if (projection.evidence_state === "no_evidence") {
    reasons.push("no_evidence");
    return "not_yet";
  }

  const records = collectRecords(events, projection, policy);
  const highConfidenceFailures = records.filter(
    (r) => r.outcome === "failure" && r.confidence >= policy.conflict_rules.high_confidence_failure_threshold,
  );
  const lapseFailSessions = new Set(highConfidenceFailures.map((r) => r.session_ref));
  const lapseCondition = policy.conflict_rules.lapse_requires_distinct_sessions
    ? highConfidenceFailures.length >= policy.conflict_rules.high_confidence_failures_before_lapse &&
      lapseFailSessions.size >= 2
    : highConfidenceFailures.length >= policy.conflict_rules.high_confidence_failures_before_lapse;

  const wasAchieved = priorDecision?.status === "learned" || priorDecision?.status === "provisional";

  if (lapseCondition) {
    reasons.push("high_confidence_failures");
    if (wasAchieved) {
      reasons.push("previously_achieved");
      return "lapsed";
    }
    reasons.push("never_achieved");
    return "not_yet";
  }

  if (projection.evidence_state === "conflicted") {
    reasons.push("conflict_detected");
    return "uncertain";
  }

  if (projection.evidence_state === "insufficient") {
    reasons.push("insufficient_valid_evidence");
    return "not_yet";
  }

  const successes = records.filter((r) => r.outcome === "success");
  const independentSuccesses = successes.filter((r) => r.unassisted).length;
  const distinctSessions = new Set(records.map((r) => r.session_ref)).size;
  const requirements = policy.session_requirements;
  let immediateMet = true;

  if (independentSuccesses < requirements.minimum_independent_successes) {
    reasons.push("insufficient_independent_successes");
    immediateMet = false;
  }
  if (distinctSessions < requirements.minimum_distinct_sessions) {
    reasons.push("insufficient_distinct_sessions");
    immediateMet = false;
  }
  if (
    policy.requires_transfer &&
    requirements.minimum_context_diversity &&
    projection.diversity.distinct_tasks < requirements.minimum_context_diversity
  ) {
    reasons.push("insufficient_context_diversity");
    immediateMet = false;
  }

  if (!immediateMet) return "not_yet";
  reasons.push("immediate_criteria_met");

  const requiredDelayed = requirements.minimum_delayed_successes;
  if (requiredDelayed === undefined || requiredDelayed === 0) {
    reasons.push("retention_not_required");
    return "learned";
  }

  const minDelayMs = requirements.minimum_delay ? durationToMs(requirements.minimum_delay) : 0;
  const firstSuccessAt = successes.length > 0 ? Math.min(...successes.map((r) => r.at)) : Infinity;
  const delayed = successes.filter((r) => r.at - firstSuccessAt >= minDelayMs).length;

  if (delayed >= requiredDelayed) {
    reasons.push("retention_satisfied");
    return "learned";
  }
  reasons.push("retention_pending");
  return "provisional";
}

function collectRecords(
  events: readonly LearningEvent[],
  projection: LearnerStateProjection,
  policy: EvidencePolicyView,
): ObservationRecord[] {
  const gate = policy.gates.minimum_measurement_confidence;
  const records: ObservationRecord[] = [];
  for (const event of events) {
    if (
      event.event_type !== "observation.recorded" ||
      event.claim_ref !== projection.claim_ref ||
      event.learner_ref !== projection.learner_ref ||
      !event.observation ||
      event.observation.result_kind === "abstention"
    ) {
      continue;
    }
    const confidence = event.observation.measurement_confidence ?? 0;
    if (confidence < gate) continue;
    records.push({
      at: Date.parse(event.occurred_at),
      event_id: event.event_id,
      session_ref: event.session_ref,
      outcome: event.observation.outcome as "success" | "failure",
      confidence,
      unassisted: event.task?.assistance
        ? event.task.assistance.hint_count === 0 &&
          event.task.assistance.retry_count === 0 &&
          !event.task.assistance.answer_revealed
        : false,
    });
  }
  return records.sort((a, b) => a.at - b.at);
}

function evidenceRefs(
  events: readonly LearningEvent[],
  projection: LearnerStateProjection,
  policy: EvidencePolicyView,
): string[] {
  return collectRecords(events, projection, policy)
    .slice(0, 32)
    .map((r) => r.event_id);
}

export function toMasteryDecisionEvent(
  decision: MasteryDecision,
  meta: { learner_ref: string; session_ref: string; composition: LearningEvent["composition"] },
  eventSeq: number,
): NewLearningEvent {
  return {
    schema_version: "0.2.0",
    event_id: `evt.${meta.session_ref}.m${String(eventSeq).padStart(4, "0")}`,
    event_type: "mastery.decision_made",
    occurred_at: decision.evaluated_at,
    learner_ref: meta.learner_ref,
    session_ref: meta.session_ref,
    mode: "learning",
    composition: meta.composition,
    idempotency_key: `${meta.session_ref}:mastery:${decision.decision_id}`,
    claim_ref: decision.claim_ref,
    evidence_policy_ref: decision.evidence_policy_ref,
    decision: {
      status: decision.status,
      reason_codes: decision.reason_codes,
      policy_version: decision.evidence_policy_version,
      ...(decision.valid_until ? { valid_until: decision.valid_until } : {}),
    },
  } as NewLearningEvent;
}

function makeDecisionId(
  projection: LearnerStateProjection,
  policy: EvidencePolicyView,
  status: MasteryStatus,
  now: string,
): string {
  const digest = createHash("sha256")
    .update(`${projection.projection_id}|${policy.policy_ref}|${policy.version}|${status}|${now}`)
    .digest("hex")
    .slice(0, 16);
  return `decision.${digest}`;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

export function durationToMs(isoDuration: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(isoDuration);
  if (!m) throw new TypeError(`unsupported ISO duration: ${isoDuration}`);
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  const seconds = Number(m[4] ?? 0);
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function addDuration(isoNow: string, isoDuration: string): string {
  return new Date(Date.parse(isoNow) + durationToMs(isoDuration)).toISOString();
}
