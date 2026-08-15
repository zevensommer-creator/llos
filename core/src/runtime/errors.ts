export const executorErrorCodes = [
  "ir_not_executable",
  "step_not_found",
  "capture_input_missing",
  "capture_input_unexpected",
  "evaluator_unavailable",
  "capability_runner_missing",
  "scheduler_unavailable",
  "session_already_finished",
  "session_not_started",
] as const;

export type ExecutorErrorCode = (typeof executorErrorCodes)[number];

export class ExecutorError extends Error {
  readonly code: ExecutorErrorCode;
  readonly stepId?: string;

  constructor(code: ExecutorErrorCode, message: string, stepId?: string) {
    super(`[${code}]${stepId ? ` ${stepId}:` : ""} ${message}`);
    this.name = "ExecutorError";
    this.code = code;
    this.stepId = stepId;
  }
}
