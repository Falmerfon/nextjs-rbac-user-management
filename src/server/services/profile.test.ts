import { beforeEach, describe, expect, it } from "vitest";
import { USER_STATUS, type User } from "@/domain/user";
import { createSeededStore, type Store } from "../store";
import { getMyProfile } from "./profile";
import type { ServiceResult } from "./result";

let store: Store;

beforeEach(() => {
  store = createSeededStore();
});

function actor(id: string): User {
  const user = store.users.get(id);
  if (!user) throw new Error(`No seeded user ${id}`);
  return user;
}

const codeOf = (result: ServiceResult<unknown>) =>
  result.ok ? "ok" : result.code;

describe("getMyProfile", () => {
  it("returns a user's own record with their manager's name", () => {
    const result = getMyProfile(store, actor("usr_olena"));
    if (!result.ok) throw new Error(result.message);
    expect(result.value.user.id).toBe("usr_olena");
    expect(result.value.managerName).toBe("Anna Shevchenko");
  });

  it("returns null for the manager name when nobody manages the user", () => {
    const result = getMyProfile(store, actor("usr_anna"));
    if (!result.ok) throw new Error(result.message);
    expect(result.value.managerName).toBeNull();
  });

  it("serves a deactivated manager's name too", () => {
    const result = getMyProfile(store, actor("usr_dmytro"));
    if (!result.ok) throw new Error(result.message);
    expect(result.value.managerName).toBe("Viktor Melnyk");
  });

  it("refuses IT, which has no content pages", () => {
    expect(codeOf(getMyProfile(store, actor("usr_ivan")))).toBe("FORBIDDEN");
  });

  it("refuses a deactivated actor", () => {
    const olena = actor("usr_olena");
    olena.status = USER_STATUS.DEACTIVATED;
    expect(codeOf(getMyProfile(store, olena))).toBe("ACTOR_INACTIVE");
  });

  it("returns a copy, not the stored user", () => {
    const result = getMyProfile(store, actor("usr_olena"));
    if (!result.ok) throw new Error(result.message);
    result.value.user.fullName = "Tampered";
    expect(store.users.get("usr_olena")?.fullName).not.toBe("Tampered");
  });
});
