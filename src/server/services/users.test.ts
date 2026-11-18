import { beforeEach, describe, expect, it } from "vitest";
import { USER_STATUS, type User } from "@/domain/user";
import { ROLES } from "@/permissions/roles";
import { login, resolveSession } from "../auth";
import { createSeededStore, type Store } from "../store";
import type { ServiceResult } from "./result";
import { createUser, getUser, listUsers, updateUser } from "./users";

let store: Store;

beforeEach(() => {
  store = createSeededStore();
});

/** The stored user with this id, used as the acting user. */
function actor(id: string): User {
  const user = store.users.get(id);
  if (!user) throw new Error(`No seeded user ${id}`);
  return user;
}

function valueOf<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.value;
}

const codeOf = (result: ServiceResult<unknown>) =>
  result.ok ? "ok" : result.code;

const deactivate = { status: USER_STATUS.DEACTIVATED };

const validNewUser = {
  fullName: "Nina Hrytsenko",
  email: "nina@example.com",
  password: "secret1",
  role: ROLES.USER,
};

describe("listUsers", () => {
  it("shows IT every account, oldest first", () => {
    const users = valueOf(listUsers(store, actor("usr_ivan")));
    expect(users).toHaveLength(store.users.size);
    const created = users.map((user) => user.createdAt);
    expect(created).toEqual([...created].sort());
  });

  it("scenario 7: shows Anna her four direct reports and nobody else", () => {
    const ids = valueOf(listUsers(store, actor("usr_anna"))).map(
      (user) => user.id,
    );
    expect(ids.sort()).toEqual(
      ["usr_bohdan", "usr_maksym", "usr_olena", "usr_sofiia"].sort(),
    );
  });

  it("shows a manager without reports an empty list", () => {
    expect(valueOf(listUsers(store, actor("usr_taras")))).toEqual([]);
  });

  it("refuses a plain user", () => {
    expect(codeOf(listUsers(store, actor("usr_olena")))).toBe("FORBIDDEN");
  });

  it("refuses a deactivated actor", () => {
    const anna = actor("usr_anna");
    anna.status = USER_STATUS.DEACTIVATED;
    expect(codeOf(listUsers(store, anna))).toBe("ACTOR_INACTIVE");
  });

  it("returns copies, not the stored objects", () => {
    const users = valueOf(listUsers(store, actor("usr_ivan")));
    const first = users[0];
    if (!first) throw new Error("expected at least one user");
    first.fullName = "Tampered";
    expect(store.users.get(first.id)?.fullName).not.toBe("Tampered");
  });
});

describe("getUser", () => {
  it("lets a manager read a direct report", () => {
    expect(valueOf(getUser(store, actor("usr_anna"), "usr_olena")).id).toBe(
      "usr_olena",
    );
  });

  it("refuses a manager who asks for a user from another team or for themselves", () => {
    expect(codeOf(getUser(store, actor("usr_anna"), "usr_dmytro"))).toBe(
      "NOT_A_DIRECT_REPORT",
    );
    expect(codeOf(getUser(store, actor("usr_anna"), "usr_anna"))).toBe(
      "NOT_A_DIRECT_REPORT",
    );
  });

  it("lets IT read anyone and reports a missing id as not found", () => {
    expect(valueOf(getUser(store, actor("usr_ivan"), "usr_dmytro")).id).toBe(
      "usr_dmytro",
    );
    expect(codeOf(getUser(store, actor("usr_ivan"), "usr_nobody"))).toBe(
      "NOT_FOUND",
    );
  });

  it("gives a role with no access the same answer for a real and a made-up id", () => {
    const olena = actor("usr_olena");
    expect(codeOf(getUser(store, olena, "usr_ivan"))).toBe("FORBIDDEN");
    expect(codeOf(getUser(store, olena, "usr_nobody"))).toBe("FORBIDDEN");
  });
});

