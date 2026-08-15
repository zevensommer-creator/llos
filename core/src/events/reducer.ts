import { createHash } from "node:crypto";
import {
  assertValid,
  type LearningEvent,
  type LearnerStateProjection,
} from "@llos/contracts";

export const REDUCER_ID = "core.reducer.learning";
export const REDUCER_VERSION = "0.1.0";

export interface EvidenceGate {
  ref: string;
  version: string;
  minimum_measurement_confidence: number;
}

export type EvidenceState = "no_evidence" | "insufficient" | "supported" | "conflicted";

export function projectLearnerState(
  events: readonly LearningEvent[],
  learnerRef: string,
  claimRef: string,
  gate: EvidenceGate,
): LearnerStateProjection {
  const claimEvents = events.filter(
    (e) => e.learner_ref === learnerRef && e.claim_ref === claimRef,
  );

  const sessions = new Set<string>();
  const snapshots = new Set<string>();
  const tasks = new Set<string>();
  const evaluators = new Map<string, NonNullable<LearningEvent["observation"]>["evaluator"]>();

  const independence = { unassisted: 0, hinted: 0, retried: 0, answer_revealed: 0 };
  const counts = { valid: 0, supporting: 0, contradicting: 0, abstained: 0, below_confidence_gate: 0 };

  let observationSeen = false;
  let firstObservedAt: string | undefined;
  let lastValidObservationAt: string | undefined;

  for (const event of claimEvents) {
    sessions.add(event.session_ref);
    if (event.composition?.material_snapshot_ref?.id) snapshots.add(event.composition.material_snapshot_ref.id);
    if (event.event_type !== "observation.recorded" || !event.observation) continue;

    const obs = event.observation;
    observationSeen = true;
    firstObservedAt ??= event.occurred_at;
    evaluators.set(`${obs.evaluator.id}@${obs.evaluator.version}`, obs.evaluator);

    if (obs.result_kind === "abstention") {
      counts.abstained += 1;
      continue;
    }

    const confidence = obs.measurement_confidence ?? 0;
    if (confidence < gate.minimum_measurement_confidence) {
      counts.below_confidence_gate += 1;
      continue;
    }

    counts.valid += 1;
    lastValidObservationAt = event.occurred_at;
    if (obs.outcome === "success") counts.supporting += 1;
    if (obs.outcome === "failure") counts.contradicting += 1;

    if (event.task?.task_ref) tasks.add(event.task.task_ref);
    const assistance = event.task?.assistance;
    if (!assistance) continue;
    if (assistance.answer_revealed) independence.answer_revealed += 1;
    else if (assistance.hint_count > 0) independence.hinted += 1;
    else if (assistance.retry_count > 0) independence.retried += 1;
    else independence.unassisted += 1;
  }

  const projection: LearnerStateProjection = {
    schema_version: "0.2.0",
    projection_id: makeProjectionId(learnerRef, claimRef, gate, claimEvents.length),
    learner_ref: learnerRef,
    claim_ref: claimRef,
    evidence_policy_ref: gate.ref,
    evidence_policy_version: gate.version,
    evidence_state: decideEvidenceState(observationSeen, counts),
    evidence_counts: counts,
    session_coverage: {
      distinct_sessions: sessions.size,
      first_observed_at: firstObservedAt,
      last_valid_observation_at: lastValidObservationAt,
    },
    independence,
    diversity: {
      distinct_material_snapshots: snapshots.size,
      distinct_tasks: tasks.size,
    },
    evaluator_summary: {
      abstention_count: counts.abstained,
      evaluators: [...evaluators.values()],
    },
    reducer: {
      id: REDUCER_ID,
      version: REDUCER_VERSION,
      event_sequence_start: claimEvents[0]?.sequence_no ?? 1,
      event_sequence_end: claimEvents[claimEvents.length - 1]?.sequence_no ?? 1,
      input_hash: hashEvents(claimEvents),
    },
    projected_at: claimEvents[claimEvents.length - 1]?.occurred_at ?? "1970-01-01T00:00:00Z",
  };

  assertValid("learner-state-projection", projection);
  return projection;
}

export function decideEvidenceState(
  observationSeen: boolean,
  counts: { valid: number; supporting: number; contradicting: number },
): EvidenceState {
  if (!observationSeen) return "no_evidence";
  if (counts.valid === 0) return "insufficient";
  if (counts.contradicting > counts.supporting) return "conflicted";
  return "supported";
}

function hashEvents(events: readonly LearningEvent[]): string {
  return createHash("sha256").update(JSON.stringify(events)).digest("hex");
}

function makeProjectionId(
  learnerRef: string,
  claimRef: string,
  gate: EvidenceGate,
  sequenceEnd: number,
): string {
  const seed = createHash("sha256")
    .update(`${learnerRef}|${claimRef}|${gate.ref}|${gate.version}`)
    .digest("hex")
    .slice(0, 16);
  return `projection.${learnerRef}.${seed}.${sequenceEnd}`;
}
