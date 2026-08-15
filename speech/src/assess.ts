import { assertValid, type PronunciationAssessment } from "@llos/contracts";
import { contentHash } from "./hash.js";
import { evaluateAudioQuality } from "./audio-quality.js";
import { matchContent, normalizeGermanText } from "./asr-match.js";
import { calibrateGerman } from "./calibration.js";
import type { PhoneDiagnostic } from "./diagnostics.js";
import { findLanguageProfile, type LanguageProfile } from "./profiles.js";
import type {
  AlignResult,
  AsrResult,
  AssessInput,
  AssessOptions,
  GopResult,
  ProsodyResult,
  SpeechEngine,
} from "./types.js";

export const SPEECH_PIPELINE_VERSION = "0.1.0";

type AbstentionReason =
  | "audio_quality"
  | "insufficient_speech"
  | "asr_disagreement"
  | "alignment_failed"
  | "alignment_low_confidence"
  | "unsupported_language_feature"
  | "provider_failure";

interface AssemblyContext {
  input: AssessInput;
  seed: number;
  clock: () => string;
  assessment_id: string;
  input_hash: string;
  profile?: LanguageProfile;
  graph_ref: PronunciationAssessment["reference"]["pronunciation_graph_ref"];
  audio_quality: PronunciationAssessment["audio_quality"];
}

function evidenceNumber(
  evidence_id: string,
  kind: PronunciationAssessment["evidence"][number]["kind"],
  value: number,
  unit: string,
  confidence: number,
  source: string,
  target_ref?: string,
): PronunciationAssessment["evidence"][number] {
  return {
    evidence_id,
    kind,
    value: { kind: "number", number: value },
    unit,
    confidence,
    source_component_ref: source,
    ...(target_ref ? { target_ref } : {}),
  };
}

function dimensionsAbstained(
  abstentionId: string,
): PronunciationAssessment["dimensions"] {
  const dims = ["phoneme_accuracy", "completeness"].map((id) => ({
    id,
    status: "abstained" as const,
    confidence: 0,
    evidence_refs: [],
    abstention_ref: abstentionId,
  }));
  return dims as unknown as PronunciationAssessment["dimensions"];
}

function emptyRecognition(): PronunciationAssessment["recognition"] {
  return { status: "not_run", hypotheses: [] };
}

function notApplicableAlignment(): PronunciationAssessment["alignment"] {
  return { status: "not_applicable", coverage: 0, mean_confidence: null };
}

function assembleBase(ctx: AssemblyContext): PronunciationAssessment {
  const profile = ctx.profile;
  return {
    schema_version: "0.2.0",
    assessment_id: ctx.assessment_id,
    session_id: ctx.input.session_id,
    activity_id: ctx.input.activity_id,
    created_at: ctx.clock(),
    language: ctx.input.language,
    mode: ctx.input.mode,
    status: "abstained",
    audio_ref: {
      uri: ctx.input.audio.uri,
      sha256: ctx.input.audio.sha256,
      media_type: ctx.input.audio.media_type,
      duration_ms: ctx.input.audio.duration_ms,
    },
    audio_quality: ctx.audio_quality,
    reference: {
      reference_type: ctx.input.reference.reference_type,
      text: ctx.input.reference.text,
      normalized_text: normalizeGermanText(ctx.input.reference.text),
      pronunciation_graph_ref: ctx.graph_ref,
      language_profile_ref: profile
        ? `artifact://language-profiles/${profile.language}/${profile.profile_version}`
        : `artifact://language-profiles/${ctx.input.language}/none`,
      acceptable_variant_policy_version: profile
        ? profile.acceptable_variant_policy_version
        : "0.0.0",
    },
    recognition: emptyRecognition(),
    alignment: notApplicableAlignment(),
    dimensions: [] as unknown as PronunciationAssessment["dimensions"],
    words: [],
    evidence: [],
    issues: [],
    abstentions: [],
    calibration: {
      language_profile_id: profile?.profile_id ?? "language-profile.none",
      language_profile_version: profile?.profile_version ?? "0.0.0",
      calibrator_id: profile?.calibrator_id ?? "calibrator.none",
      calibrator_version: profile?.calibrator_version ?? "0.0.0",
      threshold_set_version: profile?.threshold_set_version ?? "0.0.0",
      domain_status: profile ? profile.domain_status : "unknown",
      ...(ctx.input.learner_l1_group
        ? { learner_l1_group: ctx.input.learner_l1_group }
        : {}),
      ...(ctx.input.device_class ? { device_class: ctx.input.device_class } : {}),
    },
    component_versions: [] as unknown as PronunciationAssessment["component_versions"],
    provenance: {
      pipeline_version: SPEECH_PIPELINE_VERSION,
      input_sha256: ctx.input_hash,
      random_seed: ctx.seed,
      started_at: ctx.clock(),
      finished_at: ctx.clock(),
      usage: { latency_ms: 0, cpu_seconds: 0, gpu_seconds: 0, cost_usd: 0 },
    },
  };
}

