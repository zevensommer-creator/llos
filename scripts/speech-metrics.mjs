// Speech metrics harness (spec §13.1/§13.2): runs the Fake-engine
// pronunciation pipeline end-to-end over a labeled corpus and gates the
// Stage 0 thresholds. Gate cases simulate a qualified read-aloud stream;
// robustness cases (bad audio, aligner failure) verify abstention paths and
// are excluded from the §13.2 gate denominators — a failed input is not an
// alignment miss, it is an honest abstention.
//
// Fake engines mean these numbers are a protocol self-check, not a model
// evaluation; real-engine calibration lands with the acoustic adapter task.

import {
  assessPronunciation,
  GermanG2p,
  makeFakeAligner,
  makeFakeAnalyzer,
  makeFakeAsr,
  makeFakeGop,
  makeFakeProsody,
  makeFakeVad,
} from "@llos/speech";

const CLOCK = () => "2026-08-16T09:00:00.000Z";
const OPTIONS = { clock: CLOCK, seed: 42 };

function audio() {
  return {
    uri: "artifact://audio/metrics/utt.wav",
    sha256: "b".repeat(64),
    media_type: "audio/wav",
    duration_ms: 2800,
    channel_count: 1,
    sample_rate_hz: 16000,
  };
}

function input(reference_text) {
  return {
    audio: audio(),
    reference: { reference_type: "exact_text", text: reference_text },
    language: "de-DE",
    mode: "read_aloud",
    session_id: "session.metrics",
    activity_id: "activity.read-aloud.metrics",
    learner_l1_group: "zh-CN",
    device_class: "consumer-headset",
  };
}

function engine({ gop = {}, prosody = {}, aligner = {}, analyzer, asr_text } = {}) {
  return {
    analyzer: analyzer ?? makeFakeAnalyzer({ snr_db: 24, clipping_ratio: 0 }),
    vad: makeFakeVad({ segments: [{ start_ms: 100, end_ms: 2700 }] }),
    asr: makeFakeAsr({
      hypotheses: [{ text: asr_text, confidence: 0.94 }],
    }),
    g2p: new GermanG2p(),
    aligner: makeFakeAligner({ coverage: 1, mean_confidence: 0.88, ...aligner }),
    gop: makeFakeGop(gop),
    prosody: makeFakeProsody(prosody),
  };
}

// Gate corpus: qualified audio, labeled issues at the utterance level.
// "Guter Morgen"-family sentences stay inside the G2P lexicon so alignment
// is deterministic; per-phone overrides key on the fake aligner's
// phone.<word>.<index> ids.
const CORPUS = [
  {
    name: "clean: Wir bieten Ihnen diesen Termin an.",
    gate: true,
    label: false,
    text: "Wir bieten Ihnen diesen Termin an.",
    build: () => engine({ asr_text: "Wir bieten Ihnen diesen Termin an." }),
  },
  {
    name: "clean: Wie schoen.",
    gate: true,
    label: false,
    text: "Wie schön.",
    build: () => engine({ asr_text: "Wie schön." }),
  },
  {
    name: "true: bieten long i: shortened (dual evidence)",
    gate: true,
    label: true,
    text: "Wir bieten Ihnen diesen Termin an.",
    build: () =>
      engine({
        asr_text: "Wir bieten Ihnen diesen Termin an.",
        gop: {
          phone_overrides: {
            "phone.2.2": { posterior: 0.3, competitors: [{ phone: "ɪ", posterior: 0.65 }] },
          },
        },
        prosody: { phone_overrides: { "phone.2.2": { duration_ms: 58 } } },
      }),
  },
  {
    name: "true: schoen oe: loses rounding (dual evidence)",
    gate: true,
    label: true,
    text: "Wie schön.",
    build: () =>
      engine({
        asr_text: "Wie schön.",
        gop: {
          phone_overrides: {
            "phone.2.2": { posterior: 0.28, competitors: [{ phone: "eː", posterior: 0.66 }] },
          },
        },
        prosody: { phone_overrides: { "phone.2.2": { f2_hz: 2170 } } },
      }),
  },
  {
    name: "true: ihnen long i: shortened (dual evidence)",
    gate: true,
    label: true,
    text: "Wir bieten Ihnen diesen Termin an.",
    build: () =>
      engine({
        asr_text: "Wir bieten Ihnen diesen Termin an.",
        gop: {
          phone_overrides: {
            "phone.3.1": { posterior: 0.3, competitors: [{ phone: "ɪ", posterior: 0.66 }] },
          },
        },
        prosody: { phone_overrides: { "phone.3.1": { duration_ms: 55 } } },
      }),
  },
  {
    name: "false: borderline mue with weak margins stays unconfirmed",
    gate: true,
    label: false,
    text: "Ich bin über müde.",
    build: () =>
      engine({
        asr_text: "Ich bin über müde.",
        gop: {
          phone_overrides: {
            "phone.4.1": { posterior: 0.55, competitors: [{ phone: "iː", posterior: 0.56 }] },
          },
        },
        prosody: { phone_overrides: { "phone.4.1": { f2_hz: 2020 } } },
      }),
  },
  {
    name: "false: ich-laut single evidence stays suspected, never confirmed",
    gate: true,
    label: true,
    expectSuspectedOnly: true,
    text: "Ich bin über müde.",
    build: () =>
      engine({
        asr_text: "Ich bin über müde.",
        gop: {
          phone_overrides: {
            "phone.1.2": { posterior: 0.25, competitors: [{ phone: "ʃ", posterior: 0.72 }] },
          },
        },
      }),
  },
  // Robustness cases: outside the §13.2 denominators by design.
  {
    name: "robust: low SNR abstains at assessment scope",
    gate: false,
    label: false,
    text: "Wir bieten Ihnen diesen Termin an.",
    build: () =>
      engine({
        asr_text: "Wir bieten Ihnen diesen Termin an.",
        analyzer: makeFakeAnalyzer({ snr_db: 9, clipping_ratio: 0 }),
      }),
  },
  {
    name: "robust: aligner failure degrades without fabrication",
    gate: false,
    label: false,
    text: "Wir bieten Ihnen diesen Termin an.",
    build: () =>
      engine({
        asr_text: "Wir bieten Ihnen diesen Termin an.",
        aligner: { status: "failed", failure_code: "MFA_FAILED" },
      }),
  },
];

