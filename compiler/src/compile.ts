import { validate } from "@llos/contracts";
import type {
  DLCManifest,
  LearningIR,
  MaterialPack,
  MaterialSnapshot,
} from "@llos/contracts";
import { canonicalJson, contentHash } from "./hash.js";
import { CompilationError } from "./errors.js";
import {
  runMaterialValidate,
  type ValidatedMaterial,
} from "./material-validate.js";
import { planPedagogical } from "./pedagogical-plan.js";
import { lowerExecutable } from "./executable-lower.js";

export interface CompileInput {
  manifest: DLCManifest;
  snapshot: MaterialSnapshot;
  materialPack: MaterialPack;
}

export interface CompileOptions {
  clock?: () => string;
  seed?: number;
  templateResolver?: (uri: string) => { content: string } | undefined;
}

export interface CompileResult {
  pedagogical?: LearningIR;
  executable?: LearningIR;
}

type ManifestPass = DLCManifest["passes"][number];

interface RunContext {
  input: CompileInput;
  options: Required<Pick<CompileOptions, "seed">> & CompileOptions;
  manifestHash: string;
  validated?: ValidatedMaterial;
  pedagogical?: LearningIR;
  executable?: LearningIR;
  completedPasses: { id: string; version: string }[];
}

type PassRunner = (pass: ManifestPass, ctx: RunContext) => void;

const passRunners: Record<string, PassRunner> = {
  "llos.compiler.material_validate:run": (pass, ctx) => {
    ctx.validated = runMaterialValidate(
      ctx.input.materialPack,
      ctx.input.snapshot,
      ctx.input.manifest,
      pass.id,
    );
  },
  "llos.compiler.pedagogical_plan:run": (pass, ctx) => {
    if (!ctx.validated) {
      throw new CompilationError(
        "pass_chain_invalid",
        pass.id,
        "pedagogical plan requires a validated material pass before it",
      );
    }
    ctx.pedagogical = planPedagogical(ctx.validated, ctx.input.manifest, {
      manifestHash: ctx.manifestHash,
      seed: ctx.options.seed,
      now: ctx.options.clock ?? defaultClock,
      completedPasses: [...ctx.completedPasses],
    });
  },
  "llos.compiler.executable_lower:run": (pass, ctx) => {
    if (!ctx.validated || !ctx.pedagogical) {
      throw new CompilationError(
        "pass_chain_invalid",
        pass.id,
        "executable lowering requires a pedagogical plan before it",
      );
    }
    ctx.executable = lowerExecutable(ctx.pedagogical, ctx.validated, ctx.input.manifest, {
      seed: ctx.options.seed,
      now: ctx.options.clock ?? defaultClock,
      manifestHash: ctx.manifestHash,
      completedPasses: [...ctx.completedPasses],
      resolveTemplate: ctx.options.templateResolver,
    });
  },
};

const OUTPUT_KIND_TO_IR: Record<string, "pedagogical" | "executable_session"> = {
  pedagogical_ir: "pedagogical",
  executable_session_ir: "executable_session",
};

function defaultClock(): string {
  return new Date().toISOString();
}

export function runCompiler(input: CompileInput, options: CompileOptions = {}): CompileResult {
  const manifestResult = validate("dlc-manifest", input.manifest);
  if (!manifestResult.valid) {
    throw new CompilationError(
      "manifest_invalid",
      "manifest",
      "DLC manifest failed schema validation",
      manifestResult.errors,
    );
  }

  assertChainValid(input.manifest);

  const ctx: RunContext = {
    input,
    options: { ...options, seed: options.seed ?? 0 },
    manifestHash: contentHash(input.manifest),
    completedPasses: [],
  };

  for (const pass of input.manifest.passes) {
    if (pass.determinism !== "deterministic") {
      throw new CompilationError(
        "pass_chain_invalid",
        pass.id,
        `pass declares determinism '${pass.determinism}' but the runtime only implements deterministic passes`,
      );
    }
    const runner = passRunners[pass.entrypoint];
    if (!runner) {
      throw new CompilationError(
        "pass_entrypoint_unknown",
        pass.id,
        `no runtime implementation registered for entrypoint ${pass.entrypoint}`,
      );
    }
    runner(pass, ctx);
    ctx.completedPasses.push({ id: pass.id, version: pass.version });
  }

  assertIrValid(ctx.pedagogical, "pedagogical.plan");
  assertIrValid(ctx.executable, "executable.lower");

  if (ctx.executable) {
    const size = Buffer.byteLength(canonicalJson(ctx.executable), "utf8");
    if (size > input.manifest.budgets.max_output_bytes) {
      throw new CompilationError(
        "budget_exceeded",
        "executable.lower",
        `executable IR size ${size} exceeds manifest budget ${input.manifest.budgets.max_output_bytes}`,
      );
    }
  }

  return {
    ...(ctx.pedagogical ? { pedagogical: ctx.pedagogical } : {}),
    ...(ctx.executable ? { executable: ctx.executable } : {}),
  };
}

function assertChainValid(manifest: DLCManifest): void {
  const passes = manifest.passes;
  if (!passes[0].input_kinds.includes("material_pack")) {
    throw new CompilationError(
      "pass_chain_invalid",
      passes[0].id,
      "first pass must consume 'material_pack'",
    );
  }
  for (let i = 1; i < passes.length; i += 1) {
    if (!passes[i].input_kinds.includes(passes[i - 1].output_kind)) {
      throw new CompilationError(
        "pass_chain_invalid",
        passes[i].id,
        `pass input_kinds do not include previous output kind '${passes[i - 1].output_kind}'`,
      );
    }
  }
  const finalKind = OUTPUT_KIND_TO_IR[passes[passes.length - 1].output_kind];
  if (!finalKind || !manifest.output_ir.kinds.includes(finalKind)) {
    throw new CompilationError(
      "pass_chain_invalid",
      passes[passes.length - 1].id,
      `final output kind '${passes[passes.length - 1].output_kind}' is not declared in manifest output_ir.kinds`,
    );
  }
}

function assertIrValid(ir: LearningIR | undefined, passId: string): void {
  if (!ir) return;
  const result = validate("learning-ir", ir);
  if (!result.valid) {
    throw new CompilationError(
      "ir_schema_invalid",
      passId,
      `learning IR failed schema validation (${ir.ir_kind})`,
      result.errors,
    );
  }
}
