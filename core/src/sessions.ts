import { randomBytes } from "node:crypto";

export interface SessionInfo {
  account_id: string;
  issued_at: string;
  expires_at: string;
}

export interface IssuedSession {
  token: string;
  session: SessionInfo;
}

export interface SessionIssueOptions {
  issuedAt: string;
  ttlSeconds: number;
  tokenGenerator?: () => string;
}

function defaultToken(): string {
  return randomBytes(32).toString("hex");
}

// Opaque bearer tokens with server-side expiry. Validation never resurrects an
// expired session and tokens carry no meaning outside this store.
export class InMemorySessionStore {
  #sessions = new Map<string, SessionInfo>();

  issue(accountId: string, options: SessionIssueOptions): IssuedSession {
    if (options.ttlSeconds <= 0) throw new Error("ttlSeconds must be positive");
    const expiresAtMs = Date.parse(options.issuedAt) + options.ttlSeconds * 1000;
    if (Number.isNaN(expiresAtMs)) throw new Error(`invalid issuedAt: ${options.issuedAt}`);
    const token = (options.tokenGenerator ?? defaultToken)();
    if (this.#sessions.has(token)) throw new Error("token collision");
    const session: SessionInfo = Object.freeze({
      account_id: accountId,
      issued_at: options.issuedAt,
      expires_at: new Date(expiresAtMs).toISOString(),
    });
    this.#sessions.set(token, session);
    return { token, session };
  }

  validate(token: string, at: string): SessionInfo | null {
    const session = this.#sessions.get(token);
    if (!session) return null;
    if (Date.parse(at) >= Date.parse(session.expires_at)) return null;
    return session;
  }

  revoke(token: string): boolean {
    return this.#sessions.delete(token);
  }

  revokeAllFor(accountId: string): number {
    let revoked = 0;
    for (const [token, session] of this.#sessions) {
      if (session.account_id === accountId) {
        this.#sessions.delete(token);
        revoked += 1;
      }
    }
    return revoked;
  }

  size(): number {
    return this.#sessions.size;
  }
}
