const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const { MockApiClient, resetMockMarket } = require("../dist/index.js");

// T-026 市场流程：筛选/详情/获取/评价门禁。模块级市场状态跨实例共享，
// 每个用例前重置种子数据保证隔离。
beforeEach(() => resetMockMarket());

test("seed market lists 4 entries; learner already owns the FSI reference DLC", async () => {
  const client = new MockApiClient();
  const entries = await client.listMarket();
  assert.ok(entries.length >= 4);
  assert.ok(entries.some((e) => e.language === "de"));
  const fsi = entries.find((e) => e.dlc_id === "dlc.fsi-german-a1");
  assert.equal(fsi.owned, true);
  const hotel = entries.find((e) => e.dlc_id === "dlc.de-hotel-survival");
  assert.equal(hotel.owned, false);
});

test("queryMarket filters by language / difficulty / search (title+tags)", async () => {
  const client = new MockApiClient();
  const de = await client.queryMarket({ language: "de" });
  assert.ok(de.length >= 3);
  assert.ok(de.every((e) => e.language === "de"));

  const b1 = await client.queryMarket({ difficulty: "B1" });
  assert.deepEqual(b1.map((e) => e.dlc_id), ["dlc.german-b1-grammar"]);

  const byTitle = await client.queryMarket({ search: "酒店" });
  assert.ok(byTitle.some((e) => e.dlc_id === "dlc.de-hotel-survival"));
  const byTag = await client.queryMarket({ search: "语法" });
  assert.ok(byTag.some((e) => e.dlc_id === "dlc.german-b1-grammar"));

  const combined = await client.queryMarket({ language: "de", difficulty: "A1", search: "发音" });
  assert.deepEqual(combined.map((e) => e.dlc_id), ["dlc.fsi-german-a1"]);
});

test("queryMarket sorts: newest (default) / downloads_desc / rating_desc", async () => {
  const client = new MockApiClient();
  const newest = await client.queryMarket();
  assert.equal(newest[0].dlc_id, "dlc.de-hotel-survival");

  const downloads = await client.queryMarket({ sort: "downloads_desc" });
  assert.equal(downloads[0].dlc_id, "dlc.fsi-german-a1");

  await client.acquireListing("dlc.de-hotel-survival");
  await client.submitReview("dlc.de-hotel-survival", 5);
  const byRating = await client.queryMarket({ sort: "rating_desc" });
  assert.equal(byRating[0].dlc_id, "dlc.de-hotel-survival"); // 唯一有评分者排最前
});

test("getMarketListing returns detail with rating/downloads; null for unknown", async () => {
  const client = new MockApiClient();
  const detail = await client.getMarketListing("dlc.fsi-german-a1");
  assert.equal(detail.title, "FSI 德语发音基础");
  assert.equal(detail.owned, true);
  assert.equal(detail.can_review, true);
  assert.equal(detail.rating_average, null);
  assert.ok(detail.downloads >= 128);
  assert.ok(detail.tags.includes("发音"));
  assert.equal(await client.getMarketListing("dlc.unknown"), null);
});

test("acquireListing: free -> acquired, idempotent second call, downloads +1 only", async () => {
  const client = new MockApiClient();
  const before = await client.getMarketListing("dlc.de-hotel-survival");
  assert.equal(before.owned, false);

  assert.deepEqual(await client.acquireListing("dlc.de-hotel-survival"), { status: "acquired" });
  const after = await client.getMarketListing("dlc.de-hotel-survival");
  assert.equal(after.owned, true);
  assert.equal(after.downloads, before.downloads + 1);

  assert.deepEqual(await client.acquireListing("dlc.de-hotel-survival"), { status: "already_owned" });
  assert.equal((await client.getMarketListing("dlc.de-hotel-survival")).downloads, before.downloads + 1);

  // 获取对同机另一实例可见（模块级状态模拟服务端）。
  const other = new MockApiClient();
  assert.equal((await other.getMarketListing("dlc.de-hotel-survival")).owned, true);
});

test("acquireListing gates: paid listings -> payment_not_available (P8); unknown -> not_found", async () => {
  const client = new MockApiClient();
  const sub = await client.acquireListing("dlc.german-b1-grammar");
  assert.deepEqual(sub, { status: "payment_not_available", price_model: "subscription" });
  const buyout = await client.acquireListing("dlc.french-start");
  assert.deepEqual(buyout, { status: "payment_not_available", price_model: "one_time" });
  assert.deepEqual(await client.acquireListing("dlc.unknown"), { status: "not_found" });
});

test("review gate: non-owner rejected with requires_entitlement (product_spec §4.3)", async () => {
  const client = new MockApiClient();
  const outcome = await client.submitReview("dlc.de-hotel-survival", 5, "很好");
  assert.equal(outcome.status, "requires_entitlement");
  assert.ok(outcome.message.length > 0);
});

test("review flow: owner submits, summary updates, re-review overwrites (一用户一评)", async () => {
  const client = new MockApiClient();
  await client.acquireListing("dlc.de-hotel-survival");

  assert.deepEqual(await client.submitReview("dlc.de-hotel-survival", 5, "训练很扎实"), {
    status: "submitted",
    rating: 5,
  });
  let detail = await client.getMarketListing("dlc.de-hotel-survival");
  assert.equal(detail.rating_average, 5);
  assert.equal(detail.rating_count, 1);
  assert.deepEqual(detail.my_review, { rating: 5, text: "训练很扎实" });

  // 覆盖更新：count 不变，均分跟随。
  assert.deepEqual(await client.submitReview("dlc.de-hotel-survival", 3), { status: "submitted", rating: 3 });
  detail = await client.getMarketListing("dlc.de-hotel-survival");
  assert.equal(detail.rating_average, 3);
  assert.equal(detail.rating_count, 1);
  assert.equal(detail.my_review.text, undefined);
});

test("review validation: rating must be an integer in 1..5", async () => {
  const client = new MockApiClient();
  for (const bad of [0, 6, 2.5, NaN]) {
    const outcome = await client.submitReview("dlc.fsi-german-a1", bad);
    assert.equal(outcome.status, "invalid_rating", `rating ${bad} rejected`);
  }
  assert.equal((await client.submitReview("dlc.unknown", 5)).status, "not_found");
});

test("workbench entitlements reflect market acquisitions", async () => {
  const client = new MockApiClient();
  await client.acquireListing("dlc.de-hotel-survival");
  const state = await client.loadWorkbench();
  assert.equal(state.status, "ready");
  const refs = state.data.entitlements.map((e) => `${e.dlc_id}:${e.source}`);
  assert.ok(refs.includes("dlc.de-hotel-survival:free"));
  assert.ok(refs.includes("dlc.german-b1-grammar:class_assignment"));
});

test("resetMockMarket restores seed state", async () => {
  const client = new MockApiClient();
  await client.acquireListing("dlc.de-hotel-survival");
  resetMockMarket();
  assert.equal((await client.getMarketListing("dlc.de-hotel-survival")).owned, false);
});
