import { fsrs, createEmptyCard, generatorParameters, type Card, type Grade, Rating } from "ts-fsrs";

export const FSRS_SCHEDULER_ID = "fsrs_memory" as const;
export const FSRS_GATE_CONFIDENCE = 0.8;

export interface ReviewFact {
  occurred_at: string;
  outcome: "success" | "failure";
  measurement_confidence: number;
}

export interface FsrsScheduleResult {
  due_at: string;
  interval: string;
  scheduler: typeof FSRS_SCHEDULER_ID;
}

const DAY_MS = 86_400_000;

function toGrade(fact: ReviewFact): Grade {
  return fact.outcome === "success" ? Rating.Good : Rating.Again;
}

function isoDaysToDuration(days: number): string {
  if (!Number.isFinite(days) || days < 1 / 1440) {
    return "PT1M";
  }
  if (days < 1) {
    return `PT${Math.max(1, Math.round(days * 24 * 60))}M`;
  }
  return `P${Math.round(days)}D`;
}

export function replayCard(history: ReviewFact[], firstReviewAt: Date): Card {
  const f = fsrs(generatorParameters({ enable_fuzz: false }));
  let card = createEmptyCard(firstReviewAt);
  for (const fact of history) {
    const now = new Date(fact.occurred_at);
    if (Number.isNaN(now.getTime())) {
      throw new TypeError(`invalid review timestamp: ${fact.occurred_at}`);
    }
    const record = f.next(card, now, toGrade(fact));
    card = record.card;
  }
  return card;
}

export function scheduleFsrsReview(
  history: ReviewFact[],
  now: string,
  minimumConfidence: number = FSRS_GATE_CONFIDENCE,
): FsrsScheduleResult {
  const accepted = history.filter((h) => h.measurement_confidence >= minimumConfidence);
  const nowDate = new Date(now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new TypeError(`invalid now timestamp: ${now}`);
  }

  if (accepted.length === 0) {
    const due = new Date(nowDate.getTime() + 10 * 60 * 1000);
    return {
      due_at: due.toISOString(),
      interval: "PT10M",
      scheduler: FSRS_SCHEDULER_ID,
    };
  }

  const firstReviewAt = new Date(accepted[0].occurred_at);
  const card = replayCard(accepted, firstReviewAt);
  const dueMs = Math.max(card.due.getTime(), nowDate.getTime());
  const intervalDays = Math.max((dueMs - nowDate.getTime()) / DAY_MS, 1 / 1440);

  return {
    due_at: new Date(dueMs).toISOString(),
    interval: isoDaysToDuration(intervalDays),
    scheduler: FSRS_SCHEDULER_ID,
  };
}
