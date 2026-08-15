import type { ReactNode } from "react";
import { describeState, type LoadState } from "@llos/api-client";

interface StateViewProps<T> {
  state: LoadState<T> | null;
  /** 正常态（或带缓存的离线态）内容渲染。 */
  children: (data: T) => ReactNode;
  onRetry?: () => void;
}

/**
 * 七态渲染器：所有旅程页共用，保证同一状态在各页面表现一致。
 * 呈现元数据来自 @llos/api-client 的 describeState（单一事实来源）。
 */
export function StateView<T>({ state, children, onRetry }: StateViewProps<T>) {
  if (state == null) {
    return (
      <div className="state state--loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> 加载中…
      </div>
    );
  }

  const p = describeState(state);

  switch (state.status) {
    case "ready":
      return <>{children(state.data)}</>;

    case "offline":
      return (
        <div className="state" role="status" aria-live="polite">
          <p className="state-banner state-banner--warning">{p.aria_label}</p>
          {state.cached != null ? (
            children(state.cached)
          ) : (
            <div className="state-panel">
              <p className="state-title">当前处于离线状态</p>
              <p className="state-body">该内容依赖在线服务，暂时无法离线使用。</p>
            </div>
          )}
        </div>
      );

    case "loading":
      return (
        <div className="state state--loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> 加载中…
        </div>
      );

    case "empty":
      return (
        <div className="state state-panel" role="status">
          <p className="state-title">这里还没有内容</p>
          <p className="state-body">完成一次学习或获取内容后，会显示在这里。</p>
        </div>
      );

    case "permission_denied":
      return (
        <div className="state state-panel state-panel--warning" role="status">
          <p className="state-title">权限不足</p>
          <p className="state-body">{state.message}</p>
          <p className="state-meta">需要能力点：{state.required_capability}</p>
        </div>
      );

    case "error_recoverable":
      return (
        <div className="state state-panel state-panel--warning" role="alert">
          <p className="state-title">出错了</p>
          <p className="state-body">{state.error.message}</p>
          {onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>
              重试
            </button>
          ) : null}
        </div>
      );

    case "error_unrecoverable":
      return (
        <div className="state state-panel state-panel--danger" role="alert">
          <p className="state-title">出现不可恢复的错误</p>
          <p className="state-body">{state.error.message}</p>
          <p className="state-meta">错误码：{state.error.code}</p>
        </div>
      );
  }
}
