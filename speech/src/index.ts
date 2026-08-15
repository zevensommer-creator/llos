export { assessPronunciation, SPEECH_PIPELINE_VERSION } from "./assess.js";
export { evaluateAudioQuality } from "./audio-quality.js";
export type { QualityGateResult, QualityVerdict } from "./audio-quality.js";
export { matchContent, normalizeGermanText } from "./asr-match.js";
export { calibrateGerman, GERMAN_CALIBRATOR_DESCRIPTOR } from "./calibration.js";
export type { CalibrationInput, CalibrationOutput, DimensionRoll } from "./calibration.js";
export { diagnose } from "./diagnostics.js";
export type {
  DiagnosticCase,
  IssueCategory,
  IssueDraft,
  PhoneDiagnostic,
} from "./diagnostics.js";
export {
  classifyVariant,
  isFinalDevoicingContext,
  phonePositionInWord,
  referenceVowelDurationMs,
} from "./variants.js";
export type { PhonePosition, VariantContext, VariantVerdict } from "./variants.js";
export {
  DEVOICED_TO_VOICED_FINAL,
  FRONT_ROUNDED_VOWELS,
  LENGTH_COUNTERPART,
  R_REALIZATIONS,
  STAGE0_REFERENCES,
  UNROUNDED_COUNTERPART,
  VOWELS,
  VOWEL_LENGTH_CLASS,
  vowelLengthClass,
} from "./phones.js";
export {
  findLanguageProfile,
  GERMAN_PROFILE,
} from "./profiles.js";
export type {
  DiagnosticThresholds,
  LanguageProfile,
  Stage0Thresholds,
} from "./profiles.js";
export { GermanG2p, GERMAN_G2P_DESCRIPTOR } from "./g2p/german.js";
export {
  fakeDescriptor,
  makeFakeAligner,
  makeFakeAnalyzer,
  makeFakeAsr,
  makeFakeGop,
  makeFakeProsody,
  makeFakeVad,
} from "./engines/fakes.js";
export type {
  FakeAlignerScript,
  FakeAnalyzerScript,
  FakeAsrScript,
  FakeGopOverride,
  FakeGopScript,
  FakeProsodyScript,
  FakeVadScript,
} from "./engines/fakes.js";
export { contentHash, canonicalJson } from "./hash.js";
export type {
  AlignedPhone,
  AlignedWord,
  AlignResult,
  AlignerPort,
  AsrHypothesis,
  AsrPort,
  AsrResult,
  AssessInput,
  AssessOptions,
  AudioAnalyzerPort,
  AudioArtifact,
  AudioMeasurements,
  G2pPhone,
  G2pPort,
  G2pResult,
  G2pWord,
  GopCompetitor,
  GopPhoneScore,
  GopPort,
  GopResult,
  PronunciationMode,
  ProsodyPort,
  ProsodyResult,
  SpeechComponentDescriptor,
  SpeechEngine,
  SpeechRole,
  VadPort,
  VadResult,
  VowelAcoustic,
} from "./types.js";