describe("createUser", () => {
  it("lets IT create a user who can then log in", () => {
    const now = Date.UTC(2026, 5, 1);
    const created = valueOf(
      createUser(store, actor("usr_ivan"), validNewUser, now),
    );

    expect(created.id).toMatch(/^usr_[0-9a-f]{10}$/);
    expect(created).toMatchObject({
      fullName: "Nina Hrytsenko",
      email: "nina@example.com",
      role: ROLES.USER,
      status: USER_STATUS.ACTIVE,
      managerId: null,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    expect(created).not.toHaveProperty("password");
    expect(login(store, "nina@example.com", "secret1").ok).toBe(true);
  });

  it("refuses everyone but IT and adds nothing", () => {
    const before = store.users.size;
    expect(codeOf(createUser(store, actor("usr_anna"), validNewUser))).toBe(
      "FORBIDDEN",
    );
    expect(codeOf(createUser(store, actor("usr_olena"), validNewUser))).toBe(
      "FORBIDDEN",
    );
    expect(store.users.size).toBe(before);
  });

  it("checks permission before it validates the body", () => {
    expect(codeOf(createUser(store, actor("usr_anna"), { nonsense: true }))).toBe(
      "FORBIDDEN",
    );
  });

  it("refuses an email that is taken, whatever its case", () => {
    const result = createUser(store, actor("usr_ivan"), {
      ...validNewUser,
      email: "ANNA@example.com",
    });
    expect(codeOf(result)).toBe("EMAIL_TAKEN");
  });

  it.each([
    ["an unknown manager id", "usr_nobody"],
    ["an IT account", "usr_ivan"],
    ["a plain user", "usr_olena"],
    ["a deactivated manager", "usr_viktor"],
  ])("refuses %s as manager", (_label, managerId) => {
    const result = createUser(store, actor("usr_ivan"), {
      ...validNewUser,
      managerId,
    });
    expect(codeOf(result)).toBe("INVALID_MANAGER");
  });

  it("accepts an active manager", () => {
    const created = valueOf(
      createUser(store, actor("usr_ivan"), {
        ...validNewUser,
        managerId: "usr_taras",
      }),
    );
    expect(created.managerId).toBe("usr_taras");
  });

  it.each([
    ["an unknown role", { role: "admin" }],
    ["a weak password", { password: "abc" }],
    ["a status chosen by the caller", { status: USER_STATUS.DEACTIVATED }],
    ["an id chosen by the caller", { id: "usr_ivan" }],
  ])("rejects %s with a validation error", (_label, override) => {
    const result = createUser(store, actor("usr_ivan"), {
      ...validNewUser,
      ...override,
    });
    expect(codeOf(result)).toBe("VALIDATION");
    if (!result.ok) expect(result.issues?.length).toBeGreaterThan(0);
  });
});

describe("updateUser: who may edit whom", () => {
  it("scenario 7: lets Anna rename a direct report", () => {
    const updated = valueOf(
      updateUser(store, actor("usr_anna"), "usr_olena", {
        fullName: "Olena K.",
        email: "  Olena.K@Example.com ",
      }),
    );
    expect(updated.fullName).toBe("Olena K.");
    expect(store.users.get("usr_olena")).toMatchObject({
      fullName: "Olena K.",
      email: "olena.k@example.com",
    });
  });

  it("scenario 7: refuses Anna on Dmytro and leaves him untouched", () => {
    const before = { ...actor("usr_dmytro") };
    expect(
      codeOf(
        updateUser(store, actor("usr_anna"), "usr_dmytro", { fullName: "Nope" }),
      ),
    ).toBe("NOT_A_DIRECT_REPORT");
    expect(store.users.get("usr_dmytro")).toEqual(before);
  });

  it("does not hand back a stranger's record for a request that changes nothing", () => {
    const dmytro = actor("usr_dmytro");
    const result = updateUser(store, actor("usr_anna"), "usr_dmytro", {
      fullName: dmytro.fullName,
    });
    expect(codeOf(result)).toBe("NOT_A_DIRECT_REPORT");
  });

  it("scenario 8: refuses Anna who gives herself the IT role", () => {
    expect(
      codeOf(
        updateUser(store, actor("usr_anna"), "usr_anna", { role: ROLES.IT }),
      ),
    ).toBe("FORBIDDEN");
    expect(store.users.get("usr_anna")?.role).toBe(ROLES.MANAGER);
  });

  it("refuses a manager who edits their own profile", () => {
    expect(
      codeOf(
        updateUser(store, actor("usr_anna"), "usr_anna", { fullName: "Nope" }),
      ),
    ).toBe("NOT_A_DIRECT_REPORT");
  });

  it("refuses a manager who changes a direct report's role or status", () => {
    const anna = actor("usr_anna");
    expect(
      codeOf(updateUser(store, anna, "usr_olena", { role: ROLES.MANAGER })),
    ).toBe("FORBIDDEN");
    expect(codeOf(updateUser(store, anna, "usr_olena", deactivate))).toBe(
      "FORBIDDEN",
    );
    expect(store.users.get("usr_olena")).toMatchObject({
      role: ROLES.USER,
      status: USER_STATUS.ACTIVE,
    });
  });

  it("refuses a plain user, even for their own record", () => {
    expect(
      codeOf(
        updateUser(store, actor("usr_olena"), "usr_olena", { fullName: "Nope" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("reports a missing target as not found to a role with access", () => {
    expect(
      codeOf(
        updateUser(store, actor("usr_ivan"), "usr_nobody", { fullName: "X" }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("updateUser: validation and uniqueness", () => {
  const ivan = () => actor("usr_ivan");

  it.each([
    ["an empty change", {}],
    ["a managerId", { managerId: "usr_anna" }],
    ["a password", { password: "hacked1" }],
    ["an id", { id: "usr_other" }],
    ["an unknown role", { role: "admin" }],
  ])("rejects %s", (_label, input) => {
    expect(codeOf(updateUser(store, ivan(), "usr_olena", input))).toBe(
      "VALIDATION",
    );
  });

  it("refuses an email that another user has", () => {
    expect(
      codeOf(
        updateUser(store, ivan(), "usr_olena", { email: "MAKSYM@example.com" }),
      ),
    ).toBe("EMAIL_TAKEN");
    expect(store.users.get("usr_olena")?.email).toBe("olena@example.com");
  });

  it("lets a user keep their own email, even if the case differs", () => {
    expect(
      codeOf(
        updateUser(store, ivan(), "usr_olena", { email: "Olena@Example.com" }),
      ),
    ).toBe("ok");
  });

  it("lets IT change a role and hands back a copy", () => {
    const updated = valueOf(
      updateUser(store, ivan(), "usr_kateryna", { role: ROLES.MANAGER }),
    );
    expect(store.users.get("usr_kateryna")?.role).toBe(ROLES.MANAGER);
    updated.fullName = "Tampered";
    expect(store.users.get("usr_kateryna")?.fullName).not.toBe("Tampered");
  });
});

describe("rules 3 and 4 through the service", () => {
  it("scenario 11: the two self-deactivations fail for different reasons", () => {
    const ivan = actor("usr_ivan");

    expect(codeOf(updateUser(store, ivan, "usr_ivan", deactivate))).toBe(
      "CANNOT_DEACTIVATE_SELF",
    );
    expect(store.users.get("usr_ivan")?.status).toBe(USER_STATUS.ACTIVE);

    expect(codeOf(updateUser(store, ivan, "usr_iryna", deactivate))).toBe("ok");
    expect(store.users.get("usr_iryna")?.status).toBe(USER_STATUS.DEACTIVATED);

    expect(codeOf(updateUser(store, ivan, "usr_ivan", deactivate))).toBe(
      "LAST_ACTIVE_ACCOUNT",
    );
    expect(store.users.get("usr_ivan")?.status).toBe(USER_STATUS.ACTIVE);
  });

  it("refuses to demote the last active IT", () => {
    const ivan = actor("usr_ivan");
    valueOf(updateUser(store, ivan, "usr_iryna", deactivate));
    expect(
      codeOf(updateUser(store, ivan, "usr_ivan", { role: ROLES.MANAGER })),
    ).toBe("LAST_ACTIVE_ACCOUNT");
    expect(store.users.get("usr_ivan")?.role).toBe(ROLES.IT);
  });

  it("counts a demotion: after demoting the other IT, Ivan is the last one", () => {
    const ivan = actor("usr_ivan");
    valueOf(updateUser(store, ivan, "usr_iryna", { role: ROLES.USER }));
    expect(codeOf(updateUser(store, ivan, "usr_ivan", deactivate))).toBe(
      "LAST_ACTIVE_ACCOUNT",
    );
  });

  it("lets IT reactivate a deactivated user", () => {
    expect(
      codeOf(
        updateUser(store, actor("usr_ivan"), "usr_bohdan", {
          status: USER_STATUS.ACTIVE,
        }),
      ),
    ).toBe("ok");
    expect(login(store, "bohdan@example.com", "bohdan123").ok).toBe(true);
  });
});

describe("rule 5: deactivation takes effect on the next request", () => {
  function sessionFor(email: string, password: string): string {
    const result = login(store, email, password);
    if (!result.ok) throw new Error(`Login failed for ${email}`);
    return result.sessionId;
  }

  it("scenario 12: Olena is logged in, Ivan deactivates her, her next request has no user", () => {
    const olenaSession = sessionFor("olena@example.com", "olena123");
    expect(resolveSession(store, olenaSession)?.id).toBe("usr_olena");

    valueOf(updateUser(store, actor("usr_ivan"), "usr_olena", deactivate));

    expect(resolveSession(store, olenaSession)).toBeNull();
    expect(login(store, "olena@example.com", "olena123")).toEqual({
      ok: false,
      code: "ACCOUNT_DEACTIVATED",
    });
  });

  it("closes every session of the deactivated user and leaves others alone", () => {
    const first = sessionFor("olena@example.com", "olena123");
    const second = sessionFor("olena@example.com", "olena123");
    const annaSession = sessionFor("anna@example.com", "anna123");

    valueOf(updateUser(store, actor("usr_ivan"), "usr_olena", deactivate));

    expect([...store.sessions.keys()]).not.toContain(first);
    expect([...store.sessions.keys()]).not.toContain(second);
    expect(resolveSession(store, annaSession)?.id).toBe("usr_anna");
  });

  it("applies to a manager who is mid-session too", () => {
    const annaSession = sessionFor("anna@example.com", "anna123");
    valueOf(updateUser(store, actor("usr_ivan"), "usr_anna", deactivate));
    expect(resolveSession(store, annaSession)).toBeNull();
  });

  it("takes a role change away on the very next request", () => {
    const annaSession = sessionFor("anna@example.com", "anna123");
    const asManager = resolveSession(store, annaSession);
    if (!asManager) throw new Error("session did not resolve");
    expect(codeOf(listUsers(store, asManager))).toBe("ok");

    valueOf(
      updateUser(store, actor("usr_ivan"), "usr_anna", { role: ROLES.USER }),
    );

    const asUser = resolveSession(store, annaSession);
    if (!asUser) throw new Error("session did not resolve");
    expect(asUser.role).toBe(ROLES.USER);
    expect(codeOf(listUsers(store, asUser))).toBe("FORBIDDEN");
  });
});

describe("a stale snapshot of the acting user", () => {
  // A route reads the session, then awaits (for the body, for params) before it
  // calls a service. A deactivation or a role change can land in between.

  it("cannot be used once the actor was deactivated", () => {
    const snapshot = { ...actor("usr_anna") };
    valueOf(updateUser(store, actor("usr_ivan"), "usr_anna", deactivate));

    const late = updateUser(store, snapshot, "usr_olena", { fullName: "Late" });
    expect(codeOf(late)).toBe("ACTOR_INACTIVE");
    expect(store.users.get("usr_olena")?.fullName).not.toBe("Late");
  });

  it("is judged by the role the store has now", () => {
    const snapshot = { ...actor("usr_anna") };
    valueOf(
      updateUser(store, actor("usr_ivan"), "usr_anna", { role: ROLES.USER }),
    );

    expect(codeOf(listUsers(store, snapshot))).toBe("FORBIDDEN");
    expect(
      codeOf(updateUser(store, snapshot, "usr_olena", { fullName: "Late" })),
    ).toBe("FORBIDDEN");
  });

  it("is refused when the actor no longer exists", () => {
    const ghost = { id: "usr_ghost", role: ROLES.IT, status: USER_STATUS.ACTIVE };
    expect(codeOf(listUsers(store, ghost))).toBe("ACTOR_INACTIVE");
    expect(codeOf(createUser(store, ghost, validNewUser))).toBe("ACTOR_INACTIVE");
  });
});
