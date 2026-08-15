import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import tokens from "@llos/design-tokens";
import { setAccountKind, useAccount, useAccountKind } from "../useAccount";

const SECTION_PLACEHOLDERS = ["通知", "下载和空间", "数据与隐私", "设备与权限"] as const;

export default function ProfileScreen() {
  const account = useAccount();
  const accountKind = useAccountKind();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{account ? account.display_name : "加载中"}</Text>
        <Text style={styles.detail}>能力点：{account ? account.capabilities.join(" / ") : ""}</Text>
      </View>

      {/* UI-2 Mock 演示：账户切换（正式 UI 由登录态决定） */}
      <View style={styles.row}>
        <Text style={styles.rowTitle}>演示账户</Text>
        <View style={styles.toggle}>
          <TouchableOpacity
            onPress={() => setAccountKind("learner")}
            style={[styles.toggleBtn, accountKind === "learner" && styles.toggleBtnActive]}
            accessibilityRole="button"
          >
            <Text style={accountKind === "learner" ? styles.toggleTextActive : styles.toggleText}>学习者</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAccountKind("teacher")}
            style={[styles.toggleBtn, accountKind === "teacher" && styles.toggleBtnActive]}
            accessibilityRole="button"
          >
            <Text style={accountKind === "teacher" ? styles.toggleTextActive : styles.toggleText}>教师</Text>
          </TouchableOpacity>
        </View>
      </View>

      {SECTION_PLACEHOLDERS.map((section) => (
        <View key={section} style={styles.row}>
          <Text style={styles.rowTitle}>{section}</Text>
          <Text style={styles.rowHint}>UI-2 填充</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.lg },
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  name: { color: tokens.color.ink, fontSize: tokens.font.size_xl, fontWeight: "600" },
  detail: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_sm, marginTop: tokens.space.xs },
  row: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowTitle: { color: tokens.color.ink, fontSize: tokens.font.size_md },
  rowHint: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm },
  toggle: { flexDirection: "row", gap: tokens.space.xs },
  toggleBtn: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.xs,
    backgroundColor: tokens.color.surface,
  },
  toggleBtnActive: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  toggleText: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_sm },
  toggleTextActive: { color: tokens.color.accent_ink, fontSize: tokens.font.size_sm, fontWeight: "600" },
});
