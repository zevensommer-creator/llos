import type { LoadState } from "./types.js";

/**
 * 七态 → 呈现描述符。web 与移动端共用，保证四个旅程在各端对同一状态渲染一致。
 * 只产出中性的呈现元数据（色调/可否重试/是否有数据/语义标签），具体文案由各端决定。
 */
export interface StatePresentation {
  /** 语义化状态键，与七态一一对应。 */
  kind: LoadState<unknown>["status"];
  /** 视觉色调（映射到 design-tokens 的 accent/success/warning/danger 等）。 */
  tone: "neutral" | "busy" | "warning" | "danger" | "success";
  /** 是否展示“重试”操作（仅可恢复失败）。 */
  can_retry: boolean;
  /** 是否有可渲染的数据（ready 或带缓存的 offline）。 */
  has_data: boolean;
  /** 无障碍播报文本（aria-live）。 */
  aria_label: string;
}

export function describeState<T>(state: LoadState<T>): StatePresentation {
  switch (state.status) {
    case "ready":
      return { kind: "ready", tone: "success", can_retry: false, has_data: true, aria_label: "内容已加载" };
    case "empty":
      return { kind: "empty", tone: "neutral", can_retry: false, has_data: false, aria_label: "暂无内容" };
    case "loading":
      return { kind: "loading", tone: "busy", can_retry: false, has_data: false, aria_label: "加载中" };
    case "permission_denied":
      return { kind: "permission_denied", tone: "warning", can_retry: false, has_data: false, aria_label: "权限不足" };
    case "offline":
      return {
        kind: "offline",
        tone: "warning",
        can_retry: false,
        has_data: state.cached != null,
        aria_label: state.cached != null ? "离线，显示已下载内容" : "离线，无可用离线内容",
      };
    case "error_recoverable":
      return { kind: "error_recoverable", tone: "warning", can_retry: true, has_data: false, aria_label: "出错了，可重试" };
    case "error_unrecoverable":
      return { kind: "error_unrecoverable", tone: "danger", can_retry: false, has_data: false, aria_label: "出现不可恢复的错误" };
  }
}

/** 全部七种状态键，供遍历测试/演示。 */
export const ALL_STATE_KINDS: readonly StatePresentation["kind"][] = [
  "ready",
  "empty",
  "loading",
  "permission_denied",
  "offline",
  "error_recoverable",
  "error_unrecoverable",
];
