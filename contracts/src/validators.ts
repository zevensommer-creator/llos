import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { schemas, type ContractName } from "./schemas.js";

export type ValidationResult =
  | { valid: true; value: unknown }
  | { valid: false; errors: string[] };

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

for (const name of Object.keys(schemas) as ContractName[]) {
  ajv.addSchema(schemas[name], name);
}

export const contractNames: readonly ContractName[] = Object.keys(schemas) as ContractName[];

export function validate(contract: ContractName, instance: unknown): ValidationResult {
  const validator = ajv.getSchema(contract);
  if (!validator) throw new Error(`Unknown contract: ${contract}`);
  const ok = validator(instance);
  if (ok) return { valid: true, value: instance };
  const errors = (validator.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  );
  return { valid: false, errors };
}

export function assertValid(contract: ContractName, instance: unknown): void {
  const result = validate(contract, instance);
  if (!result.valid) {
    throw new Error(`${contract} validation failed:\n${result.errors.join("\n")}`);
  }
}
