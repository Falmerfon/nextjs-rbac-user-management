import { beforeEach, describe, expect, it } from "vitest";
import { USER_STATUS } from "@/domain/user";
import { ROLES } from "@/permissions/roles";
import {
  SESSION_TTL_MS,
  destroySession,
  destroySessionsForUser,
  login,
  resolveSession,
} from "./auth";
import { createSeededStore, type Store } from "./store";

let store: Store;

beforeEach(() => {
  store = createSeededStore();
});

function loginAs(email: string, password: string) {
  const result = login(store, email, password);
  if (!result.ok) throw new Error(`Login failed for ${email}: ${result.code}`);
  return result;
}

describe("login", () => {
  it("opens a session for a valid email and password", () => {
    const result = loginAs("anna@example.com", "anna123");
    expect(result.user.id).toBe("usr_anna");
    expect(store.sessions.get(result.sessionId)?.userId).toBe("usr_anna");
  });

  it("ignores case and surrounding spaces in the email", () => {
    expect(login(store, "  ANNA@Example.com ", "anna123").ok).toBe(true);
  });

  it("never returns a password", () => {
    expect(loginAs("anna@example.com", "anna123").user).not.toHaveProperty(
      "password",
    );
  });

  it("gives the same answer for a wrong password and an unknown email", () => {
    expect(login(store, "anna@example.com", "nope")).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
    });
    expect(login(store, "nobody@example.com", "anna123")).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
    });
  });

  it("refuses a deactivated account that has the right password", () => {
    expect(login(store, "viktor@example.com", "viktor123")).toEqual({
      ok: false,
      code: "ACCOUNT_DEACTIVATED",
    });
    expect(store.sessions.size).toBe(0);
  });

  it("does not reveal a deactivated account to a wrong password", () => {
    expect(login(store, "viktor@example.com", "nope")).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
    });
  });

  it("issues a fresh session id on every login", () => {
    const first = loginAs("anna@example.com", "anna123");
    const second = loginAs("anna@example.com", "anna123");
    expect(second.sessionId).not.toBe(first.sessionId);
  });
});

describe("resolveSession", () => {
  it("returns the user for a live session", () => {
    const { sessionId } = loginAs("olena@example.com", "olena123");
    expect(resolveSession(store, sessionId)?.id).toBe("usr_olena");
  });

  it("returns null for an unknown session id", () => {
    expect(resolveSession(store, "not-a-session")).toBeNull();
  });

  it("returns null once the session has expired", () => {
    const start = 1_000_000;
    const result = login(store, "olena@example.com", "olena123", start);
    if (!result.ok) throw new Error("login failed");

    expect(resolveSession(store, result.sessionId, start + SESSION_TTL_MS - 1))
      .not.toBeNull();
    expect(
      resolveSession(store, result.sessionId, start + SESSION_TTL_MS),
    ).toBeNull();
    expect(store.sessions.has(result.sessionId)).toBe(false);
  });

  it("rule 5: the next request after a deactivation gets no user", () => {
    const { sessionId } = loginAs("olena@example.com", "olena123");
    expect(resolveSession(store, sessionId)).not.toBeNull();

    const olena = store.users.get("usr_olena");
    if (!olena) throw new Error("usr_olena is missing from the seed");
    olena.status = USER_STATUS.DEACTIVATED;

    expect(resolveSession(store, sessionId)).toBeNull();
    expect(store.sessions.has(sessionId)).toBe(false);
  });

  it("sees a role change on the very next call", () => {
    const { sessionId } = loginAs("anna@example.com", "anna123");
    const anna = store.users.get("usr_anna");
    if (!anna) throw new Error("usr_anna is missing from the seed");
    anna.role = ROLES.USER;

    expect(resolveSession(store, sessionId)?.role).toBe(ROLES.USER);
  });

  it("hands out a copy, so callers cannot edit the stored user", () => {
    const { sessionId } = loginAs("anna@example.com", "anna123");
    const resolved = resolveSession(store, sessionId);
    if (!resolved) throw new Error("session did not resolve");
    resolved.role = ROLES.IT;

    expect(store.users.get("usr_anna")?.role).toBe(ROLES.MANAGER);
  });
});

describe("closing sessions", () => {
  it("destroySession ends one session", () => {
    const { sessionId } = loginAs("anna@example.com", "anna123");
    destroySession(store, sessionId);
    expect(resolveSession(store, sessionId)).toBeNull();
  });

  it("destroySessionsForUser ends all of one user's sessions and no others", () => {
    const first = loginAs("anna@example.com", "anna123");
    const second = loginAs("anna@example.com", "anna123");
    const other = loginAs("olena@example.com", "olena123");

    expect(destroySessionsForUser(store, "usr_anna")).toBe(2);
    expect(resolveSession(store, first.sessionId)).toBeNull();
    expect(resolveSession(store, second.sessionId)).toBeNull();
    expect(resolveSession(store, other.sessionId)).not.toBeNull();
  });
});
