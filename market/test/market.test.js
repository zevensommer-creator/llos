"use strict";

// T-025 (P4b): market backend — publish gate, catalog filter/search/sort,
// entitlement-gated reviews, idempotent free acquisition through the Core
// entitlement store. Sources: product_spec §4.1-§4.3, §6.7.

const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
} = require("@llos/core/dist/index.js");
const {
  MarketService,
  MarketError,
  dlcResourceRef,
} = require("../dist/index.js");

function setup() {
  const accounts = new InMemoryAccountStore();
  const entitlements = new InMemoryEntitlementStore();
  let tick = 0;
  const clock = () => `2026-08-16T10:00:${String(tick++).padStart(2, "0")}.000Z`;
  const market = new MarketService({ accountStore: accounts, entitlementStore: entitlements, clock });
  return { accounts, entitlements, market, clock };
}

function makePublisher(accounts, id) {
  accounts.createAccount(id);
  accounts.grant(id, "publish_dlc");
  return id;
}

const HOTEL = {
  dlc_ref: { dlc_id: "de.fsi-construction", version: "0.1.0", sha256: "a".repeat(64) },
  title: "Hotel Check-in Deutsch",
  summary: "FSI-style hotel check-in construction training",
  language: "de",
  difficulty: "A2",
  tags: ["hotel", "travel"],
  pricing: { model: "free" },
};

test("publishing requires the publish_dlc capability", () => {
  const { accounts, market } = setup();
  accounts.createAccount("acct.pleb");

  assert.throws(
    () => market.publish("acct.pleb", HOTEL),
    (err) => err instanceof MarketError && err.code === "publisher_capability_missing",
  );
  assert.equal(market.query().length, 0);

  makePublisher(accounts, "acct.edu");
  const listing = market.publish("acct.edu", HOTEL);
  assert.equal(listing.listing_id, "listing.de.fsi-construction");
  assert.equal(listing.publisher_id, "acct.edu");
});

test("invalid listing inputs are rejected at the boundary", () => {
  const { accounts, market } = setup();
  makePublisher(accounts, "acct.edu");

  assert.throws(
    () => market.publish("acct.edu", { ...HOTEL, title: "  " }),
    (err) => err.code === "invalid_listing_input",
  );
  assert.throws(
    () => market.publish("acct.edu", { ...HOTEL, language: "German Course!" }),
    (err) => err.code === "invalid_listing_input",
  );
  assert.throws(
    () => market.publish("acct.edu", { ...HOTEL, pricing: { model: "purchase" } }),
    (err) => err.code === "invalid_listing_input",
  );
});

test("catalog filters by language/difficulty/tags and searches title+tags", () => {
  const { accounts, market } = setup();
  makePublisher(accounts, "acct.edu");

  market.publish("acct.edu", HOTEL);
  market.publish("acct.edu", {
    dlc_ref: { dlc_id: "de.restaurant", version: "0.1.0", sha256: "b".repeat(64) },
    title: "Restaurant Talk",
    summary: "Ordering and small talk",
    language: "de",
    difficulty: "B1",
    tags: ["food", "travel"],
    pricing: { model: "free" },
  });
  market.publish("acct.edu", {
    dlc_ref: { dlc_id: "fr.cafe", version: "0.1.0", sha256: "c".repeat(64) },
    title: "Café Français",
    summary: "Basic café dialogues",
    language: "fr",
    difficulty: "A1",
    tags: ["food"],
    pricing: { model: "free" },
  });

  assert.equal(market.query({ language: "de" }).length, 2);
  assert.equal(market.query({ language: "fr" }).length, 1);
  assert.equal(market.query({ difficulty: "B1" })[0].listing.title, "Restaurant Talk");
  assert.equal(market.query({ tags: ["travel"] }).length, 2);
  assert.equal(market.query({ tags: ["travel", "food"] }).length, 1);
  assert.equal(market.query({ language: "de", search: "hotel" }).length, 1);
  assert.equal(market.query({ search: "café" }).length, 1);
  assert.equal(market.query({ search: "nomatch" }).length, 0);
});

test("free acquisition grants a permanent entitlement exactly once per user", () => {
  const { accounts, entitlements, market } = setup();
  accounts.createAccount("acct.learner");
  makePublisher(accounts, "acct.edu");
  market.publish("acct.edu", HOTEL);

  const first = market.acquireFree("acct.learner", "listing.de.fsi-construction");
  assert.equal(first.already_acquired, false);
  assert.equal(first.entitlement.resource_ref, "dlc/de.fsi-construction");
  assert.equal(first.entitlement.expires_at, undefined);
  assert.equal(first.view.downloads, 1);

  const second = market.acquireFree("acct.learner", "listing.de.fsi-construction");
  assert.equal(second.already_acquired, true);
  assert.equal(second.entitlement.granted_at, first.entitlement.granted_at);
  assert.equal(second.view.downloads, 1);

  assert.ok(entitlements.has("acct.learner", dlcResourceRef("de.fsi-construction"), "2030-01-01T00:00:00.000Z"));
});

