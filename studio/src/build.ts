import type { DLCManifest, MaterialPack } from "@llos/contracts";
import { validate } from "@llos/contracts";
import type { StructuredUnit } from "./ingest.js";
import { StudioError, translateSchemaErrors } from "./errors.js";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const MATERIAL_PACK_SCHEMA_VERSION = "0.2.1";
const MANIFEST_SCHEMA_VERSION = "0.2.0";
const MATERIAL_SCHEMA_URN = `urn:language-learning-platform:schema:material-pack:${MATERIAL_PACK_SCHEMA_VERSION}`;
const LEARNING_IR_SCHEMA_URN = "urn:language-learning-platform:schema:learning-ir:0.2.0";

export interface BuildDraftOptions {
  language: string;
  title: string;
  description?: string;
  cefrLevel: CefrLevel;
  creatorName: string;
  packId: string;
  dlcId: string;
  version: string;
  createdAt: string;
}

const INTENTS: Record<StructuredUnit["frame_type"], string[]> = {
  scenario: ["exchange_information"],
  argument_structure: ["make_statement"],
  concept: ["make_polite_request"],
};

const PARTICIPANTS: Record<StructuredUnit["frame_type"], { id: string; role: string }[]> = {
  scenario: [
    { id: "speaker", role: "participant_a" },
    { id: "partner", role: "participant_b" },
  ],
  argument_structure: [
    { id: "agent", role: "nominative" },
    { id: "object", role: "accusative" },
    { id: "adressat", role: "dative" },
  ],
  concept: [
    { id: "speaker", role: "requester" },
    { id: "addressee", role: "service_staff" },
  ],
};

export interface StructuredInput {
  units: StructuredUnit[];
  structured_by: { provider_id: string; model_id?: string };
}

export function buildMaterialPack(
  structured: StructuredInput,
  options: BuildDraftOptions,
): MaterialPack {
  const frames = structured.units.map((unit) => {
    const n = unit.unit_no;
    const lexical = unit.lemma ? [{ id: `lex.${n}`, language: options.language, lemma: unit.lemma, frequency_band: 3 }] : [];
    return {
      id: `frame.${n}`,
      frame_type: unit.frame_type,
      titles: [{ language: options.language, text: unit.title }],
      communicative_intents: INTENTS[unit.frame_type],
      participants: PARTICIPANTS[unit.frame_type],
      facts: [
        {
          subject: "construction",
          predicate: "surface_pattern",
          object: { kind: "string", string: unit.pattern },
        },
        ...(unit.lemma
          ? [
              {
                subject: "focus_lexeme",
                predicate: "lemma",
                object: { kind: "ref", ref: `lex.${n}` },
              },
            ]
          : []),
      ],
      lexical_candidates: lexical,
      asset_refs: [],
    };
  });

  const pack = {
    schema_version: MATERIAL_PACK_SCHEMA_VERSION,
    pack_id: options.packId,
    version: options.version,
    display_name: options.title,
    ...(options.description ? { description: options.description } : {}),
    pack_kind: "semantic_scenario",
    distribution_scope: "internal",
    languages: [options.language],
    level_refs: [{ scale_ref: "scale.cefr", level_ref: options.cefrLevel, version: "2001.0.0" }],
    register_tags: ["neutral"],
    compatibility: {
      material_schema: ">=0.2.0 <0.3.0",
      learning_ir: ">=0.2.0 <0.3.0",
      required_dlc_capabilities: ["scenario.dialogue"],
    },
    lifecycle: "private_saved",
    semantic_frames: frames,
    assets: [],
    generation_policy: {
      allow_generation: true,
      allowed_transformations: ["surface_realization", "lexical_substitution", "dialogue_expansion"],
      immutable_paths: ["/semantic_frames/*/id", "/semantic_frames/*/facts/0"],
      human_review_required: true,
    },
    provenance: {
      created_at: options.createdAt,
      creators: [options.creatorName],
      source_records: [],
      generation_runs: [
        {
          provider_id: structured.structured_by.provider_id,
          model_version: structured.structured_by.model_id ?? "unspecified",
          template_version: "0.1.0",
          created_at: options.createdAt,
        },
      ],
    },
  };
  return assertPackValid(pack);
}

function assertPackValid(pack: unknown): MaterialPack {
  const result = validate("material-pack", pack);
  if (!result.valid) {
    throw new StudioError(
      "draft_schema_invalid",
      `草稿未能通过素材完整性检查：\n${translateSchemaErrors("material-pack", result.errors).join("\n")}`,
      result.errors,
    );
  }
  return pack as MaterialPack;
}

