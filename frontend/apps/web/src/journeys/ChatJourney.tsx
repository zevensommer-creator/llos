import type { ChatSessionView } from "@llos/api-client";

/**
 * 聊天旅程（ChatSession）。CLIENT_SURFACE_SPEC §6：聊天可引用素材，
 * 但不显示学习进度、不生成掌握度或复习安排——本组件刻意不渲染任何学习状态。
 */
export function ChatJourney({ data }: { data: ChatSessionView }) {
  return (
    <div className="journey">
      <header className="journey-head">
        <span className="mode-badge mode-badge--chat">ChatSession</span>
        <h2 className="journey-title">{data.session.title}</h2>
      </header>
      <p className="journey-note">普通聊天：不产生学习状态，不显示学习进度。</p>
      <ul className="chat-list">
        {data.messages.map((m) => (
          <li key={m.message_id} className={`chat-msg chat-msg--${m.role}`}>
            <span className="chat-role">{m.role === "user" ? "我" : "助手"}</span>
            <p className="chat-text">{m.text}</p>
            {m.referenced_material ? (
              <span className="chat-ref">引用素材：{m.referenced_material}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
