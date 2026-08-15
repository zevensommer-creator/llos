import { randomBytes } from "node:crypto";
import type { Account, InMemoryAccountStore } from "./identity.js";
import type { InMemoryEntitlementStore } from "./entitlements.js";

export const CREATE_CLASS_CAPABILITY = "create_class";
export const JOIN_CLASS_CAPABILITY = "join_class";

// Entitlements granted through a class assignment carry this source tag so
// leaving the class revokes exactly the class channel and never touches
// personal grants (product_spec §5.4: paid personal subscriptions survive).
export function classEntitlementSource(classId: string): string {
  return `class:${classId}`;
}

export interface ClassRecord {
  class_id: string;
  name: string;
  description?: string;
  creator_id: string;
  created_at: string;
  archived: boolean;
}

export interface ClassMembership {
  class_id: string;
  account_id: string;
  joined_at: string;
}

export interface ClassInvitationRecord {
  code: string;
  class_id: string;
  issuer_id: string;
  issued_at: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
}

export type ClassErrorCode =
  | "create_class_capability_missing"
  | "join_class_capability_missing"
  | "class_not_found"
  | "class_archived"
  | "not_class_creator"
  | "not_class_member"
  | "cannot_remove_creator"
  | "invalid_class_input"
  | "unknown_class_invitation"
  | "class_invitation_revoked"
  | "class_invitation_exhausted"
  | "not_class_invitation_issuer";

export class ClassError extends Error {
  readonly code: ClassErrorCode;
  constructor(code: ClassErrorCode, message: string) {
    super(message);
    this.name = "ClassError";
    this.code = code;
  }
}

export interface ClassServiceDeps {
  accountStore: InMemoryAccountStore;
  entitlementStore: InMemoryEntitlementStore;
  clock: () => string;
}

export interface CreateClassOptions {
  name: string;
  description?: string;
  idGenerator?: () => string;
}

export interface ClassUpdate {
  name?: string;
  description?: string;
}

export interface ClassInvitationIssueOptions {
  maxUses?: number;
  codeGenerator?: () => string;
}

// Class orchestration lives in Core: membership changes and class-channel
// entitlement revocation are privileged writes (baseline P-001 / §12). The
// entitlement store itself stays policy-free; this service supplies the
// class:<id> source tag and the §5.4 revocation semantics.
export class ClassService {
  readonly #accounts: InMemoryAccountStore;
  readonly #entitlements: InMemoryEntitlementStore;
  readonly #clock: () => string;
  readonly #classes = new Map<string, ClassRecord>();
  readonly #members = new Map<string, Map<string, ClassMembership>>();
  readonly #invitations = new Map<string, ClassInvitationRecord>();
  readonly #memberJoinedHandlers: ((membership: ClassMembership) => void)[] = [];

  constructor(deps: ClassServiceDeps) {
    this.#accounts = deps.accountStore;
    this.#entitlements = deps.entitlementStore;
    this.#clock = deps.clock;
  }

  // The assignment service registers here so members joining later receive
  // the class's already-assigned free DLCs without the caller doing two steps.
  onMemberJoined(handler: (membership: ClassMembership) => void): void {
    this.#memberJoinedHandlers.push(handler);
  }

  // Creator gate for privileged class operations (assignments, notices).
  // Public counterpart of #requireCreator + #requireClass + active check.
  requireActiveClassFor(creatorId: string, classId: string): ClassRecord {
    const record = this.#requireClass(classId);
    this.#requireCreator(record, creatorId);
    if (record.archived) {
      throw new ClassError("class_archived", `class ${classId} is archived`);
    }
    return record;
  }

  createClass(actorId: string, options: CreateClassOptions): ClassRecord {
    const actor: Account | undefined = this.#accounts.get(actorId);
    if (!actor || !actor.capabilities.has(CREATE_CLASS_CAPABILITY)) {
      throw new ClassError(
        "create_class_capability_missing",
        `account ${actorId} cannot create classes: ${CREATE_CLASS_CAPABILITY} required (product_spec §2.1)`,
      );
    }
    const name = options.name.trim();
    if (name.length === 0) {
      throw new ClassError("invalid_class_input", "class name must be non-empty");
    }
    const now = this.#clock();
    const classId = `class.${(options.idGenerator ?? (() => randomBytes(6).toString("hex")))()}`;
    if (this.#classes.has(classId)) {
      throw new ClassError("invalid_class_input", `class id collision: ${classId}`);
    }
    const record: ClassRecord = Object.freeze({
      class_id: classId,
      name,
      description: options.description?.trim() || undefined,
      creator_id: actorId,
      created_at: now,
      archived: false,
    });
    this.#classes.set(classId, record);
    this.#members.set(classId, new Map([[actorId, { class_id: classId, account_id: actorId, joined_at: now }]]));
    return record;
  }

  updateClass(creatorId: string, classId: string, update: ClassUpdate): ClassRecord {
    const record = this.#requireClass(classId);
    this.#requireCreator(record, creatorId);
    if (record.archived) {
      throw new ClassError("class_archived", `class ${classId} is archived and can no longer be updated`);
    }
    if (update.name !== undefined && update.name.trim().length === 0) {
      throw new ClassError("invalid_class_input", "class name must be non-empty");
    }
    const updated: ClassRecord = Object.freeze({
      ...record,
      name: update.name !== undefined ? update.name.trim() : record.name,
      description:
        update.description !== undefined ? update.description.trim() || undefined : record.description,
    });
    this.#classes.set(classId, updated);
    return updated;
  }

  archiveClass(creatorId: string, classId: string): ClassRecord {
    const record = this.#requireClass(classId);
    this.#requireCreator(record, creatorId);
    if (record.archived) return record;
    const archived: ClassRecord = Object.freeze({ ...record, archived: true });
    this.#classes.set(classId, archived);
    return archived;
  }

