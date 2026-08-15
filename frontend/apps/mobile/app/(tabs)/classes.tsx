import { StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";
import type { TeacherMobileDashboardViewModel } from "@llos/api-client";
import { JourneyScreen } from "../../components/JourneyScreen";

// 教师助手旅程（教师移动端仪表盘，§4）：随身班级助手，非缩小版电脑后台。
// 批量/高级功能显示"请在电脑端完成"。学习者账户进入会得到权限不足（§2 服务端重新授权）。
export default function ClassesScreen() {
  return (
    <JourneyScreen journey="teacher">{(data) => <TeacherView data={data} />}</JourneyScreen>
  );
}

function TeacherView({ data }: { data: TeacherMobileDashboardViewModel }) {
  return (
    <View>
      <View style={styles.summaryCard}>
        <Text style={styles.big}>{data.today_pending_count}</Text>
        <Text style={styles.detail}>今日待处理</Text>
      </View>

      {data.overdue_tasks.length > 0 ? (
        <View>
          <Text style={styles.kind}>到期 / 逾期任务</Text>
          {data.overdue_tasks.map((t) => (
            <View key={t.task_id} style={styles.row}>
              <Text style={styles.rowTitle}>{t.label}</Text>
              <Text style={[styles.rowHint, t.overdue && styles.overdue]}>
                {t.overdue ? "已逾期" : `截止 ${t.due}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.new_member_names.length > 0 ? (
        <Text style={styles.note}>新成员：{data.new_member_names.join("、")}</Text>
      ) : null}

      <Text style={styles.kind}>班级概览</Text>
      {data.classes.map((c) => (
        <View key={c.class_id} style={styles.classCard}>
          <Text style={styles.title}>{c.name}</Text>
          <Text style={styles.detail}>
            {c.member_count} 名成员 · 完成率 {Math.round(c.completion_rate * 100)}% · {c.overdue_count} 逾期
          </Text>
          {c.anomaly ? <Text style={styles.anomaly}>{c.anomaly}</Text> : null}
        </View>
      ))}

      <Text style={styles.hint}>{data.advanced_note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
    alignItems: "center",
  },
  big: { color: tokens.color.accent, fontSize: tokens.font.size_display, fontWeight: "600" },
  kind: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm, margin: tokens.space.sm },
  row: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowTitle: { color: tokens.color.ink, fontSize: tokens.font.size_md, flex: 1 },
  rowHint: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm },
  overdue: { color: tokens.color.danger },
  note: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_sm, margin: tokens.space.sm },
  classCard: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  title: { color: tokens.color.ink, fontSize: tokens.font.size_lg, fontWeight: "600" },
  detail: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_md, marginTop: tokens.space.xs },
  anomaly: { color: tokens.color.warning, fontSize: tokens.font.size_sm, marginTop: tokens.space.xs },
  hint: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm, marginTop: tokens.space.sm },
});
