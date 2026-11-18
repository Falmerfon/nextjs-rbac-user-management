import { beforeEach, describe, expect, it } from "vitest";
import { MAX_PAGE_SIZE } from "@/domain/client-schemas";
import { USER_STATUS, type User } from "@/domain/user";
import { createSeededStore, type Store } from "../store";
import { getClient, listClients } from "./clients";
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

function valueOf<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.value;
}

const codeOf = (result: ServiceResult<unknown>) =>
  result.ok ? "ok" : result.code;

describe("listClients", () => {
  const anna = () => actor("usr_anna");

  it("returns one page with the total, never the whole list", () => {
    const page = valueOf(listClients(store, anna(), {}));
    expect(page.items).toHaveLength(25);
    expect(page.total).toBe(store.clients.length);
    expect(page.total).toBeGreaterThan(1000);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(25);
    expect(page.totalPages).toBe(Math.ceil(page.total / 25));
  });

  it("walks through the list in order without gaps or overlap", () => {
    const first = valueOf(listClients(store, anna(), { page: "1", limit: "10" }));
    const second = valueOf(listClients(store, anna(), { page: "2", limit: "10" }));
    expect(first.items[0]?.id).toBe("cl_00001");
    expect(first.items.at(-1)?.id).toBe("cl_00010");
    expect(second.items[0]?.id).toBe("cl_00011");
  });

  it("cuts an oversized limit down to the cap and says which size it used", () => {
    const page = valueOf(listClients(store, anna(), { limit: "100000" }));
    expect(page.items).toHaveLength(MAX_PAGE_SIZE);
    expect(page.limit).toBe(MAX_PAGE_SIZE);
  });

  it("serves the last page with what is left", () => {
    const first = valueOf(listClients(store, anna(), { limit: "25" }));
    const last = valueOf(
      listClients(store, anna(), { page: String(first.totalPages), limit: "25" }),
    );
    expect(last.items).toHaveLength(first.total - (first.totalPages - 1) * 25);
  });

  it("returns an empty page past the end, with the same total", () => {
    const page = valueOf(listClients(store, anna(), { page: "9999" }));
    expect(page.items).toEqual([]);
    expect(page.total).toBe(store.clients.length);
  });

  it.each([
    ["page zero", { page: "0" }],
    ["a negative page", { page: "-1" }],
    ["a non-numeric page", { page: "two" }],
    ["a fractional page", { page: "1.5" }],
    ["limit zero", { limit: "0" }],
    ["an empty limit", { limit: "" }],
    ["a non-numeric limit", { limit: "many" }],
  ])("rejects %s", (_label, query) => {
    const result = listClients(store, anna(), query);
    expect(codeOf(result)).toBe("VALIDATION");
    if (!result.ok) expect(result.issues?.length).toBeGreaterThan(0);
  });

  it("ignores query parameters it does not know", () => {
    expect(codeOf(listClients(store, anna(), { page: "1", _: "123" }))).toBe("ok");
  });

  it("serves managers and users, refuses IT", () => {
    expect(codeOf(listClients(store, actor("usr_anna"), {}))).toBe("ok");
    expect(codeOf(listClients(store, actor("usr_olena"), {}))).toBe("ok");
    expect(codeOf(listClients(store, actor("usr_ivan"), {}))).toBe("FORBIDDEN");
  });

  it("refuses a deactivated actor", () => {
    const stale = { ...actor("usr_olena"), status: USER_STATUS.DEACTIVATED };
    expect(codeOf(listClients(store, stale, {}))).toBe("ACTOR_INACTIVE");
  });

  it("returns copies, not the stored clients", () => {
    const page = valueOf(listClients(store, anna(), {}));
    const first = page.items[0];
    if (!first) throw new Error("expected a client");
    first.name = "Tampered";
    expect(store.clients[0]?.name).not.toBe("Tampered");
  });
});

describe("getClient", () => {
  it("returns a client to a manager or a user", () => {
    expect(valueOf(getClient(store, actor("usr_olena"), "cl_00042")).id).toBe(
      "cl_00042",
    );
  });

  it("reports a missing id as not found", () => {
    expect(codeOf(getClient(store, actor("usr_anna"), "cl_99999"))).toBe(
      "NOT_FOUND",
    );
  });

  it("refuses IT for a real and a made-up id alike", () => {
    const ivan = actor("usr_ivan");
    expect(codeOf(getClient(store, ivan, "cl_00042"))).toBe("FORBIDDEN");
    expect(codeOf(getClient(store, ivan, "cl_99999"))).toBe("FORBIDDEN");
  });
});
