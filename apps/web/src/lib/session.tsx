import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { canSee, type Area, type DemoAccount } from "./roles";
import { currentAccount, setCurrentUser } from "./user";

interface Session {
  account: DemoAccount | null;
  signIn: (account: DemoAccount) => void;
  signOut: () => void;
  can: (area: Area) => boolean;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<DemoAccount | null>(currentAccount);

  const signIn = useCallback((a: DemoAccount) => {
    setCurrentUser(a.username);
    setAccount(a);
  }, []);
  const signOut = useCallback(() => {
    setCurrentUser(null);
    setAccount(null);
  }, []);

  const value = useMemo<Session>(
    () => ({ account, signIn, signOut, can: (area) => (account ? canSee(account.role, area) : false) }),
    [account, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside <SessionProvider>");
  return s;
}
