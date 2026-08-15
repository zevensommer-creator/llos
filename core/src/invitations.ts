import { randomBytes } from "node:crypto";
import type { Account, InMemoryAccountStore } from "./identity.js";

export const DEFAULT_INVITATION_CAPABILITY = "create_class";

export interface InvitationRecord {
  code: string;
  issuer_id: string;
  capability: string;
  issued_at: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
}

export interface InvitationIssueOptions {
  issuedAt: string;
  capability?: string;
  maxUses?: number;
  codeGenerator?: () => string;
}

export class InvitationError extends Error {
  readonly code:
    | "issuer_missing_capability"
    | "unknown_invitation"
    | "invitation_revoked"
    | "invitation_exhausted"
    | "not_invitation_issuer";
  constructor(code: InvitationError["code"], message: string) {
    super(message);
    this.name = "InvitationError";
    this.code = code;
  }
}

// Capability invitation chain (product_spec §2.3): only an account that already
// holds a capability may hand it out, so `create_class` propagates through the
// chain without any central grantor. Redeeming mints the capability onto the
// redeemer, who can then issue invitations of their own.
export class InMemoryInvitationStore {
  #records = new Map<string, InvitationRecord>();

  issue(issuer: Account, options: InvitationIssueOptions): InvitationRecord {
    const capability = options.capability ?? DEFAULT_INVITATION_CAPABILITY;
    if (!issuer.capabilities.has(capability)) {
      throw new InvitationError(
        "issuer_missing_capability",
        `account ${issuer.account_id} cannot invite for ${capability}: capability not held`,
      );
    }
    const maxUses = options.maxUses ?? 1;
    if (!Number.isInteger(maxUses) || maxUses < 1) {
      throw new Error("maxUses must be a positive integer");
    }
    const code = `llos-inv-${(options.codeGenerator ?? (() => randomBytes(12).toString("hex")))()}`;
    if (this.#records.has(code)) throw new Error("invitation code collision");
    const record: InvitationRecord = Object.freeze({
      code,
      issuer_id: issuer.account_id,
      capability,
      issued_at: options.issuedAt,
      max_uses: maxUses,
      uses: 0,
      revoked: false,
    });
    this.#records.set(code, record);
    return record;
  }

  redeem(
    accountStore: InMemoryAccountStore,
    code: string,
    redeemerId: string,
  ): InvitationRecord {
    const record = this.#records.get(code);
    if (!record) {
      throw new InvitationError("unknown_invitation", `unknown invitation code: ${code}`);
    }
    if (record.revoked) {
      throw new InvitationError("invitation_revoked", `invitation ${code} has been revoked`);
    }
    if (record.uses >= record.max_uses) {
      throw new InvitationError(
        "invitation_exhausted",
        `invitation ${code} has no uses left (${record.max_uses})`,
      );
    }
    accountStore.grant(redeemerId, record.capability);
    const updated: InvitationRecord = Object.freeze({ ...record, uses: record.uses + 1 });
    this.#records.set(code, updated);
    return updated;
  }

  revoke(code: string, issuerId: string): void {
    const record = this.#records.get(code);
    if (!record) {
      throw new InvitationError("unknown_invitation", `unknown invitation code: ${code}`);
    }
    if (record.issuer_id !== issuerId) {
      throw new InvitationError(
        "not_invitation_issuer",
        `invitation ${code} can only be revoked by its issuer`,
      );
    }
    this.#records.set(code, Object.freeze({ ...record, revoked: true }));
  }

  get(code: string): InvitationRecord | undefined {
    return this.#records.get(code);
  }
}
