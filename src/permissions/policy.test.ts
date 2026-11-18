import { describe, expect, it } from "vitest";
import { USER_STATUS } from "@/domain/user";
import {
  authorizeContentView,
  authorizeUserCreate,
  authorizeUserManagement,
  authorizeUserUpdate,
  authorizeUserView,
  type ActiveCount,
  type Decision,
  type DenyCode,
} from "./policy";
import { ALL_ROLES, ROLES, type Role } from "./roles";
import { makeUser } from "./test-utils";

function activeCounts(counts: Partial<Record<Role, number>> = {}): ActiveCount {
  return (role) => counts[role] ?? 0;
}

/** Enough active IT accounts that the last-account rule never applies. */
const PLENTY_OF_IT = activeCounts({ [ROLES.IT]: 5 });

function expectAllowed(decision: Decision) {
  expect(decision).toEqual({ allowed: true });
}

function expectDenied(decision: Decision, code: DenyCode) {
  expect(decision).toMatchObject({ allowed: false, code });
}

interface Expectations {
  createUsers: boolean;
  editAnyProfile: boolean;
  editReportProfile: boolean;
  changeRole: boolean;
  changeStatus: boolean;
  viewContent: boolean;
  openUserManagement: boolean;
}

/**
 * The table from the task, read literally. Typed as Record<Role, ...> so a new
 * role fails the type check until it has a row here.
 */
const MATRIX: Record<Role, Expectations> = {
  [ROLES.IT]: {
    createUsers: true,
    editAnyProfile: true,
    editReportProfile: true,
    changeRole: true,
    changeStatus: true,
    viewContent: false,
    openUserManagement: true,
  },
  [ROLES.MANAGER]: {
    createUsers: false,
    editAnyProfile: false,
    editReportProfile: true,
    changeRole: false,
    changeStatus: false,
    viewContent: true,
    openUserManagement: true,
  },
  [ROLES.USER]: {
    createUsers: false,
    editAnyProfile: false,
    editReportProfile: false,
    changeRole: false,
    changeStatus: false,
    viewContent: true,
    openUserManagement: false,
  },
};

describe.each(ALL_ROLES)("permission matrix: %s", (role) => {
  const expected = MATRIX[role];
  const actor = makeUser({ role });
  const stranger = makeUser();
  const report = makeUser({ managerId: actor.id });

  it("create users", () => {
    expect(authorizeUserCreate(actor).allowed).toBe(expected.createUsers);
  });

  it("edit the profile of any user", () => {
    const decision = authorizeUserUpdate(
      actor,
      stranger,
      { fullName: "New Name" },
      PLENTY_OF_IT,
    );
    expect(decision.allowed).toBe(expected.editAnyProfile);
  });

  it("edit the profile of a direct report", () => {
    const decision = authorizeUserUpdate(
      actor,
      report,
      { email: "new@example.test" },
      PLENTY_OF_IT,
    );
    expect(decision.allowed).toBe(expected.editReportProfile);
  });

  it("change a role", () => {
    const decision = authorizeUserUpdate(
      actor,
      report,
      { role: ROLES.MANAGER },
      PLENTY_OF_IT,
    );
    expect(decision.allowed).toBe(expected.changeRole);
  });

  it("change a status", () => {
    const decision = authorizeUserUpdate(
      actor,
      report,
      { status: USER_STATUS.DEACTIVATED },
      PLENTY_OF_IT,
    );
    expect(decision.allowed).toBe(expected.changeStatus);
  });

  it("view content", () => {
    expect(authorizeContentView(actor).allowed).toBe(expected.viewContent);
  });

  it("open the user management page", () => {
    expect(authorizeUserManagement(actor).allowed).toBe(
      expected.openUserManagement,
    );
  });
});

describe("rule 1: only IT creates users, changes roles and changes statuses", () => {
  it("refuses a manager who tries to change a direct report's role", () => {
    const anna = makeUser({ role: ROLES.MANAGER });
    const report = makeUser({ managerId: anna.id });
    expectDenied(
      authorizeUserUpdate(anna, report, { role: ROLES.IT }, PLENTY_OF_IT),
      "FORBIDDEN",
    );
  });

  it("refuses a manager who tries to deactivate a direct report", () => {
    const anna = makeUser({ role: ROLES.MANAGER });
    const report = makeUser({ managerId: anna.id });
    expectDenied(
      authorizeUserUpdate(
        anna,
        report,
        { status: USER_STATUS.DEACTIVATED },
        PLENTY_OF_IT,
      ),
      "FORBIDDEN",
    );
  });
});

