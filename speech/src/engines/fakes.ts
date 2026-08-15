import type {
  AlignerPort,
  AlignResult,
  AlignedPhone,
  AlignedWord,
  AudioAnalyzerPort,
  AudioArtifact,
  AudioMeasurements,
  AsrPort,
  AsrResult,
  G2pWord,
  GopPhoneScore,
  GopPort,
  GopResult,
  ProsodyPort,
  ProsodyResult,
  SpeechComponentDescriptor,
  VadPort,
  VadResult,
  VowelAcoustic,
} from "../types.js";
import {
  FRONT_ROUNDED_VOWELS,
  STAGE0_REFERENCES,
  VOWELS,
  vowelLengthClass,
} from "../phones.js";

const FAKE_PROVIDER = "provider.fake.test";

export function fakeDescriptor(
  component_ref: string,
  role: SpeechComponentDescriptor["role"],
  model_id: string,
): SpeechComponentDescriptor {
  return {
    component_ref,
    role,
    provider_id: FAKE_PROVIDER,
    model_id,
    model_version: "0.1.0",
  };
}

export interface FakeAnalyzerScript {
  snr_db: number | null;
  clipping_ratio: number;
  extra_quality_flags?: AudioMeasurements["extra_quality_flags"];
}

export function makeFakeAnalyzer(script: FakeAnalyzerScript): AudioAnalyzerPort {
  return {
    descriptor: fakeDescriptor("component.fake-vad", "vad", "fake-quality-analyzer"),
    measure(): AudioMeasurements {
      return {
        snr_db: script.snr_db,
        clipping_ratio: script.clipping_ratio,
        extra_quality_flags: script.extra_quality_flags ?? [],
      };
    },
  };
}

export interface FakeVadScript {
  segments: { start_ms: number; end_ms: number }[];
  uncertain?: boolean;
}

export function makeFakeVad(script: FakeVadScript): VadPort {
  return {
    descriptor: fakeDescriptor("component.fake-vad", "vad", "fake-vad"),
    detect(audio: AudioArtifact): VadResult {
      const speech = script.segments.reduce(
        (sum, segment) => sum + (segment.end_ms - segment.start_ms),
        0,
      );
      const silence_ratio = Math.max(
        0,
        Math.min(1, 1 - speech / Math.max(1, audio.duration_ms)),
      );
      return {
        segments: script.segments,
        speech_duration_ms: speech,
        silence_ratio: Math.round(silence_ratio * 1000) / 1000,
        uncertain: script.uncertain ?? false,
      };
    },
  };
}

export type FakeAsrScript =
  | { hypotheses: { text: string; confidence: number }[] }
  | { status: "failed" };

export function makeFakeAsr(script: FakeAsrScript): AsrPort {
  return {
    descriptor: fakeDescriptor("component.fake-asr", "asr", "fake-whisper"),
    transcribe(): AsrResult {
      if ("status" in script) {
        return { status: "failed", hypotheses: [] };
      }
      return {
        status: "completed",
        hypotheses: script.hypotheses.map((hypothesis, index) => ({
          text: hypothesis.text,
          rank: index + 1,
          confidence: hypothesis.confidence,
        })),
      };
    },
  };
}

export type FakeAlignerScript =
  | { status: "failed"; failure_code: string }
  | {
      coverage: number;
      mean_confidence: number;
      word_confidences?: number[];
    };

export function makeFakeAligner(script: FakeAlignerScript): AlignerPort {
  return {
    descriptor: fakeDescriptor("component.fake-aligner", "alignment", "fake-mfa-german"),
    align(audio: AudioArtifact, words: G2pWord[], _recognizedText: string) {
      if ("status" in script) {
        return {
          status: "failed" as const,
          coverage: 0,
          mean_confidence: null,
          words: [],
          failure_code: script.failure_code,
        };
      }

      const totalPhones = words.reduce((sum, word) => sum + word.phones.length, 0);
      const usable = Math.max(1, audio.duration_ms);
      const perPhone = Math.floor(usable / Math.max(1, totalPhones));

      let cursor = 0;
      const alignedWords: AlignedWord[] = words.map((word, wordIdx) => {
        const wordConfidence =
          script.word_confidences?.[wordIdx] ?? script.mean_confidence;
        const phones: AlignedPhone[] = word.phones.map((phone, phoneIdx) => {
          const start = cursor;
          const end = Math.min(usable, cursor + perPhone);
          cursor = end;
          return {
            phone_id: `phone.${wordIdx + 1}.${phoneIdx + 1}`,
            expected: phone.symbol,
            start_ms: start,
            end_ms: end,
            confidence: wordConfidence,
          };
        });
        return {
          word_id: `word.${wordIdx + 1}`,
          text: word.text,
          start_ms: phones[0]?.start_ms ?? cursor,
          end_ms: phones[phones.length - 1]?.end_ms ?? cursor,
          alignment_confidence: wordConfidence,
          phones,
        };
      });

      return {
        status: "completed" as const,
        coverage: script.coverage,
        mean_confidence: script.mean_confidence,
        words: alignedWords,
      };
    },
  };
}

