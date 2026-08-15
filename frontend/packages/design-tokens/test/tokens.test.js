const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const tokens = require("../dist/tokens.js");

test("generated CJS tokens match tokens.json", () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "tokens", "tokens.json"), "utf8"),
  );
  assert.deepEqual(tokens.color, raw.color);
  assert.deepEqual(tokens.space, raw.space);
  assert.ok(Object.isFrozen(tokens));
});

test("CSS output exposes light-theme custom properties", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "dist", "tokens.css"), "utf8");
  assert.match(css, /--llos-color-bg:/);
  assert.match(css, /--llos-color-mode-chat:/);
  assert.match(css, /--llos-color-mode-learning:/);
});

test("chat and learning modes get distinct token pairs (spec: modes must be visually distinct)", () => {
  assert.notEqual(tokens.color.mode_chat, tokens.color.mode_learning);
  assert.notEqual(tokens.color.mode_chat_soft, tokens.color.mode_learning_soft);
});
