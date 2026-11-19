import { describe, expect, it } from "vitest";
import { json, jsonError, respond, statusFor } from "./http";
import { fail, ok, type ServiceErrorCode } from "./services/result";

/** The agreed statuses, written out again so a change has to be deliberate. */
const EXPECTED: Record<ServiceErrorCode, number> = {
  ACTOR_INACTIVE: 401,
  FORBIDDEN: 403,
  NOT_A_DIRECT_REPORT: 403,
  ROLE_NOT_EDITABLE: 403,
  CANNOT_DEACTIVATE_SELF: 403,
  CANNOT_CHANGE_OWN_ROLE: 403,
  LAST_ACTIVE_ACCOUNT: 409,
  EMAIL_TAKEN: 409,
  NOT_FOUND: 404,
  VALIDATION: 400,
  INVALID_MANAGER: 422,
};

describe("statusFor", () => {
  it.each(Object.entries(EXPECTED))("%s is %i", (code, status) => {
    // Object.entries widens the key to string; the Record above keeps it exact.
    expect(statusFor(code as ServiceErrorCode)).toBe(status);
  });

  it("tells the two self-protection failures apart from the last-IT failure", () => {
    expect(statusFor("CANNOT_DEACTIVATE_SELF")).not.toBe(
      statusFor("LAST_ACTIVE_ACCOUNT"),
    );
  });
});

describe("json", () => {
  it("sends the body, the status and a no-store header", async () => {
    const response = json({ hello: "world" }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ hello: "world" });
  });
});

describe("jsonError", () => {
  it("wraps the error in { error: { code, message } }", async () => {
    const response = jsonError(403, "FORBIDDEN", "Nope.");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Nope." },
    });
  });

  it("includes the issues only when there are some", async () => {
    const withIssues = await jsonError(400, "VALIDATION", "Bad.", ["a: b"]).json();
    expect(withIssues.error.issues).toEqual(["a: b"]);
    const without = await jsonError(400, "VALIDATION", "Bad.").json();
    expect(without.error).not.toHaveProperty("issues");
  });
});

describe("respond", () => {
  it("turns a success into the mapped body and status", async () => {
    const response = respond(ok({ id: 1 }), (value) => ({ item: value }), 201);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ item: { id: 1 } });
  });

  it("turns a failure into its status and error body", async () => {
    const response = respond(
      fail("LAST_ACTIVE_ACCOUNT", "Keep one.", ["x"]),
      (value) => value,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "LAST_ACTIVE_ACCOUNT", message: "Keep one.", issues: ["x"] },
    });
  });
});
