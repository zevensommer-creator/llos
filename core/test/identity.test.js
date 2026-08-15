const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryAccountStore,
  BASE_CAPABILITIES,
  CREATOR_CAPABILITIES,
  creatorCapabilitiesUnlocked,
} = require("../dist/index.js");

test("a fresh account gets base capabilities only", () => {
  const store = new InMemoryAccountStore();
  const account = store.createAccount("acct.alice");
  assert.equal(account.verification, "unverified");
  for (const c of BASE_CAPABILITIES) assert.ok(account.capabilities.has(c));
  for (const c of CREATOR_CAPABILITIES) assert.ok(!account.capabilities.has(c));
});

test("creator capabilities require teacher or developer verification", () => {
  const store = new InMemoryAccountStore();
  store.createAccount("acct.bob", "unverified");
  assert.ok(!store.hasCapability("acct.bob", "publish_dlc"));

  store.setVerification("acct.bob", "teacher_verified");
  assert.ok(store.hasCapability("acct.bob", "publish_dlc"));
  assert.ok(store.hasCapability("acct.bob", "upload_material"));

  store.setVerification("acct.bob", "unverified");
  assert.ok(!store.hasCapability("acct.bob", "publish_dlc"));
});

test("capability points can be granted and revoked individually", () => {
  const store = new InMemoryAccountStore();
  store.createAccount("acct.carol");
  store.grant("acct.carol", "create_class");
  assert.ok(store.hasCapability("acct.carol", "create_class"));
  store.revoke("acct.carol", "create_class");
  assert.ok(!store.hasCapability("acct.carol", "create_class"));
  assert.ok(store.hasCapability("acct.carol", "learn"));
});

test("developer_verified also unlocks creator capabilities", () => {
  assert.ok(creatorCapabilitiesUnlocked("developer_verified"));
  assert.ok(creatorCapabilitiesUnlocked("teacher_verified"));
  assert.ok(!creatorCapabilitiesUnlocked("unverified"));
});