const GATES = {
  high_confidence_precision: 0.9,
  false_correction_rate: 0.05,
  alignment_success_rate: 0.95,
};

const rows = CORPUS.map((entry) => {
  const assessment = assessPronunciation(input(entry.text), entry.build(), OPTIONS);
  const confirmed = assessment.issues.filter((issue) => issue.status === "confirmed");
  const suspected = assessment.issues.filter((issue) => issue.status === "suspected");
  return { ...entry, assessment, confirmed, suspected };
});

const gateRows = rows.filter((row) => row.gate);
const alignmentAttempts = gateRows.filter(
  (row) => row.assessment.alignment.status !== "not_applicable",
);
const alignmentSuccesses = alignmentAttempts.filter(
  (row) => row.assessment.alignment.status === "completed",
);
const alignmentSuccessRate =
  alignmentAttempts.length > 0 ? alignmentSuccesses.length / alignmentAttempts.length : 1;

const confirmedRows = gateRows.filter((row) => row.confirmed.length > 0);
const trueConfirmed = confirmedRows.filter((row) => row.label);
const falseConfirmed = confirmedRows.filter((row) => !row.label);
const precision = confirmedRows.length > 0 ? trueConfirmed.length / confirmedRows.length : 1;
const fcr = confirmedRows.length > 0 ? falseConfirmed.length / confirmedRows.length : 0;

const abstainedAssessments = rows.filter((row) => row.assessment.status === "abstained");
const abstentionRate = rows.length > 0 ? abstainedAssessments.length / rows.length : 0;

const suspectedOnlyRows = gateRows.filter(
  (row) => row.expectSuspectedOnly && row.confirmed.length === 0 && row.suspected.length > 0,
);
const suspectedOnlyOk = suspectedOnlyRows.length === 1;

const checks = [
  {
    metric: "high-confidence precision",
    value: precision,
    threshold: `>= ${GATES.high_confidence_precision}`,
    pass: precision >= GATES.high_confidence_precision,
  },
  {
    metric: "false correction rate",
    value: fcr,
    threshold: `<= ${GATES.false_correction_rate}`,
    pass: fcr <= GATES.false_correction_rate,
  },
  {
    metric: "alignment success rate (read_aloud)",
    value: alignmentSuccessRate,
    threshold: `>= ${GATES.alignment_success_rate}`,
    pass: alignmentSuccessRate >= GATES.alignment_success_rate,
  },
  {
    metric: "single-evidence stays suspected",
    value: suspectedOnlyOk ? 1 : 0,
    threshold: "== 1",
    pass: suspectedOnlyOk,
  },
  {
    metric: "abstention rate (reported, no gate)",
    value: abstentionRate,
    threshold: "report only",
    pass: true,
  },
];

console.log("Speech metrics harness — Stage 0 protocol self-check (Fake engines)\n");
for (const row of rows) {
  const issues = row.assessment.issues.length;
  const confirmed = row.confirmed.length;
  const suspected = row.suspected.length;
  console.log(
    `${row.gate ? "[gate]" : "[robustness]"} ${row.name}\n` +
      `    status=${row.assessment.status} alignment=${row.assessment.alignment.status}` +
      ` issues=${issues} (confirmed=${confirmed}, suspected=${suspected})`,
  );
}
console.log("");
for (const check of checks) {
  const value = typeof check.value === "number" ? check.value.toFixed(3) : check.value;
  console.log(
    `${check.pass ? "PASS" : "FAIL"}  ${check.metric}: ${value} (gate ${check.threshold})`,
  );
}

const failed = checks.filter((check) => !check.pass);
if (failed.length > 0) {
  console.error(`\n${failed.length} gate(s) failed (spec §13.2)`);
  process.exitCode = 1;
} else {
  console.log("\nAll spec §13.2 Stage 0 gates passed.");
}