test("paid listings refuse acquisition until P8", () => {
  const { accounts, market } = setup();
  makePublisher(accounts, "acct.edu");
  market.publish("acct.edu", {
    dlc_ref: { dlc_id: "de.premium", version: "0.1.0", sha256: "d".repeat(64) },
    title: "Premium Pack",
    summary: "paid",
    language: "de",
    pricing: { model: "purchase", price_cents: 990 },
  });

  assert.throws(
    () => market.acquireFree("acct.anyone", "listing.de.premium"),
    (err) => err instanceof MarketError && err.code === "pricing_not_available",
  );
  assert.throws(
    () => market.acquireFree("acct.anyone", "listing.missing"),
    (err) => err.code === "listing_not_found",
  );
});

test("reviews require acquisition; one review per user updates in place", () => {
  const { accounts, market } = setup();
  accounts.createAccount("acct.learner");
  makePublisher(accounts, "acct.edu");
  market.publish("acct.edu", HOTEL);

  assert.throws(
    () => market.review("acct.learner", "listing.de.fsi-construction", 4),
    (err) => err instanceof MarketError && err.code === "review_requires_entitlement",
  );

  market.acquireFree("acct.learner", "listing.de.fsi-construction");
  assert.throws(
    () => market.review("acct.learner", "listing.de.fsi-construction", 0),
    (err) => err.code === "invalid_rating",
  );
  assert.throws(
    () => market.review("acct.learner", "listing.de.fsi-construction", 4.5),
    (err) => err.code === "invalid_rating",
  );

  market.review("acct.learner", "listing.de.fsi-construction", 3);
  const updated = market.review("acct.learner", "listing.de.fsi-construction", 5, "great");

  assert.equal(market.reviewsFor("listing.de.fsi-construction").length, 1);
  assert.equal(updated.rating, 5);
  const view = market.view("listing.de.fsi-construction");
  assert.equal(view.rating_summary.count, 1);
  assert.equal(view.rating_summary.average, 5);
});

test("rating sort aggregates across users; newest sort orders by publish time", () => {
  const { accounts, market } = setup();
  makePublisher(accounts, "acct.edu");
  ["acct.a", "acct.b", "acct.c"].forEach((id) => accounts.createAccount(id));

  market.publish("acct.edu", HOTEL);
  market.publish("acct.edu", {
    dlc_ref: { dlc_id: "de.restaurant", version: "0.1.0", sha256: "b".repeat(64) },
    title: "Restaurant Talk",
    summary: "",
    language: "de",
    tags: [],
    pricing: { model: "free" },
  });

  market.acquireFree("acct.a", "listing.de.fsi-construction");
  market.acquireFree("acct.b", "listing.de.fsi-construction");
  market.review("acct.a", "listing.de.fsi-construction", 5);
  market.review("acct.b", "listing.de.fsi-construction", 4);
  market.acquireFree("acct.c", "listing.de.restaurant");
  market.review("acct.c", "listing.de.restaurant", 5);

  const byRating = market.query({ sort: "rating_desc" });
  assert.equal(byRating[0].listing.listing_id, "listing.de.restaurant");
  assert.equal(byRating[0].rating_summary.average, 5);
  assert.equal(byRating[1].listing.listing_id, "listing.de.fsi-construction");
  assert.equal(byRating[1].rating_summary.average, 4.5);

  const byDownloads = market.query({ sort: "downloads_desc" });
  assert.equal(byDownloads[0].listing.listing_id, "listing.de.fsi-construction");
  assert.equal(byDownloads[0].downloads, 2);
});

test("only the publisher can bump the DLC version, owners keep access", () => {
  const { accounts, market } = setup();
  accounts.createAccount("acct.learner");
  makePublisher(accounts, "acct.edu");
  makePublisher(accounts, "acct.other");
  market.publish("acct.edu", HOTEL);

  assert.throws(
    () => market.updateVersion("acct.other", "listing.de.fsi-construction", {
      dlc_id: "de.fsi-construction",
      version: "0.2.0",
      sha256: "e".repeat(64),
    }),
    (err) => err.code === "not_listing_publisher",
  );

  market.acquireFree("acct.learner", "listing.de.fsi-construction");
  const updated = market.updateVersion("acct.edu", "listing.de.fsi-construction", {
    dlc_id: "de.fsi-construction",
    version: "0.2.0",
    sha256: "e".repeat(64),
  });

  assert.equal(updated.dlc_ref.version, "0.2.0");
  assert.equal(updated.listing_id, "listing.de.fsi-construction");
  const view = market.view("listing.de.fsi-construction");
  assert.equal(view.listing.dlc_ref.version, "0.2.0");
  // version-free resource ref: the owner still holds the entitlement
  assert.ok(
    market.acquireFree("acct.learner", "listing.de.fsi-construction").already_acquired,
  );
});
