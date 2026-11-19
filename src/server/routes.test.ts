import { beforeEach, describe, expect, it, vi } from "vitest";

// Stand-in for the request's cookie store. Everything else runs for real: the
// route handlers, requireUser, the services, the policy and the store.
//
// Each request gets its own jar through AsyncLocalStorage, so requests that run
// at the same time cannot see each other's cookies. That is what lets a test
// start two users' requests together and check a race.
const requestJar = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  return new AsyncLocalStorage<Map<string, string>>();
});

vi.mock("next/headers", () => {
  const jar = () => {
    const current = requestJar.getStore();
    if (!current) throw new Error("No cookie jar: run the route through call()");
    return current;
  };
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = jar().get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        jar().set(name, value);
      },
      delete: (name: string) => {
        jar().delete(name);
      },
    }),
  };
});

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { GET as clientRoute } from "@/app/api/clients/[id]/route";
import { GET as clientsRoute } from "@/app/api/clients/route";
import { GET as userRoute, PATCH as patchUserRoute } from "@/app/api/users/[id]/route";
import { GET as usersRoute, POST as createUserRoute } from "@/app/api/users/route";
import type { Client } from "@/domain/client";
import { USER_STATUS, type User } from "@/domain/user";
import { ROLES } from "@/permissions/roles";

interface Body {
  error?: { code: string; message: string; issues?: string[] };
  user?: User;
  users?: User[];
  client?: Client;
  items?: Client[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

interface Reply {
  status: number;
  headers: Headers;
  body: Body;
}

/** Runs one request as the holder of `session`, or as nobody. */
async function call(
  run: () => Promise<Response>,
  session: string | null,
): Promise<Reply> {
  const jar = new Map<string, string>();
  if (session) jar.set("session", session);
  const response = await requestJar.run(jar, run);
  const body = (await response.json().catch(() => ({}))) as Body;
  return { status: response.status, headers: response.headers, body };
}

const BASE = "http://localhost";

function jsonRequest(method: string, path: string, body: unknown): Request {
  return new Request(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const forUser = (id: string) => ({ params: Promise.resolve({ id }) });

const api = {
  me: (s: string | null) => call(() => meRoute(), s),
  users: (s: string | null) => call(() => usersRoute(), s),
  user: (s: string | null, id: string) =>
    call(() => userRoute(new Request(`${BASE}/api/users/${id}`), forUser(id)), s),
  createUser: (s: string | null, body: unknown) =>
    call(() => createUserRoute(jsonRequest("POST", "/api/users", body)), s),
  patchUser: (s: string | null, id: string, body: unknown) =>
    call(
      () => patchUserRoute(jsonRequest("PATCH", `/api/users/${id}`, body), forUser(id)),
      s,
    ),
  clients: (s: string | null, query = "") =>
    call(() => clientsRoute(new Request(`${BASE}/api/clients${query}`)), s),
  client: (s: string | null, id: string) =>
    call(() => clientRoute(new Request(`${BASE}/api/clients/${id}`), forUser(id)), s),
};

/** Logs in through the real login route and returns the session cookie. */
async function signIn(email: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  const response = await requestJar.run(jar, () =>
    loginRoute(jsonRequest("POST", "/api/auth/login", { email, password })),
  );
  expect(response.status).toBe(200);
  const session = jar.get("session");
  if (!session) throw new Error("Login did not set a session cookie");
  return session;
}

const errorCode = (reply: Reply) => reply.body.error?.code;
const deactivate = { status: USER_STATUS.DEACTIVATED };

beforeEach(() => {
  globalThis.__rbacStore = undefined;
});

describe("every endpoint needs a login", () => {
  const calls: Array<[string, (s: string | null) => Promise<Reply>]> = [
    ["GET /api/auth/me", (s) => api.me(s)],
    ["GET /api/users", (s) => api.users(s)],
    ["POST /api/users", (s) => api.createUser(s, {})],
    ["GET /api/users/{id}", (s) => api.user(s, "usr_anna")],
    ["PATCH /api/users/{id}", (s) => api.patchUser(s, "usr_anna", { fullName: "X" })],
    ["GET /api/clients", (s) => api.clients(s)],
    ["GET /api/clients/{id}", (s) => api.client(s, "cl_00001")],
  ];

  it.each(calls)("%s without a cookie is 401", async (_name, run) => {
    const reply = await run(null);
    expect(reply.status).toBe(401);
    expect(errorCode(reply)).toBe("UNAUTHENTICATED");
  });

  it.each(calls)("%s with a made-up session is 401", async (_name, run) => {
    expect((await run("not-a-real-session")).status).toBe(401);
  });
});

describe("scenario 7: Anna and her direct reports", () => {
  it("lists only her four direct reports", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const reply = await api.users(anna);
    expect(reply.status).toBe(200);
    expect(reply.body.users?.map((user) => user.id).sort()).toEqual(
      ["usr_bohdan", "usr_maksym", "usr_olena", "usr_sofiia"].sort(),
    );
  });

  it("refuses to read or edit Dmytro, who reports to someone else", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const read = await api.user(anna, "usr_dmytro");
    expect(read.status).toBe(403);
    expect(errorCode(read)).toBe("NOT_A_DIRECT_REPORT");

    const edit = await api.patchUser(anna, "usr_dmytro", { fullName: "Nope" });
    expect(edit.status).toBe(403);
    expect(errorCode(edit)).toBe("NOT_A_DIRECT_REPORT");

    const ivan = await signIn("ivan@example.com", "ivan123");
    expect((await api.user(ivan, "usr_dmytro")).body.user?.fullName).toBe(
      "Dmytro Savchuk",
    );
  });

  it("refuses to edit a direct report whom IT made a manager (rule 2: not other managers)", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const anna = await signIn("anna@example.com", "anna123");

    const promote = await api.patchUser(ivan, "usr_maksym", { role: ROLES.MANAGER });
    expect(promote.status).toBe(200);
    expect(promote.body.user?.managerId).toBe("usr_anna");

    const edit = await api.patchUser(anna, "usr_maksym", { fullName: "Nope" });
    expect(edit.status).toBe(403);
    expect(errorCode(edit)).toBe("ROLE_NOT_EDITABLE");
    expect((await api.user(ivan, "usr_maksym")).body.user?.fullName).toBe("Maksym Hnatiuk");

    const byIt = await api.patchUser(ivan, "usr_maksym", { fullName: "Max H." });
    expect(byIt.status).toBe(200);
  });

  it("lets her rename a direct report", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const edit = await api.patchUser(anna, "usr_olena", { fullName: "Olena K." });
    expect(edit.status).toBe(200);
    expect(edit.body.user?.fullName).toBe("Olena K.");
    expect((await api.user(anna, "usr_olena")).body.user?.fullName).toBe("Olena K.");
  });
});

