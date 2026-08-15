import type { DiagnosticThresholds } from "./profiles.js";
import type {
  AlignedPhone,
  G2pPhone,
  GopPhoneScore,
  VowelAcoustic,
} from "./types.js";
import {
  DEVOICED_TO_VOICED_FINAL,
  FRONT_ROUNDED_VOWELS,
  LENGTH_COUNTERPART,
  STAGE0_REFERENCES,
  UNROUNDED_COUNTERPART,
  vowelLengthClass,
} from "./phones.js";
import {
  classifyVariant,
  isFinalDevoicingContext,
  phonePositionInWord,
  referenceVowelDurationMs,
} from "./variants.js";

// Channel model: each phone gets up to three evidence channels. A correction
// is only "confirmed" when at least two channels independently suspect the
// same realization; a single suspecting channel yields "suspected". Conflict
// is direction-sensitive: GOP accusing a substitution while acoustic evidence
// backs the canonical realization abstains (spec §8.3, §10.3, §13.2).

export type IssueCategory =
  | "phoneme_substitution"
  | "vowel_quantity"
  | "vowel_quality"
  | "front_rounded_vowel"
  | "ich_ach_laut"
  | "final_devoicing";

export type EvidenceChannel = "gop" | "duration" | "formant";

export interface IssueDraft {
  category: IssueCategory;
  status: "confirmed" | "suspected";
  observed: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  feedback_key: string;
  pedagogical_priority: number;
  channels: EvidenceChannel[];
}

// Schema enum mirror: pronunciation-assessment abstention reason codes.
export type AbstentionReasonCode =
  | "audio_quality"
  | "insufficient_speech"
  | "asr_disagreement"
  | "alignment_failed"
  | "alignment_low_confidence"
  | "acceptable_variant_ambiguous"
  | "out_of_calibration_domain"
  | "evidence_conflict"
  | "unsupported_language_feature"
  | "provider_failure";

export interface PhoneDiagnostic {
  phone_id: string;
  word_id: string;
  status: "acceptable" | "issue" | "uncertain";
  gop?: {
    posterior: number;
    confidence: number;
    competitor?: { phone: string; posterior: number };
  };
  vowel_acoustic?: {
    duration_ms: number;
    f2_hz: number | null;
    length_class?: "long" | "short";
  };
  issue?: IssueDraft;
  abstention?: { reason_code: AbstentionReasonCode; message: string };
  variant_note?: string;
}

export interface DiagnosticCase {
  phone_id: string;
  word_id: string;
  word: string;
  phoneIndex: number;
  phoneCount: number;
  phone: AlignedPhone;
  g2pPhone: G2pPhone;
  gop?: GopPhoneScore;
  vowel?: VowelAcoustic;
  articulationRate: number | null;
  wordConfidence: number;
}

type ChannelVerdict = "suspect" | "supports" | "neutral";

interface Channel {
  kind: EvidenceChannel;
  verdict: ChannelVerdict;
  confidence: number;
}

function topCompetitor(gop: GopPhoneScore): { phone: string; posterior: number } | undefined {
  return [...gop.competitors].sort((a, b) => b.posterior - a.posterior)[0];
}

function gopChannel(
  gop: GopPhoneScore,
  competitorWhitelist: readonly string[],
  thresholds: DiagnosticThresholds,
): Channel {
  const competitor = topCompetitor(gop);
  const whitelisted = competitor && competitorWhitelist.includes(competitor.phone);
  if (
    competitor &&
    whitelisted &&
    competitor.posterior - gop.posterior >= thresholds.competitor_margin &&
    competitor.posterior >= thresholds.competitor_confirm_posterior
  ) {
    return { kind: "gop", verdict: "suspect", confidence: competitor.posterior };
  }
  if (gop.posterior >= thresholds.gop_confident_accept) {
    return { kind: "gop", verdict: "supports", confidence: gop.posterior };
  }
  return { kind: "gop", verdict: "neutral", confidence: gop.posterior };
}

function durationChannel(
  lengthClass: "long" | "short",
  vowel: VowelAcoustic,
  articulationRate: number | null,
  thresholds: DiagnosticThresholds,
): Channel {
  if (vowel.duration_ms < thresholds.vowel_duration_min_ms) {
    return { kind: "duration", verdict: "neutral", confidence: 0.4 };
  }
  const reference = referenceVowelDurationMs(lengthClass, articulationRate);
  const ratio = vowel.duration_ms / reference;
  if (lengthClass === "long" && ratio < thresholds.vowel_quantity_short_ratio) {
    return {
      kind: "duration",
      verdict: "suspect",
      confidence: Math.min(1, Math.max(0, 1 - ratio / thresholds.vowel_quantity_short_ratio)),
    };
  }
  if (lengthClass === "short" && ratio > thresholds.vowel_quantity_long_ratio) {
    return {
      kind: "duration",
      verdict: "suspect",
      confidence: Math.min(1, (ratio - 1) / (thresholds.vowel_quantity_long_ratio - 1)),
    };
  }
  return { kind: "duration", verdict: "supports", confidence: 0.7 };
}

