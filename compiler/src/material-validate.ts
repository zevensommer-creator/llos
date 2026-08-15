import { validate } from "@llos/contracts";
import type { DLCManifest, MaterialPack, MaterialSnapshot } from "@llos/contracts";
import { contentHash } from "./hash.js";
import { CompilationError } from "./errors.js";

export type MaterialArtifactRef = MaterialSnapshot["material_ref"];

export interface ValidatedMaterial {
  pack: MaterialPack;
  packHash: string;
  language: string;
  sourceRef: MaterialArtifactRef;
}

export function runMaterialValidate(
  pack: MaterialPack,
  snapshot: MaterialSnapshot,
  manifest: DLCManifest,
  passId: string,
): ValidatedMaterial {
  const packHash = contentHash(pack);
  if (packHash !== snapshot.content_sha256) {
    throw new CompilationError(
      "material_hash_mismatch",
      passId,
      "material pack content hash does not match snapshot.content_sha256",
      [`computed=${packHash}`, `snapshot=${snapshot.content_sha256}`],
    );
  }

  const schemaResult = validate("material-pack", pack);
  if (!schemaResult.valid) {
    throw new CompilationError(
      "material_schema_invalid",
      passId,
      "material pack failed schema validation",
      schemaResult.errors,
    );
  }

  const packSchemaUrn = `urn:language-learning-platform:schema:material-pack:${pack.schema_version}`;
  if (!manifest.accepted_material_schemas.includes(packSchemaUrn)) {
    throw new CompilationError(
      "material_version_rejected",
      passId,
      "material pack schema version is not accepted by this DLC",
      [`pack=${packSchemaUrn}`, `accepted=${manifest.accepted_material_schemas.join(", ")}`],
    );
  }

  const supported = new Set(manifest.supported_languages.map((l) => l.language));
  const shared = pack.languages.filter((l) => supported.has(l));
  if (shared.length === 0) {
    throw new CompilationError(
      "language_unsupported",
      passId,
      "material pack language is not supported by this DLC",
      [`pack=${pack.languages.join(", ")}`, `dlc=${[...supported].join(", ")}`],
    );
  }

  assertReferencesIntact(pack, passId);

  return { pack, packHash, language: shared[0], sourceRef: snapshot.material_ref };
}

function assertReferencesIntact(pack: MaterialPack, passId: string): void {
  const assetIds = new Set<string>(pack.assets.map((a) => a.id));
  const frameIds = new Set<string>(pack.semantic_frames.map((f) => f.id));
  const lexicalIds = new Set<string>(
    pack.semantic_frames.flatMap((f) => f.lexical_candidates?.map((c) => c.id) ?? []),
  );

  for (const frame of pack.semantic_frames) {
    for (const ref of frame.asset_refs ?? []) {
      if (!assetIds.has(ref)) {
        throw new CompilationError(
          "material_reference_broken",
          passId,
          `frame ${frame.id} references unknown asset ${ref}`,
        );
      }
    }
    for (const fact of frame.facts) {
      if (fact.object.kind === "ref" && !lexicalIds.has(fact.object.ref)) {
        throw new CompilationError(
          "material_reference_broken",
          passId,
          `frame ${frame.id} fact references unknown lexical candidate ${fact.object.ref}`,
        );
      }
    }
  }

  const targetIds = new Set([...assetIds, ...frameIds, ...lexicalIds]);
  for (const ann of pack.annotations ?? []) {
    if (!targetIds.has(ann.target_ref)) {
      throw new CompilationError(
        "material_reference_broken",
        passId,
        `annotation ${ann.id} targets unknown object ${ann.target_ref}`,
      );
    }
  }
}
