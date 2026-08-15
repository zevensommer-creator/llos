export {
  InMemoryEventStore,
  EventAppendError,
  type NewLearningEvent,
  type EventAppendErrorCode,
} from "./events/store.js";
export {
  projectLearnerState,
  decideEvidenceState,
  REDUCER_ID,
  REDUCER_VERSION,
  type EvidenceGate,
  type EvidenceState,
} from "./events/reducer.js";
export {
  InMemoryAccountStore,
  BASE_CAPABILITIES,
  CREATOR_CAPABILITIES,
  creatorCapabilitiesUnlocked,
  type Account,
  type VerificationStatus,
} from "./identity.js";
export { InMemoryEntitlementStore, type Entitlement } from "./entitlements.js";
export {
  SessionExecutor,
  EXECUTOR_ID,
  EXECUTOR_VERSION,
  addInterval,
  type ExecutionState,
  type ExecutorDeps,
  type SessionMeta,
  type ResponseInput,
  type EvaluatorFn,
  type EvaluatorResult,
  type ExecStepView,
} from "./runtime/executor.js";
export { ExecutorError, executorErrorCodes, type ExecutorErrorCode } from "./runtime/errors.js";
export {
  scheduleFsrsReview,
  replayCard,
  FSRS_SCHEDULER_ID,
  FSRS_GATE_CONFIDENCE,
  type ReviewFact,
  type FsrsScheduleResult,
} from "./scheduler/fsrs.js";
export {
  decideMastery,
  toMasteryDecisionEvent,
  MASTERY_ESTIMATOR_ID,
  MASTERY_REDUCER_VERSION,
  durationToMs,
  type MasteryStatus,
  type MasteryDecision,
  type EvidencePolicyView,
  type DecideMasteryInput,
} from "./policy/mastery.js";
export {
  projectLearningCurve,
  type CurvePoint,
  type LearningCurve,
} from "./projections/learning-curve.js";
export { rankWeakSpots, type WeakSpot } from "./projections/weak-spots.js";
export { projectAdaptiveDifficulty, type DifficultyTier, type DifficultyHint } from "./projections/adaptive-difficulty.js";
export {
  toPronunciationObservations,
  toObservationRecordedEvents,
  mapAbstentionReason,
  SPEECH_BRIDGE_ID,
  SPEECH_BRIDGE_VERSION,
  type SpeechBridgeContext,
  type ObservationEventContext,
} from "./speech/bridge.js";
