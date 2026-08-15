"use strict";

// Piper TTS is registered for exactly one capability: tts.demo_reading
// (示范朗读). It must never resolve for scoring-calibration capabilities —
// synthetic audio is not a native-speaker standard (spec §10) — and the Fake
// adapter must be deterministic with content-addressed caching (spec §12.4,
// §12.5).

const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderGateway,
  GatewayError,
  PIPER_TTS_DESCRIPTOR,
  PIPER_TTS_PROVIDER_ID,
  FakeTTSProvider,
} = require("../dist/index.js");

function registryWithPiper() {
  const registry = new ProviderRegistry();
  registry.register(PIPER_TTS_DESCRIPTOR);
  const tts = new FakeTTSProvider();
  registry.attach(PIPER_TTS_PROVIDER_ID, tts);
  return { registry, tts };
}

test("the Piper descriptor passes the contract schema and registers", () => {
  const registry = new ProviderRegistry();
  const registered = registry.register(PIPER_TTS_DESCRIPTOR);
  assert.equal(registered.provider_id, PIPER_TTS_PROVIDER_ID);
  assert.equal(registered.capabilities[0].capability_id, "tts.demo_reading");
});

test("resolves for demo reading in German; never for pronunciation standards", () => {
  const { registry } = registryWithPiper();
  const resolved = registry.resolve("tts.demo_reading", {
    operation: "synthesize",
    language: "de-DE",
    quality_tier: "economy",
  });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].descriptor.provider_id, PIPER_TTS_PROVIDER_ID);

  // Red line: no capability may expose Piper as a native-speaker standard.
  assert.equal(registry.resolve("tts.native_reference").length, 0);
  assert.equal(registry.resolve("pronunciation.scoring_reference").length, 0);
});

test("business code requests capabilities, never brand names", async () => {
  const { registry, tts } = registryWithPiper();
  const gateway = new ProviderGateway(registry);
  const result = await gateway.execute({
    capability_id: "tts.demo_reading",
    operation: "synthesize",
    language: "de-DE",
    input: { text: "Guten Morgen. Wie geht es Ihnen?" },
  });

  const audio = result.output.audio;
  assert.match(audio.uri, /^artifact:\/\/tts-cache\/[a-f0-9]{64}\.wav$/);
  assert.match(audio.sha256, /^[a-f0-9]{64}$/);
  assert.equal(audio.media_type, "audio/wav");
  assert.ok(result.output.duration_ms >= 600);
  // The request carries a capability id only — no provider brand name.
  for (const request of tts.requests) {
    assert.equal(request.capability_id, "tts.demo_reading");
  }
});

test("synthesis is deterministic and content-addressed; repeats hit the cache", async () => {
  const { tts } = registryWithPiper();
  const first = await tts.execute({
    capability_id: "tts.demo_reading",
    operation: "synthesize",
    input: { text: "Ich möchte ein Zimmer reservieren." },
  });
  const second = await tts.execute({
    capability_id: "tts.demo_reading",
    operation: "synthesize",
    input: { text: "Ich möchte ein Zimmer reservieren." },
  });
  const other = await tts.execute({
    capability_id: "tts.demo_reading",
    operation: "synthesize",
    input: { text: "Ich möchte ein Zimmer reservieren.", voice: "piper-de-thorsten-high" },
  });

  assert.equal(first.output.audio.sha256, second.output.audio.sha256);
  assert.equal(second.output.cached, true);
  assert.equal(first.output.cached, false);
  assert.notEqual(other.output.audio.sha256, first.output.audio.sha256);
  assert.equal(tts.cacheSize, 2);
  assert.equal(tts.requests.length, 3);
});

test("empty or non-string text fails loudly instead of synthesizing garbage", async () => {
  const { tts } = registryWithPiper();
  await assert.rejects(() =>
    tts.execute({ capability_id: "tts.demo_reading", operation: "synthesize", input: { text: "" } }),
  );
  await assert.rejects(() =>
    tts.execute({ capability_id: "tts.demo_reading", operation: "synthesize", input: {} }),
  );
});
