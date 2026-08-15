"use strict";

// T-024 (P4a): accounts — credential registration, login sessions, the
// manage_users authorization gate, and the create_class invitation chain.
// Sources: product_spec §2.1-§2.4 (capabilities, verification, invitation
// chain, server-side re-authorization).

const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryAccountStore,
  InMemoryCredentialStore,
  InMemorySessionStore,
  InMemoryInvitationStore,
  CapabilityAdminError,
  InvitationError,
  grantCapabilityAs,
  revokeCapabilityAs,
  setVerificationAs,
  ADMIN_CAPABILITY,
  BASE_CAPABILITIES,
} = require("../dist/index.js");

test("registration stores a scrypt credential, never the plaintext password", () => {
  const accounts = new InMemoryAccountStore();
  const credentials = new InMemoryCredentialStore();
  const account = accounts.createAccount("acct.dora");
  credentials.set("acct.dora", "kaffee-mit-milch-42");

  assert.equal(account.verification, "unverified");
  for (const c of BASE_CAPABILITIES) assert.ok(account.capabilities.has(c));
  assert.ok(credentials.has("acct.dora"));
  assert.ok(credentials.verify("acct.dora", "kaffee-mit-milch-42"));
  assert.ok(!credentials.verify("acct.dora", "wrong-password"));
  assert.ok(!credentials.verify("acct.nobody", "kaffee-mit-milch-42"));

  credentials.set("acct.dora", "new-password-7");
  assert.ok(!credentials.verify("acct.dora", "kaffee-mit-milch-42"));
  assert.ok(credentials.verify("acct.dora", "new-password-7"));
});

test("empty passwords are rejected at the boundary", () => {
  const credentials = new InMemoryCredentialStore();
  assert.throws(() => credentials.set("acct.eve", ""), /non-empty/);
  assert.throws(() => credentials.set("acct.eve", undefined), /non-empty/);
});

test("login issues an opaque session that expires and revokes", () => {
  const sessions = new InMemorySessionStore();
  const issued = sessions.issue("acct.frank", {
    issuedAt: "2026-08-16T10:00:00.000Z",
    ttlSeconds: 3600,
  });

  assert.match(issued.token, /^[0-9a-f]{64}$/);
  assert.equal(issued.session.account_id, "acct.frank");
  assert.equal(issued.session.expires_at, "2026-08-16T11:00:00.000Z");

  const valid = sessions.validate(issued.token, "2026-08-16T10:59:59.000Z");
  assert.equal(valid.account_id, "acct.frank");
  assert.equal(sessions.validate(issued.token, "2026-08-16T11:00:00.000Z"), null);
  assert.equal(sessions.validate("forged-token", "2026-08-16T10:00:00.000Z"), null);

  assert.equal(sessions.revoke(issued.token), true);
  assert.equal(sessions.validate(issued.token, "2026-08-16T10:30:00.000Z"), null);
  assert.equal(sessions.revoke(issued.token), false);
});

test("revokeAllFor drops every session of one account and no others", () => {
  const sessions = new InMemorySessionStore();
  const a = sessions.issue("acct.greta", { issuedAt: "2026-08-16T10:00:00.000Z", ttlSeconds: 600 });
  sessions.issue("acct.greta", { issuedAt: "2026-08-16T10:01:00.000Z", ttlSeconds: 600 });
  const b = sessions.issue("acct.hans", { issuedAt: "2026-08-16T10:02:00.000Z", ttlSeconds: 600 });

  assert.equal(sessions.revokeAllFor("acct.greta"), 2);
  assert.equal(sessions.validate(a.token, "2026-08-16T10:03:00.000Z"), null);
  assert.notEqual(sessions.validate(b.token, "2026-08-16T10:03:00.000Z"), null);
  assert.equal(sessions.size(), 1);
});

test("capability admin operations are gated on manage_users", () => {
  const accounts = new InMemoryAccountStore();
  accounts.createAccount("acct.pleb");
  accounts.createAccount("acct.target");
  const admin = accounts.createAccount("acct.root");
  accounts.grant("acct.root", ADMIN_CAPABILITY);

  assert.throws(
    () => grantCapabilityAs(accounts, "acct.pleb", "acct.target", "create_class"),
    (err) => err instanceof CapabilityAdminError && err.code === "capability_admin_denied",
  );
  assert.ok(!accounts.hasCapability("acct.target", "create_class"));

  grantCapabilityAs(accounts, "acct.root", "acct.target", "create_class");
  assert.ok(accounts.hasCapability("acct.target", "create_class"));

  revokeCapabilityAs(accounts, "acct.root", "acct.target", "create_class");
  assert.ok(!accounts.hasCapability("acct.target", "create_class"));

  assert.throws(
    () => setVerificationAs(accounts, "acct.pleb", "acct.target", "teacher_verified"),
    CapabilityAdminError,
  );
  setVerificationAs(accounts, "acct.root", "acct.target", "teacher_verified");
  assert.equal(accounts.get("acct.target").verification, "teacher_verified");
});