describe("scenario 8: Anna tries to become IT", () => {
  it("is refused and her role does not change", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const reply = await api.patchUser(anna, "usr_anna", { role: ROLES.IT });
    expect(reply.status).toBe(403);
    expect(errorCode(reply)).toBe("FORBIDDEN");

    const ivan = await signIn("ivan@example.com", "ivan123");
    expect((await api.user(ivan, "usr_anna")).body.user?.role).toBe(ROLES.MANAGER);
  });
});

describe("scenario 9: the client table is paginated on the server", () => {
  it("returns one page and the total, not the whole list", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const reply = await api.clients(anna);
    expect(reply.status).toBe(200);
    expect(reply.body.items).toHaveLength(25);
    expect(reply.body.total).toBeGreaterThan(1000);
    expect(reply.body.totalPages).toBe(Math.ceil((reply.body.total ?? 0) / 25));
  });

  it("serves the page that was asked for", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const reply = await api.clients(anna, "?page=2&limit=10");
    expect(reply.body.items?.[0]?.id).toBe("cl_00011");
    expect(reply.body.items).toHaveLength(10);
  });

  it("cannot be talked into returning everything", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const reply = await api.clients(anna, "?limit=1000000");
    expect(reply.body.items).toHaveLength(100);
    expect(reply.body.limit).toBe(100);
    expect(reply.body.total).toBeGreaterThan(1000);
  });

  it("rejects a nonsense page with 400", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const reply = await api.clients(anna, "?page=0");
    expect(reply.status).toBe(400);
    expect(errorCode(reply)).toBe("VALIDATION");
  });

  it("opens one client", async () => {
    const olena = await signIn("olena@example.com", "olena123");
    expect((await api.client(olena, "cl_00042")).body.client?.id).toBe("cl_00042");
    expect((await api.client(olena, "cl_99999")).status).toBe(404);
  });
});

