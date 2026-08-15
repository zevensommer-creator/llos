import type { LearningEvent } from "@llos/contracts";
import type { InMemoryEntitlementStore } from "./entitlements.js";
import { classEntitlementSource, ClassError, type ClassMembership, type ClassService } from "./classes.js";

// product_spec §5.3 paid assignment modes (both supported; activation of
// teacher_purchase waits for P8 payments):
export type PaidAssignMode = "teacher_purchase" | "recommend_self_purchase";

// Mirror of the market-side listing shape the caller supplies. Core must not
// depend on the market package, so pricing facts arrive via this interface.
export interface AssignListingInfo {
  listing_id: string;
  dlc_id: string;
  pricing_model: "free" | "one_time" | "purchase" | "subscription";
  publisher_id: string;
}

export interface ClassAssignment {
  assignment_id: string;
  class_id: string;
  listing_id: string;
  dlc_id: string;
  resource_ref: string;
  mode: "auto_free" | PaidAssignMode;
  sequence: number;
  due_at?: string;
  assigned_at: string;
  updated_at: string;
  entitlements_granted: boolean;
}

export interface AssignOptions {
  /** Prerequisite order within the class (smaller = earlier). */
  sequence?: number;
  dueAt?: string;
  paidMode?: PaidAssignMode;
}

export type AssignmentErrorCode = "assignment_not_found";

export class AssignmentError extends Error {
  readonly code: AssignmentErrorCode;
  constructor(code: AssignmentErrorCode, message: string) {
    super(message);
    this.name = "AssignmentError";
    this.code = code;
  }
}

export interface AssignDeps {
  classService: ClassService;
  entitlementStore: InMemoryEntitlementStore;
  clock: () => string;
}

// DLC assignment is an entitlement-granting privileged operation, so it lives
// in Core (product_spec §5.6). Free DLCs (and the creator's own listings,
// §4.2) grant immediately to every member; members joining later are caught
// up through the ClassService member-joined hook. Paid listings only record
// the C-scheme mode — no entitlement until P8.
export class ClassAssignmentService {
  readonly #classes: ClassService;
  readonly #entitlements: InMemoryEntitlementStore;
  readonly #clock: () => string;
  readonly #assignments = new Map<string, ClassAssignment>();

  constructor(deps: AssignDeps) {
    this.#classes = deps.classService;
    this.#entitlements = deps.entitlementStore;
    this.#clock = deps.clock;
    this.#classes.onMemberJoined((membership) => this.#catchUpMember(membership));
  }

  assign(creatorId: string, classId: string, listing: AssignListingInfo, options: AssignOptions = {}): ClassAssignment {
    this.#classes.requireActiveClassFor(creatorId, classId);
    const now = this.#clock();
    const assignmentId = `${classId}::${listing.listing_id}`;
    const existing = this.#assignments.get(assignmentId);

    const isCreatorOwned = listing.publisher_id === creatorId;
    const autoFree = listing.pricing_model === "free" || isCreatorOwned;
    const mode: ClassAssignment["mode"] = autoFree
      ? "auto_free"
      : (options.paidMode ?? "recommend_self_purchase");

    const assignment: ClassAssignment = Object.freeze({
      assignment_id: assignmentId,
      class_id: classId,
      listing_id: listing.listing_id,
      dlc_id: listing.dlc_id,
      resource_ref: `dlc/${listing.dlc_id}`,
      mode,
      sequence: options.sequence ?? existing?.sequence ?? this.#nextSequence(classId),
      due_at: options.dueAt ?? existing?.due_at,
      assigned_at: existing?.assigned_at ?? now,
      updated_at: now,
      entitlements_granted: autoFree,
    });
    this.#assignments.set(assignmentId, assignment);

    if (autoFree) {
      this.#grantToMembers(classId, assignment.resource_ref, now);
    }
    return assignment;
  }

  unassign(creatorId: string, classId: string, listingId: string): void {
    this.#classes.requireActiveClassFor(creatorId, classId);
    const assignmentId = `${classId}::${listingId}`;
    const assignment = this.#assignments.get(assignmentId);
    if (!assignment) {
      throw new AssignmentError("assignment_not_found", `no assignment ${assignmentId}`);
    }
    this.#assignments.delete(assignmentId);
    if (assignment.entitlements_granted) {
      this.#entitlements.revokeResourceBySource(
        assignment.resource_ref,
        classEntitlementSource(classId),
      );
    }
  }

  assignmentsFor(classId: string): ClassAssignment[] {
    return [...this.#assignments.values()]
      .filter((a) => a.class_id === classId)
      .sort((a, b) => a.sequence - b.sequence || a.assignment_id.localeCompare(b.assignment_id));
  }

  // §5.5 prerequisite order: an assignment unlocks only when every
  // lower-sequence assignment of the same class is completed by this member.
  // This is a presentation gate scoped to the class — it never writes or
  // revokes entitlements, so learning rights are never locked.
  unlockStateFor(classId: string, accountId: string, events: readonly LearningEvent[]): UnlockState[] {
    if (!this.#classes.isMember(classId, accountId)) {
      throw new ClassError("not_class_member", `account ${accountId} is not a member of ${classId}`);
    }
    const ordered = this.assignmentsFor(classId);
    const completedDlcs = new Set(
      events
        .filter(
          (e) =>
            e.learner_ref === accountId &&
            e.event_type === "learning.session_completed" &&
            e.composition?.dlc_ref?.id,
        )
        .map((e) => e.composition.dlc_ref.id),
    );
    return ordered.map((assignment) => {
      const blockers = ordered.filter(
        (other) =>
          other.sequence < assignment.sequence && !completedDlcs.has(other.dlc_id),
      );
      return {
        assignment_id: assignment.assignment_id,
        dlc_id: assignment.dlc_id,
        sequence: assignment.sequence,
        due_at: assignment.due_at,
        unlocked: blockers.length === 0,
        blocked_by: blockers.map((b) => b.assignment_id),
        completed: completedDlcs.has(assignment.dlc_id),
      };
    });
  }

  // Compensating catch-up for a member (also used by the member-joined hook):
  // grants every auto_free assignment of the class the account just joined.
  syncMember(classId: string, accountId: string): number {
    const now = this.#clock();
    let granted = 0;
    for (const assignment of this.assignmentsFor(classId)) {
      if (!assignment.entitlements_granted) continue;
      const source = classEntitlementSource(classId);
      if (!this.#entitlements.get(accountId, assignment.resource_ref)) {
        this.#entitlements.grant(accountId, assignment.resource_ref, now, undefined, source);
        granted += 1;
      }
    }
    return granted;
  }

  #catchUpMember(membership: ClassMembership): void {
    this.syncMember(membership.class_id, membership.account_id);
  }

  #grantToMembers(classId: string, resourceRef: string, now: string): void {
    const source = classEntitlementSource(classId);
    for (const member of this.#classes.members(classId)) {
      if (!this.#entitlements.get(member.account_id, resourceRef)) {
        this.#entitlements.grant(member.account_id, resourceRef, now, undefined, source);
      }
    }
  }

  #nextSequence(classId: string): number {
    const current = this.assignmentsFor(classId);
    return current.length === 0 ? 1 : current[current.length - 1].sequence + 1;
  }
}

export interface UnlockState {
  assignment_id: string;
  dlc_id: string;
  sequence: number;
  due_at?: string;
  unlocked: boolean;
  blocked_by: string[];
  completed: boolean;
}
