import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { USER_STATUS, type User } from "@/domain/user";
import type { Store } from "./store";

/** How long a login lasts. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type LoginResult =
  | { ok: true; user: User; sessionId: string }
  | { ok: false; code: "INVALID_CREDENTIALS" | "ACCOUNT_DEACTIVATED" };

function findUserByEmail(store: Store, email: string): User | undefined {
  const wanted = email.trim().toLowerCase();
  for (const user of store.users.values()) {
    if (user.email.toLowerCase() === wanted) return user;
  }
  return undefined;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks the credentials and opens a session.
 *
 * A deactivated account is reported only after the password was right, so the
 * message cannot be used to find out which emails exist. Every login gets a new
 * session id, which rules out session fixation.
 */
export function login(
  store: Store,
  email: string,
  password: string,
  now: number = Date.now(),
): LoginResult {
  const user = findUserByEmail(store, email);
  const expected = user ? store.passwords.get(user.id) : undefined;

  if (!user || expected === undefined || !sameText(expected, password)) {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    return { ok: false, code: "ACCOUNT_DEACTIVATED" };
  }

  const sessionId = randomBytes(32).toString("base64url");
  store.sessions.set(sessionId, {
    userId: user.id,
    expiresAt: now + SESSION_TTL_MS,
  });
  return { ok: true, user: { ...user }, sessionId };
}

/**
 * Turns a session id into the user it belongs to, or null.
 *
 * This is how rule 5 works. The session stores only a user id. The user is read
 * from the store on every call, so a deactivation or a role change made one
 * request ago is already visible here, and a deactivated user's next request
 * gets null.
 */
export function resolveSession(
  store: Store,
  sessionId: string,
  now: number = Date.now(),
): User | null {
  const session = store.sessions.get(sessionId);
  if (!session) return null;

  const user = store.users.get(session.userId);
  if (session.expiresAt <= now || !user || user.status !== USER_STATUS.ACTIVE) {
    store.sessions.delete(sessionId);
    return null;
  }
  return { ...user };
}

export function destroySession(store: Store, sessionId: string): void {
  store.sessions.delete(sessionId);
}

/** Closes every session of one user. Returns how many it closed. */
export function destroySessionsForUser(store: Store, userId: string): number {
  let closed = 0;
  for (const [sessionId, session] of store.sessions) {
    if (session.userId === userId) {
      store.sessions.delete(sessionId);
      closed += 1;
    }
  }
  return closed;
}
