import type { DLCManifest, MaterialPack } from "@llos/contracts";

// 版本隐形管理（product_spec §6.7）：创作者从不接触版本号，系统按变更
// 类型自动判定——素材/文案变更 → patch/minor；教学结构变更 → major。

export type VersionBumpKind = "patch" | "minor" | "major";

export interface VersionDecision {
  kind: VersionBumpKind;
  reason: string;
}

export function bumpVersion(version: string, kind: VersionBumpKind): string {
  const parts = version.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`not a semver string: ${version}`);
  }
  const nums = parts.map((p) => Number(p));
  if (kind === "patch") return `${nums[0]}.${nums[1]}.${nums[2] + 1}`;
  if (kind === "minor") return `${nums[0]}.${nums[1] + 1}.0`;
  return `${nums[0] + 1}.0.0`;
}

export function decideVersionBump(
  previous: { pack: MaterialPack; manifest: DLCManifest },
  next: { pack: MaterialPack; manifest: DLCManifest },
): VersionDecision {
  if (teachingStructureChanged(previous.manifest, next.manifest)) {
    return {
      kind: "major",
      reason: "教学结构发生变化（学习目标或评估政策调整），老学员的进度将按新课程重新安排",
    };
  }
  if (materialScopeChanged(previous.pack, next.pack)) {
    return {
      kind: "minor",
      reason: "课程内容有增减，新增了学习单元",
    };
  }
  return {
    kind: "patch",
    reason: "仅文字与说明的修订，学习单元保持不变",
  };
}

/** 教学结构 = 学什么（claims）+ 怎么练怎么评（训练模式 + 评估政策 + 理论档案 + 编译管线）。 */
function teachingStructureChanged(prev: DLCManifest, next: DLCManifest): boolean {
  const keyOf = (m: DLCManifest) =>
    JSON.stringify([
      m.claims?.map((c) => [c.claim_ref, c.evidence_policy_ref, c.evidence_policy_version]) ?? [],
      m.evidence_policies.map((p) => [p.policy_ref, p.version]),
      m.theory_profile.map((t) => [t.id, t.role]),
      m.passes.map((p) => [p.id, p.entrypoint, p.output_kind]),
      m.missing_input_handling,
      m.degradation_policy,
      m.accepted_material_schemas,
      // 专家模式训练模式信封（sha256 绑定内容）：训练结构变化影响学员进度安排。
      m.extensions ?? {},
    ]);
  return keyOf(prev) !== keyOf(next);
}

/** 素材范围 = 学员要过的单元集合（增删单元）。文案变化不算。 */
function materialScopeChanged(prev: MaterialPack, next: MaterialPack): boolean {
  const idsOf = (p: MaterialPack) => new Set(p.semantic_frames.map((f) => f.id));
  const prevIds = idsOf(prev);
  const nextIds = idsOf(next);
  if (prevIds.size !== nextIds.size) return true;
  for (const id of prevIds) {
    if (!nextIds.has(id)) return true;
  }
  return false;
}
