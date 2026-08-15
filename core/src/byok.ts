// BYOK 密钥保管库（product_spec §6.5/§6.11）。
// 密钥的存储与隐私级别声明属 Core 特权：明文只存在于本模块内部，
// list() 只返回掩码视图；Gateway 在装配 adapter 时经 resolveFor 取用，
// provider descriptor 只携带 credential 引用，永不携带密钥本体。

export const BYOK_FAMILIES = [
  "deepseek",
  "openai",
  "google",
  "anthropic",
  "mock",
] as const;
export type ByokFamily = (typeof BYOK_FAMILIES)[number];

export interface ByokEntryView {
  entry_id: string;
  provider_family: ByokFamily;
  label: string;
  masked_key: string;
  registered_at: string;
}

/** Gateway 装配 adapter 时的一次性取用结果；不得进入日志或任何视图。 */
export interface ByokSecret {
  entry_id: string;
  provider_family: ByokFamily;
  api_key: string;
}

export interface RegisterByokInput {
  provider_family: ByokFamily;
  label: string;
  api_key: string;
}

export type ByokErrorCode = "invalid_input" | "not_found" | "not_owner";

export class ByokError extends Error {
  readonly code: ByokErrorCode;

  constructor(code: ByokErrorCode, message: string) {
    super(message);
    this.name = "ByokError";
    this.code = code;
  }
}

const MIN_KEY_LENGTH = 8;

/** 短密钥不泄露任何字符；长密钥只露前 3 后 4，足够辨认、不足还原。 */
export function maskKey(apiKey: string): string {
  if (apiKey.length < 12) return "…";
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}

export interface ByokVaultDeps {
  clock: () => string;
}

interface VaultRecord {
  accountId: string;
  providerFamily: ByokFamily;
  label: string;
  apiKey: string;
  registeredAt: string;
}

export class ByokVault {
  readonly #clock: () => string;
  #records = new Map<string, VaultRecord>();
  #nextId = 1;

  constructor(deps: ByokVaultDeps) {
    this.#clock = deps.clock;
  }

  register(accountId: string, input: RegisterByokInput): ByokEntryView {
    const label = input.label.trim();
    if (!accountId) {
      throw new ByokError("invalid_input", "account id is required");
    }
    if (!BYOK_FAMILIES.includes(input.provider_family)) {
      throw new ByokError(
        "invalid_input",
        `unknown provider family "${String(input.provider_family)}"; supported: ${BYOK_FAMILIES.join(", ")}`,
      );
    }
    if (label.length === 0) {
      throw new ByokError("invalid_input", "label must be non-empty");
    }
    if (input.api_key.length < MIN_KEY_LENGTH) {
      throw new ByokError("invalid_input", `api key must be at least ${MIN_KEY_LENGTH} characters`);
    }
    const entryId = `byok.${this.#nextId++}`;
    const record: VaultRecord = {
      accountId,
      providerFamily: input.provider_family,
      label,
      apiKey: input.api_key,
      registeredAt: this.#clock(),
    };
    this.#records.set(entryId, record);
    return this.#viewOf(entryId, record);
  }

  list(accountId: string): ByokEntryView[] {
    return [...this.#records]
      .filter(([, record]) => record.accountId === accountId)
      .map(([entryId, record]) => this.#viewOf(entryId, record));
  }

  revoke(accountId: string, entryId: string): void {
    const record = this.#requireOwned(accountId, entryId);
    this.#records.delete(record.entryId);
  }

  /** 所有者校验后返回明文密钥；仅限 Gateway 装配 adapter 时调用。 */
  resolveFor(accountId: string, entryId: string): ByokSecret {
    const record = this.#requireOwned(accountId, entryId);
    return {
      entry_id: record.entryId,
      provider_family: record.providerFamily,
      api_key: record.apiKey,
    };
  }

  has(accountId: string, entryId: string): boolean {
    return this.#records.get(entryId)?.accountId === accountId;
  }

  #requireOwned(accountId: string, entryId: string): VaultRecord & { entryId: string } {
    const record = this.#records.get(entryId);
    if (!record) {
      throw new ByokError("not_found", `unknown BYOK entry: ${entryId}`);
    }
    if (record.accountId !== accountId) {
      // 不区分"不存在"与"非本人"，避免枚举他人条目。
      throw new ByokError("not_owner", `BYOK entry ${entryId} is not accessible for this account`);
    }
    return { ...record, entryId };
  }

  #viewOf(entryId: string, record: VaultRecord): ByokEntryView {
    return Object.freeze({
      entry_id: entryId,
      provider_family: record.providerFamily,
      label: record.label,
      masked_key: maskKey(record.apiKey),
      registered_at: record.registeredAt,
    });
  }
}
