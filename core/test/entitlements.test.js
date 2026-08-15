const { test } = require("node:test");
const assert = require("node:assert");
const { InMemoryEntitlementStore } = require("../dist/index.js");

test("granted entitlement grants access to the resource", () => {
  const store = new InMemoryEntitlementStore();
  store.grant("acct.alice", "dlc.fsi-german@1.0.0", "2026-08-15T10:00:00Z");
  assert.ok(store.has("acct.alice", "dlc.fsi-german@1.0.0", "2026-08-15T12:00:00Z"));
  assert.ok(!store.has("acct.alice", "dlc.other@1.0.0", "2026-08-15T12:00:00Z"));
  assert.ok(!store.has("acct.bob", "dlc.fsi-german@1.0.0", "2026-08-15T12:00:00Z"));
});

test("expired entitlement no longer grants access", () => {
  const store = new InMemoryEntitlementStore();
  store.grant("acct.alice", "dlc.fsi-german@1.0.0", "2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z");
  assert.ok(store.has("acct.alice", "dlc.fsi-german@1.0.0", "2026-08-05T00:00:00Z"));
  assert.ok(!store.has("acct.alice", "dlc.fsi-german@1.0.0", "2026-08-11T00:00:00Z"));
});

test("revoking an entitlement removes access", () => {
  const store = new InMemoryEntitlementStore();
  store.grant("acct.alice", "dlc.fsi-german@1.0.0", "2026-08-15T10:00:00Z");
  assert.ok(store.revoke("acct.alice", "dlc.fsi-german@1.0.0"));
  assert.ok(!store.has("acct.alice", "dlc.fsi-german@1.0.0", "2026-08-15T12:00:00Z"));
});
