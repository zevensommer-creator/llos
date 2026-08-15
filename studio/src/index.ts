export {
  StudioError,
  translateSchemaErrors,
  type StudioErrorCode,
} from "./errors.js";
export {
  STRUCTURE_CAPABILITY_ID,
  STRUCTURE_OPERATION,
  OCR_OPERATION,
  fakePdfTextExtractor,
  extractSourceText,
  ingestSource,
  parseStructuredOutput,
  parseOcrOutput,
  deterministicStructureTransport,
  deterministicOcrTransport,
  deterministicStudioTransport,
  type IngestSource,
  type IngestDeps,
  type PdfTextExtractor,
  type StructuredFrameType,
  type StructuredUnit,
  type StructuredMaterial,
} from "./ingest.js";
export {
  CEFR_LEVELS,
  buildMaterialPack,
  buildManifestDraft,
  assertManifestValid,
  assertPackSchema,
  MATERIAL_PACK_SCHEMA_VERSION,
  type CefrLevel,
  type BuildDraftOptions,
} from "./build.js";
export {
  CREATE_DRAFT_CAPABILITY,
  StudioDrafts,
  type DraftStatus,
  type DraftBase,
  type StudioDraft,
  type CreateDraftInput,
  type DraftEdit,
  type StudioDraftsDeps,
} from "./drafts.js";
export {
  SANDBOX_LEARNER_REF,
  buildSnapshot,
  compileDraft,
  runSandboxTrial,
  type SandboxTrialReport,
  type SandboxOptions,
} from "./sandbox.js";
export {
  bumpVersion,
  decideVersionBump,
  type VersionBumpKind,
  type VersionDecision,
} from "./versioning.js";
export {
  STUDIO_TEMPLATES,
  templateById,
  type StudioTemplate,
} from "./templates.js";
export {
  StudioService,
  type PublishDraftInput,
  type PublishListingInput,
  type PublishResult,
  type StudioServiceDeps,
} from "./service.js";