function formantChannel(
  vowel: VowelAcoustic,
  thresholds: DiagnosticThresholds,
): Channel {
  if (vowel.f2_hz === null) {
    return { kind: "formant", verdict: "neutral", confidence: 0.4 };
  }
  const midpoint =
    (STAGE0_REFERENCES.front_rounded_f2_hz + STAGE0_REFERENCES.front_unrounded_f2_hz) / 2;
  const offset = thresholds.formant_confirm_offset_hz;
  if (vowel.f2_hz >= midpoint + offset) {
    return {
      kind: "formant",
      verdict: "suspect",
      confidence: Math.min(1, (vowel.f2_hz - midpoint) / 300),
    };
  }
  if (vowel.f2_hz <= midpoint - offset) {
    return { kind: "formant", verdict: "supports", confidence: 0.7 };
  }
  return { kind: "formant", verdict: "neutral", confidence: 0.5 };
}

function fuseConfidences(suspects: Channel[]): number {
  const fused = suspects.reduce((acc, channel) => 1 - (1 - acc) * (1 - channel.confidence), 0.5);
  const singleEvidenceDiscount = 0.75;
  return suspects.length >= 2 ? fused : fused * singleEvidenceDiscount;
}

function draft(
  category: IssueCategory,
  observed: string,
  severity: IssueDraft["severity"],
  confidence: number,
  feedback_key: string,
  pedagogical_priority: number,
  channels: EvidenceChannel[],
): IssueDraft {
  return {
    category,
    status: "suspected",
    observed,
    severity,
    confidence: Math.round(confidence * 100) / 100,
    feedback_key,
    pedagogical_priority,
    channels,
  };
}