describe("scenario 10: IT manages users and is kept out of content", () => {
  it("lets Ivan list every user", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const reply = await api.users(ivan);
    expect(reply.status).toBe(200);
    expect(reply.body.users).toHaveLength(11);
  });

  it("refuses him the client list and a single client", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const list = await api.clients(ivan);
    expect(list.status).toBe(403);
    expect(errorCode(list)).toBe("FORBIDDEN");
    expect((await api.client(ivan, "cl_00001")).status).toBe(403);
  });
});

describe("scenario 11: self-deactivation and the last IT", () => {
  it("fails with a different reason the second time", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");

    const first = await api.patchUser(ivan, "usr_ivan", deactivate);
    expect(first.status).toBe(403);
    expect(errorCode(first)).toBe("CANNOT_DEACTIVATE_SELF");

    const other = await api.patchUser(ivan, "usr_iryna", deactivate);
    expect(other.status).toBe(200);
    expect(other.body.user?.status).toBe(USER_STATUS.DEACTIVATED);

    const second = await api.patchUser(ivan, "usr_ivan", deactivate);
    expect(second.status).toBe(409);
    expect(errorCode(second)).toBe("LAST_ACTIVE_ACCOUNT");

    expect((await api.me(ivan)).body.user?.status).toBe(USER_STATUS.ACTIVE);
  });
});

describe("scenario 12 and rule 5: deactivation cuts a session off at once", () => {
  it("ends Olena's session on her next request", async () => {
    const olena = await signIn("olena@example.com", "olena123");
    const ivan = await signIn("ivan@example.com", "ivan123");
    expect((await api.clients(olena)).status).toBe(200);

    expect((await api.patchUser(ivan, "usr_olena", deactivate)).status).toBe(200);

    const next = await api.clients(olena);
    expect(next.status).toBe(401);
    expect(errorCode(next)).toBe("UNAUTHENTICATED");
    expect((await api.me(olena)).status).toBe(401);
  });

  it("does not let her log in again", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    await api.patchUser(ivan, "usr_olena", deactivate);

    const response = await requestJar.run(new Map(), () =>
      loginRoute(
        jsonRequest("POST", "/api/auth/login", {
          email: "olena@example.com",
          password: "olena123",
        }),
      ),
    );
    expect(response.status).toBe(403);
  });

  it("applies to a manager who is in the middle of a session", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const ivan = await signIn("ivan@example.com", "ivan123");
    await api.patchUser(ivan, "usr_anna", deactivate);
    expect((await api.users(anna)).status).toBe(401);
  });

  it("takes a role change away on the very next request", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const ivan = await signIn("ivan@example.com", "ivan123");
    expect((await api.users(anna)).status).toBe(200);

    await api.patchUser(ivan, "usr_anna", { role: ROLES.USER });

    expect((await api.users(anna)).status).toBe(403);
    expect((await api.clients(anna)).status).toBe(200);
  });
});

describe("creating users", () => {
  const newUser = {
    fullName: "Nina Hrytsenko",
    email: "nina@example.com",
    password: "secret1",
    role: ROLES.USER,
  };

  it("lets IT create a user, who can then log in and read clients", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const created = await api.createUser(ivan, newUser);
    expect(created.status).toBe(201);
    expect(created.body.user?.email).toBe("nina@example.com");

    const nina = await signIn("nina@example.com", "secret1");
    expect((await api.clients(nina)).status).toBe(200);
  });

  it("refuses a manager and a plain user", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const olena = await signIn("olena@example.com", "olena123");
    expect((await api.createUser(anna, newUser)).status).toBe(403);
    expect((await api.createUser(olena, newUser)).status).toBe(403);
  });

  it("answers 400 to a body that is not valid, with the issues", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const reply = await api.createUser(ivan, { ...newUser, email: "nope" });
    expect(reply.status).toBe(400);
    expect(reply.body.error?.issues?.join(" ")).toContain("email");
  });

  it("answers 400 to a body that is not JSON", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const reply = await call(
      () => createUserRoute(new Request(`${BASE}/api/users`, { method: "POST", body: "oops" })),
      ivan,
    );
    expect(reply.status).toBe(400);
  });

  it("answers 409 for a taken email and 422 for a bad manager", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    expect(
      (await api.createUser(ivan, { ...newUser, email: "ANNA@example.com" })).status,
    ).toBe(409);
    expect(
      (await api.createUser(ivan, { ...newUser, managerId: "usr_viktor" })).status,
    ).toBe(422);
  });
});