export interface FakeGopOverride {
  posterior: number;
  confidence?: number;
  competitors?: { phone: string; posterior: number }[];
}

export type FakeGopScript =
  | { status: "failed"; failure_code?: string }
  | {
      default_posterior?: number;
      default_confidence?: number;
      phone_overrides?: Record<string, FakeGopOverride>;
    };

export function makeFakeGop(script: FakeGopScript): GopPort {
  return {
    descriptor: fakeDescriptor("component.fake-gop", "gop", "fake-ctc-gop"),
    score(_audio: AudioArtifact, alignment: AlignResult): GopResult {
      if ("status" in script) {
        return { status: "failed", scores: [], failure_code: script.failure_code ?? "GOP_FAILED" };
      }
      const defaultPosterior = script.default_posterior ?? 0.96;
      const defaultConfidence = script.default_confidence ?? 0.93;
      const scores: GopPhoneScore[] = alignment.words.flatMap((word) =>
        word.phones.map((phone) => {
          const override = script.phone_overrides?.[phone.phone_id];
          return {
            phone_id: phone.phone_id,
            posterior: override?.posterior ?? defaultPosterior,
            confidence: override?.confidence ?? defaultConfidence,
            competitors: override?.competitors ?? [],
          };
        }),
      );
      return { status: "completed", scores };
    },
  };
}

export interface FakeProsodyScript {
  status?: "failed";
  failure_code?: string;
  voiced_ratio?: number;
  f0_median_hz?: number | null;
  f0_range_semitones?: number | null;
  articulation_rate?: number | null;
  pauses?: { start_ms: number; end_ms: number }[];
  phone_overrides?: Record<string, Partial<Omit<VowelAcoustic, "phone_id">>>;
}

// Fake prosody derives plausible vowel acoustics from the aligned phones:
// duration follows the expected length class, F2 follows the front
// rounded/unrounded reference split. Tests corrupt single phones via
// phone_overrides keyed by phone_id.
export function makeFakeProsody(script: FakeProsodyScript = {}): ProsodyPort {
  return {
    descriptor: fakeDescriptor("component.fake-prosody", "prosody", "fake-praat-features"),
    analyze(_audio: AudioArtifact, alignment: AlignResult): ProsodyResult {
      if (script.status === "failed") {
        return {
          status: "failed",
          voiced_ratio: 0,
          f0_median_hz: null,
          f0_range_semitones: null,
          articulation_rate: null,
          pauses: [],
          vowel_acoustics: [],
          failure_code: script.failure_code ?? "PRAAT_FAILED",
        };
      }
      const vowel_acoustics: VowelAcoustic[] = [];
      for (const word of alignment.words) {
        for (const phone of word.phones) {
          if (!VOWELS.has(phone.expected)) continue;
          const length = vowelLengthClass(phone.expected);
          const duration =
            length === "long"
              ? STAGE0_REFERENCES.long_vowel_ms
              : length === "short"
                ? STAGE0_REFERENCES.short_vowel_ms
                : 85;
          const f2 = FRONT_ROUNDED_VOWELS.has(phone.expected)
            ? STAGE0_REFERENCES.front_rounded_f2_hz
            : ["iː", "ɪ", "eː", "ɛ", "ɛː"].includes(phone.expected)
              ? STAGE0_REFERENCES.front_unrounded_f2_hz
              : 1100;
          const override = script.phone_overrides?.[phone.phone_id];
          vowel_acoustics.push({
            phone_id: phone.phone_id,
            duration_ms: override?.duration_ms ?? duration,
            f1_hz: override?.f1_hz ?? 320,
            f2_hz: override?.f2_hz ?? f2,
            f0_hz: override?.f0_hz ?? 128,
            intensity_db: override?.intensity_db ?? 66,
          });
        }
      }
      return {
        status: "completed",
        voiced_ratio: script.voiced_ratio ?? 0.82,
        f0_median_hz: script.f0_median_hz === undefined ? 128 : script.f0_median_hz,
        f0_range_semitones: script.f0_range_semitones === undefined ? 6 : script.f0_range_semitones,
        articulation_rate: script.articulation_rate === undefined ? 12 : script.articulation_rate,
        pauses: script.pauses ?? [],
        vowel_acoustics,
      };
    },
  };
}