function diagnose(
  testCase: DiagnosticCase,
  thresholds: DiagnosticThresholds,
): PhoneDiagnostic {
  const { g2pPhone, phone } = testCase;
  const expected = phone.expected;
  const position = phonePositionInWord(testCase.phoneIndex, testCase.phoneCount);

  const base: PhoneDiagnostic = {
    phone_id: phone.phone_id,
    word_id: testCase.word_id,
    status: "acceptable",
  };
  if (testCase.gop) {
    const competitor = topCompetitor(testCase.gop);
    base.gop = {
      posterior: testCase.gop.posterior,
      confidence: testCase.gop.confidence,
      ...(competitor ? { competitor } : {}),
    };
  }
  const lengthClass = g2pPhone.length_class ?? vowelLengthClass(expected);
  if (testCase.vowel) {
    base.vowel_acoustic = {
      duration_ms: testCase.vowel.duration_ms,
      f2_hz: testCase.vowel.f2_hz,
      ...(lengthClass ? { length_class: lengthClass } : {}),
    };
  }

  if (testCase.wordConfidence < thresholds.word_confidence_floor) {
    return {
      ...base,
      status: "uncertain",
      abstention: {
        reason_code: "alignment_low_confidence",
        message: `Word alignment confidence ${testCase.wordConfidence} below diagnosis floor ${thresholds.word_confidence_floor}.`,
      },
    };
  }

  if (!testCase.gop || testCase.gop.confidence < thresholds.gop_confidence_floor) {
    return {
      ...base,
      status: "uncertain",
      abstention: {
        reason_code: "evidence_conflict",
        message: testCase.gop
          ? `GOP scorer confidence ${testCase.gop.confidence} below floor ${thresholds.gop_confidence_floor}.`
          : "No GOP score available for this phone.",
      },
    };
  }

  const gop = testCase.gop;
  const competitor = topCompetitor(gop);

  // Acceptable variant layer runs before any correction (spec §10.3).
  if (competitor) {
    const variant = classifyVariant({
      word: testCase.word,
      expected,
      observed: competitor.phone,
      position,
    });
    if (variant.acceptable) {
      return { ...base, status: "acceptable", variant_note: variant.note };
    }
  }

  const channels: Channel[] = [];
  let issue: IssueDraft | undefined;

  if (FRONT_ROUNDED_VOWELS.has(expected)) {
    const unrounded = UNROUNDED_COUNTERPART[expected];
    const gopCh = gopChannel(gop, [unrounded], thresholds);
    const formantCh = testCase.vowel
      ? formantChannel(testCase.vowel, thresholds)
      : { kind: "formant" as const, verdict: "neutral" as const, confidence: 0.4 };
    channels.push(gopCh, formantCh);
    issue = draft(
      "front_rounded_vowel",
      competitor?.phone === unrounded ? unrounded : "unrounded realization",
      "medium",
      fuseConfidences(channels.filter((c) => c.verdict === "suspect")),
      "de.front_rounded_vowel.round_and_protrude",
      70,
      channels.filter((c) => c.verdict === "suspect").map((c) => c.kind),
    );
  } else if (lengthClass && testCase.vowel) {
    const counterpart = LENGTH_COUNTERPART[expected];
    const gopCh = gopChannel(gop, counterpart ? [counterpart] : [], thresholds);
    const durationCh = durationChannel(lengthClass, testCase.vowel, testCase.articulationRate, thresholds);
    channels.push(gopCh, durationCh);
    const shortened = lengthClass === "long";
    issue = draft(
      "vowel_quantity",
      competitor?.phone === counterpart ? counterpart : shortened ? "short vowel realization" : "over-long realization",
      shortened ? "medium" : "low",
      fuseConfidences(channels.filter((c) => c.verdict === "suspect")),
      shortened
        ? "de.vowel_quantity.lengthen_and_hold_quality"
        : "de.vowel_quantity.shorten_and_sharpen",
      shortened ? 80 : 40,
      channels.filter((c) => c.verdict === "suspect").map((c) => c.kind),
    );
  } else if (expected === "ç" || expected === "x") {
    const suspects = expected === "ç" ? ["x", "ʃ"] : ["ç"];
    const gopCh = gopChannel(gop, suspects, thresholds);
    channels.push(gopCh);
    const observed = competitor?.phone;
    const feedback_key =
      observed === "ʃ"
        ? "de.ich_ach_laut.no_sh"
        : expected === "ç"
          ? "de.ich_ach_laut.front_palatal"
          : "de.ich_ach_laut.back_velar";
    issue = draft(
      "ich_ach_laut",
      observed ?? "non-canonical fricative",
      "medium",
      fuseConfidences(channels.filter((c) => c.verdict === "suspect")),
      feedback_key,
      observed === "ʃ" ? 75 : 70,
      channels.filter((c) => c.verdict === "suspect").map((c) => c.kind),
    );
  } else if (isFinalDevoicingContext(testCase.word, expected, position)) {
    const voiced = DEVOICED_TO_VOICED_FINAL[expected];
    const gopCh = gopChannel(gop, voiced ? [voiced] : [], thresholds);
    channels.push(gopCh);
    issue = draft(
      "final_devoicing",
      competitor?.phone === voiced ? voiced : "voiced final obstruent",
      "medium",
      fuseConfidences(channels.filter((c) => c.verdict === "suspect")),
      "de.final_devoicing.unvoice_final_stop",
      65,
      channels.filter((c) => c.verdict === "suspect").map((c) => c.kind),
    );
  } else {
    const gopCh = gopChannel(gop, competitor ? [competitor.phone] : [], thresholds);
    channels.push(gopCh);
    issue = draft(
      "phoneme_substitution",
      competitor?.phone ?? "unexpected realization",
      "low",
      fuseConfidences(channels.filter((c) => c.verdict === "suspect")),
      "de.phoneme_substitution.focus_target",
      50,
      channels.filter((c) => c.verdict === "suspect").map((c) => c.kind),
    );
  }

  const suspects = channels.filter((c) => c.verdict === "suspect");
  const gopAccuses = channels.some((c) => c.kind === "gop" && c.verdict === "suspect");
  const acousticsBackCanonical = channels.some(
    (c) => c.kind !== "gop" && c.verdict === "supports",
  );

  if (suspects.length === 0) {
    return { ...base, status: "acceptable" };
  }

  // Direction-sensitive conflict: GOP accuses a substitution while the
  // independent acoustic evidence backs the canonical realization — both
  // cannot be right, so abstain. The reverse is NOT a conflict: a GOP
  // posterior validating the phoneme identity does not certify its duration
  // or rounding, so a single acoustic flag stays "suspected".
  if (gopAccuses && acousticsBackCanonical) {
    return {
      ...base,
      status: "uncertain",
      abstention: {
        reason_code: "evidence_conflict",
        message: `GOP and acoustic evidence disagree for '${expected}'.`,
      },
    };
  }

  if (suspects.length >= 2 && issue && issue.confidence >= thresholds.issue_confirm_confidence) {
    return { ...base, status: "issue", issue: { ...issue, status: "confirmed" } };
  }

  if (suspects.length >= 2 && issue) {
    return { ...base, status: "issue", issue };
  }

  return { ...base, status: "issue", issue };
}

export { diagnose };