describe("updating users: what a request may not do", () => {
  it.each([
    ["reassign the manager", { managerId: "usr_anna" }],
    ["set a password", { password: "hacked1" }],
    ["set an id", { id: "usr_other" }],
    ["change nothing at all", {}],
  ])("rejects a request that tries to %s", async (_label, body) => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    expect((await api.patchUser(ivan, "usr_olena", body)).status).toBe(400);
  });

  it("answers 404 for a missing user to IT, and 403 to a plain user", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const olena = await signIn("olena@example.com", "olena123");
    expect((await api.user(ivan, "usr_nobody")).status).toBe(404);
    expect((await api.user(olena, "usr_nobody")).status).toBe(403);
    expect((await api.user(olena, "usr_ivan")).status).toBe(403);
  });
});

describe("what responses contain", () => {
  it("never carries a password", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const replies = [
      await api.users(ivan),
      await api.user(ivan, "usr_anna"),
      await api.me(ivan),
      await api.patchUser(ivan, "usr_olena", { fullName: "Olena K." }),
    ];
    for (const reply of replies) {
      const text = JSON.stringify(reply.body);
      expect(text).not.toContain("password");
      expect(text).not.toContain("123");
    }
  });

  it("is never cached", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    for (const reply of [await api.users(anna), await api.clients(anna), await api.me(null)]) {
      expect(reply.headers.get("cache-control")).toBe("no-store");
    }
  });
});

