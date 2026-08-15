export {
  runCompiler,
  type CompileInput,
  type CompileOptions,
  type CompileResult,
} from "./compile.js";
export {
  runMaterialValidate,
  type ValidatedMaterial,
} from "./material-validate.js";
export { planPedagogical } from "./pedagogical-plan.js";
export { lowerExecutable } from "./executable-lower.js";
export { canonicalJson, contentHash, sha256Hex } from "./hash.js";
export {
  CompilationError,
  compilationErrorCodes,
  type CompilationErrorCode,
} from "./errors.js";
export { RUNTIME_VERSION } from "./runtime-version.js";
