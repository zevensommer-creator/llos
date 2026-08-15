import type { LearningEvent, LearnerStateProjection } from "@llos/contracts";
import type { EvidenceGate } from "../events/reducer.js";

export interface WeakSpot {
  claim_ref: string;
  rank: number;
  priority_score: number;
  reasons: string[];
  evidence_state: LearnerStateProjection["evidence_state"];
  success_rate: number | null;
  overdue_review: boolean;
}

export function rankWeakSpots(
  events: readonly LearningEvent[],
  learnerRef: string,
  claims: { claim_ref: string; gate: EvidenceGate }[],
  now: string,
): WeakSpot[] {
  const scored = claims.map(({ claim_ref, gate }) => {
    const projection = projectForClaim(events, learnerRef, claim_ref, gate);
    const reasons: string[] = [];
    let score = 0;

    switch (projection.evidence_state) {
      case "conflicted": score += 100; reasons.push("conflicted_evidence"); break;
      case "no_evidence": score += 80; reasons.push("no_evidence"); break;
      case "insufficient": score += 60; reasons.push("insufficient_evidence"); break;
      default: score += 10; reasons.push("supported_evidence");
    }

    const successes = projection.evidence_counts.supporting;
    const valid = projection.evidence_counts.valid;
    const successRate = valid > 0 ? successes / valid : null;
    if (successRate !== null && successRate < 0.6) {
      score += Math.round((1 - successRate) * 50);
      reasons.push("low_success_rate");
    }

    const overdue = isReviewOverdue(events, learnerRef, claim_ref, now);
    if (overdue) {
      score += 30;
      reasons.push("overdue_review");
    }

    return {
      claim_ref,
      priority_score: score,
      reasons,
      evidence_state: projection.evidence_state,
      success_rate: successRate === null ? null : Math.round(successRate * 1000) / 1000,
      overdue_review: overdue,
    };
  });

  return scored
    .sort((a, b) => b.priority_score - a.priority_score || (a.claim_ref < b.claim_ref ? -1 : 1))
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

function projectForClaim(
  events: readonly LearningEvent[],
  learnerRef: string,
  claimRef: string,
  gate: EvidenceGate,
): Pick<LearnerStateProjection, "evidence_state" | "evidence_counts"> {
  let supporting = 0;
  let contradicting = 0;
  let abstained = 0;
  let belowGate = 0;
  let observationSeen = false;

  for (const event of events) {
    if (
      event.event_type !== "observation.recorded" ||
      event.learner_ref !== learnerRef ||
      event.claim_ref !== claimRef ||
      !event.observation
    ) {
      continue;
    }
    observationSeen = true;
    const obs = event.observation;
    if (obs.result_kind === "abstention") {
      abstained += 1;
      continue;
    }
    const confidence = obs.measurement_confidence ?? 0;
    if (confidence < gate.minimum_measurement_confidence) {
      belowGate += 1;
      continue;
    }
    if (obs.outcome === "success") supporting += 1;
    else contradicting += 1;
  }

  const valid = supporting + contradicting;
  let evidence_state: LearnerStateProjection["evidence_state"] = "no_evidence";
  if (observationSeen) {
    if (valid === 0) evidence_state = "insufficient";
    else if (contradicting > supporting) evidence_state = "conflicted";
    else evidence_state = "supported";
  }

  return {
    evidence_state,
    evidence_counts: { valid, supporting, contradicting, abstained, below_confidence_gate: belowGate },
  };
}

function isReviewOverdue(
  events: readonly LearningEvent[],
  learnerRef: string,
  claimRef: string,
  now: string,
): boolean {
  let lastDue: string | undefined;
  for (const event of events) {
    if (
      event.event_type === "review.scheduled" &&
      event.learner_ref === learnerRef &&
      event.claim_ref === claimRef
    ) {
      lastDue = event.review?.due_at;
    }
  }
  if (!lastDue) return false;
  return Date.parse(lastDue) < Date.parse(now);
}