describe("rule 2: a manager edits only their own direct reports", () => {
  const anna = makeUser({ role: ROLES.MANAGER });
  const otherManager = makeUser({ role: ROLES.MANAGER });

  it("allows name and email changes for a direct report", () => {
    const report = makeUser({ managerId: anna.id });
    expectAllowed(
      authorizeUserUpdate(
        anna,
        report,
        { fullName: "Renamed", email: "renamed@example.test" },
        PLENTY_OF_IT,
      ),
    );
  });

  it("allows it for a deactivated direct report too", () => {
    const report = makeUser({
      managerId: anna.id,
      status: USER_STATUS.DEACTIVATED,
    });
    expectAllowed(
      authorizeUserUpdate(anna, report, { fullName: "Renamed" }, PLENTY_OF_IT),
    );
  });

  it("refuses a user who reports to another manager (scenario 7)", () => {
    const dmytro = makeUser({ managerId: otherManager.id });
    expectDenied(
      authorizeUserUpdate(anna, dmytro, { fullName: "Nope" }, PLENTY_OF_IT),
      "NOT_A_DIRECT_REPORT",
    );
  });

  it("refuses another manager", () => {
    expectDenied(
      authorizeUserUpdate(
        anna,
        otherManager,
        { fullName: "Nope" },
        PLENTY_OF_IT,
      ),
      "NOT_A_DIRECT_REPORT",
    );
  });

  it("refuses even a request that changes nothing on a user from another team", () => {
    const dmytro = makeUser({ managerId: otherManager.id });
    expectDenied(
      authorizeUserUpdate(
        anna,
        dmytro,
        { fullName: dmytro.fullName, role: dmytro.role },
        PLENTY_OF_IT,
      ),
      "NOT_A_DIRECT_REPORT",
    );
  });

  it("does not care what role the direct report has", () => {
    // The scope is managerId, not "users with the user role". Limiting reports
    // to one role would break the moment a fourth role appears.
    const juniorManager = makeUser({ role: ROLES.MANAGER, managerId: anna.id });
    expectAllowed(
      authorizeUserUpdate(anna, juniorManager, { fullName: "Renamed" }, PLENTY_OF_IT),
    );
  });

  it("still refuses another manager who is not a direct report", () => {
    const peer = makeUser({ role: ROLES.MANAGER, managerId: otherManager.id });
    expectDenied(
      authorizeUserUpdate(anna, peer, { fullName: "Nope" }, PLENTY_OF_IT),
      "NOT_A_DIRECT_REPORT",
    );
  });

  it("refuses a user nobody manages", () => {
    const unassigned = makeUser({ managerId: null });
    expectDenied(
      authorizeUserUpdate(anna, unassigned, { email: "x@y.test" }, PLENTY_OF_IT),
      "NOT_A_DIRECT_REPORT",
    );
  });

  it("refuses the manager's own profile, even if their managerId points at themselves", () => {
    const selfManaged = { ...anna, managerId: anna.id };
    expectDenied(
      authorizeUserUpdate(
        anna,
        selfManaged,
        { fullName: "Nope" },
        PLENTY_OF_IT,
      ),
      "NOT_A_DIRECT_REPORT",
    );
  });

  it("refuses a manager who gives themselves the IT role (scenario 8)", () => {
    expectDenied(
      authorizeUserUpdate(anna, anna, { role: ROLES.IT }, PLENTY_OF_IT),
      "FORBIDDEN",
    );
  });

  it("does not treat resubmitted, unchanged fields as a change", () => {
    const report = makeUser({ managerId: anna.id });
    expectAllowed(
      authorizeUserUpdate(
        anna,
        report,
        { fullName: "Renamed", role: report.role, status: report.status },
        PLENTY_OF_IT,
      ),
    );
  });
});

describe("rule 3: nobody deactivates or demotes their own account", () => {
  const ivan = makeUser({ role: ROLES.IT });
  const twoItAccounts = activeCounts({ [ROLES.IT]: 2 });

  it("refuses self-deactivation", () => {
    expectDenied(
      authorizeUserUpdate(
        ivan,
        ivan,
        { status: USER_STATUS.DEACTIVATED },
        twoItAccounts,
      ),
      "CANNOT_DEACTIVATE_SELF",
    );
  });

  it("refuses any change to their own role", () => {
    expectDenied(
      authorizeUserUpdate(ivan, ivan, { role: ROLES.MANAGER }, twoItAccounts),
      "CANNOT_CHANGE_OWN_ROLE",
    );
  });

  it("still lets IT edit their own name and email", () => {
    expectAllowed(
      authorizeUserUpdate(
        ivan,
        ivan,
        { fullName: "Ivan P.", email: "ivan.p@example.test" },
        twoItAccounts,
      ),
    );
  });
});

