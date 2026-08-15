import type { LearningEvent } from "@llos/contracts";

// Class statistics derive purely from the append-only learning event stream
// (product_spec §5.6): the frontend reads Core projections and never queries
// raw events. Deterministic: same members + assignments + events in, same
// projection out.

export interface StatsAssignmentInput {
  assignment_id: string;
  dlc_id: string;
  due_at?: string;
}

export interface MemberDlcProgress {
  dlc_id: string;
  sessions_started: number;
  sessions_completed: number;
  completed: boolean;
  on_time: boolean | null;
  last_activity_at: string | null;
  training_ms: number;
}

export interface MemberProgress {
  account_id: string;
  dlcs: MemberDlcProgress[];
  assigned_count: number;
  completed_count: number;
  training_ms_total: number;
}

export interface ClassWeakSpot {
  claim_ref: string;
  members_affected: number;
  success_rate: number | null;
  priority_score: number;
  reasons: string[];
}

export interface ClassStatsSummary {
  members_total: number;
  members_active: number;
  assignments_total: number;
  completions_total: number;
  completions_on_time: number;
  completion_rate_overall: number | null;
  completion_rate_on_time: number | null;
}

export interface ClassStats {
  class_id: string;
  members: MemberProgress[];
  summary: ClassStatsSummary;
  weak_spots: ClassWeakSpot[];
}

export interface ClassStatsInput {
  class_id: string;
  member_ids: readonly string[];
  assignments: readonly StatsAssignmentInput[];
  events: readonly LearningEvent[];
  now: string;
}

export const CLASS_STATS_PROJECTOR_ID = "class-stats";
export const CLASS_STATS_PROJECTOR_VERSION = "1.0.0";

export function projectClassStats(input: ClassStatsInput): ClassStats {
  const assignedDlcs = new Set(input.assignments.map((a) => a.dlc_id));
  const members = input.member_ids.map((accountId) =>
    memberProgress(accountId, input.assignments, assignedDlcs, input.events),
  );

  const completionsTotal = sum(members, (m) => m.completed_count);
  const expected = members.length * input.assignments.length;
  const onTimePerAssignment = input.assignments.map((assignment) => {
    let onTime = 0;
    for (const member of members) {
      const progress = member.dlcs.find((d) => d.dlc_id === assignment.dlc_id);
      if (progress?.on_time === true) onTime += 1;
    }
    return onTime;
  });
  const completionsOnTime = onTimePerAssignment.reduce((sum_, n) => sum_ + n, 0);

  const summary: ClassStatsSummary = {
    members_total: members.length,
    members_active: members.filter((m) => m.dlcs.some((d) => d.last_activity_at !== null)).length,
    assignments_total: input.assignments.length,
    completions_total: completionsTotal,
    completions_on_time: completionsOnTime,
    completion_rate_overall: expected > 0 ? round3(completionsTotal / expected) : null,
    completion_rate_on_time: expected > 0 ? round3(completionsOnTime / expected) : null,
  };

  return {
    class_id: input.class_id,
    members,
    summary,
    weak_spots: weakSpots(input.member_ids, assignedDlcs, input.events),
  };
}

function memberProgress(
  accountId: string,
  assignments: readonly StatsAssignmentInput[],
  assignedDlcs: Set<string>,
  events: readonly LearningEvent[],
): MemberProgress {
  const dlcs = assignments.map((assignment) => {
    const relevant = events.filter(
      (e) =>
        e.learner_ref === accountId &&
        e.composition?.dlc_ref?.id === assignment.dlc_id,
    );
    const started = relevant.filter((e) => e.event_type === "learning.session_started");
    const completed = relevant.filter((e) => e.event_type === "learning.session_completed");
    const lastActivity = relevant.reduce<string | null>(
      (latest, e) => (latest === null || e.occurred_at > latest ? e.occurred_at : latest),
      null,
    );
    const trainingMs = trainingMsFor(relevant);
    return {
      dlc_id: assignment.dlc_id,
      sessions_started: started.length,
      sessions_completed: completed.length,
      completed: completed.length > 0,
      on_time: onTimeFlag(completed, assignment.due_at),
      last_activity_at: lastActivity,
      training_ms: trainingMs,
    };
  });

  return {
    account_id: accountId,
    dlcs,
    assigned_count: assignments.length,
    completed_count: dlcs.filter((d) => d.completed).length,
    training_ms_total: dlcs.reduce((sum_, d) => sum_ + d.training_ms, 0),
  };
}

