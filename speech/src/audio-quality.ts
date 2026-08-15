import type { AudioMeasurements, AudioArtifact, VadResult } from "./types.js";
import type { Stage0Thresholds } from "./profiles.js";
import type { PronunciationAssessment } from "@llos/contracts";

type AudioQuality = PronunciationAssessment["audio_quality"];
type QualityFlag = NonNullable<AudioQuality["quality_flags"]>[number];

export type QualityVerdict = "passed" | "degraded" | "rejected";

export interface QualityGateResult {
  quality: AudioQuality;
  verdict: QualityVerdict;
  has_speech: boolean;
}

const REJECT_FLAGS: readonly QualityFlag[] = [
  "too_short",
  "low_snr",
  "clipping",
  "multiple_speakers",
  "music",
  "unsupported_format",
  "vad_uncertain",
];

export function evaluateAudioQuality(
  audio: AudioArtifact,
  measurements: AudioMeasurements,
  vad: VadResult,
  thresholds: Stage0Thresholds,
): QualityGateResult {
  const flags: QualityFlag[] = [];

  if (vad.speech_duration_ms < thresholds.min_speech_duration_ms) flags.push("too_short");
  if (vad.speech_duration_ms > thresholds.max_speech_duration_ms) flags.push("too_long");
  if (measurements.snr_db !== null && measurements.snr_db < thresholds.min_snr_db) {
    flags.push("low_snr");
  }
  if (measurements.clipping_ratio > thresholds.max_clipping_ratio) flags.push("clipping");
  if (vad.silence_ratio > thresholds.max_silence_ratio && !flags.includes("too_short")) {
    flags.push("vad_uncertain");
  }
  if (audio.sample_rate_hz < thresholds.min_sample_rate_hz) flags.push("unsupported_format");
  if (audio.channel_count !== thresholds.required_channel_count) flags.push("unsupported_format");
  for (const flag of measurements.extra_quality_flags) {
    if (!flags.includes(flag)) flags.push(flag);
  }
  if (vad.uncertain && !flags.includes("vad_uncertain")) flags.push("vad_uncertain");

  const has_speech = vad.segments.length > 0 && vad.speech_duration_ms > 0;

  const verdict: QualityVerdict = flags.some((f) => REJECT_FLAGS.includes(f))
    ? "rejected"
    : flags.includes("too_long")
      ? "degraded"
      : "passed";

  const quality: AudioQuality = {
    status: verdict,
    speech_duration_ms: vad.speech_duration_ms,
    snr_db: measurements.snr_db,
    clipping_ratio: measurements.clipping_ratio,
    silence_ratio: vad.silence_ratio,
    channel_count: audio.channel_count,
    sample_rate_hz: audio.sample_rate_hz,
    ...(flags.length > 0 ? { quality_flags: flags } : {}),
  };

  return { quality, verdict, has_speech };
}