  get(classId: string): ClassRecord | undefined {
    return this.#classes.get(classId);
  }

  classesFor(accountId: string): ClassRecord[] {
    return [...this.#classes.values()]
      .filter((record) => this.#members.get(record.class_id)?.has(accountId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  issueInvitation(
    creatorId: string,
    classId: string,
    options: ClassInvitationIssueOptions = {},
  ): ClassInvitationRecord {
    const record = this.#requireClass(classId);
    this.#requireCreator(record, creatorId);
    if (record.archived) {
      throw new ClassError("class_archived", `class ${classId} is archived and can no longer invite`);
    }
    const maxUses = options.maxUses ?? 1;
    if (!Number.isInteger(maxUses) || maxUses < 1) {
      throw new ClassError("invalid_class_input", "maxUses must be a positive integer");
    }
    const code = `llos-class-${(options.codeGenerator ?? (() => randomBytes(12).toString("hex")))()}`;
    if (this.#invitations.has(code)) {
      throw new ClassError("invalid_class_input", "class invitation code collision");
    }
    const invitation: ClassInvitationRecord = Object.freeze({
      code,
      class_id: classId,
      issuer_id: creatorId,
      issued_at: this.#clock(),
      max_uses: maxUses,
      uses: 0,
      revoked: false,
    });
    this.#invitations.set(code, invitation);
    return invitation;
  }

  revokeInvitation(code: string, issuerId: string): void {
    const invitation = this.#requireInvitation(code);
    if (invitation.issuer_id !== issuerId) {
      throw new ClassError(
        "not_class_invitation_issuer",
        `class invitation ${code} can only be revoked by its issuer`,
      );
    }
    this.#invitations.set(code, Object.freeze({ ...invitation, revoked: true }));
  }

  getInvitation(code: string): ClassInvitationRecord | undefined {
    return this.#invitations.get(code);
  }

  // Redeeming a class invitation joins the class (product_spec §5.4). Already
  // being a member is idempotent and does not consume a use.
  redeemInvitation(code: string, accountId: string): ClassMembership {
    const invitation = this.#requireInvitation(code);
    const record = this.#requireClass(invitation.class_id);
    if (!this.#accounts.hasCapability(accountId, JOIN_CLASS_CAPABILITY)) {
      throw new ClassError(
        "join_class_capability_missing",
        `account ${accountId} lacks ${JOIN_CLASS_CAPABILITY} and cannot join classes`,
      );
    }
    const existing = this.#members.get(record.class_id)?.get(accountId);
    if (existing) return existing;
    if (record.archived) {
      throw new ClassError("class_archived", `class ${record.class_id} is archived and cannot accept members`);
    }
    if (invitation.revoked) {
      throw new ClassError("class_invitation_revoked", `class invitation ${code} has been revoked`);
    }
    if (invitation.uses >= invitation.max_uses) {
      throw new ClassError(
        "class_invitation_exhausted",
        `class invitation ${code} has no uses left (${invitation.max_uses})`,
      );
    }
    const membership: ClassMembership = Object.freeze({
      class_id: record.class_id,
      account_id: accountId,
      joined_at: this.#clock(),
    });
    this.#members.get(record.class_id)?.set(accountId, membership);
    this.#invitations.set(code, Object.freeze({ ...invitation, uses: invitation.uses + 1 }));
    for (const handler of this.#memberJoinedHandlers) handler(membership);
    return membership;
  }

  members(classId: string): ClassMembership[] {
    this.#requireClass(classId);
    return [...(this.#members.get(classId)?.values() ?? [])].sort((a, b) =>
      a.joined_at.localeCompare(b.joined_at),
    );
  }

  isMember(classId: string, accountId: string): boolean {
    return this.#members.get(classId)?.has(accountId) ?? false;
  }

  removeMember(creatorId: string, classId: string, accountId: string): void {
    const record = this.#requireClass(classId);
    this.#requireCreator(record, creatorId);
    if (accountId === record.creator_id) {
      throw new ClassError("cannot_remove_creator", `the class creator (${accountId}) cannot be removed`);
    }
    this.#dropMember(classId, accountId);
  }

  leaveClass(accountId: string, classId: string): void {
    const record = this.#requireClass(classId);
    if (accountId === record.creator_id) {
      throw new ClassError("cannot_remove_creator", `the class creator (${accountId}) cannot leave; archive the class instead`);
    }
    this.#dropMember(classId, accountId);
  }

  // Membership end (leave or removal): only entitlements granted through this
  // class channel are revoked; personal grants keep their source and survive
  // (product_spec §5.4).
  #dropMember(classId: string, accountId: string): void {
    const roster = this.#members.get(classId);
    if (!roster?.has(accountId)) {
      throw new ClassError("not_class_member", `account ${accountId} is not a member of ${classId}`);
    }
    roster.delete(accountId);
    this.#entitlements.revokeBySource(accountId, classEntitlementSource(classId));
  }

  #requireClass(classId: string): ClassRecord {
    const record = this.#classes.get(classId);
    if (!record) {
      throw new ClassError("class_not_found", `unknown class: ${classId}`);
    }
    return record;
  }

  #requireCreator(record: ClassRecord, actorId: string): void {
    if (record.creator_id !== actorId) {
      throw new ClassError(
        "not_class_creator",
        `class ${record.class_id} can only be managed by its creator (${record.creator_id})`,
      );
    }
  }

  #requireInvitation(code: string): ClassInvitationRecord {
    const invitation = this.#invitations.get(code);
    if (!invitation) {
      throw new ClassError("unknown_class_invitation", `unknown class invitation code: ${code}`);
    }
    return invitation;
  }
}