describe("rule 4: the system never ends up with zero active IT accounts", () => {
  const ivan = makeUser({ role: ROLES.IT });
  const lastIt = activeCounts({ [ROLES.IT]: 1 });

  it("refuses to deactivate the last active IT account", () => {
    expectDenied(
      authorizeUserUpdate(
        ivan,
        ivan,
        { status: USER_STATUS.DEACTIVATED },
        lastIt,
      ),
      "LAST_ACTIVE_ACCOUNT",
    );
  });

  it("refuses to demote the last active IT account", () => {
    expectDenied(
      authorizeUserUpdate(ivan, ivan, { role: ROLES.MANAGER }, lastIt),
      "LAST_ACTIVE_ACCOUNT",
    );
  });

  it("decides from the counts, not from who is acting", () => {
    const otherIt = makeUser({ role: ROLES.IT });
    expectDenied(
      authorizeUserUpdate(
        ivan,
        otherIt,
        { status: USER_STATUS.DEACTIVATED },
        lastIt,
      ),
      "LAST_ACTIVE_ACCOUNT",
    );
  });

  it("refuses a combined demotion and deactivation of the last one", () => {
    const otherIt = makeUser({ role: ROLES.IT });
    expectDenied(
      authorizeUserUpdate(
        ivan,
        otherIt,
        { role: ROLES.USER, status: USER_STATUS.DEACTIVATED },
        lastIt,
      ),
      "LAST_ACTIVE_ACCOUNT",
    );
  });

  it("allows deactivating an IT account while another stays active", () => {
    const otherIt = makeUser({ role: ROLES.IT });
    expectAllowed(
      authorizeUserUpdate(
        ivan,
        otherIt,
        { status: USER_STATUS.DEACTIVATED },
        activeCounts({ [ROLES.IT]: 2 }),
      ),
    );
  });

  it("does not count an IT account that is already deactivated", () => {
    const sleepingIt = makeUser({
      role: ROLES.IT,
      status: USER_STATUS.DEACTIVATED,
    });
    expectAllowed(
      authorizeUserUpdate(ivan, sleepingIt, { role: ROLES.USER }, lastIt),
    );
  });

  it("allows reactivating an IT account", () => {
    const sleepingIt = makeUser({
      role: ROLES.IT,
      status: USER_STATUS.DEACTIVATED,
    });
    expectAllowed(
      authorizeUserUpdate(
        ivan,
        sleepingIt,
        { status: USER_STATUS.ACTIVE },
        lastIt,
      ),
    );
  });

  it("applies only to roles that require a minimum", () => {
    const onlyManager = makeUser({ role: ROLES.MANAGER });
    expectAllowed(
      authorizeUserUpdate(
        ivan,
        onlyManager,
        { status: USER_STATUS.DEACTIVATED },
        activeCounts({ [ROLES.IT]: 1, [ROLES.MANAGER]: 1 }),
      ),
    );
  });
});

describe("scenario 11: the two self-deactivation failures differ", () => {
  it("fails on the self rule first, then on the last-account rule", () => {
    const ivan = makeUser({ role: ROLES.IT });
    const otherIt = makeUser({ role: ROLES.IT });
    const deactivate = { status: USER_STATUS.DEACTIVATED };

    expectDenied(
      authorizeUserUpdate(
        ivan,
        ivan,
        deactivate,
        activeCounts({ [ROLES.IT]: 2 }),
      ),
      "CANNOT_DEACTIVATE_SELF",
    );
    expectAllowed(
      authorizeUserUpdate(
        ivan,
        otherIt,
        deactivate,
        activeCounts({ [ROLES.IT]: 2 }),
      ),
    );
    expectDenied(
      authorizeUserUpdate(
        ivan,
        ivan,
        deactivate,
        activeCounts({ [ROLES.IT]: 1 }),
      ),
      "LAST_ACTIVE_ACCOUNT",
    );
  });
});

describe("rule 5 backstop: a deactivated actor is refused everything", () => {
  it.each(ALL_ROLES)("as %s", (role) => {
    const actor = makeUser({ role, status: USER_STATUS.DEACTIVATED });
    const target = makeUser({ managerId: actor.id });

    const decisions = [
      authorizeContentView(actor),
      authorizeUserManagement(actor),
      authorizeUserCreate(actor),
      authorizeUserView(actor, target),
      authorizeUserUpdate(actor, target, { fullName: "X" }, PLENTY_OF_IT),
    ];
    for (const decision of decisions) expectDenied(decision, "ACTOR_INACTIVE");
  });
});

describe("viewing users", () => {
  const anna = makeUser({ role: ROLES.MANAGER });
  const ivan = makeUser({ role: ROLES.IT });
  const report = makeUser({ managerId: anna.id });
  const stranger = makeUser({ managerId: makeUser().id });

  it("shows IT everyone", () => {
    expectAllowed(authorizeUserView(ivan, report));
    expectAllowed(authorizeUserView(ivan, stranger));
  });

  it("shows a manager their direct reports and nobody else", () => {
    expectAllowed(authorizeUserView(anna, report));
    expectDenied(authorizeUserView(anna, stranger), "NOT_A_DIRECT_REPORT");
    expectDenied(authorizeUserView(anna, anna), "NOT_A_DIRECT_REPORT");
  });

  it("shows a plain user no one", () => {
    const olena = makeUser({ role: ROLES.USER });
    expectDenied(authorizeUserView(olena, report), "FORBIDDEN");
  });
});

describe("content", () => {
  it("is refused to IT with a clear reason", () => {
    expectDenied(
      authorizeContentView(makeUser({ role: ROLES.IT })),
      "FORBIDDEN",
    );
  });
});
