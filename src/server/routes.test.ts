import { beforeEach, describe, expect, it, vi } from "vitest";

// Stand-in for the request's cookie store. Everything else runs for real: the
// route handlers, requireUser, the services, the policy and the store.
const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

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
  cookieJar.clear();
  if (session) cookieJar.set("session", session);
  const response = await run();
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
  cookieJar.clear();
  const response = await loginRoute(
    jsonRequest("POST", "/api/auth/login", { email, password }),
  );
  expect(response.status).toBe(200);
  const session = cookieJar.get("session");
  if (!session) throw new Error("Login did not set a session cookie");
  return session;
}

const errorCode = (reply: Reply) => reply.body.error?.code;
const deactivate = { status: USER_STATUS.DEACTIVATED };

beforeEach(() => {
  globalThis.__rbacStore = undefined;
  cookieJar.clear();
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

    cookieJar.clear();
    const response = await loginRoute(
      jsonRequest("POST", "/api/auth/login", {
        email: "olena@example.com",
        password: "olena123",
      }),
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
