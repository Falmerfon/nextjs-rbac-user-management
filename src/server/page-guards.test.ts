import { beforeEach, describe, expect, it, vi } from "vitest";

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

// The real redirect() and forbidden() throw special errors that only Next
// understands. These throw readable ones, so a test can say what happened.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  forbidden: () => {
    throw new Error("forbidden");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

import { authorizeContentView, authorizeUserManagement } from "@/permissions/policy";
import { USER_STATUS } from "@/domain/user";
import { login } from "./auth";
import { orInterrupt, requireAllowed, requirePageUser } from "./page-guards";
import { fail, ok } from "./services/result";
import { getStore } from "./store";

function signIn(email: string, password: string): void {
  const result = login(getStore(), email, password);
  if (!result.ok) throw new Error(`Login failed for ${email}`);
  cookieJar.set("session", result.sessionId);
}

beforeEach(() => {
  globalThis.__rbacStore = undefined;
  cookieJar.clear();
});

describe("requirePageUser", () => {
  it("sends a visitor with no cookie to /login", async () => {
    await expect(requirePageUser()).rejects.toThrow("redirect:/login");
  });

  it("sends a visitor with a made-up session to /login", async () => {
    cookieJar.set("session", "not-a-session");
    await expect(requirePageUser()).rejects.toThrow("redirect:/login");
  });

  it("returns the logged-in user", async () => {
    signIn("anna@example.com", "anna123");
    expect((await requirePageUser()).id).toBe("usr_anna");
  });

  it("sends a user to /login on the first page load after a deactivation", async () => {
    signIn("olena@example.com", "olena123");
    await expect(requirePageUser()).resolves.toBeDefined();

    const olena = getStore().users.get("usr_olena");
    if (!olena) throw new Error("usr_olena is missing from the seed");
    olena.status = USER_STATUS.DEACTIVATED;

    await expect(requirePageUser()).rejects.toThrow("redirect:/login");
  });
});

describe("requireAllowed", () => {
  it("lets a manager open a content page", async () => {
    signIn("anna@example.com", "anna123");
    await expect(requireAllowed(authorizeContentView)).resolves.toMatchObject({
      id: "usr_anna",
    });
  });

  it("gives IT the 403 page for content, not a redirect", async () => {
    signIn("ivan@example.com", "ivan123");
    await expect(requireAllowed(authorizeContentView)).rejects.toThrow("forbidden");
  });

  it("gives a plain user the 403 page for user management", async () => {
    signIn("olena@example.com", "olena123");
    await expect(requireAllowed(authorizeUserManagement)).rejects.toThrow(
      "forbidden",
    );
  });

  it("redirects a visitor who is not logged in before it checks permission", async () => {
    await expect(requireAllowed(authorizeContentView)).rejects.toThrow(
      "redirect:/login",
    );
  });
});

describe("orInterrupt", () => {
  it("returns the value of a success", () => {
    expect(orInterrupt(ok(42))).toBe(42);
  });

  it("turns a missing item into the 404 page", () => {
    expect(() => orInterrupt(fail("NOT_FOUND", "x"))).toThrow("notFound");
  });

  it("turns any other failure into the 403 page", () => {
    expect(() => orInterrupt(fail("FORBIDDEN", "x"))).toThrow("forbidden");
    expect(() => orInterrupt(fail("NOT_A_DIRECT_REPORT", "x"))).toThrow(
      "forbidden",
    );
  });
});
