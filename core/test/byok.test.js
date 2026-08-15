const { test } = require("node:test");
const assert = require("node:assert");
const { ByokVault, ByokError, maskKey } = require("../dist/index.js");

const NOW = "2026-08-16T12:00:00Z";

function setup() {
  return new ByokVault({ clock: () => NOW });
}

const KEY = "sk-byok-0123456789abcdef";

test("register returns a masked view; the raw key never leaks", () => {
  const vault = setup();
  const view = vault.register("teacher.a", {
    provider_family: "deepseek",
    label: "我的 DeepSeek key",
    api_key: KEY,
  });
  assert.equal(view.provider_family, "deepseek");
  assert.equal(view.label, "我的 DeepSeek key");
  assert.equal(view.registered_at, NOW);
  assert.ok(!view.masked_key.includes("0123456789"));
  assert.ok(!JSON.stringify(view).includes(KEY));
  assert.equal(maskKey(KEY), `sk-…${KEY.slice(-4)}`);
});

test("maskKey reveals nothing for short keys", () => {
  assert.equal(maskKey("short"), "…");
  assert.equal(maskKey("1234567890ab"), "123…90ab");
});

test("list is account-isolated and masked-only", () => {
  const vault = setup();
  vault.register("teacher.a", { provider_family: "deepseek", label: "a", api_key: KEY });
  vault.register("teacher.b", { provider_family: "openai", label: "b", api_key: KEY });
  const mine = vault.list("teacher.a");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].provider_family, "deepseek");
  assert.ok(!JSON.stringify(mine).includes(KEY));
});

test("resolveFor requires ownership; other accounts get not_owner", () => {
  const vault = setup();
  const view = vault.register("teacher.a", { provider_family: "mock", label: "m", api_key: KEY });
  const secret = vault.resolveFor("teacher.a", view.entry_id);
  assert.equal(secret.api_key, KEY);
  assert.equal(secret.entry_id, view.entry_id);
  assert.throws(
    () => vault.resolveFor("teacher.b", view.entry_id),
    (err) => err instanceof ByokError && err.code === "not_owner",
  );
});

test("revoke removes the entry; later access is not_found", () => {
  const vault = setup();
  const view = vault.register("teacher.a", { provider_family: "mock", label: "m", api_key: KEY });
  vault.revoke("teacher.a", view.entry_id);
  assert.equal(vault.has("teacher.a", view.entry_id), false);
  assert.equal(vault.list("teacher.a").length, 0);
  assert.throws(
    () => vault.resolveFor("teacher.a", view.entry_id),
    (err) => err instanceof ByokError && err.code === "not_found",
  );
  assert.throws(
    () => vault.revoke("teacher.a", view.entry_id),
    (err) => err instanceof ByokError && err.code === "not_found",
  );
});

test("registration validates family, label and key length", () => {
  const vault = setup();
  assert.throws(
    () => vault.register("a", { provider_family: "mistral", label: "x", api_key: KEY }),
    (err) => err.code === "invalid_input",
  );
  assert.throws(
    () => vault.register("a", { provider_family: "deepseek", label: "  ", api_key: KEY }),
    (err) => err.code === "invalid_input",
  );
  assert.throws(
    () => vault.register("a", { provider_family: "deepseek", label: "x", api_key: "short" }),
    (err) => err.code === "invalid_input",
  );
});
