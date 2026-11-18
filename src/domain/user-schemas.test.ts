import { describe, expect, it } from "vitest";
import { ROLES } from "@/permissions/roles";
import {
  createUserSchema,
  describeIssues,
  updateUserSchema,
} from "./user-schemas";
import { USER_STATUS } from "./user";

const validCreate = {
  fullName: "  Nina Hrytsenko ",
  email: "  Nina@Example.COM ",
  password: "secret1",
  role: ROLES.USER,
};

describe("createUserSchema", () => {
  it("trims the name and normalises the email", () => {
    const parsed = createUserSchema.parse(validCreate);
    expect(parsed.fullName).toBe("Nina Hrytsenko");
    expect(parsed.email).toBe("nina@example.com");
  });

  it("defaults managerId to null", () => {
    expect(createUserSchema.parse(validCreate).managerId).toBeNull();
  });

  it("accepts a manager id", () => {
    expect(
      createUserSchema.parse({ ...validCreate, managerId: "usr_anna" }).managerId,
    ).toBe("usr_anna");
  });

  it.each([
    ["an empty name", { fullName: "   " }],
    ["a malformed email", { email: "not-an-email" }],
    ["a short password", { password: "abc" }],
    ["an unknown role", { role: "admin" }],
    ["an empty manager id", { managerId: "" }],
  ])("rejects %s", (_label, override) => {
    expect(createUserSchema.safeParse({ ...validCreate, ...override }).success).toBe(
      false,
    );
  });

  it.each(["id", "status", "createdAt"])(
    "rejects an unexpected key: %s",
    (key) => {
      expect(
        createUserSchema.safeParse({ ...validCreate, [key]: "x" }).success,
      ).toBe(false);
    },
  );
});

describe("updateUserSchema", () => {
  it("accepts any single field", () => {
    expect(updateUserSchema.safeParse({ fullName: "New" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ role: ROLES.MANAGER }).success).toBe(true);
    expect(
      updateUserSchema.safeParse({ status: USER_STATUS.DEACTIVATED }).success,
    ).toBe(true);
  });

  it("normalises the email", () => {
    expect(updateUserSchema.parse({ email: " A@B.CO " }).email).toBe("a@b.co");
  });

  it("rejects an empty change", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });

  it.each(["managerId", "id", "password", "createdAt"])(
    "rejects a field an update may not touch: %s",
    (key) => {
      expect(
        updateUserSchema.safeParse({ fullName: "New", [key]: "x" }).success,
      ).toBe(false);
    },
  );

  it("rejects an unknown role or status", () => {
    expect(updateUserSchema.safeParse({ role: "admin" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ status: "banned" }).success).toBe(false);
  });
});

describe("describeIssues", () => {
  it("names the field that failed", () => {
    const result = createUserSchema.safeParse({ ...validCreate, email: "nope" });
    if (result.success) throw new Error("expected a failure");
    expect(describeIssues(result.error).join(" ")).toContain("email");
  });
});
