import { afterEach, describe, expect, it, vi } from "vitest";
import { USER_STATUS } from "@/domain/user";
import { SEED_ACCOUNTS } from "./seed/users";
import { createSeededStore, getStore } from "./store";

afterEach(() => {
  globalThis.__rbacStore = undefined;
});

describe("createSeededStore", () => {
  it("loads every seeded user with a password and over a thousand clients", () => {
    const store = createSeededStore();
    expect(store.users.size).toBe(SEED_ACCOUNTS.length);
    expect(store.passwords.size).toBe(SEED_ACCOUNTS.length);
    expect(store.clients.length).toBeGreaterThan(1000);
  });

  it("keeps passwords off the user objects", () => {
    for (const user of createSeededStore().users.values()) {
      expect(user).not.toHaveProperty("password");
    }
  });

  it("returns an independent copy each time", () => {
    const first = createSeededStore();
    const second = createSeededStore();

    const ivan = first.users.get("usr_ivan");
    if (!ivan) throw new Error("usr_ivan is missing from the seed");
    ivan.status = USER_STATUS.DEACTIVATED;

    expect(second.users.get("usr_ivan")?.status).toBe(USER_STATUS.ACTIVE);
    expect(
      SEED_ACCOUNTS.find((account) => account.id === "usr_ivan")?.status,
    ).toBe(USER_STATUS.ACTIVE);
  });
});

describe("getStore", () => {
  it("hands out one store per process", () => {
    expect(getStore()).toBe(getStore());
  });

  it("keeps the same store when the module is loaded again", async () => {
    const before = getStore();
    before.passwords.set("usr_ivan", "changed");

    vi.resetModules();
    const reloaded = await import("./store");

    expect(reloaded.getStore()).toBe(before);
    expect(reloaded.getStore().passwords.get("usr_ivan")).toBe("changed");
  });
});
