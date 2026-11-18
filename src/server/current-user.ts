import "server-only";
import { cookies } from "next/headers";
import type { User } from "@/domain/user";
import { SESSION_TTL_MS, resolveSession } from "./auth";
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