function attachComponents(
  assessment: PronunciationAssessment,
  engine: SpeechEngine,
  profile?: LanguageProfile,
): void {
  const seen = new Set<string>();
  const descriptors = [
    engine.analyzer.descriptor,
    engine.vad.descriptor,
    engine.asr.descriptor,
    engine.g2p.descriptor,
    engine.aligner.descriptor,
    ...(engine.gop ? [engine.gop.descriptor] : []),
    ...(engine.prosody ? [engine.prosody.descriptor] : []),
  ];
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.component_ref)) continue;
    seen.add(descriptor.component_ref);
    assessment.component_versions.push({
      component_ref: descriptor.component_ref,
      role: descriptor.role,
      provider_id: descriptor.provider_id,
      model_id: descriptor.model_id,
      model_version: descriptor.model_version,
    });
  }
  if (profile) {
    assessment.component_versions.push({
      component_ref: profile.calibrator_id,
      role: "calibration",
      provider_id: "provider.llos.local",
      model_id: profile.calibrator_id,
      model_version: profile.calibrator_version,
    });
  }
}

function abstain(
  ctx: AssemblyContext,
  engine: SpeechEngine,
  reason: AbstentionReason,
  message: string,
  evidence: PronunciationAssessment["evidence"],
): PronunciationAssessment {
  const assessment = assembleBase(ctx);
  const abstention_id = `abs.${reason}`;
  assessment.abstentions.push({
    abstention_id,
    scope: "assessment",
    reason_code: reason,
    message,
    ...(evidence.length > 0
      ? { evidence_refs: evidence.map((item) => item.evidence_id) }
      : {}),
  });
  assessment.evidence.push(...evidence);
  assessment.dimensions = dimensionsAbstained(abstention_id);
  attachComponents(assessment, engine, ctx.profile);
  return assessment;
}

function failAssessment(
  ctx: AssemblyContext,
  engine: SpeechEngine,
  code: string,
  message: string,
): PronunciationAssessment {
  const assessment = assembleBase(ctx);
  assessment.status = "failed";
  assessment.diagnostics = [{ code, severity: "error", message, retryable: true }];
  const abstention_id = "abs.provider_failure";
  assessment.abstentions.push({
    abstention_id,
    scope: "assessment",
    reason_code: "provider_failure",
    message,
  });
  assessment.dimensions = dimensionsAbstained(abstention_id);
  attachComponents(assessment, engine, ctx.profile);
  return assessment;
}

