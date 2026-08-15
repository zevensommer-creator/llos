import type {
  AlignerPort,
  AlignedPhone,
  AlignedWord,
  AudioAnalyzerPort,
  AudioArtifact,
  AudioMeasurements,
  AsrPort,
  AsrResult,
  G2pWord,
  SpeechComponentDescriptor,
  VadPort,
  VadResult,
} from "../types.js";

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
