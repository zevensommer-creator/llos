// Shared German phone inventory: single source of truth for G2P length
// classes, diagnostic target sets and fake acoustic references.

export const VOWEL_LENGTH_CLASS: Record<string, "long" | "short"> = {
  "iː": "long", "ɪ": "short",
  "yː": "long", "ʏ": "short",
  "uː": "long", "ʊ": "short",
  "eː": "long", "ɛ": "short", "ɛː": "long",
  "øː": "long", "œ": "short",
  "oː": "long", "ɔ": "short",
  "aː": "long", "a": "short", "ə": "short", "ɐ": "short",
};

export function vowelLengthClass(symbol: string): "long" | "short" | undefined {
  return VOWEL_LENGTH_CLASS[symbol];
}

export const VOWELS = new Set(Object.keys(VOWEL_LENGTH_CLASS));

export const FRONT_ROUNDED_VOWELS = new Set(["yː", "ʏ", "øː", "œ"]);

export const UNROUNDED_COUNTERPART: Record<string, string> = {
  "yː": "iː",
  "ʏ": "ɪ",
  "øː": "eː",
  "œ": "ɛ",
};

export const LENGTH_COUNTERPART: Record<string, string> = {
  "iː": "ɪ", "ɪ": "iː",
  "yː": "ʏ", "ʏ": "yː",
  "uː": "ʊ", "ʊ": "uː",
  "eː": "ɛ", "ɛ": "eː",
  "oː": "ɔ", "ɔ": "oː",
  "øː": "œ", "œ": "øː",
  "aː": "a", "a": "aː",
};

export const R_REALIZATIONS = new Set(["ʁ", "r", "ʀ", "ɐ", "ʁ̞"]);

export const VOICED_TO_DEVOICED_FINAL: Record<string, string> = {
  b: "p", d: "t", g: "k",
};

export const DEVOICED_TO_VOICED_FINAL: Record<string, string> = {
  p: "b", t: "d", k: "g",
};

export const FINAL_VOICED_LETTERS = new Set(["b", "d", "g"]);

// Stage 0 reference distributions for read-aloud German. Deliberately coarse:
// they only gate suspicion; confirmation always needs a second, independent
// evidence source (spec §10.3, §10.4 Stage 0).
export const STAGE0_REFERENCES = {
  long_vowel_ms: 110,
  short_vowel_ms: 65,
  reference_articulation_rate: 12.0,
  front_rounded_f2_hz: 1850,
  front_unrounded_f2_hz: 2150,
} as const;
