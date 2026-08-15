export interface Stage0Thresholds {
  min_speech_duration_ms: number;
  max_speech_duration_ms: number;
  min_snr_db: number;
  max_clipping_ratio: number;
  max_silence_ratio: number;
  min_sample_rate_hz: number;
  required_channel_count: number;
  min_completeness: number;
  min_alignment_coverage: number;
  min_alignment_mean_confidence: number;
  min_word_alignment_confidence: number;
}

// Stage 0 conservative diagnosis thresholds (spec §10.4, §13.2). Biased
// towards abstention: a phone is only flagged when GOP and an independent
// acoustic cue agree, and only "confirmed" when the fused confidence clears
// issue_confirm_confidence.
export interface DiagnosticThresholds {
  gop_confident_accept: number;
  gop_issue_posterior: number;
  gop_confidence_floor: number;
  competitor_margin: number;
  competitor_confirm_posterior: number;
  vowel_duration_min_ms: number;
  vowel_quantity_short_ratio: number;
  vowel_quantity_long_ratio: number;
  formant_confirm_offset_hz: number;
  formant_ambiguous_band_hz: number;
  word_confidence_floor: number;
  issue_confirm_confidence: number;
}

export interface LanguageProfile {
  language: string;
  profile_id: string;
  profile_version: string;
  calibrator_id: string;
  calibrator_version: string;
  threshold_set_version: string;
  acceptable_variant_policy_version: string;
  supported_modes: readonly ("read_aloud" | "shadowing")[];
  domain_status: "in_domain" | "partially_in_domain" | "out_of_domain" | "unknown";
  thresholds: Stage0Thresholds;
  diagnostics: DiagnosticThresholds;
}

const STAGE0_DIAGNOSTICS: DiagnosticThresholds = {
  gop_confident_accept: 0.9,
  gop_issue_posterior: 0.55,
  gop_confidence_floor: 0.6,
  competitor_margin: 0.25,
  competitor_confirm_posterior: 0.6,
  vowel_duration_min_ms: 40,
  vowel_quantity_short_ratio: 0.62,
  vowel_quantity_long_ratio: 1.6,
  formant_confirm_offset_hz: 100,
  formant_ambiguous_band_hz: 150,
  word_confidence_floor: 0.75,
  issue_confirm_confidence: 0.75,
};

export const GERMAN_PROFILE: LanguageProfile = {
  language: "de-DE",
  profile_id: "language-profile.de-DE",
  profile_version: "0.1.0",
  calibrator_id: "calibrator.de.read-aloud",
  calibrator_version: "0.1.0",
  threshold_set_version: "0.1.0",
  acceptable_variant_policy_version: "0.1.0",
  supported_modes: ["read_aloud", "shadowing"],
  domain_status: "in_domain",
  thresholds: {
    min_speech_duration_ms: 800,
    max_speech_duration_ms: 30000,
    min_snr_db: 15,
    max_clipping_ratio: 0.05,
    max_silence_ratio: 0.6,
    min_sample_rate_hz: 16000,
    required_channel_count: 1,
    min_completeness: 0.8,
    min_alignment_coverage: 0.9,
    min_alignment_mean_confidence: 0.6,
    min_word_alignment_confidence: 0.5,
  },
  diagnostics: STAGE0_DIAGNOSTICS,
};

const PROFILES: Record<string, LanguageProfile> = {
  de: GERMAN_PROFILE,
  "de-DE": GERMAN_PROFILE,
  "de-AT": GERMAN_PROFILE,
  "de-CH": GERMAN_PROFILE,
};

export function findLanguageProfile(language: string): LanguageProfile | undefined {
  return PROFILES[language] ?? PROFILES[language.split("-")[0]];
}