export function assessPronunciation(
  input: AssessInput,
  engine: SpeechEngine,
  options: AssessOptions = {},
): PronunciationAssessment {
  const clock = options.clock ?? (() => new Date().toISOString());
  const seed = options.seed ?? 0;
  const assessment_id = `assessment.${contentHash({ input, seed }).slice(0, 16)}`;
  const input_hash = contentHash(input);

  const measurements = engine.analyzer.measure(input.audio);
  const vad = engine.vad.detect(input.audio);
  const profile = findLanguageProfile(input.language);

  const rawGraphHash = contentHash({
    language: input.language,
    text: input.reference.text,
  });
  const graph_ref = profile
    ? engine.g2p.toPronunciation(normalizeGermanText(input.reference.text)).graph_ref
    : {
        uri: `artifact://pronunciation-graphs/${input.language}/raw-${rawGraphHash.slice(0, 12)}`,
        sha256: rawGraphHash,
        media_type: "application/json",
      };

  const thresholds = profile?.thresholds;
  const gate = thresholds
    ? evaluateAudioQuality(input.audio, measurements, vad, thresholds)
    : {
        quality: {
          status: "degraded" as const,
          speech_duration_ms: vad.speech_duration_ms,
          snr_db: measurements.snr_db,
          clipping_ratio: measurements.clipping_ratio,
          silence_ratio: vad.silence_ratio,
          channel_count: input.audio.channel_count,
          sample_rate_hz: input.audio.sample_rate_hz,
        },
        verdict: "degraded" as const,
        has_speech: vad.segments.length > 0,
      };

  const ctx: AssemblyContext = {
    input,
    seed,
    clock,
    assessment_id,
    input_hash,
    profile,
    graph_ref,
    audio_quality: gate.quality,
  };

  const qualityEvidence = [
    evidenceNumber(
      "ev.quality.snr",
      "audio_quality",
      measurements.snr_db ?? vad.speech_duration_ms,
      measurements.snr_db !== null ? "dB" : "ms",
      measurements.snr_db !== null ? 0.9 : 0.5,
      engine.vad.descriptor.component_ref,
    ),
  ];

  if (!profile) {
    return finalize(
      abstain(
        ctx,
        engine,
        "unsupported_language_feature",
        `No calibrated language profile for '${input.language}' in pipeline ${SPEECH_PIPELINE_VERSION}.`,
        qualityEvidence,
      ),
    );
  }

  if (!profile.supported_modes.includes(input.mode as "read_aloud" | "shadowing")) {
    return finalize(
      abstain(
        ctx,
        engine,
        "unsupported_language_feature",
        `Mode '${input.mode}' is not supported for ${profile.language} in pipeline ${SPEECH_PIPELINE_VERSION}.`,
        qualityEvidence,
      ),
    );
  }

  if (gate.verdict === "rejected") {
    const reason: AbstentionReason = gate.has_speech ? "audio_quality" : "insufficient_speech";
    const message = gate.has_speech
      ? `Audio quality gate rejected the recording (flags: ${(gate.quality.quality_flags ?? []).join(", ") || "none"}).`
      : "No speech segment detected by VAD.";
    return finalize(abstain(ctx, engine, reason, message, qualityEvidence));
  }

  const asr = engine.asr.transcribe(input.audio, profile.language);
  if (asr.status === "failed") {
    const failed = failAssessment(
      ctx,
      engine,
      "ASR_PROVIDER_FAILURE",
      "ASR engine failed to transcribe the recording.",
    );
    failed.recognition = { status: "failed", hypotheses: [] };
    return finalize(failed);
  }

  const match = matchContent(input.reference.text, asr.hypotheses[0]?.text ?? "");
  const asrEvidence = [
    ...qualityEvidence,
    evidenceNumber(
      "ev.asr.confidence",
      "asr_hypothesis",
      asr.hypotheses[0]?.confidence ?? 0,
      "probability",
      asr.hypotheses[0]?.confidence ?? 0,
      engine.asr.descriptor.component_ref,
    ),
  ];

  if (match.completeness < profile.thresholds.min_completeness) {
    return finalize(
      abstain(
        ctx,
        engine,
        "asr_disagreement",
        `Recognized text matches the reference at ${match.completeness}, below the Stage 0 floor of ${profile.thresholds.min_completeness}.`,
        asrEvidence,
      ),
    );
  }

  const g2p = engine.g2p.toPronunciation(normalizeGermanText(input.reference.text));
  const alignment = engine.aligner.align(
    input.audio,
    g2p.words,
    asr.hypotheses[0]?.text ?? "",
  );

  if (alignment.status === "failed") {
    return finalize(
      abstain(
        ctx,
        engine,
        "alignment_failed",
        `Forced alignment failed (${alignment.failure_code ?? "UNKNOWN"}).`,
        asrEvidence,
      ),
    );
  }

  const alignmentEvidence = [
    ...asrEvidence,
    evidenceNumber(
      "ev.alignment.coverage",
      "alignment",
      alignment.coverage,
      "ratio",
      alignment.mean_confidence ?? 0,
      engine.aligner.descriptor.component_ref,
    ),
  ];

  if (
    alignment.coverage < profile.thresholds.min_alignment_coverage ||
    (alignment.mean_confidence ?? 0) < profile.thresholds.min_alignment_mean_confidence
  ) {
    return finalize(
      abstain(
        ctx,
        engine,
        "alignment_low_confidence",
        `Alignment coverage ${alignment.coverage} / mean confidence ${alignment.mean_confidence} below Stage 0 floors (${profile.thresholds.min_alignment_coverage} / ${profile.thresholds.min_alignment_mean_confidence}).`,
        alignmentEvidence,
      ),
    );
  }

  if (!engine.gop || !engine.prosody) {
    return finalize(assembleCompleted(ctx, engine, alignment, asr, match));
  }

  const gop = engine.gop.score(input.audio, alignment);
  const prosody = engine.prosody.analyze(input.audio, alignment);

  if (gop.status === "failed") {
    return finalize(
      assembleCompleted(ctx, engine, alignment, asr, match, {
        phonemeAbstainReason: "provider_failure",
        phonemeAbstainMessage: `GOP scorer failed (${gop.failure_code ?? "GOP_FAILED"}); phoneme accuracy abstained.`,
      }),
    );
  }

  return finalize(
    assembleDiagnosed(ctx, engine, alignment, asr, match, gop, prosody),
  );
}

