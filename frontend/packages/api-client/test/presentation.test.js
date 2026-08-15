const { test } = require("node:test");
const assert = require("node:assert");
const { describeState, ALL_STATE_KINDS } = require("../dist/index.js");

const STATES = [
  { status: "ready", data: { x: 1 } },
  { status: "empty" },
  { status: "loading" },
  { status: "permission_denied", required_capability: "create_class", message: "m" },
  { status: "offline", cached: null },
  { status: "offline", cached: { x: 1 } },
  { status: "error_recoverable", error: { code: "network_timeout", message: "m" } },
  { status: "error_unrecoverable", error: { code: "unknown", message: "m" } },
];

test("describeState maps all 7 statuses without throwing", () => {
  for (const s of STATES) {
    const p = describeState(s);
    assert.ok(p.kind && p.tone && p.aria_label);
  }
});

test("only recoverable error is retryable", () => {
  const rec = describeState({ status: "error_recoverable", error: { code: "network_timeout", message: "m" } });
  const unrec = describeState({ status: "error_unrecoverable", error: { code: "unknown", message: "m" } });
  assert.equal(rec.can_retry, true);
  assert.equal(unrec.can_retry, false);
});

test("offline has_data only when a cached snapshot exists (§9)", () => {
  assert.equal(describeState({ status: "offline", cached: { a: 1 } }).has_data, true);
  assert.equal(describeState({ status: "offline", cached: null }).has_data, false);
});

test("ready has data; empty/loading/permission/error do not", () => {
  assert.equal(describeState({ status: "ready", data: 1 }).has_data, true);
  for (const s of [{ status: "empty" }, { status: "loading" }, { status: "permission_denied", required_capability: "learn", message: "m" }]) {
    assert.equal(describeState(s).has_data, false);
  }
});

test("ALL_STATE_KINDS lists exactly the 7 required states", () => {
  assert.deepEqual([...ALL_STATE_KINDS].sort(), [
    "empty",
    "error_recoverable",
    "error_unrecoverable",
    "loading",
    "offline",
    "permission_denied",
    "ready",
  ]);
});
