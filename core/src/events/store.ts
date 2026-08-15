import { validate, type LearningEvent } from "@llos/contracts";

// Pick (not Omit): the generated type has a string index signature, which makes
// Omit collapse every field to unknown.
export type NewLearningEvent = Pick<
  LearningEvent,
  | "schema_version"
  | "event_id"
  | "event_type"
  | "occurred_at"
  | "learner_ref"
  | "session_ref"
  | "mode"
  | "composition"
  | "claim_ref"
  | "evidence_policy_ref"
  | "task"
  | "observation"
  | "decision"
  | "review"
  | "abort_reason"
  | "payload_ref"
  | "idempotency_key"
  | "extensions"
>;

export type EventAppendErrorCode =
  | "schema_invalid"
  | "duplicate_event_id";

export class EventAppendError extends Error {
  readonly code: EventAppendErrorCode;
  readonly errors?: readonly string[];

  constructor(code: EventAppendErrorCode, message: string, errors?: readonly string[]) {
    super(message);
    this.name = "EventAppendError";
    this.code = code;
    this.errors = errors;
  }
}

export class InMemoryEventStore {
  #events: LearningEvent[] = [];
  #byIdempotencyKey = new Map<string, LearningEvent>();
  #byEventId = new Set<string>();

  append(input: NewLearningEvent): LearningEvent {
    const duplicate = this.#byIdempotencyKey.get(input.idempotency_key);
    if (duplicate) return duplicate;
    if (this.#byEventId.has(input.event_id)) {
      throw new EventAppendError(
        "duplicate_event_id",
        `event_id "${input.event_id}" already stored with a different idempotency_key`,
      );
    }

    const candidate: LearningEvent = { ...input, sequence_no: this.#events.length + 1 };
    const result = validate("learning-event", candidate);
    if (!result.valid) {
      throw new EventAppendError(
        "schema_invalid",
        "learning event rejected by contract schema (closed registry; chat mode never enters this stream)",
        result.errors,
      );
    }

    const stored: LearningEvent = Object.freeze(candidate);
    this.#events.push(stored);
    this.#byIdempotencyKey.set(stored.idempotency_key, stored);
    this.#byEventId.add(stored.event_id);
    return stored;
  }

  events(): readonly LearningEvent[] {
    return this.#events;
  }

  eventsFor(learnerRef: string): readonly LearningEvent[] {
    return this.#events.filter((e) => e.learner_ref === learnerRef);
  }

  eventsForClaim(learnerRef: string, claimRef: string): readonly LearningEvent[] {
    return this.#events.filter((e) => e.learner_ref === learnerRef && e.claim_ref === claimRef);
  }
}