interface LegacyOptions {
  phonemeAbstainReason?: AbstentionReason;
  phonemeAbstainMessage?: string;
}

function assembleCompleted(
  ctx: AssemblyContext,
  engine: SpeechEngine,
  alignment: AlignResult,
  asr: AsrResult,
  match: ReturnType<typeof matchContent>,
  options: LegacyOptions = {},
): PronunciationAssessment {
  const assessment = assembleTracked(ctx, engine, alignment, asr, match);

  const gopAbstentionId = "abs.phoneme-accuracy.no-gop";
  assessment.abstentions.push({
    abstention_id: gopAbstentionId,
    scope: "dimension",
    target_ref: "phoneme_accuracy",
    reason_code: options.phonemeAbstainReason ?? "unsupported_language_feature",
    message:
      options.phonemeAbstainMessage ??
      `Engine provides no GOP/prosody scorers; phoneme accuracy abstained (pipeline ${SPEECH_PIPELINE_VERSION}).`,
  });
  assessment.dimensions = [
    {
      id: "phoneme_accuracy",
      status: "abstained",
      confidence: 0,
      evidence_refs: ["ev.alignment.coverage"],
      abstention_ref: gopAbstentionId,
    },
    {
      id: "completeness",
      status: "scored",
      score: Math.round(match.completeness * 100),
      confidence: asr.hypotheses[0]?.confidence ?? 0,
      evidence_refs: ["ev.asr.confidence"],
    },
  ];

  const minWordConfidence = ctx.profile?.thresholds.min_word_alignment_confidence ?? 0.5;
  assessment.words = alignment.words.map((word) => ({
    word_id: word.word_id,
    text: word.text,
    interval: { start_ms: word.start_ms, end_ms: word.end_ms },
    alignment_confidence: word.alignment_confidence,
    phones: word.phones.map((phone) => ({
      phone_id: phone.phone_id,
      expected: phone.expected,
      interval: { start_ms: phone.start_ms, end_ms: phone.end_ms },
      status:
        word.alignment_confidence < minWordConfidence ? "not_aligned" : "uncertain",
      confidence: phone.confidence,
      evidence_refs: ["ev.alignment.coverage"],
    })),
    issue_refs: [],
  }));

  attachComponents(assessment, engine, ctx.profile);
  return assessment;
}

