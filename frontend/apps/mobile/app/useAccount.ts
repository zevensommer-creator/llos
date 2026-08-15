import { useEffect, useState } from "react";
import { type Account, MockApiClient } from "@llos/api-client";

const client = new MockApiClient();

export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    void client.getAccount().then(setAccount);
  }, []);
  return account;
}
