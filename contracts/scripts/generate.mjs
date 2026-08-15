import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(pkgRoot, "..", "docs", "contracts");
const genDir = join(pkgRoot, "src", "generated");
const schemaCopyDir = join(pkgRoot, "schemas");

await mkdir(genDir, { recursive: true });
await mkdir(schemaCopyDir, { recursive: true });

const schemaFiles = (await readdir(schemaDir)).filter((f) => f.endsWith(".schema.json")).sort();

// Mirrors json-schema-to-typescript's toSafeString (src/utils.ts): the root type
// name is derived from schema.title (or $id), not from the file name.
function toSafeString(s) {
  return s
    .replace(/(^\s*[^a-zA-Z_$])|([^a-zA-Z_$\d])/g, " ")
    .replace(/^_[a-z]/g, (m) => m.toUpperCase())
    .replace(/_[a-z]/g, (m) => m.slice(1).toUpperCase())
    .replace(/([\d$]+[a-zA-Z])/g, (m) => m.toUpperCase())
    .replace(/\s+([a-zA-Z])/g, (m) => m.trim().toUpperCase())
    .replace(/\s/g, "");
}

const generatedIndex = [];
const schemaMapEntries = [];

for (const file of schemaFiles) {
  const name = file.replace(/\.schema\.json$/, "");
  const raw = await readFile(join(schemaDir, file), "utf8");
  const schema = JSON.parse(raw);

  const ts = await compile(schema, name, {
    bannerComment: `/* eslint-disable */\n// AUTO-GENERATED from docs/contracts/${file}. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.`,
    style: { singleQuote: true, semi: true },
  });

  const pascal = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  const mainType = toSafeString(schema.title || schema.$id || name);
  if (!new RegExp(`^export (?:type|interface) ${mainType}\\b`, "m").test(ts)) {
    throw new Error(`expected main type "${mainType}" not exported by generated module for ${file}`);
  }

  await writeFile(join(genDir, `${pascal}.ts`), ts, "utf8");
  await copyFile(join(schemaDir, file), join(schemaCopyDir, file));

  generatedIndex.push(`export type { ${mainType} } from "./${pascal}.js";`);
  schemaMapEntries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(schema)},`);
}

await writeFile(
  join(genDir, "index.ts"),
  `${generatedIndex.join("\n")}\n`,
  "utf8",
);

const registryFile = join(schemaDir, "learning-event-registry.json");
let registryExport = "";
try {
  const registry = JSON.parse(await readFile(registryFile, "utf8"));
  registryExport = `export const learningEventRegistry = ${JSON.stringify(registry, null, 2)} as const;\n`;
} catch {
  registryExport = "";
}

await writeFile(
  join(pkgRoot, "src", "schemas.ts"),
  `/* eslint-disable */\n// AUTO-GENERATED from docs/contracts. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.\nexport const schemas = {\n${schemaMapEntries.join("\n")}\n} as const;\n\nexport type ContractName = keyof typeof schemas;\n\n${registryExport}`,
  "utf8",
);

console.log(`generated ${schemaFiles.length} schema modules + schemas.ts`);