function assembleTracked(
  ctx: AssemblyContext,
  engine: SpeechEngine,
  alignment: AlignResult,
  asr: AsrResult,
  match: ReturnType<typeof matchContent>,
): PronunciationAssessment {
  const assessment = assembleBase(ctx);
  assessment.status = "partial";
  assessment.recognition = {
    status: asr.status,
    hypotheses: asr.hypotheses,
    content_match: match,
  };

  const alignmentArtifactHash = contentHash(alignment.words);
  assessment.alignment = {
    status: alignment.status,
    coverage: alignment.coverage,
    mean_confidence: alignment.mean_confidence,
    artifact_ref: {
      uri: `artifact://alignments/${ctx.input.session_id}/${alignmentArtifactHash.slice(0, 16)}`,
      sha256: alignmentArtifactHash,
      media_type: "application/json",
    },
  };

  assessment.evidence.push(
    evidenceNumber(
      "ev.quality.snr",
      "audio_quality",
      ctx.audio_quality.snr_db ?? ctx.audio_quality.speech_duration_ms,
      ctx.audio_quality.snr_db !== null ? "dB" : "ms",
      0.9,
      engine.vad.descriptor.component_ref,
    ),
    evidenceNumber(
      "ev.asr.confidence",
      "asr_hypothesis",
      asr.hypotheses[0]?.confidence ?? 0,
      "probability",
      asr.hypotheses[0]?.confidence ?? 0,
      engine.asr.descriptor.component_ref,
    ),
    evidenceNumber(
      "ev.alignment.coverage",
      "alignment",
      alignment.coverage,
      "ratio",
      alignment.mean_confidence ?? 0,
      engine.aligner.descriptor.component_ref,
    ),
  );
  return assessment;
}

interface DiagnosticEvidenceIds {
  gop: string;
  ctc?: string;
  duration?: string;
  formant?: string;
}

function evidenceIdsFor(diagnostic: PhoneDiagnostic): DiagnosticEvidenceIds {
  return {
    gop: `ev.gop.${diagnostic.phone_id}`,
    ...(diagnostic.gop?.competitor
      ? { ctc: `ev.ctc.${diagnostic.phone_id}` }
      : {}),
    ...(diagnostic.vowel_acoustic
      ? {
          duration: `ev.duration.${diagnostic.phone_id}`,
          ...(diagnostic.vowel_acoustic.f2_hz !== null
            ? { formant: `ev.formant.${diagnostic.phone_id}` }
            : {}),
        }
      : {}),
  };
}

