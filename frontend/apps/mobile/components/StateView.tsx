import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import tokens from "@llos/design-tokens";
import { describeState, type LoadState } from "@llos/api-client";
import type { ReactNode } from "react";

const TONE_COLOR = {
  neutral: tokens.color.ink_secondary,
  busy: tokens.color.accent,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
  success: tokens.color.success,
} as const;

interface StateViewProps<T> {
  state: LoadState<T> | null;
  children: (data: T) => ReactNode;
  onRetry?: () => void;
}

/** 移动端七态渲染器：与 web 共用 describeState，保证各端表现一致。 */
export function StateView<T>({ state, children, onRetry }: StateViewProps<T>) {
  if (state == null) {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color={tokens.color.accent} />
        <Text style={styles.muted}>加载中…</Text>
      </View>
    );
  }

  const p = describeState(state);

  switch (state.status) {
    case "ready":
      return <>{children(state.data)}</>;

    case "offline":
      return (
        <View style={styles.flex}>
          <View style={[styles.banner, { borderColor: tokens.color.warning }]}>
            <Text style={[styles.bannerText, { color: tokens.color.warning }]}>{p.aria_label}</Text>
          </View>
          {state.cached != null ? (
            children(state.cached)
          ) : (
            <Panel title="当前处于离线状态" body="该内容依赖在线服务，暂时无法离线使用。" tone="warning" />
          )}
        </View>
      );

    case "loading":
      return (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator color={tokens.color.accent} />
          <Text style={styles.muted}>加载中…</Text>
        </View>
      );

    case "empty":
      return <Panel title="这里还没有内容" body="完成一次学习或获取内容后，会显示在这里。" tone="neutral" />;

    case "permission_denied":
      return (
        <Panel
          title="权限不足"
          body={state.message}
          tone="warning"
          meta={`需要能力点：${state.required_capability}`}
        />
      );

    case "error_recoverable":
      return (
        <View style={styles.center}>
          <Panel title="出错了" body={state.error.message} tone="warning" />
          {onRetry ? (
            <TouchableOpacity style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
              <Text style={styles.retryText}>重试</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );

    case "error_unrecoverable":
      return (
        <Panel title="出现不可恢复的错误" body={state.error.message} tone="danger" meta={`错误码：${state.error.code}`} />
      );
  }
}

function Panel({ title, body, tone, meta }: { title: string; body: string; tone: keyof typeof TONE_COLOR; meta?: string }) {
  return (
    <View style={[styles.panel, { borderColor: TONE_COLOR[tone] }]}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelBody}>{body}</Text>
      {meta ? <Text style={styles.muted}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: tokens.space.xl, gap: tokens.space.md },
  muted: { color: tokens.color.ink_disabled, fontSize: tokens.font.size_sm, marginTop: tokens.space.xs },
  banner: {
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.accent_soft,
    padding: tokens.space.sm,
    marginBottom: tokens.space.md,
  },
  bannerText: { fontSize: tokens.font.size_sm },
  panel: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.xl,
    alignItems: "center",
    margin: tokens.space.lg,
  },
  panelTitle: { fontSize: tokens.font.size_lg, fontWeight: "600", marginBottom: tokens.space.sm },
  panelBody: { color: tokens.color.ink_secondary, textAlign: "center", marginBottom: tokens.space.xs },
  retryBtn: {
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.sm,
  },
  retryText: { color: tokens.color.accent_ink, fontWeight: "600" },
});
