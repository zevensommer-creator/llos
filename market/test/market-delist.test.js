"use strict";

// T-031 (P6b): market delist — stop new acquisitions, existing owners keep
// access (product_spec §6.9). Source: product_spec §6.9, BUILD_PLAN P6.

const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
} = require("@llos/core/dist/index.js");
const { MarketService, MarketError, dlcResourceRef } = require("../dist/index.js");

function setup() {
  const accounts = new InMemoryAccountStore();
  const entitlements = new InMemoryEntitlementStore();
  let tick = 0;
  const clock = () => `2026-08-16T10:${String(tick++).padStart(2, "0")}:00.000Z`;
  const market = new MarketService({ accountStore: accounts, entitlementStore: entitlements, clock });
  accounts.createAccount("acct.edu", "teacher_verified");
  accounts.createAccount("acct.owner");
  accounts.createAccount("acct.late");
  const listing = market.publish("acct.edu", {
    dlc_ref: { dlc_id: "de.cafe", version: "0.1.0", sha256: "a".repeat(64) },
    title: "Café Deutsch",
    summary: "Café-Situationen",
    language: "de",
    pricing: { model: "free" },
  });
  return { accounts, entitlements, market, listing };
}

test("delist is publisher-only and idempotent-rejecting", () => {
  const { market, listing } = setup();
  assert.throws(
    () => market.delist("acct.owner", listing.listing_id),
    (e) => e instanceof MarketError && e.code === "not_listing_publisher",
  );
  const delisted = market.delist("acct.edu", listing.listing_id);
  assert.ok(delisted.delisted_at, "delisted_at recorded");
  assert.equal(delisted.listing_id, listing.listing_id);
  assert.throws(
    () => market.delist("acct.edu", listing.listing_id),
    (e) => e instanceof MarketError && e.code === "listing_already_delisted",
  );
});

test("delist stops new acquisitions but existing owners keep access", () => {
  const { market, listing, entitlements } = setup();
  market.acquireFree("acct.owner", listing.listing_id);

  market.delist("acct.edu", listing.listing_id);

  assert.throws(
    () => market.acquireFree("acct.late", listing.listing_id),
    (e) => e instanceof MarketError && e.code === "listing_delisted",
  );
  const again = market.acquireFree("acct.owner", listing.listing_id);
  assert.equal(again.already_acquired, true, "owner re-visit stays idempotent");
  const resource = dlcResourceRef(listing.dlc_ref.dlc_id);
  assert.ok(entitlements.has("acct.owner", resource, "2026-08-16T23:00:00.000Z"));
  assert.equal(entitlements.has("acct.late", resource, "2026-08-16T23:00:00.000Z"), false);
});

test("delisted listings disappear from the catalog but stay viewable", () => {
  const { market, listing } = setup();
  assert.equal(market.query().length, 1);
  market.delist("acct.edu", listing.listing_id);
  assert.equal(market.query().length, 0, "catalog hides delisted listings");
  const view = market.view(listing.listing_id);
  assert.ok(view, "view() still resolves for owner-facing pages");
  assert.ok(view.listing.delisted_at);
});

test("delisted listings no longer receive version updates", () => {
  const { market, listing } = setup();
  market.delist("acct.edu", listing.listing_id);
  assert.throws(
    () =>
      market.updateVersion("acct.edu", listing.listing_id, {
        dlc_id: listing.dlc_ref.dlc_id,
        version: "0.2.0",
        sha256: "b".repeat(64),
      }),
    (e) => e instanceof MarketError && e.code === "listing_delisted",
  );
});
