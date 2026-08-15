import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(pkgRoot, "..", "tests", "contracts", "fixtures");
const read = (dir) => JSON.parse(readFileSync(join(fixtures, dir, "valid_minimal.json"), "utf8"));
const write = (dir, file, data) =>
  writeFileSync(join(fixtures, dir, file), JSON.stringify(data, null, 2) + "\n");

const cases = [
  {
    dir: "material-request",
    file: "invalid_empty_sources.json",
    mutate: (d) => ({ ...d, allowed_sources: [] }),
  },
  {
    dir: "dlc-manifest",
    file: "invalid_silent_chat_degradation.json",
    mutate: (d) => ({ ...d, missing_input_handling: "degrade_to_chat" }),
  },
  {
    dir: "learning-ir",
    file: "invalid_evaluate_without_claims.json",
    mutate: (d) => {
      const step = d.program.steps.find((s) => s.primitive === "evaluate");
      delete step.claim_refs;
      return d;
    },
  },
  {
    dir: "learning-claim",
    file: "invalid_unnamespaced_claim_ref.json",
    mutate: (d) => ({ ...d, claim_ref: "vowel_quantity" }),
  },
  {
    dir: "learner-state-projection",
    file: "invalid_mastery_wording_state.json",
    mutate: (d) => ({ ...d, evidence_state: "mastered" }),
  },
  {
    dir: "provider-descriptor",
    file: "invalid_brand_in_capability_id.json",
    mutate: (d) => {
      d.capabilities[0].capability_id = "gpt-4o.feedback";
      return d;
    },
  },
  {
    dir: "pronunciation-assessment",
    file: "invalid_issue_without_evidence.json",
    mutate: (d) => {
      d.issues[0].evidence_refs = [];
      return d;
    },
  },
  {
    dir: "agent-work",
    file: "invalid_completed_without_artifacts.json",
    mutate: (d) => {
      if (d.record_type !== "work_result") throw new Error("example is not a WorkResult");
      d.artifacts = [];
      return d;
    },
  },
];

for (const c of cases) {
  write(c.dir, c.file, c.mutate(read(c.dir)));
  console.log(`wrote ${c.dir}/${c.file}`);
}
