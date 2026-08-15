const { test } = require("node:test");
const assert = require("node:assert");
const { schemas, learningEventRegistry } = require("../dist/index.js");

test("learning-event schema enum mirrors the closed registry", () => {
  const enumTypes = schemas["learning-event"].properties.event_type.enum;
  const registryTypes = learningEventRegistry.event_types.map((e) => e.event_type);
  assert.deepEqual([...enumTypes].sort(), [...registryTypes].sort());
});

test("registry event types are unique", () => {
  const registryTypes = learningEventRegistry.event_types.map((e) => e.event_type);
  assert.equal(new Set(registryTypes).size, registryTypes.length);
});
