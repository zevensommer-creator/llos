export {
  ProviderRegistry,
  ProviderRegistryError,
  languageSupported,
  type ProviderAdapter,
  type ProviderRequest,
  type ProviderResult,
  type QualityTier,
  type ResolveOptions,
  type ResolvedProvider,
  type RegistryErrorCode,
} from "./registry.js";
export {
  ProviderGateway,
  GatewayError,
  type GatewayErrorCode,
  type FailedAttempt,
} from "./gateway.js";
export { FakeProvider, type FakeProviderOptions } from "./fake-provider.js";
export {
  PIPER_TTS_DESCRIPTOR,
  PIPER_TTS_PROVIDER_ID,
  FakeTTSProvider,
  type TtsSynthesisInput,
  type TtsSynthesisOutput,
} from "./piper-tts.js";
