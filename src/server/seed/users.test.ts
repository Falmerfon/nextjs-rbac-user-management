import { describe, expect, it } from "vitest";
import { USER_STATUS } from "@/domain/user";
import { ROLES, hasCapability } from "@/permissions/roles";
import { SEED_ACCOUNTS, type SeedAccount } from "./users";

function account(email: string): SeedAccount {
  const found = SEED_ACCOUNTS.find((candidate) => candidate.email === email);
  if (!found) throw new Error(`No seeded account for ${email}`);
  return found;
}

const reportsOf = (managerId: string) =>
  SEED_ACCOUNTS.filter((candidate) => candidate.managerId === managerId);

const isActive = (candidate: SeedAccount) =>
  candidate.status === USER_STATUS.ACTIVE;

describe("seeded accounts are consistent", () => {
  it("uses unique ids and unique emails", () => {
    const ids = SEED_ACCOUNTS.map((candidate) => candidate.id);
    const emails = SEED_ACCOUNTS.map((candidate) =>
      candidate.email.toLowerCase(),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("gives every account a password", () => {
    for (const candidate of SEED_ACCOUNTS) {
      expect(candidate.password).not.toBe("");
    }
  });

  it("points managerId only at an existing manager, never at itself", () => {
    for (const candidate of SEED_ACCOUNTS) {
      if (candidate.managerId === null) continue;
      expect(candidate.managerId).not.toBe(candidate.id);
      const manager = SEED_ACCOUNTS.find(
        (other) => other.id === candidate.managerId,
      );
      expect(manager).toBeDefined();
      expect(hasCapability(manager!.role, "users:read:reports")).toBe(true);
    }
  });
});

describe("seeded accounts cover what the task asks for", () => {
  it("has two active IT accounts, so rule 4 can be tested", () => {
    const activeIt = SEED_ACCOUNTS.filter(
      (candidate) => candidate.role === ROLES.IT && isActive(candidate),
    );
    expect(activeIt).toHaveLength(2);
  });

  it("has two active managers, one of them without direct reports", () => {
    const managers = SEED_ACCOUNTS.filter(
      (candidate) => candidate.role === ROLES.MANAGER && isActive(candidate),
    );
    expect(managers.length).toBeGreaterThanOrEqual(2);
    expect(
      managers.some((manager) => reportsOf(manager.id).length === 0),
    ).toBe(true);
  });

  it("has a user who is already deactivated", () => {
    expect(
      SEED_ACCOUNTS.some(
        (candidate) =>
          candidate.role === ROLES.USER &&
          candidate.status === USER_STATUS.DEACTIVATED,
      ),
    ).toBe(true);
  });

  it("has a user whose manager is deactivated", () => {
    const orphaned = SEED_ACCOUNTS.filter((candidate) => {
      const manager = SEED_ACCOUNTS.find(
        (other) => other.id === candidate.managerId,
      );
      return manager?.status === USER_STATUS.DEACTIVATED;
    });
    expect(orphaned.length).toBeGreaterThan(0);
  });

  it("has a user that nobody manages", () => {
    expect(
      SEED_ACCOUNTS.some(
        (candidate) =>
          candidate.role === ROLES.USER && candidate.managerId === null,
      ),
    ).toBe(true);
  });
});

describe("seeded accounts match the scenarios", () => {
  const anna = account("anna@example.com");

  it("scenario 7: Anna has exactly four direct reports", () => {
    expect(anna.role).toBe(ROLES.MANAGER);
    expect(reportsOf(anna.id)).toHaveLength(4);
  });

  it("scenario 7: Dmytro reports to somebody else", () => {
    const dmytro = account("dmytro@example.com");
    expect(dmytro.managerId).not.toBeNull();
    expect(dmytro.managerId).not.toBe(anna.id);
  });

  it("scenario 12: Olena is an active user under Anna", () => {
    const olena = account("olena@example.com");
    expect(olena.role).toBe(ROLES.USER);
    expect(olena.status).toBe(USER_STATUS.ACTIVE);
    expect(olena.managerId).toBe(anna.id);
  });

  it("scenario 11: Ivan is IT and there is another IT to deactivate", () => {
    expect(account("ivan@example.com").role).toBe(ROLES.IT);
    expect(account("iryna@example.com").role).toBe(ROLES.IT);
  });
});
