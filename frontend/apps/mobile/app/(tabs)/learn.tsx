import { StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";
import type { LearningSessionView } from "@llos/api-client";
import { JourneyScreen } from "../../components/JourneyScreen";

const VERDICT_LABEL: Record<string, string> = {
  correct: "正确",
  partial: "部分正确",
  incorrect: "不正确",
  abstained: "暂不判定（证据不足）",
};

// 学习旅程（LearningSession）：三层就绪后执行训练，展示版本化可撤销的学习状态；
// 评价器弃权（abstained）不得显示为学习者失败（§7 / 不变量 7 / VIEW_MODELS §3）。
export default function LearnScreen() {
  return (
    <JourneyScreen journey="learning">{(data) => <LearnView data={data} />}</JourneyScreen>
  );
}

function LearnView({ data }: { data: LearningSessionView }) {
  const { session } = data;
  const current = session.activities?.[data.current_activity_index];

  return (
    <View>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: tokens.color.mode_learning_soft }]}>
          <Text style={[styles.badgeText, { color: tokens.color.mode_learning }]}>LearningSession</Text>
        </View>
        <Text style={styles.title}>{session.title}</Text>
      </View>

      {session.snapshot ? (
        <Text style={styles.note}>
          {session.snapshot.title} · {session.snapshot.item_count} 项 · v{session.snapshot.version}
          {session.snapshot.offline_allowed ? " · 可离线" : " · 需在线"}
        </Text>
      ) : null}

      {current ? (
        <View style={styles.card}>
          <Text style={styles.kind}>当前活动（{current.kind}）</Text>
          <Text style={styles.prompt}>{current.prompt}</Text>
          {current.requires_microphone ? <Text style={styles.meta}>需要麦克风</Text> : null}
        </View>
      ) : null}

      {data.feedback ? (
        <View style={[styles.card, data.feedback.verdict === "abstained" && styles.cardAbstain]}>
          <Text style={styles.kind}>反馈</Text>
          <Text style={styles.prompt}>{VERDICT_LABEL[data.feedback.verdict] ?? data.feedback.verdict}</Text>
          <Text style={styles.body}>{data.feedback.explanation}</Text>
        </View>
      ) : null}

      {session.learning_state && session.learning_state.length > 0 ? (
        <View>
          <Text style={styles.kind}>学习状态</Text>
          {session.learning_state.map((s) => (
            <View key={s.claim_id} style={styles.stateCard}>
              <Text style={[styles.mastery, { color: masteryColor(s.status) }]}>{s.display_label}</Text>
              <Text style={styles.body}>{s.reason_summary}</Text>
              <Text style={styles.meta}>下一步：{s.next_action} · 政策 {s.policy_ref}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.sync}>
        同步队列：{data.sync_queue.pending_count} 待提交 · {data.sync_queue.online ? "在线" : "离线"}
      </Text>
    </View>
  );
}

function masteryColor(status: string): string {
  switch (status) {
    case "learned":
      return tokens.color.success;
    case "provisional":
      return tokens.color.warning;
    case "lapsed":
      return tokens.color.danger;
    default:
      return tokens.color.ink_secondary;
  }
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.xs },
  badge: { borderRadius: tokens.radius.pill, paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xs },
  badgeText: { fontSize: tokens.font.size_sm, fontWeight: "600" },
  title: { color: tokens.color.ink, fontSize: tokens.font.size_lg, fontWeight: "600", flex: 1 },
  note: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_sm, marginBottom: tokens.space.md },
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderLeftColor: tokens.color.mode_learning,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  cardAbstain: { borderLeftColor: tokens.color.warning },
  kind: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm, marginBottom: tokens.space.xs },
  prompt: { color: tokens.color.ink, fontSize: tokens.font.size_lg, marginBottom: tokens.space.xs },
  body: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_md },
  meta: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm, marginTop: tokens.space.xs },
  stateCard: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
  },
  mastery: { fontSize: tokens.font.size_md, fontWeight: "600", marginBottom: tokens.space.xs },
  sync: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm, marginTop: tokens.space.md },
});
