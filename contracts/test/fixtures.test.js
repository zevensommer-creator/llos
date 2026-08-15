const { test } = require("node:test");
const assert = require("node:assert");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { validate, contractNames } = require("../dist/index.js");

const fixturesRoot = join(__dirname, "..", "..", "tests", "contracts", "fixtures");

test("all 15 contracts have compiled validators", () => {
  assert.equal(contractNames.length, 15);
});

for (const group of readdirSync(fixturesRoot, { withFileTypes: true })) {
  if (!group.isDirectory()) continue;
  const contract = group.name;

  test(`fixture group "${contract}" maps to a known contract`, () => {
    assert.ok(contractNames.includes(contract), `unknown contract dir: ${contract}`);
  });

  for (const file of readdirSync(join(fixturesRoot, group.name)).sort()) {
    const expectValid = file.startsWith("valid_");
    test(`${contract}/${file} must ${expectValid ? "pass" : "be rejected"}`, () => {
      const fixture = JSON.parse(readFileSync(join(fixturesRoot, group.name, file), "utf8"));
      const result = validate(contract, fixture);
      assert.equal(result.valid, expectValid, JSON.stringify(result, null, 2));
    });
  }
}