test("only capability holders can issue invitations for it", () => {
  const accounts = new InMemoryAccountStore();
  const invitations = new InMemoryInvitationStore();
  const plain = accounts.createAccount("acct.noholder");

  assert.throws(
    () => invitations.issue(plain, { issuedAt: "2026-08-16T10:00:00.000Z" }),
    (err) => err instanceof InvitationError && err.code === "issuer_missing_capability",
  );
});

test("redeeming an invitation grants the capability (single use default)", () => {
  const accounts = new InMemoryAccountStore();
  const invitations = new InMemoryInvitationStore();
  accounts.createAccount("acct.ivo");
  accounts.grant("acct.ivo", "create_class");
  accounts.createAccount("acct.jana");
  accounts.createAccount("acct.karl");

  const record = invitations.issue(accounts.get("acct.ivo"), {
    issuedAt: "2026-08-16T10:00:00.000Z",
  });
  assert.match(record.code, /^llos-inv-/);
  assert.equal(record.capability, "create_class");
  assert.equal(record.max_uses, 1);

  const redeemed = invitations.redeem(accounts, record.code, "acct.jana");
  assert.equal(redeemed.uses, 1);
  assert.ok(accounts.hasCapability("acct.jana", "create_class"));

  assert.throws(
    () => invitations.redeem(accounts, record.code, "acct.karl"),
    (err) => err instanceof InvitationError && err.code === "invitation_exhausted",
  );
  assert.ok(!accounts.hasCapability("acct.karl", "create_class"));
});

test("the invitation chain propagates: a redeemer can issue new invitations", () => {
  const accounts = new InMemoryAccountStore();
  const invitations = new InMemoryInvitationStore();
  accounts.createAccount("acct.ivo");
  accounts.grant("acct.ivo", "create_class");
  accounts.createAccount("acct.jana");
  accounts.createAccount("acct.karl");

  const first = invitations.issue(accounts.get("acct.ivo"), {
    issuedAt: "2026-08-16T10:00:00.000Z",
    codeGenerator: () => "first",
  });
  invitations.redeem(accounts, first.code, "acct.jana");

  const second = invitations.issue(accounts.get("acct.jana"), {
    issuedAt: "2026-08-16T10:05:00.000Z",
    codeGenerator: () => "second",
  });
  invitations.redeem(accounts, second.code, "acct.karl");

  assert.ok(accounts.hasCapability("acct.karl", "create_class"));
});

test("revoked and unknown invitations are rejected; only the issuer can revoke", () => {
  const accounts = new InMemoryAccountStore();
  const invitations = new InMemoryInvitationStore();
  accounts.createAccount("acct.ivo");
  accounts.grant("acct.ivo", "create_class");
  accounts.createAccount("acct.jana");
  accounts.createAccount("acct.stranger");

  const record = invitations.issue(accounts.get("acct.ivo"), {
    issuedAt: "2026-08-16T10:00:00.000Z",
    maxUses: 3,
    codeGenerator: () => "multi",
  });

  invitations.redeem(accounts, record.code, "acct.jana");
  invitations.revoke(record.code, "acct.ivo");

  assert.throws(
    () => invitations.redeem(accounts, record.code, "acct.stranger"),
    (err) => err instanceof InvitationError && err.code === "invitation_revoked",
  );
  assert.ok(!accounts.hasCapability("acct.stranger", "create_class"));

  assert.throws(
    () => invitations.revoke(record.code, "acct.jana"),
    (err) => err instanceof InvitationError && err.code === "not_invitation_issuer",
  );
  assert.throws(
    () => invitations.redeem(accounts, "llos-inv-nope", "acct.jana"),
    (err) => err instanceof InvitationError && err.code === "unknown_invitation",
  );
});

test("multi-use invitations count down and stay open until exhausted", () => {
  const accounts = new InMemoryAccountStore();
  const invitations = new InMemoryInvitationStore();
  accounts.createAccount("acct.ivo");
  accounts.grant("acct.ivo", "create_class");
  ["acct.a", "acct.b", "acct.c"].forEach((id) => accounts.createAccount(id));

  const record = invitations.issue(accounts.get("acct.ivo"), {
    issuedAt: "2026-08-16T10:00:00.000Z",
    maxUses: 2,
    codeGenerator: () => "pair",
  });

  invitations.redeem(accounts, record.code, "acct.a");
  const last = invitations.redeem(accounts, record.code, "acct.b");
  assert.equal(last.uses, 2);

  assert.throws(
    () => invitations.redeem(accounts, record.code, "acct.c"),
    InvitationError,
  );
  assert.ok(accounts.hasCapability("acct.a", "create_class"));
  assert.ok(accounts.hasCapability("acct.b", "create_class"));
  assert.ok(!accounts.hasCapability("acct.c", "create_class"));
});
