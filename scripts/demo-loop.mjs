// P2 acceptance: verify the full closed learning loop from the command line.
// material pack + reference DLC -> compile -> execute (mock learner) ->
// append-only event stream -> projections -> mastery decisions -> FSRS schedule.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCompiler, contentHash } from "@llos/compiler";
import {
  SessionExecutor,
  InMemoryEventStore,
  projectLearnerState,
  projectLearningCurve,
  rankWeakSpots,
  projectAdaptiveDifficulty,
  decideMastery,
  toMasteryDecisionEvent,
  scheduleFsrsReview,
} from "@llos/core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const materialPack = JSON.parse(read("materials/reference/de-hotel-checkin.json"));
const manifest = JSON.parse(read("dlc_reference/dlc.de.fsi-construction.json"));
const templateContent = read("dlc_reference/templates/feedback-generic.json");

const SHA = contentHash(materialPack);
const snapshot = {
  schema_version: "0.2.1",
  snapshot_id: "snap.reference.de-hotel-checkin.001",
  source: "stored",
  material_ref: {
    uri: `artifact://materials/${materialPack.id}/${materialPack.version}`,
    sha256: SHA,
    media_type: "application/json",
    schema_id: "material-pack",
    schema_version: "0.2.1",
  },
  content_sha256: SHA,
  schema_validation: {
    status: "valid",
    schema_id: "material-pack",
    schema_version: "0.2.1",
  },
  quality_checks: { status: "passed", checks: [] },
  created_at: "2026-08-16T00:00:00Z",
  lifecycle: "active",
};

const { executable } = runCompiler(
  { manifest, snapshot, materialPack },
  {
    clock: () => "2026-08-16T00:00:00Z",
    seed: 7,
    templateResolver: (uri) =>
      uri.endsWith("feedback-generic") ? { content: templateContent } : undefined,
  },
);
console.log(`[compile] executable IR ready: ${executable.program.steps.length} steps, entry ${executable.program.entry_step_id}`);

const store = new InMemoryEventStore();
const learnerRef = "learner.demo";
const claims = executable.claims.map((c) => c.claim_ref);
const gate = { ref: claims[0] && executable.claims[0].evidence_policy_ref, version: executable.claims[0].evidence_policy_version, minimum_measurement_confidence: 0.8 };

function composition(sessionRef) {
  return {
    core_version: "0.2.0",
    dlc_ref: { id: manifest.dlc_id, version: manifest.version, sha256: contentHash(manifest) },
    material_snapshot_ref: { id: snapshot.snapshot_id, version: "1.0.0", sha256: SHA },
    learning_ir_ref: { id: executable.ir_id, version: "0.2.0", sha256: contentHash(executable) },
  };
}

function runSession(sessionRef, dayIso, outcomes) {
  const counter = { present: 0 };
  const executor = new SessionExecutor(executable, {
    learner_ref: learnerRef,
    session_ref: sessionRef,
    composition: composition(sessionRef),
  }, {
    append: (e) => store.append(e),
    clock: () => dayIso,
    evaluators: {
      "eval.typed_answer": () => {
        const outcome = outcomes[counter.present++ % outcomes.length];
        return { result_kind: "binary", outcome, measurement_confidence: 0.92 };
      },
    },
    fsrsScheduler: (claimRef) =>
      scheduleFsrsReview(
        store
          .events()
          .filter((e) => e.event_type === "observation.recorded" && e.claim_ref === claimRef)
          .map((e) => ({
            occurred_at: e.occurred_at,
            outcome: e.observation.outcome,
            measurement_confidence: e.observation.measurement_confidence,
          })),
        dayIso,
      ),
  });
  let state = executor.start();
  while (state.status === "awaiting_input") {
    state = executor.advance({ payload_ref: `artifact://responses/${sessionRef}/${state.step_id}`, payload_sha256: SHA });
  }
  return state;
}

const first = runSession("session.day1", "2026-08-16T08:00:00Z", ["success"]);
console.log(`[execute] day 1 session: ${first.status}${first.outcome ? `/${first.outcome}` : ""} -> ${store.events().length} events`);

const second = runSession("session.day2", "2026-08-17T09:00:00Z", ["success"]);
console.log(`[execute] day 2 retention session: ${second.status}${second.outcome ? `/${second.outcome}` : ""} -> ${store.events().length} events`);

const events = store.events();
const policy = {
  policy_ref: executable.claims[0].evidence_policy_ref,
  version: executable.claims[0].evidence_policy_version,
  gates: { minimum_measurement_confidence: 0.8 },
  session_requirements: {
    minimum_distinct_sessions: 2,
    minimum_independent_successes: 2,
    minimum_delayed_successes: 1,
    minimum_delay: "PT24H",
  },
  requires_transfer: false,
  requires_automatization: false,
  conflict_rules: {
    high_confidence_failure_threshold: 0.9,
    high_confidence_failures_before_lapse: 2,
    lapse_requires_distinct_sessions: true,
  },
  abstention_handling: "count_as_insufficient",
};

console.log("\n[mastery] decisions per claim:");
const decisions = claims.map((claimRef, i) => {
  const projection = projectLearnerState(events, learnerRef, claimRef, {
    ref: policy.policy_ref,
    version: policy.version,
    minimum_measurement_confidence: 0.8,
  });
  const decision = decideMastery({ events, projection, policy, now: "2026-08-17T10:00:00Z" });
  store.append(
    toMasteryDecisionEvent(decision, {
      learner_ref: learnerRef,
      session_ref: "session.day2",
      composition: composition("session.day2"),
    }, i + 1),
  );
  console.log(`  ${claimRef.padEnd(52)} ${decision.status.padEnd(12)} [${decision.reason_codes.join(", ")}]`);
  return { claim_ref: claimRef, status: decision.status };
});

console.log("\n[weak spots] ranked review targets:");
for (const spot of rankWeakSpots(
  events,
  learnerRef,
  claims.map((claim_ref) => ({ claim_ref, gate })),
  "2026-08-17T10:00:00Z",
)) {
  console.log(`  #${spot.rank} ${spot.claim_ref.padEnd(52)} score=${String(spot.priority_score).padEnd(4)} [${spot.reasons.join(", ")}]`);
}

console.log("\n[curve] claim 1 daily success rate:");
const curve = projectLearningCurve(events, learnerRef, claims[0], 0.8);
for (const p of curve.points) {
  console.log(`  ${p.date}  obs=${p.observations} valid=${p.valid} success_rate=${p.success_rate}`);
}

const hint = projectAdaptiveDifficulty(decisions);
console.log(`\n[difficulty] tier=${hint.tier} [${hint.reasons.join(", ")}]`);

const review = scheduleFsrsReview(
  events
    .filter((e) => e.event_type === "observation.recorded" && e.claim_ref === claims[0])
    .map((e) => ({ occurred_at: e.occurred_at, outcome: e.observation.outcome, measurement_confidence: e.observation.measurement_confidence })),
  "2026-08-17T10:00:00Z",
);
console.log(`[fsrs] next review for claim 1: due ${review.due_at} (${review.interval})`);

console.log(`\n[done] event stream sealed at ${store.events().length} events — loop closed.`);
