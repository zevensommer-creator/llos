export type DifficultyTier = "easier" | "hold" | "harder";

export interface DifficultyHint {
  tier: DifficultyTier;
  reasons: string[];
}

export function projectAdaptiveDifficulty(
  decisions: { claim_ref: string; status: string }[],
): DifficultyHint {
  if (decisions.length === 0) {
    return { tier: "hold", reasons: ["no_decisions"] };
  }
  const achieved = decisions.filter((d) => d.status === "learned").length;
  const unstable = decisions.filter((d) =>
    d.status === "not_yet" || d.status === "uncertain" || d.status === "lapsed",
  ).length;

  if (achieved >= unstable && achieved > 0 && achieved >= Math.ceil(decisions.length / 2)) {
    return { tier: "harder", reasons: ["majority_learned"] };
  }
  if (unstable > achieved && unstable >= Math.ceil(decisions.length / 2)) {
    return { tier: "easier", reasons: ["majority_unstable"] };
  }
  return { tier: "hold", reasons: ["mixed_evidence"] };
}
