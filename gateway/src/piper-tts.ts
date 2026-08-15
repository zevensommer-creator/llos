import { createHash } from "node:crypto";
import type { ProviderAdapter, ProviderRequest, ProviderResult } from "./registry.js";

export const PIPER_TTS_PROVIDER_ID = "provider.tts.piper-local";

/**
 * Piper local TTS, registered strictly for demo reading (示范朗读): the
 * learner-facing reference audio for read-aloud/shadowing activities. It must
 * never serve as a native-speaker pronunciation standard (spec §10 red line)
 * and never feeds the scoring pipeline. Real Python-process adapters land in a
 * later task; this descriptor pins the contract now.
 */
export const PIPER_TTS_DESCRIPTOR = {
  schema_version: "0.2.0",
  provider_id: PIPER_TTS_PROVIDER_ID,
  version: "0.1.0",
  display_name: "Local Piper TTS (demo reading only)",
  description:
    "Local Piper neural TTS. Scope: tts.demo_reading — synthetic reference audio for read-aloud and shadowing prompts only. Explicitly NOT a native-speaker standard for pronunciation scoring or calibration (baseline §10).",
  execution: {
    mode: "local",
    adapter_entrypoint: "providers.piper:Provider",
    network_required: false,
    credential_ref_names: [],
    sandbox_required: true,
  },
  capabilities: [
    {
      capability_id: "tts.demo_reading",
      kind: "tts",
      operations: ["synthesize"],
      languages: ["de-DE"],
      quality_tiers: ["economy"],
      input_media_types: ["text/plain"],
      supports_streaming: false,
      supports_batch: true,
      supports_cancellation: true,
      supports_seed: true,
      model_refs: ["piper-de-thorsten"],
    },
  ],
  models: [
    {
      model_id: "piper-de-thorsten",
      model_version: "pinned-by-lockfile",
      artifact_or_service_ref: "artifact://voices/piper-de-thorsten",
      languages: ["de"],
      precision: "mixed",
      status: "candidate",
    },
  ],
  hardware_requirements: {
    architectures: ["x86_64", "aarch64"],
    minimum_cpu_cores: 1,
    minimum_ram_mb: 512,
    gpu: "none",
    disk_mb: 200,
  },
  limits: {
    max_concurrency: 1,
    request_timeout_ms: 30000,
    max_audio_ms: 60000,
  },
  cost_model: {
    currency: "USD",
    effective_at: "2026-08-16T00:00:00Z",
    components: [
      {
        unit: "compute_second",
        price: 0,
        notes: "Host-local synthesis; cost metered by deployment.",
      },
    ],
  },
  privacy: {
    data_leaves_host: false,
    processing_regions: [],
    retention: "none",
    training_use: "none",
    supported_data_classes: ["public", "internal", "personal_text"],
  },
  license: {
    code_spdx_id: "GPL-3.0-or-later",
    model_license_status: "separate_unreviewed",
    model_license_refs: ["artifact://licenses/piper-de-thorsten"],
    commercial_use: "unknown",
  },
  health: {
    check_kind: "synthetic_request",
    check_target: "fixture://tts/de/sanity-phrase.txt",
    timeout_ms: 10000,
    failure_threshold: 3,
    recovery_threshold: 2,
  },
};

export interface TtsSynthesisInput {
  text: string;
  voice?: string;
}

export interface TtsSynthesisOutput {
  audio: {
    uri: string;
    sha256: string;
    media_type: "audio/wav";
  };
  duration_ms: number;
  cached: boolean;
}

/**
 * Deterministic, network-free Piper stand-in (spec §12.5 FakeTTSProvider).
 * Synthesis is content-addressed: identical (text, voice) pairs reuse the
 * same artifact URI and hash, mirroring the TTS content-addressed cache rule
 * (spec §12.4) so repeated demo readings never resynthesize.
 */
export class FakeTTSProvider implements ProviderAdapter {
  readonly provider_id = PIPER_TTS_PROVIDER_ID;
  #cache = new Map<string, TtsSynthesisOutput>();
  #requests: ProviderRequest[] = [];

  get requests(): readonly ProviderRequest[] {
    return this.#requests;
  }

  get cacheSize(): number {
    return this.#cache.size;
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    this.#requests.push(request);
    const input = request.input as TtsSynthesisInput;
    if (typeof input?.text !== "string" || input.text.length === 0) {
      throw new Error("tts input requires a non-empty text field");
    }
    const voice = input.voice ?? "piper-de-thorsten";
    const cacheKey = createHash("sha256").update(`${voice}|${input.text}`).digest("hex");
    const cached = this.#cache.get(cacheKey);
    if (cached) {
      return {
        output: { ...cached, cached: true },
        provider_id: this.provider_id,
        model_id: voice,
      };
    }
    const artifactSha = createHash("sha256").update(`piper-fake|${cacheKey}`).digest("hex");
    const output: TtsSynthesisOutput = {
      audio: {
        uri: `artifact://tts-cache/${cacheKey}.wav`,
        sha256: artifactSha,
        media_type: "audio/wav",
      },
      duration_ms: Math.max(600, Math.round(input.text.length * 60)),
      cached: false,
    };
    this.#cache.set(cacheKey, output);
    return {
      output: { ...output },
      provider_id: this.provider_id,
      model_id: voice,
    };
  }
}
