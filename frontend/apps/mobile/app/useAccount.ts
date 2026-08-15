import { useEffect, useState, useSyncExternalStore } from "react";
import { type Account, MockApiClient } from "@llos/api-client";

export type AccountKind = "learner" | "teacher";

// UI-2 Mock 演示用全局账户存储（useSyncExternalStore，无第三方状态库）。
// 正式状态管理选型见 TECH_STACK（UI-2 选型），此处仅服务 Mock 旅程验收。
let kind: AccountKind = "learner";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAccountKind(next: AccountKind) {
  if (next !== kind) {
    kind = next;
    emit();
  }
}

export function useAccountKind(): AccountKind {
  return useSyncExternalStore(subscribe, () => kind);
}

const CLIENTS: Record<AccountKind, MockApiClient> = {
  learner: new MockApiClient({ account: "learner" }),
  teacher: new MockApiClient({ account: "teacher" }),
};

export function useAccount(): Account | null {
  const k = useAccountKind();
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    void CLIENTS[k].getAccount().then(setAccount);
  }, [k]);
  return account;
}
