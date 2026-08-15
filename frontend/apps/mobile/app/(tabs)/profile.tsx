import { StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";
import { useAccount } from "../useAccount";

const SECTION_PLACEHOLDERS = ["通知", "下载和空间", "数据与隐私", "设备与权限"] as const;

export default function ProfileScreen() {
  const account = useAccount();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{account ? account.display_name : "加载中"}</Text>
        <Text style={styles.detail}>能力点：{account ? account.capabilities.join(" / ") : ""}</Text>
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
});
