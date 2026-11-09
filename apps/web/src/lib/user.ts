/**
 * Stand-in for sign-in until Amazon Cognito is wired up (Spec §2, S2).
 * Every change the API records is attributed to the signed-in username (`x-user`).
 */
import { DEMO_ACCOUNTS, type DemoAccount } from "./roles";

const KEY = "mms.user";

export const DEMO_USERS = DEMO_ACCOUNTS.map((a) => a.username);

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Username sent to the API. Falls back to the HR officer so tests and the first slice keep working. */
export function currentUser(): string {
  return read() ?? "hr.officer";
}

/** The signed-in demo account, or null when nobody has signed in yet. */
export function currentAccount(): DemoAccount | null {
  const username = read();
  return DEMO_ACCOUNTS.find((a) => a.username === username) ?? null;
}

export function setCurrentUser(user: string | null): void {
  try {
    if (user === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, user);
  } catch {
    /* storage unavailable: keep the default */
  }
}
