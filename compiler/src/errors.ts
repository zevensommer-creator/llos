export const compilationErrorCodes = [
  "manifest_invalid",
  "manifest_reference_broken",
  "pass_entrypoint_unknown",
  "pass_chain_invalid",
  "material_schema_invalid",
  "material_version_rejected",
  "material_hash_mismatch",
  "material_reference_broken",
  "language_unsupported",
  "template_unresolved",
  "ir_schema_invalid",
  "budget_exceeded",
] as const;

export type CompilationErrorCode = (typeof compilationErrorCodes)[number];

export class CompilationError extends Error {
  readonly code: CompilationErrorCode;
  readonly passId: string;
  readonly details?: string[];

  constructor(
    code: CompilationErrorCode,
    passId: string,
    message: string,
    details?: string[],
  ) {
    super(`[${code}] ${passId}: ${message}`);
    this.name = "CompilationError";
    this.code = code;
    this.passId = passId;
    this.details = details;
  }
}
