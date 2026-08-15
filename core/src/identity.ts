export const BASE_CAPABILITIES = [
  "chat",
  "learn",
  "generate_material_ephemeral",
  "join_class",
  "create_dlc_draft",
] as const;

export const CREATOR_CAPABILITIES = [
  "upload_dlc",
  "publish_dlc",
  "upload_material",
  "publish_material",
] as const;

export type VerificationStatus = "unverified" | "teacher_verified" | "developer_verified";

export interface Account {
  account_id: string;
  capabilities: ReadonlySet<string>;
  verification: VerificationStatus;
}

export function creatorCapabilitiesUnlocked(verification: VerificationStatus): boolean {
  return verification === "teacher_verified" || verification === "developer_verified";
}

export class InMemoryAccountStore {
  #accounts = new Map<string, Account>();

  createAccount(
    accountId: string,
    verification: VerificationStatus = "unverified",
  ): Account {
    if (this.#accounts.has(accountId)) throw new Error(`account already exists: ${accountId}`);
    const capabilities = new Set<string>(BASE_CAPABILITIES);
    if (creatorCapabilitiesUnlocked(verification)) {
      for (const c of CREATOR_CAPABILITIES) capabilities.add(c);
    }
    const account: Account = Object.freeze({
      account_id: accountId,
      capabilities,
      verification,
    });
    this.#accounts.set(accountId, account);
    return account;
  }

  get(accountId: string): Account | undefined {
    return this.#accounts.get(accountId);
  }

  setVerification(accountId: string, verification: VerificationStatus): Account {
    const account = this.#require(accountId);
    const capabilities = new Set(account.capabilities);
    if (creatorCapabilitiesUnlocked(verification)) {
      for (const c of CREATOR_CAPABILITIES) capabilities.add(c);
    } else if (account.verification !== "unverified") {
      for (const c of CREATOR_CAPABILITIES) capabilities.delete(c);
    }
    const updated: Account = Object.freeze({
      account_id: accountId,
      capabilities,
      verification,
    });
    this.#accounts.set(accountId, updated);
    return updated;
  }

  grant(accountId: string, capability: string): Account {
    const account = this.#require(accountId);
    const capabilities = new Set(account.capabilities);
    capabilities.add(capability);
    const updated: Account = Object.freeze({ ...account, capabilities });
    this.#accounts.set(accountId, updated);
    return updated;
  }

  revoke(accountId: string, capability: string): Account {
    const account = this.#require(accountId);
    const capabilities = new Set(account.capabilities);
    capabilities.delete(capability);
    const updated: Account = Object.freeze({ ...account, capabilities });
    this.#accounts.set(accountId, updated);
    return updated;
  }

  hasCapability(accountId: string, capability: string): boolean {
    return this.#accounts.get(accountId)?.capabilities.has(capability) ?? false;
  }

  #require(accountId: string): Account {
    const account = this.#accounts.get(accountId);
    if (!account) throw new Error(`unknown account: ${accountId}`);
    return account;
  }
}
