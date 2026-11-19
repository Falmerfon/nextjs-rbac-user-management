import { describe, expect, it } from "vitest";
import {
  ALL_ROLES,
  ROLE_DEFINITIONS,
  ROLES,
  hasCapability,
  isRole,
} from "./roles";

describe("role definitions", () => {
  it.each(ALL_ROLES)("%s has a complete definition", (role) => {
    const definition = ROLE_DEFINITIONS[role];
    expect(definition.label).not.toBe("");
    expect(definition.homePath.startsWith("/")).toBe(true);
    expect(definition.minActiveAccounts).toBeGreaterThanOrEqual(0);
    expect(typeof definition.editableAsReport).toBe("boolean");
    expect(new Set(definition.capabilities).size).toBe(
      definition.capabilities.length,
    );
  });

  it("defines exactly the known roles", () => {
    expect(Object.keys(ROLE_DEFINITIONS).sort()).toEqual(
      [...ALL_ROLES].sort(),
    );
  });

  it("does not make the IT role a superset of the manager role", () => {
    const managerCapabilities = ROLE_DEFINITIONS[ROLES.MANAGER].capabilities;
    const missing = managerCapabilities.filter(
      (capability) => !hasCapability(ROLES.IT, capability),
    );
    expect(missing).toContain("content:view");
  });

  it("does not let a manager edit another manager, and excludes nobody else", () => {
    expect(ROLE_DEFINITIONS[ROLES.MANAGER].editableAsReport).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.IT].editableAsReport).toBe(true);
    expect(ROLE_DEFINITIONS[ROLES.USER].editableAsReport).toBe(true);
  });

  it("requires at least one active account only for the role that needs it", () => {
    const protectedRoles = ALL_ROLES.filter(
      (role) => ROLE_DEFINITIONS[role].minActiveAccounts > 0,
    );
    expect(protectedRoles).toEqual([ROLES.IT]);
  });
});

describe("hasCapability", () => {
  it("reports only what the role lists", () => {
    expect(hasCapability(ROLES.USER, "content:view")).toBe(true);
    expect(hasCapability(ROLES.USER, "users:read:reports")).toBe(false);
    expect(hasCapability(ROLES.MANAGER, "users:change-role")).toBe(false);
  });
});

describe("isRole", () => {
  it("accepts known roles and rejects everything else", () => {
    for (const role of ALL_ROLES) expect(isRole(role)).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});