describe("the review checklist, over HTTP", () => {
  const record = async (session: string, id: string) =>
    (await api.user(session, id)).body.user;

  const rawPatch = (session: string | null, id: string, raw: string) =>
    call(
      () =>
        patchUserRoute(
          new Request(`${BASE}/api/users/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: raw,
          }),
          forUser(id),
        ),
      session,
    );

  it("refuses a mixed body as a whole and applies none of it", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const ivan = await signIn("ivan@example.com", "ivan123");
    const before = await record(ivan, "usr_olena");

    const reply = await api.patchUser(anna, "usr_olena", {
      fullName: "Hijacked",
      role: ROLES.IT,
      status: USER_STATUS.DEACTIVATED,
    });

    expect(reply.status).toBe(403);
    expect(await record(ivan, "usr_olena")).toEqual(before);
  });

  it("refuses a body that also tries to move the user to another manager", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const ivan = await signIn("ivan@example.com", "ivan123");
    const before = await record(ivan, "usr_olena");

    const reply = await api.patchUser(anna, "usr_olena", {
      fullName: "Hijacked",
      role: ROLES.IT,
      status: USER_STATUS.DEACTIVATED,
      managerId: "usr_taras",
    });

    expect(reply.status).toBe(400);
    expect(await record(ivan, "usr_olena")).toEqual(before);
  });

  it.each([
    ["__proto__", `{"fullName":"x","__proto__":{"role":"${ROLES.IT}"}}`],
    ["constructor", `{"fullName":"x","constructor":{"prototype":{"role":"${ROLES.IT}"}}}`],
  ])("rejects a raw JSON body with a %s key and changes nothing", async (_key, raw) => {
    const anna = await signIn("anna@example.com", "anna123");
    const ivan = await signIn("ivan@example.com", "ivan123");
    const before = await record(ivan, "usr_olena");

    expect((await rawPatch(anna, "usr_olena", raw)).status).toBe(400);

    expect(await record(ivan, "usr_olena")).toEqual(before);
    expect(({} as { role?: string }).role).toBeUndefined();
  });

  it("reads a duplicate key the way JSON.parse does, so the last one wins and nothing escalates", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const ivan = await signIn("ivan@example.com", "ivan123");

    const reply = await rawPatch(
      anna,
      "usr_olena",
      `{"fullName":"Dup","role":"${ROLES.IT}","role":"${ROLES.USER}"}`,
    );

    expect(reply.status).toBe(200);
    expect(await record(ivan, "usr_olena")).toMatchObject({
      fullName: "Dup",
      role: ROLES.USER,
    });
  });

  it("refuses a manager every edit outside their direct reports", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    const targets = ["usr_dmytro", "usr_taras", "usr_anna", "usr_kateryna"];
    for (const id of targets) {
      const reply = await api.patchUser(anna, id, { fullName: "Hijacked" });
      expect([id, reply.status]).toEqual([id, 403]);
    }
  });

  it("refuses a manager the fields that are not theirs to change", async () => {
    const anna = await signIn("anna@example.com", "anna123");
    expect((await api.patchUser(anna, "usr_olena", { role: ROLES.MANAGER })).status).toBe(403);
    expect((await api.patchUser(anna, "usr_olena", deactivate)).status).toBe(403);
    expect((await api.patchUser(anna, "usr_olena", { managerId: "usr_taras" })).status).toBe(400);
    expect(
      (await api.createUser(anna, {
        fullName: "Nina",
        email: "nina@example.com",
        password: "secret1",
        role: ROLES.USER,
      })).status,
    ).toBe(403);
  });

  it("refuses a plain user the whole users API", async () => {
    const olena = await signIn("olena@example.com", "olena123");
    expect((await api.users(olena)).status).toBe(403);
    expect((await api.user(olena, "usr_olena")).status).toBe(403);
    expect((await api.patchUser(olena, "usr_olena", { fullName: "X" })).status).toBe(403);
    expect(
      (await api.createUser(olena, {
        fullName: "Nina",
        email: "nina@example.com",
        password: "secret1",
        role: ROLES.USER,
      })).status,
    ).toBe(403);
  });

  it("refuses IT to change their own role, and the last IT to be demoted", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");

    const own = await api.patchUser(ivan, "usr_ivan", { role: ROLES.MANAGER });
    expect([own.status, errorCode(own)]).toEqual([403, "CANNOT_CHANGE_OWN_ROLE"]);

    await api.patchUser(ivan, "usr_iryna", deactivate);
    const last = await api.patchUser(ivan, "usr_ivan", { role: ROLES.MANAGER });
    expect([last.status, errorCode(last)]).toEqual([409, "LAST_ACTIVE_ACCOUNT"]);
    expect((await record(ivan, "usr_ivan"))?.role).toBe(ROLES.IT);
  });

  it("does not return a password when a user is created", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const reply = await api.createUser(ivan, {
      fullName: "Nina",
      email: "nina@example.com",
      password: "secret1",
      role: ROLES.USER,
    });
    expect(reply.status).toBe(201);
    const text = JSON.stringify(reply.body);
    expect(text).not.toContain("password");
    expect(text).not.toContain("secret1");
  });
});

describe("races between requests", () => {
  const newUser = {
    fullName: "Race",
    email: "race@example.com",
    password: "secret1",
    role: ROLES.USER,
  };

  it("lets exactly one of five identical creates win", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const replies = await Promise.all(
      [1, 2, 3, 4, 5].map(() => api.createUser(ivan, newUser)),
    );
    expect(replies.filter((reply) => reply.status === 201)).toHaveLength(1);
    expect(replies.filter((reply) => reply.status === 409)).toHaveLength(4);
  });

  it("leaves one active IT when two IT accounts deactivate each other at the same moment", async () => {
    const ivan = await signIn("ivan@example.com", "ivan123");
    const iryna = await signIn("iryna@example.com", "iryna123");

    const [first, second] = await Promise.all([
      api.patchUser(ivan, "usr_iryna", deactivate),
      api.patchUser(iryna, "usr_ivan", deactivate),
    ]);

    expect([first.status, second.status].filter((status) => status === 200)).toHaveLength(1);
    const survivor = first.status === 200 ? ivan : iryna;
    const users = (await api.users(survivor)).body.users ?? [];
    const activeIt = users.filter(
      (user) => user.role === ROLES.IT && user.status === USER_STATUS.ACTIVE,
    );
    expect(activeIt).toHaveLength(1);
  });
});