// §5.5: due dates affect only the on-time rate. They never block learning —
// late completions still count as completed.
function onTimeFlag(
  completedEvents: readonly LearningEvent[],
  dueAt: string | undefined,
): boolean | null {
  if (completedEvents.length === 0) return null;
  if (!dueAt) return null;
  const firstCompletion = completedEvents.reduce((earliest, e) =>
    e.occurred_at < earliest.occurred_at ? e : earliest,
  );
  return firstCompletion.occurred_at <= dueAt;
}

// Session duration is approximated by pairing session_started with the first
// session_completed sharing the session_ref (aborted sessions contribute 0).
function trainingMsFor(events: readonly LearningEvent[]): number {
  const startedAt = new Map<string, string>();
  let totalMs = 0;
  for (const event of events) {
    if (event.event_type === "learning.session_started") {
      startedAt.set(event.session_ref, event.occurred_at);
    } else if (event.event_type === "learning.session_completed") {
      const start = startedAt.get(event.session_ref);
      if (start) {
        totalMs += Math.max(0, Date.parse(event.occurred_at) - Date.parse(start));
        startedAt.delete(event.session_ref);
      }
    }
  }
  return totalMs;
}

// Class-level weak spots aggregate member observations per claim within the
// assigned DLCs: conflicted or low-success claims rise to the top.
function weakSpots(
  memberIds: readonly string[],
  assignedDlcs: Set<string>,
  events: readonly LearningEvent[],
): ClassWeakSpot[] {
  const members = new Set(memberIds);
  const perClaim = new Map<
    string,
    { affected: Set<string>; supporting: number; contradicting: number; abstained: number }
  >();

  for (const event of events) {
    if (
      event.event_type !== "observation.recorded" ||
      !event.observation ||
      !event.claim_ref ||
      !members.has(event.learner_ref) ||
      !assignedDlcs.has(event.composition?.dlc_ref?.id ?? "")
    ) {
      continue;
    }
    const bucket = perClaim.get(event.claim_ref) ?? {
      affected: new Set<string>(),
      supporting: 0,
      contradicting: 0,
      abstained: 0,
    };
    bucket.affected.add(event.learner_ref);
    const obs = event.observation;
    if (obs.result_kind === "abstention") bucket.abstained += 1;
    else if (obs.outcome === "success") bucket.supporting += 1;
    else bucket.contradicting += 1;
    perClaim.set(event.claim_ref, bucket);
  }

  const spots: ClassWeakSpot[] = [];
  for (const [claimRef, bucket] of perClaim) {
    const valid = bucket.supporting + bucket.contradicting;
    const successRate = valid > 0 ? round3(bucket.supporting / valid) : null;
    const reasons: string[] = [];
    let score = 0;
    if (valid > 0 && bucket.contradicting > bucket.supporting) {
      score += 100;
      reasons.push("conflicted_evidence");
    }
    if (successRate !== null && successRate < 0.6) {
      score += Math.round((1 - successRate) * 50);
      reasons.push("low_success_rate");
    }
    if (bucket.abstained > 0 && valid === 0) {
      score += 40;
      reasons.push("only_abstentions");
    }
    if (reasons.length === 0) continue;
    score += Math.min(bucket.affected.size, 50);
    spots.push({
      claim_ref: claimRef,
      members_affected: bucket.affected.size,
      success_rate: successRate,
      priority_score: score,
      reasons,
    });
  }

  return spots
    .sort((a, b) => b.priority_score - a.priority_score || (a.claim_ref < b.claim_ref ? -1 : 1))
    .slice(0, 10);
}

function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