function assembleDiagnosed(
  ctx: AssemblyContext,
  engine: SpeechEngine,
  alignment: AlignResult,
  asr: AsrResult,
  match: ReturnType<typeof matchContent>,
  gop: GopResult,
  prosody: ProsodyResult,
): PronunciationAssessment {
  const assessment = assembleTracked(ctx, engine, alignment, asr, match);

  const g2p = engine.g2p.toPronunciation(normalizeGermanText(ctx.input.reference.text));
  const calibration = calibrateGerman({
    profile: ctx.profile!,
    alignment,
    g2pWords: g2p.words,
    gop,
    prosody,
  });

  const gopSource = engine.gop!.descriptor.component_ref;
  const prosodySource = engine.prosody!.descriptor.component_ref;
  const phoneById = new Map(
    calibration.diagnostics.map((item) => [item.phone_id, item]),
  );

  for (const diagnostic of calibration.diagnostics) {
    if (diagnostic.gop) {
      assessment.evidence.push(
        evidenceNumber(
          `ev.gop.${diagnostic.phone_id}`,
          "gop",
          diagnostic.gop.posterior,
          "probability",
          diagnostic.gop.confidence,
          gopSource,
          diagnostic.phone_id,
        ),
      );
      if (diagnostic.gop.competitor) {
        assessment.evidence.push(
          evidenceNumber(
            `ev.ctc.${diagnostic.phone_id}`,
            "ctc_posterior",
            diagnostic.gop.competitor.posterior,
            "probability",
            diagnostic.gop.confidence,
            gopSource,
            diagnostic.phone_id,
          ),
        );
      }
    }
    if (diagnostic.vowel_acoustic) {
      assessment.evidence.push(
        evidenceNumber(
          `ev.duration.${diagnostic.phone_id}`,
          "duration",
          diagnostic.vowel_acoustic.duration_ms,
          "ms",
          0.8,
          prosodySource,
          diagnostic.phone_id,
        ),
      );
      if (diagnostic.vowel_acoustic.f2_hz !== null) {
        assessment.evidence.push(
          evidenceNumber(
            `ev.formant.${diagnostic.phone_id}`,
            "formant",
            diagnostic.vowel_acoustic.f2_hz,
            "Hz",
            0.7,
            prosodySource,
            diagnostic.phone_id,
          ),
        );
      }
    }
  }

  const issueIdsByPhone = new Map<string, string[]>();
  let issueCounter = 0;
  const alignedPhones = alignment.words.flatMap((word) => word.phones);
  for (const diagnostic of calibration.diagnostics) {
    if (diagnostic.status !== "issue" || !diagnostic.issue) continue;
    const alignedPhone = alignedPhones.find(
      (phone) => phone.phone_id === diagnostic.phone_id,
    );
    if (!alignedPhone) continue;
    issueCounter += 1;
    const issue_id = `issue.${issueCounter}.${diagnostic.issue.category}`;
    const ids = evidenceIdsFor(diagnostic);
    const refs: string[] = [];
    if (diagnostic.issue.channels.includes("gop")) {
      refs.push(ids.gop);
      if (ids.ctc) refs.push(ids.ctc);
    }
    if (diagnostic.issue.channels.includes("duration") && ids.duration) {
      refs.push(ids.duration);
    }
    if (diagnostic.issue.channels.includes("formant") && ids.formant) {
      refs.push(ids.formant);
    }
    const evidence_refs: [string, ...string[]] =
      refs.length > 0 ? [refs[0]!, ...refs.slice(1)] : ["ev.alignment.coverage"];
    assessment.issues.push({
      issue_id,
      category: diagnostic.issue.category,
      status: diagnostic.issue.status,
      severity: diagnostic.issue.severity,
      target: alignedPhone.expected,
      observed: diagnostic.issue.observed,
      location: { start_ms: alignedPhone.start_ms, end_ms: alignedPhone.end_ms },
      word_ref: diagnostic.word_id,
      phone_ref: diagnostic.phone_id,
      confidence: diagnostic.issue.confidence,
      evidence_refs,
      feedback_key: diagnostic.issue.feedback_key,
      pedagogical_priority: diagnostic.issue.pedagogical_priority,
    });
    issueIdsByPhone.set(diagnostic.phone_id, [
      ...(issueIdsByPhone.get(diagnostic.phone_id) ?? []),
      issue_id,
    ]);
  }

  for (const diagnostic of calibration.diagnostics) {
    if (!diagnostic.abstention) continue;
    assessment.abstentions.push({
      abstention_id: `abs.${diagnostic.phone_id}.${diagnostic.abstention.reason_code}`,
      scope: "phone",
      target_ref: diagnostic.phone_id,
      reason_code: diagnostic.abstention.reason_code,
      message: diagnostic.abstention.message,
    });
  }

  const stressAbstentionId = "abs.word-stress.stage0";
  assessment.abstentions.push({
    abstention_id: stressAbstentionId,
    scope: "dimension",
    target_ref: "word_stress",
    reason_code: "evidence_conflict",
    message: `Stage 0 has no joint F0/intensity/duration stress model; word stress deferred (pipeline ${SPEECH_PIPELINE_VERSION}).`,
  });

  const dims: PronunciationAssessment["dimensions"][number][] = [];
  for (const roll of calibration.dimensions) {
    if (roll.id === "phoneme_accuracy") {
      dims.push({
        id: "phoneme_accuracy",
        status: roll.status,
        ...(roll.status === "scored" && roll.score !== undefined
          ? { score: roll.score }
          : {}),
        confidence: roll.confidence,
        evidence_refs: roll.evidence_phone_ids.map((id) => `ev.gop.${id}`),
        ...(roll.status === "abstained"
          ? { abstention_ref: "abs.phoneme-accuracy.no-scores" }
          : {}),
      });
      if (roll.status === "abstained") {
        assessment.abstentions.push({
          abstention_id: "abs.phoneme-accuracy.no-scores",
          scope: "dimension",
          target_ref: "phoneme_accuracy",
          reason_code: "evidence_conflict",
          message: "No GOP scores survived calibration for this utterance.",
        });
      }
    } else if (roll.id === "vowel_quantity") {
      dims.push({
        id: "vowel_quantity",
        status: roll.status,
        ...(roll.status === "scored" && roll.score !== undefined
          ? { score: roll.score }
          : {}),
        confidence: roll.confidence,
        evidence_refs: roll.evidence_phone_ids.map((id) => `ev.duration.${id}`),
      });
    } else {
      dims.push({
        id: "vowel_quality",
        status: roll.status,
        ...(roll.status === "scored" && roll.score !== undefined
          ? { score: roll.score }
          : {}),
        confidence: roll.confidence,
        evidence_refs: roll.evidence_phone_ids.map((id) => `ev.formant.${id}`),
      });
    }
  }
  dims.push({
    id: "word_stress",
    status: "abstained",
    confidence: 0,
    evidence_refs: [],
    abstention_ref: stressAbstentionId,
  });
  dims.push({
    id: "completeness",
    status: "scored",
    score: Math.round(match.completeness * 100),
    confidence: asr.hypotheses[0]?.confidence ?? 0,
    evidence_refs: ["ev.asr.confidence"],
  });
  assessment.dimensions = dims as unknown as PronunciationAssessment["dimensions"];

  const minWordConfidence = ctx.profile?.thresholds.min_word_alignment_confidence ?? 0.5;
  assessment.words = alignment.words.map((word) => ({
    word_id: word.word_id,
    text: word.text,
    interval: { start_ms: word.start_ms, end_ms: word.end_ms },
    alignment_confidence: word.alignment_confidence,
    phones: word.phones.map((phone) => {
      const diagnostic = phoneById.get(phone.phone_id);
      const issueRefs = issueIdsByPhone.get(phone.phone_id);
      return {
        phone_id: phone.phone_id,
        expected: phone.expected,
        interval: { start_ms: phone.start_ms, end_ms: phone.end_ms },
        status: diagnostic
          ? diagnostic.status
          : word.alignment_confidence < minWordConfidence
            ? "not_aligned"
            : "uncertain",
        confidence: diagnostic?.gop?.confidence ?? phone.confidence,
        evidence_refs: [`ev.gop.${phone.phone_id}`],
        ...(issueRefs ? { issue_refs: issueRefs } : {}),
      };
    }),
    issue_refs: [
      ...new Set(
        word.phones.flatMap((phone) => issueIdsByPhone.get(phone.phone_id) ?? []),
      ),
    ],
  }));

  attachComponents(assessment, engine, ctx.profile);
  return assessment;
}

function finalize(assessment: PronunciationAssessment): PronunciationAssessment {
  assertValid("pronunciation-assessment", assessment);
  return assessment;
}
