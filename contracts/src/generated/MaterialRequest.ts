/* eslint-disable */
// AUTO-GENERATED from docs/contracts/material-request.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

export type Identifier = string;
export type LanguageTag = string;
export type TypedValue =
  | {
      kind: 'string';
      string: string;
    }
  | {
      kind: 'int';
      int: number;
    }
  | {
      kind: 'float';
      float: number;
    }
  | {
      kind: 'bool';
      bool: boolean;
    };
export type ClaimRef = string;
export type SemVer = string;
export type Sha256 = string;

/**
 * Typed request declared by a DLC (based on learning goals, learner projection and user instructions) for the material layer to resolve from stored packs, uploaded assets, or LLM generation. Failure to resolve does NOT silently degrade to chat; the learning session is paused or rejected (spec §2.6, §2.7).
 */
export interface MaterialRequest {
  schema_version: '0.2.0';
  request_id: Identifier;
  dlc_ref: Identifier;
  session_ref?: Identifier;
  language: LanguageTag;
  genre?: string;
  scenario_tags?: string[];
  /**
   * @minItems 1
   */
  modality: ['text' | 'audio' | 'image' | 'dialogue', ...('text' | 'audio' | 'image' | 'dialogue')[]];
  constraints: {
    length?: {
      min_units?: number;
      max_units?: number;
      unit?: 'word' | 'sentence' | 'paragraph' | 'turn';
    };
    difficulty_hint?: TypedValue;
    must_include_refs?: Identifier[];
    /**
     * Structures or topics that must not appear (e.g. not-yet-learned structures).
     */
    must_avoid_refs?: Identifier[];
    topic_tags?: string[];
    safety: {
      content_policy_ref: Identifier;
      minimum_age?: number;
    };
  };
  /**
   * Claims the resolved material should provide evidence opportunities for.
   *
   * @minItems 1
   */
  claims_to_cover: [ClaimRef, ...ClaimRef[]];
  randomness?: 'none' | 'allowed' | 'required';
  /**
   * @minItems 1
   */
  allowed_sources: [
    'stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived',
    ...('stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived')[]
  ];
  /**
   * Existing pack/frame IDs that may be used as variation seeds.
   */
  allow_variation_of?: Identifier[];
  persistence: 'ephemeral_only' | 'save_allowed';
  /**
   * Optional natural-language instruction from the learner; recorded in the MaterialSnapshot provenance.
   */
  user_instruction?: string;
  extensions?: Extensions;
}
export interface Extensions {
  [k: string]: ExtensionEnvelope;
}
export interface ExtensionEnvelope {
  schema_id: Identifier;
  schema_version: SemVer;
  payload_ref: {
    uri: string;
    sha256: Sha256;
  };
}
