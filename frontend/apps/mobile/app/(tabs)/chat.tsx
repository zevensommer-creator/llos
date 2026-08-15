import { StyleSheet, Text, View } from "react-native";
import tokens from "@llos/design-tokens";
import type { ChatSessionView } from "@llos/api-client";
import { JourneyScreen } from "../../components/JourneyScreen";

// 聊天旅程（ChatSession）。§6：可引用素材，但永不显示学习进度/掌握度。
export default function ChatScreen() {
  return (
    <JourneyScreen journey="chat">{(data) => <ChatView data={data} />}</JourneyScreen>
  );
}

function ChatView({ data }: { data: ChatSessionView }) {
  return (
    <View>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: tokens.color.mode_chat_soft }]}>
          <Text style={[styles.badgeText, { color: tokens.color.mode_chat }]}>ChatSession</Text>
        </View>
        <Text style={styles.title}>{data.session.title}</Text>
      </View>
      <Text style={styles.note}>普通聊天：不产生学习状态，不显示学习进度。</Text>
      {data.messages.map((m) => (
        <View
          key={m.message_id}
          style={[styles.msg, m.role === "user" && styles.msgUser]}
        >
          <Text style={styles.role}>{m.role === "user" ? "我" : "助手"}</Text>
          <Text style={styles.text}>{m.text}</Text>
          {m.referenced_material ? (
            <Text style={styles.ref}>引用素材：{m.referenced_material}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.xs },
  badge: { borderRadius: tokens.radius.pill, paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xs },
  badgeText: { fontSize: tokens.font.size_sm, fontWeight: "600" },
  title: { color: tokens.color.ink, fontSize: tokens.font.size_lg, fontWeight: "600", flex: 1 },
  note: { color: tokens.color.ink_secondary, fontSize: tokens.font.size_sm, marginBottom: tokens.space.md },
  msg: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
  },
  msgUser: { backgroundColor: tokens.color.accent_soft },
  role: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm },
  text: { color: tokens.color.ink, fontSize: tokens.font.size_md, marginTop: tokens.space.xs },
  ref: { color: tokens.color.mode_chat, fontSize: tokens.font.size_sm, marginTop: tokens.space.xs },
});
