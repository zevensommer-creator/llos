"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { contentHash } = require("../dist/index.js");
const { assertValid } = require("@llos/contracts");

const ROOT = path.resolve(__dirname, "..", "..");
const PACK_PATH = path.join(ROOT, "materials", "reference", "de-hotel-checkin.json");
const MANIFEST_PATH = path.join(ROOT, "dlc_reference", "dlc.de.fsi-construction.json");
const TEMPLATE_PATH = path.join(ROOT, "dlc_reference", "templates", "feedback-generic.json");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadFixtures() {
  return {
    materialPack: loadJson(PACK_PATH),
    manifest: loadJson(MANIFEST_PATH),
    templateContent: fs.readFileSync(TEMPLATE_PATH, "utf8"),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const FIXED_CLOCK = () => "2026-08-16T00:00:00Z";

function makeSnapshot(pack, overrides = {}) {
  const hash = contentHash(pack);
  const snapshot = {
    schema_version: "0.2.1",
    snapshot_id: "snap.reference.de-hotel-checkin.001",
    source: "stored",
    material_ref: {
      uri: "artifact://materials/material.de.hotel-checkin/0.1.0",
      sha256: hash,
      media_type: "application/json",
      schema_id: "material-pack",
      schema_version: "0.2.1",
    },
    content_sha256: hash,
    schema_validation: {
      status: "valid",
      schema_id: "material-pack",
      schema_version: "0.2.1",
      validated_at: "2026-08-16T00:00:00Z",
    },
    quality_checks: [{ check_id: "reference.pack.checks", status: "passed" }],
    created_at: "2026-08-16T00:00:00Z",
    lifecycle: "published",
    ...overrides,
  };
  assertValid("material-snapshot", snapshot);
  return snapshot;
}

function fileTemplateResolver(templateContent) {
  return (uri) =>
    uri.endsWith("templates/feedback-generic") ? { content: templateContent } : undefined;
}

function baseOptions(templateContent, overrides = {}) {
  return {
    clock: FIXED_CLOCK,
    seed: 0,
    templateResolver: fileTemplateResolver(templateContent),
    ...overrides,
  };
}

module.exports = {
  loadJson,
  loadFixtures,
  clone,
  makeSnapshot,
  baseOptions,
  FIXED_CLOCK,
};