export function buildManifestDraft(options: BuildDraftOptions): DLCManifest {
  const dlcId = options.dlcId;
  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    dlc_id: dlcId,
    version: options.version,
    display_name: options.title,
    ...(options.description ? { description: options.description } : {}),
    compatibility: {
      core_api: ">=0.2.0 <0.3.0",
      compiler_runtime: ">=0.1.0 <0.2.0",
      minimum_contracts: {
        "material-pack": MATERIAL_PACK_SCHEMA_VERSION,
        "learning-ir": "0.2.0",
        "dlc-manifest": MANIFEST_SCHEMA_VERSION,
      },
    },
    supported_languages: [
      {
        language: options.language,
        release_tier: "primary",
        language_profile_ref: `artifact://language-profiles/${options.language}/0.2.0`,
      },
    ],
    theory_profile: [
      {
        id: "construction-grammar",
        name: "Construction Grammar",
        role: "primary",
        operational_claims: [
          {
            claim_id: "construction-as-learning-unit",
            compiler_effect:
              "Activities are generated around form-meaning pair identifiers (frames) rather than isolated rules; each frame lowers to one drill stage.",
            test_ref: "test://compiler/golden",
          },
        ],
      },
    ],
    claims: [
      {
        claim_ref: `${dlcId}:claim/checkin_dialogue`,
        evidence_policy_ref: `${dlcId}:policy/retention_transfer`,
        evidence_policy_version: "0.1.0",
        display_name: "Dialog führen",
      },
      {
        claim_ref: `${dlcId}:claim/verb_valence_dative`,
        evidence_policy_ref: `${dlcId}:policy/retention_transfer`,
        evidence_policy_version: "0.1.0",
        display_name: "Verbvalenz beherrschen",
      },
      {
        claim_ref: `${dlcId}:claim/polite_request_construction`,
        evidence_policy_ref: `${dlcId}:policy/retention_transfer`,
        evidence_policy_version: "0.1.0",
        display_name: "Höfliche Konstruktion verwenden",
      },
    ],
    accepted_material_schemas: [MATERIAL_SCHEMA_URN],
    material_request_templates: [
      {
        id: "req.fresh-scenario",
        template_ref: `artifact://dlc/${dlcId}/requests/fresh-scenario`,
        trigger: "on_material_shortage",
      },
    ],
    missing_input_handling: "reject_session",
    degradation_policy: {
      allowed: true,
      on_provider_failure: "offline_fallback",
      on_capability_missing: "pause_session",
      offline_allowed: true,
    },
    evidence_policies: [
      {
        policy_ref: `${dlcId}:policy/retention_transfer`,
        version: "0.1.0",
        policy_artifact: `artifact://dlc/${dlcId}/policies/retention-transfer/0.1.0`,
      },
    ],
    output_ir: {
      schema_id: LEARNING_IR_SCHEMA_URN,
      version_range: ">=0.2.0 <0.3.0",
      kinds: ["pedagogical", "executable_session"],
    },
    passes: [
      {
        id: "material.parse",
        version: "0.1.0",
        stage: "material_parse",
        entrypoint: "llos.compiler.material_validate:run",
        input_kinds: ["material_pack"],
        output_kind: "validated_material",
        determinism: "deterministic",
        failure_policy: "fail_compilation",
      },
      {
        id: "pedagogical.plan",
        version: "0.1.0",
        stage: "theory",
        entrypoint: "llos.compiler.pedagogical_plan:run",
        input_kinds: ["validated_material"],
        output_kind: "pedagogical_ir",
        determinism: "deterministic",
        failure_policy: "fail_compilation",
      },
      {
        id: "executable.lower",
        version: "0.1.0",
        stage: "activity_codegen",
        entrypoint: "llos.compiler.executable_lower:run",
        input_kinds: ["pedagogical_ir"],
        output_kind: "executable_session_ir",
        determinism: "deterministic",
        failure_policy: "fail_compilation",
      },
    ],
    capability_requirements: [],
    permissions: ["material.read", "artifact.read", "artifact.write_scoped"],
    budgets: {
      compile_timeout_ms: 30000,
      max_provider_calls: 0,
      max_cost_usd: 0,
      max_memory_mb: 256,
      max_output_bytes: 5000000,
    },
    quality_gates: [
      {
        id: "ir.schema.valid",
        stage: "compile",
        severity: "error",
        validator_ref: "validator://learning-ir/0.2.0",
      },
    ],
    package: {
      artifact_uri: `artifact://dlc/${dlcId}/${options.version}`,
      media_type: "application/zip",
      sha256: "0".repeat(64),
      size_bytes: 1,
    },
    license: {
      spdx_id: "LicenseRef-All-Rights-Reserved",
      commercial_use: "unknown",
      notices: ["版权责任由上传者承担（product_spec §6.12）。"],
    },
  };
  return assertManifestValid(manifest);
}

export function assertManifestValid(manifest: unknown): DLCManifest {
  const result = validate("dlc-manifest", manifest);
  if (!result.valid) {
    throw new StudioError(
      "draft_schema_invalid",
      `草稿未能通过课程包完整性检查：\n${translateSchemaErrors("dlc-manifest", result.errors).join("\n")}`,
      result.errors,
    );
  }
  return manifest as DLCManifest;
}

export function assertPackSchema(pack: unknown): MaterialPack {
  return assertPackValid(pack);
}
