const { test } = require("node:test");
const assert = require("node:assert");
const { MockApiClient } = require("../dist/index.js");

test("learner account gets base capabilities only", async () => {
  const client = new MockApiClient();
  const account = await client.getAccount();
  assert.deepEqual([...account.capabilities].sort(), [
    "chat",
    "create_dlc_draft",
    "generate_material_ephemeral",
    "join_class",
    "learn",
  ]);
  assert.ok(!account.capabilities.includes("create_class"));
});

test("teacher account additionally holds create_class", async () => {
  const client = new MockApiClient({ account: "teacher" });
  const account = await client.getAccount();
  assert.ok(account.capabilities.includes("create_class"));
});

test("home overview and market never resolve empty (mock must cover blank/loading states upstream)", async () => {
  const client = new MockApiClient();
  const overview = await client.getHomeOverview();
  assert.ok(overview.cards.length >= 3);
  const market = await client.listMarket();
  assert.ok(market.length >= 3);
  assert.ok(market.some((entry) => entry.language === "de"));
});
