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

test("grant records the optional source channel", () => {
  const store = new InMemoryEntitlementStore();
  const personal = store.grant("acct.alice", "dlc/a", "2026-08-15T10:00:00Z");
  assert.equal(personal.source, undefined);
  const classGrant = store.grant(
    "acct.alice",
    "dlc/b",
    "2026-08-15T10:00:00Z",
    undefined,
    "class:class.1",
  );
  assert.equal(classGrant.source, "class:class.1");
  assert.equal(store.get("acct.alice", "dlc/b").source, "class:class.1");
});

test("revokeBySource removes only the matching channel of that account", () => {
  const store = new InMemoryEntitlementStore();
  store.grant("acct.alice", "dlc/personal", "2026-08-15T10:00:00Z");
  store.grant("acct.alice", "dlc/class-a", "2026-08-15T10:00:00Z", undefined, "class:class.a");
  store.grant("acct.alice", "dlc/class-b", "2026-08-15T10:00:00Z", undefined, "class:class.b");
  store.grant("acct.bob", "dlc/class-a", "2026-08-15T10:00:00Z", undefined, "class:class.a");

  assert.equal(store.entitlementsBySource("acct.alice", "class:class.a").length, 1);
  assert.equal(store.revokeBySource("acct.alice", "class:class.a"), 1);

  const at = "2026-08-15T12:00:00Z";
  assert.ok(!store.has("acct.alice", "dlc/class-a", at), "class-a grant revoked");
  assert.ok(store.has("acct.alice", "dlc/personal", at), "personal grant survives");
  assert.ok(store.has("acct.alice", "dlc/class-b", at), "other class grant survives");
  assert.ok(store.has("acct.bob", "dlc/class-a", at), "other accounts untouched");
  assert.equal(store.revokeBySource("acct.alice", "class:class.a"), 0, "idempotent");
});
