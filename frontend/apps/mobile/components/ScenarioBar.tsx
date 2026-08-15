import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import tokens from "@llos/design-tokens";
import type { LoadScenario } from "@llos/api-client";

const SCENARIOS: readonly { id: LoadScenario; label: string }[] = [
  { id: "normal", label: "正常" },
  { id: "empty", label: "空白" },
  { id: "loading", label: "加载" },
  { id: "permission_denied", label: "权限不足" },
  { id: "offline", label: "离线" },
  { id: "error_recoverable", label: "可恢复" },
  { id: "error_unrecoverable", label: "不可恢复" },
];

/** UI-2 演示用七态切换条（正式 UI 不出现，仅 Mock 旅程验收用）。 */
export function ScenarioBar({ value, onChange }: { value: LoadScenario; onChange: (s: LoadScenario) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={styles.content}>
      {SCENARIOS.map((s) => {
        const active = s.id === value;
        return (
          <TouchableOpacity
            key={s.id}
            onPress={() => onChange(s.id)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0 },
  content: { gap: tokens.space.sm, paddingVertical: tokens.space.sm },
  chip: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.xs,
    backgroundColor: tokens.color.surface,
  },
  chipActive: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  chipText: { fontSize: tokens.font.size_sm, color: tokens.color.ink_secondary },
  chipTextActive: { color: tokens.color.accent_ink, fontWeight: "600" },
});
