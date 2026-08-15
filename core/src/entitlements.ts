export interface Entitlement {
  account_id: string;
  resource_ref: string;
  granted_at: string;
  expires_at?: string;
  /** Grant channel (e.g. `class:<class_id>`); undefined = direct/personal grant. */
  source?: string;
}

export class InMemoryEntitlementStore {
  #entitlements = new Map<string, Entitlement>();

  grant(
    accountId: string,
    resourceRef: string,
    grantedAt: string,
    expiresAt?: string,
    source?: string,
  ): Entitlement {
    const key = `${accountId}::${resourceRef}`;
    const entitlement: Entitlement = Object.freeze({
      account_id: accountId,
      resource_ref: resourceRef,
      granted_at: grantedAt,
      expires_at: expiresAt,
      source,
    });
    this.#entitlements.set(key, entitlement);
    return entitlement;
  }

  has(accountId: string, resourceRef: string, at: string): boolean {
    const entitlement = this.#entitlements.get(`${accountId}::${resourceRef}`);
    if (!entitlement) return false;
    if (entitlement.expires_at && entitlement.expires_at < at) return false;
    return true;
  }

  get(accountId: string, resourceRef: string): Entitlement | undefined {
    return this.#entitlements.get(`${accountId}::${resourceRef}`);
  }

  revoke(accountId: string, resourceRef: string): boolean {
    return this.#entitlements.delete(`${accountId}::${resourceRef}`);
  }

  entitlementsBySource(accountId: string, source: string): Entitlement[] {
    return [...this.#entitlements.values()].filter(
      (entitlement) => entitlement.account_id === accountId && entitlement.source === source,
    );
  }

  revokeBySource(accountId: string, source: string): number {
    const doomed = this.entitlementsBySource(accountId, source);
    for (const entitlement of doomed) {
      this.#entitlements.delete(`${entitlement.account_id}::${entitlement.resource_ref}`);
    }
    return doomed.length;
  }
}
