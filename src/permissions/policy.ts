import { USER_STATUS, type User } from "@/domain/user";
import {
  ROLE_DEFINITIONS,
  hasCapability,
  type Capability,
  type Role,
} from "./roles";

/**
 * Every decision about who may do what with users and content is made in this
 * file. The functions are pure: whatever stored state a decision needs, such as
 * how many active accounts a role has, is passed in by the caller.
 *
 * Callers translate a denial into HTTP. This file knows nothing about requests.
 */

export type DenyCode =
  | "ACTOR_INACTIVE"
  | "FORBIDDEN"
  | "NOT_A_DIRECT_REPORT"
  | "LAST_ACTIVE_ACCOUNT"
  | "CANNOT_DEACTIVATE_SELF"
  | "CANNOT_CHANGE_OWN_ROLE";

export type Decision =
  | { allowed: true }
  | { allowed: false; code: DenyCode; message: string };

/** The part of a user the policy needs to know about whoever is acting. */
export type Actor = Pick<User, "id" | "role" | "status">;

/** The fields an update can touch. */
export type UserChange = Partial<
  Pick<User, "fullName" | "email" | "role" | "status">
>;

/** How many active accounts currently have the given role. */
export type ActiveCount = (role: Role) => number;

const allow = (): Decision => ({ allowed: true });

const deny = (code: DenyCode, message: string): Decision => ({
  allowed: false,
  code,
  message,
});

/**
 * Backstop for rule 5. The session layer already refuses a deactivated
 * account, so this only matters if a caller forgets to.
 */
function rejectInactive(actor: Actor): Decision | null {
  return actor.status === USER_STATUS.ACTIVE
    ? null
    : deny("ACTOR_INACTIVE", "This account is deactivated.");
}

/** A direct report has managerId equal to the actor's id. Never the actor. */
function isDirectReport(actor: Actor, target: Pick<User, "id" | "managerId">) {
  return target.id !== actor.id && target.managerId === actor.id;
}

/**
 * Shared by viewing and editing: a role with the `all` capability covers every
 * user, a role with only the `reports` capability covers its direct reports.
 */
function checkScope(
  actor: Actor,
  target: Pick<User, "id" | "managerId">,
  capabilities: { all: Capability; reports: Capability },
  verb: "view" | "edit",
): Decision {
  if (hasCapability(actor.role, capabilities.all)) return allow();
  if (hasCapability(actor.role, capabilities.reports)) {
    return isDirectReport(actor, target)
      ? allow()
      : deny("NOT_A_DIRECT_REPORT", `You can only ${verb} your direct reports.`);
  }
  return deny("FORBIDDEN", `Your role cannot ${verb} users.`);
}

export function authorizeContentView(actor: Actor): Decision {
  return (
    rejectInactive(actor) ??
    (hasCapability(actor.role, "content:view")
      ? allow()
      : deny("FORBIDDEN", "Your role cannot view content."))
  );
}

/** Gate for the /manage-users page and the list endpoint. */
export function authorizeUserManagement(actor: Actor): Decision {
  return (
    rejectInactive(actor) ??
    (hasCapability(actor.role, "users:read:all") ||
    hasCapability(actor.role, "users:read:reports")
      ? allow()
      : deny("FORBIDDEN", "Your role cannot manage users."))
  );
}

/** Also used to filter the user list: a user is listed only if this allows. */
export function authorizeUserView(
  actor: Actor,
  target: Pick<User, "id" | "managerId">,
): Decision {
  return (
    rejectInactive(actor) ??
    checkScope(
      actor,
      target,
      { all: "users:read:all", reports: "users:read:reports" },
      "view",
    )
  );
}

export function authorizeUserCreate(actor: Actor): Decision {
  return (
    rejectInactive(actor) ??
    (hasCapability(actor.role, "users:create")
      ? allow()
      : deny("FORBIDDEN", "Your role cannot create users."))
  );
}

/**
 * Decides whether `actor` may apply `change` to `target`.
 *
 * Only fields whose value differs from the target's current one count as a
 * change, so a form that resubmits unchanged fields is not penalised.
 *
 * Checks run in this order, and the first failure is returned:
 *   1. Capability and scope (rules 1 and 2).
 *   2. The last-active-account rule (rule 4).
 *   3. The self-protection rules (rule 3).
 *   4. The actor must be able to see the target at all.
 * Rule 4 comes before rule 3 on purpose. When the actor is the last active IT
 * and deactivates themselves, the reason that matters is the system-wide one.
 * With another IT still active, the same request fails on the self rule.
 *
 * Step 4 is last so that a refused change names the specific reason. It exists
 * for the request that changes nothing: without it, a manager could resend a
 * stranger's current values and get the stranger's record back.
 */
export function authorizeUserUpdate(
  actor: Actor,
  target: User,
  change: UserChange,
  activeCount: ActiveCount,
): Decision {
  const blocked = rejectInactive(actor);
  if (blocked) return blocked;

  const nextRole = change.role ?? target.role;
  const nextStatus = change.status ?? target.status;
  const changesRole = nextRole !== target.role;
  const changesStatus = nextStatus !== target.status;
  const changesProfile =
    (change.fullName ?? target.fullName) !== target.fullName ||
    (change.email ?? target.email) !== target.email;

  // 1. Capability and scope.
  if (changesRole && !hasCapability(actor.role, "users:change-role")) {
    return deny("FORBIDDEN", "Your role cannot change roles.");
  }
  if (changesStatus && !hasCapability(actor.role, "users:change-status")) {
    return deny("FORBIDDEN", "Your role cannot activate or deactivate users.");
  }
  if (changesProfile) {
    const scope = checkScope(
      actor,
      target,
      {
        all: "users:edit-profile:all",
        reports: "users:edit-profile:reports",
      },
      "edit",
    );
    if (!scope.allowed) return scope;
  }

  // 2. The system keeps its minimum of active accounts for each role.
  const leavesActiveSet =
    target.status === USER_STATUS.ACTIVE &&
    (nextStatus !== USER_STATUS.ACTIVE || nextRole !== target.role);
  const { label, minActiveAccounts } = ROLE_DEFINITIONS[target.role];
  if (
    leavesActiveSet &&
    minActiveAccounts > 0 &&
    activeCount(target.role) - 1 < minActiveAccounts
  ) {
    const plural = minActiveAccounts === 1 ? "" : "s";
    return deny(
      "LAST_ACTIVE_ACCOUNT",
      `The system must keep at least ${minActiveAccounts} active ${label} account${plural}.`,
    );
  }

  // 3. Nobody deactivates or changes their own account. With roles that are
  // not hierarchical, any change to your own role counts as a demotion.
  if (actor.id === target.id) {
    if (changesStatus && nextStatus !== USER_STATUS.ACTIVE) {
      return deny(
        "CANNOT_DEACTIVATE_SELF",
        "You cannot deactivate your own account.",
      );
    }
    if (changesRole) {
      return deny("CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role.");
    }
  }

  // 4. Reaching the target at all.
  return authorizeUserView(actor, target);
}
