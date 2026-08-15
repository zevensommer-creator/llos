export interface ArtifactRef {
  uri: string;
  sha256: string;
  media_type: string;
}

export type SpeechRole = "vad" | "asr" | "g2p" | "alignment" | "calibration";

export interface SpeechComponentDescriptor {
  component_ref: string;
  role: SpeechRole;
  provider_id: string;
  model_id: string;
  model_version: string;
  configuration_sha256?: string;
}

export interface AudioArtifact {
  uri: string;
  sha256: string;
  media_type: string;
  duration_ms: number;
  channel_count: number;
  sample_rate_hz: number;
}

export interface AudioMeasurements {
  snr_db: number | null;
  clipping_ratio: number;
  extra_quality_flags: readonly ("multiple_speakers" | "music" | "unsupported_format")[];
}

export interface VadResult {
  segments: { start_ms: number; end_ms: number }[];
  speech_duration_ms: number;
  silence_ratio: number;
  uncertain: boolean;
}

export interface AsrHypothesis {
  text: string;
  rank: number;
  confidence: number;
}

export interface AsrResult {
  status: "completed" | "partial" | "failed" | "not_run";
  hypotheses: AsrHypothesis[];
}

export interface G2pPhone {
  symbol: string;
  length_class?: "long" | "short";
  stress_syllable?: number;
  uncertain?: boolean;
}

export interface G2pWord {
  text: string;
  phones: G2pPhone[];
  stress_syllable?: number;
  from_lexicon: boolean;
  uncertain?: boolean;
}

export interface G2pResult {
  words: G2pWord[];
  graph_ref: ArtifactRef;
}

export interface AlignedPhone {
  phone_id: string;
  expected: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface AlignedWord {
  word_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  alignment_confidence: number;
  phones: AlignedPhone[];
}

export interface AlignResult {
  status: "completed" | "partial" | "failed";
  coverage: number;
  mean_confidence: number | null;
  words: AlignedWord[];
  failure_code?: string;
}

export interface AudioAnalyzerPort {
  descriptor: SpeechComponentDescriptor;
  measure(audio: AudioArtifact): AudioMeasurements;
}

export interface VadPort {
  descriptor: SpeechComponentDescriptor;
  detect(audio: AudioArtifact): VadResult;
}

export interface AsrPort {
  descriptor: SpeechComponentDescriptor;
  transcribe(audio: AudioArtifact, language: string): AsrResult;
}

export interface G2pPort {
  descriptor: SpeechComponentDescriptor;
  toPronunciation(normalizedText: string): G2pResult;
}

export interface AlignerPort {
  descriptor: SpeechComponentDescriptor;
  align(
    audio: AudioArtifact,
    words: G2pWord[],
    recognizedText: string,
  ): AlignResult;
}

export interface SpeechEngine {
  analyzer: AudioAnalyzerPort;
  vad: VadPort;
  asr: AsrPort;
  g2p: G2pPort;
  aligner: AlignerPort;
}

export type PronunciationMode =
  | "read_aloud"
  | "shadowing"
  | "constrained_response"
  | "open_speech";

export interface AssessInput {
  audio: AudioArtifact;
  reference: {
    reference_type: "exact_text" | "answer_graph" | "resolved_transcript";
    text: string;
  };
  language: string;
  mode: PronunciationMode;
  session_id: string;
  activity_id: string;
  learner_l1_group?: string;
  device_class?: string;
}

export interface AssessOptions {
  clock?: () => string;
  seed?: number;
}
