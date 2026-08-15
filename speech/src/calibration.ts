import { diagnose, type PhoneDiagnostic } from "./diagnostics.js";
import type { LanguageProfile } from "./profiles.js";
import { FRONT_ROUNDED_VOWELS } from "./phones.js";
import type { AlignResult, G2pWord, GopResult, ProsodyResult } from "./types.js";

export const GERMAN_CALIBRATOR_DESCRIPTOR = {
  component_ref: "calibrator.de.read-aloud",
  role: "calibration" as const,
  provider_id: "provider.llos.local",
  model_id: "calibrator.de.read-aloud",
  model_version: "0.1.0",
};

export interface CalibrationInput {
  profile: LanguageProfile;
  alignment: AlignResult;
  g2pWords: G2pWord[];
  gop: GopResult;
  prosody: ProsodyResult;
}

export type DimensionRoll =
  | {
      id: "phoneme_accuracy";
      status: "scored" | "abstained";
      score?: number;
      confidence: number;
      evidence_phone_ids: string[];
    }
  | {
      id: "vowel_quantity" | "vowel_quality";
      status: "scored" | "not_applicable";
      score?: number;
      confidence: number;
      evidence_phone_ids: string[];
    };

export interface CalibrationOutput {
  diagnostics: PhoneDiagnostic[];
  dimensions: DimensionRoll[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function proportionScore(items: PhoneDiagnostic[]): number {
  const acceptable = items.filter((item) => item.status === "acceptable").length;
  return Math.round((acceptable / items.length) * 100);
}

// Stage 0 German calibrator: maps aligned words to G2P words (both follow the
// reference order), runs the per-phone diagnoser and rolls diagnostics up
// into dimension summaries. Deterministic: no clock, no RNG.
export function calibrateGerman(input: CalibrationInput): CalibrationOutput {
  const gopByPhone = new Map(input.gop.scores.map((score) => [score.phone_id, score]));
  const acousticByPhone = new Map(
    input.prosody.vowel_acoustics.map((item) => [item.phone_id, item]),
  );

  const diagnostics: PhoneDiagnostic[] = [];
  const wordCount = Math.min(input.alignment.words.length, input.g2pWords.length);
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
    const word = input.alignment.words[wordIndex];
    const g2pWord = input.g2pWords[wordIndex];
    for (const [phoneIndex, phone] of word.phones.entries()) {
      const g2pPhone = g2pWord.phones[phoneIndex];
      if (!g2pPhone) continue;
      diagnostics.push(
        diagnose(
          {
            phone_id: phone.phone_id,
            word_id: word.word_id,
            word: word.text,
            phoneIndex,
            phoneCount: g2pWord.phones.length,
            phone,
            g2pPhone,
            gop: gopByPhone.get(phone.phone_id),
            vowel: acousticByPhone.get(phone.phone_id),
            articulationRate: input.prosody.articulation_rate,
            wordConfidence: word.alignment_confidence,
          },
          input.profile.diagnostics,
        ),
      );
    }
  }

  const gopDiagnostics = diagnostics.filter((item) => item.gop);
  const phonemeAccuracy: DimensionRoll = gopDiagnostics.length
    ? {
        id: "phoneme_accuracy",
        status: "scored",
        score: Math.round(
          (gopDiagnostics.reduce((sum, item) => sum + (item.gop?.posterior ?? 0), 0) /
            gopDiagnostics.length) *
            100,
        ),
        confidence: round2(
          gopDiagnostics.reduce((sum, item) => sum + (item.gop?.confidence ?? 0), 0) /
            gopDiagnostics.length,
        ),
        evidence_phone_ids: gopDiagnostics.map((item) => item.phone_id),
      }
    : {
        id: "phoneme_accuracy",
        status: "abstained",
        confidence: 0,
        evidence_phone_ids: [],
      };

  const quantityDiagnostics = diagnostics.filter(
    (item) =>
      item.vowel_acoustic?.length_class !== undefined && item.status !== "uncertain",
  );
  const vowelQuantity: DimensionRoll = quantityDiagnostics.length
    ? {
        id: "vowel_quantity",
        status: "scored",
        score: proportionScore(quantityDiagnostics),
        confidence: 0.7,
        evidence_phone_ids: quantityDiagnostics.map((item) => item.phone_id),
      }
    : {
        id: "vowel_quantity",
        status: "not_applicable",
        confidence: 0,
        evidence_phone_ids: [],
      };

  const frontRoundedExpected = new Set(
    input.alignment.words
      .flatMap((word) => word.phones)
      .filter((phone) => FRONT_ROUNDED_VOWELS.has(phone.expected))
      .map((phone) => phone.phone_id),
  );
  const qualityDiagnostics = diagnostics.filter(
    (item) => frontRoundedExpected.has(item.phone_id) && item.status !== "uncertain",
  );
  const vowelQuality: DimensionRoll = qualityDiagnostics.length
    ? {
        id: "vowel_quality",
        status: "scored",
        score: proportionScore(qualityDiagnostics),
        confidence: 0.7,
        evidence_phone_ids: qualityDiagnostics.map((item) => item.phone_id),
      }
    : {
        id: "vowel_quality",
        status: "not_applicable",
        confidence: 0,
        evidence_phone_ids: [],
      };

  return {
    diagnostics,
    dimensions: [phonemeAccuracy, vowelQuantity, vowelQuality],
  };
}
