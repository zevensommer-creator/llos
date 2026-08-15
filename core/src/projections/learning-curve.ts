import type { LearningEvent } from "@llos/contracts";

export interface CurvePoint {
  date: string;
  observations: number;
  valid: number;
  successes: number;
  success_rate: number | null;
  mean_confidence: number | null;
}

export interface LearningCurve {
  claim_ref: string;
  learner_ref: string;
  points: CurvePoint[];
}

export function projectLearningCurve(
  events: readonly LearningEvent[],
  learnerRef: string,
  claimRef: string,
  minimumConfidence: number,
): LearningCurve {
  const buckets = new Map<string, { observations: number; valid: number; successes: number; confidenceSum: number }>();

  for (const event of events) {
    if (
      event.event_type !== "observation.recorded" ||
      event.learner_ref !== learnerRef ||
      event.claim_ref !== claimRef ||
      !event.observation
    ) {
      continue;
    }
    const date = event.occurred_at.slice(0, 10);
    const bucket = buckets.get(date) ?? { observations: 0, valid: 0, successes: 0, confidenceSum: 0 };
    bucket.observations += 1;
    if (event.observation.result_kind !== "abstention") {
      const confidence = event.observation.measurement_confidence ?? 0;
      if (confidence >= minimumConfidence) {
        bucket.valid += 1;
        bucket.confidenceSum += confidence;
        if (event.observation.outcome === "success") bucket.successes += 1;
      }
    }
    buckets.set(date, bucket);
  }

  const points = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, b]) => ({
      date,
      observations: b.observations,
      valid: b.valid,
      successes: b.successes,
      success_rate: b.valid > 0 ? round3(b.successes / b.valid) : null,
      mean_confidence: b.valid > 0 ? round3(b.confidenceSum / b.valid) : null,
    }));

  return { claim_ref: claimRef, learner_ref: learnerRef, points };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
