import { StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";

// 教师随身班级助手（非缩小版电脑后台）。批量操作显示"请在电脑端完成"。
export default function ClassesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>德语 A1 班（Mock）</Text>
        <Text style={styles.detail}>24 名成员 · 今日待处理 3 项 · 2 名学生逾期</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>快捷操作</Text>
        <Text style={styles.detail}>发布通知 / 生成邀请码 / 单次分配</Text>
      </View>
      <Text style={styles.hint}>批量成员管理与批量购买请在电脑端完成</Text>
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
  title: { color: tokens.color.ink, fontSize: tokens.font.size_lg, fontWeight: "600" },
  detail: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_md, marginTop: tokens.space.xs },
  hint: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm },
});
