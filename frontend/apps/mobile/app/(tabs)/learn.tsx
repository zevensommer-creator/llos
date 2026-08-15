import { StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";

// CLIENT_SURFACE_SPEC §6：聊天与学习两种会话在标题、导航、状态上明确区分；
// 聊天（DLC 为空）不产生学习状态，永不显示学习进度。
export default function LearnScreen() {
  return (
    <View style={styles.container}>
      <View style={[styles.modeCard, { borderColor: tokens.color.mode_learning }]}>
        <Text style={[styles.modeTitle, { color: tokens.color.mode_learning }]}>LearningSession</Text>
        <Text style={styles.modeDetail}>三层就绪（DLC + MaterialSnapshot + IR）后执行训练，产生学习证据</Text>
      </View>
      <View style={[styles.modeCard, { borderColor: tokens.color.mode_chat }]}>
        <Text style={[styles.modeTitle, { color: tokens.color.mode_chat }]}>ChatSession</Text>
        <Text style={styles.modeDetail}>普通聊天：不显示学习进度，不生成复习安排</Text>
      </View>
      <Text style={styles.placeholder}>UI-2 将以 Mock 旅程填充当前学习组合与历史状态</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.lg },
  modeCard: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  modeTitle: { fontSize: tokens.font.size_lg, fontWeight: "600" },
  modeDetail: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_md, marginTop: tokens.space.xs },
  placeholder: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm, marginTop: tokens.space.md },
});
