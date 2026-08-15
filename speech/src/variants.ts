import {
  FINAL_VOICED_LETTERS,
  R_REALIZATIONS,
  STAGE0_REFERENCES,
} from "./phones.js";

// Acceptable variant layer (spec §10.3): runs BEFORE any correction is
// emitted. Standard German admits several realizations for /r/, word-initial
// <ch> before back vowels, final <-ig> and coda <-er>; flagging them would be
// a false correction even if the acoustic match to the canonical phone is weak.

export type PhonePosition = "word_initial" | "word_internal" | "word_final";

export interface VariantContext {
  word: string;
  expected: string;
  observed?: string;
  position: PhonePosition;
}

export interface VariantVerdict {
  acceptable: boolean;
  note?: string;
}

export function classifyVariant(ctx: VariantContext): VariantVerdict {
  const { word, expected, observed, position } = ctx;
  if (!observed || observed === expected) {
    return { acceptable: true };
  }

  if (R_REALIZATIONS.has(expected) && R_REALIZATIONS.has(observed)) {
    return { acceptable: true, note: "r_realization" };
  }

  if (expected === "ɐ" && observed === "ə" && position === "word_final") {
    return { acceptable: true, note: "er_final_schwa" };
  }
  if (expected === "ə" && observed === "ɐ" && position === "word_final") {
    return { acceptable: true, note: "er_final_schwa" };
  }

  if (expected === "ç" && (observed === "x" || observed === "k")) {
    if (position === "word_initial" && word.startsWith("ch")) {
      return { acceptable: true, note: "word_initial_ch_variant" };
    }
    if (position === "word_final" && word.endsWith("ig")) {
      return { acceptable: true, note: "final_ig_variant" };
    }
  }

  return { acceptable: false };
}

// Word-final devoicing context: the reference already expects the devoiced
// obstruent (G2P applies Auslautverhärtung); the learner error is realizing
// the underlying voiced stop. Detectable from the written form.
export function isFinalDevoicingContext(
  word: string,
  expectedPhone: string,
  position: PhonePosition,
): boolean {
  if (position !== "word_final") return false;
  const lastLetter = word.slice(-1).toLowerCase();
  return (
    FINAL_VOICED_LETTERS.has(lastLetter) &&
    (expectedPhone === "p" || expectedPhone === "t" || expectedPhone === "k")
  );
}

export function phonePositionInWord(phoneIndex: number, phoneCount: number): PhonePosition {
  if (phoneIndex === 0) return "word_initial";
  if (phoneIndex === phoneCount - 1) return "word_final";
  return "word_internal";
}

// Stage 0 reference duration for a vowel, normalized by the speaker's
// articulation rate relative to the reference rate.
export function referenceVowelDurationMs(
  lengthClass: "long" | "short",
  articulationRate: number | null,
): number {
  const base =
    lengthClass === "long"
      ? STAGE0_REFERENCES.long_vowel_ms
      : STAGE0_REFERENCES.short_vowel_ms;
  const factor =
    articulationRate && articulationRate > 0
      ? articulationRate / STAGE0_REFERENCES.reference_articulation_rate
      : 1;
  return base / factor;
}
