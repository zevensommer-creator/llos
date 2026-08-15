export { assessPronunciation, SPEECH_PIPELINE_VERSION } from "./assess.js";
export { evaluateAudioQuality } from "./audio-quality.js";
export type { QualityGateResult, QualityVerdict } from "./audio-quality.js";
export { matchContent, normalizeGermanText } from "./asr-match.js";
export {
  findLanguageProfile,
  GERMAN_PROFILE,
} from "./profiles.js";
export type { LanguageProfile, Stage0Thresholds } from "./profiles.js";
export { GermanG2p, GERMAN_G2P_DESCRIPTOR } from "./g2p/german.js";
export {
  fakeDescriptor,
  makeFakeAligner,
  makeFakeAnalyzer,
  makeFakeAsr,
  makeFakeVad,
} from "./engines/fakes.js";
export type {
  FakeAlignerScript,
  FakeAnalyzerScript,
  FakeAsrScript,
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
  PronunciationMode,
  SpeechComponentDescriptor,
  SpeechEngine,
  SpeechRole,
  VadPort,
  VadResult,
} from "./types.js";
