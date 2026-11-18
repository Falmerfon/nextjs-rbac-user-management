import "server-only";
import { cookies } from "next/headers";
import type { User } from "@/domain/user";
import { SESSION_TTL_MS, resolveSession } from "./auth";
import { jsonError } from "./http";
import { getStore } from "./store";

export const SESSION_COOKIE = "session";

export async function readSessionId(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * The logged-in user for this request, or null. Pages and route handlers call
 * this and nothing else to find out who is asking. The cookie carries only a
 * session id, so the user, their role and their status come from the store.
 */
export async function getCurrentUser(): Promise<User | null> {
  const sessionId = await readSessionId();
  return sessionId ? resolveSession(getStore(), sessionId) : null;
}

/**
 * What every API route starts with. Either the logged-in user, or the 401 to
 * send back. A deactivated user's session no longer resolves, so their next
 * request ends here (rule 5).
 */
export async function requireUser(): Promise<
  { ok: true; user: User } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();
  return user
    ? { ok: true, user }
    : {
        ok: false,
        response: jsonError(401, "UNAUTHENTICATED", "You are not logged in."),
      };
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    // Off by default so the app also works over plain http on localhost.
    // Set SESSION_COOKIE_SECURE=true when serving over https.
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
