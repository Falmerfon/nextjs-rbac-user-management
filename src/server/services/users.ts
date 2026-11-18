import "server-only";
import { randomBytes } from "node:crypto";
import { USER_STATUS, type User } from "@/domain/user";
import {
  createUserSchema,
  describeIssues,
  updateUserSchema,
} from "@/domain/user-schemas";
import {
  authorizeUserCreate,
  authorizeUserManagement,
  authorizeUserUpdate,
  authorizeUserView,
  type ActiveCount,
  type Actor,
} from "@/permissions/policy";
import { hasCapability } from "@/permissions/roles";
import { destroySessionsForUser } from "../auth";
import type { Store } from "../store";
import { fail, ok, refusal, type ServiceResult } from "./result";

/**
 * Every function here takes the acting user first and asks the policy before it
 * touches anything. The route handlers contain no permission logic of their own.
 *
 * Two habits keep the checks honest:
 *  - Whatever is returned is a copy, never an object that lives in the store.
 *  - Everything between a policy decision and the write is synchronous. With no
 *    `await` in between, no other request can change the state the decision
 *    relied on, such as the number of active IT accounts.
 */

function activeCounter(store: Store): ActiveCount {
  return (role) => {
    let count = 0;
    for (const user of store.users.values()) {
      if (user.role === role && user.status === USER_STATUS.ACTIVE) count += 1;
    }
    return count;
  };
}

function isEmailTaken(store: Store, email: string, exceptId?: string): boolean {
  for (const user of store.users.values()) {
    if (user.id !== exceptId && user.email.toLowerCase() === email) return true;
  }
  return false;
}

function newUserId(store: Store): string {
  let id: string;
  do {
    id = `usr_${randomBytes(5).toString("hex")}`;
  } while (store.users.has(id));
  return id;
}

const byCreation = (a: User, b: User) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Users the actor may see: everyone for IT, direct reports for a manager. */
export function listUsers(store: Store, actor: Actor): ServiceResult<User[]> {
  const gate = refusal(authorizeUserManagement(actor));
  if (gate) return gate;

  const visible = [...store.users.values()]
    .filter((user) => authorizeUserView(actor, user).allowed)
    .sort(byCreation)
    .map((user) => ({ ...user }));
  return ok(visible);
}

export function getUser(
  store: Store,
  actor: Actor,
  id: string,
): ServiceResult<User> {
  // The management check comes first, so a role with no access gets the same
  // answer for a real id and a made-up one.
  const gate = refusal(authorizeUserManagement(actor));
  if (gate) return gate;

  const target = store.users.get(id);
  if (!target) return fail("NOT_FOUND", "User not found.");

  const view = refusal(authorizeUserView(actor, target));
  if (view) return view;

  return ok({ ...target });
}

export function createUser(
  store: Store,
  actor: Actor,
  input: unknown,
  now: number = Date.now(),
): ServiceResult<User> {
  const gate = refusal(authorizeUserCreate(actor));
  if (gate) return gate;

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "The request is invalid.", describeIssues(parsed.error));
  }
  const data = parsed.data;

  if (isEmailTaken(store, data.email)) {
    return fail("EMAIL_TAKEN", "Another user already has this email.");
  }

  if (data.managerId !== null) {
    const manager = store.users.get(data.managerId);
    const canManage =
      manager !== undefined &&
      manager.status === USER_STATUS.ACTIVE &&
      hasCapability(manager.role, "users:read:reports");
    if (!canManage) {
      return fail(
        "INVALID_MANAGER",
        "The manager must be an active user whose role can have direct reports.",
      );
    }
  }

  const user: User = {
    id: newUserId(store),
    fullName: data.fullName,
    email: data.email,
    role: data.role,
    status: USER_STATUS.ACTIVE,
    managerId: data.managerId,
    createdAt: new Date(now).toISOString(),
  };
  store.users.set(user.id, user);
  store.passwords.set(user.id, data.password);
  return ok({ ...user });
}

export function updateUser(
  store: Store,
  actor: Actor,
  id: string,
  input: unknown,
): ServiceResult<User> {
  const gate = refusal(authorizeUserManagement(actor));
  if (gate) return gate;

  const target = store.users.get(id);
  if (!target) return fail("NOT_FOUND", "User not found.");

  // No separate "can the actor see this user" check here: authorizeUserUpdate
  // ends with one, after the checks that give a more specific reason.
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "The request is invalid.", describeIssues(parsed.error));
  }
  const change = parsed.data;

  const decision = refusal(
    authorizeUserUpdate(actor, target, change, activeCounter(store)),
  );
  if (decision) return decision;

  if (change.email !== undefined && isEmailTaken(store, change.email, target.id)) {
    return fail("EMAIL_TAKEN", "Another user already has this email.");
  }

  if (change.fullName !== undefined) target.fullName = change.fullName;
  if (change.email !== undefined) target.email = change.email;
  if (change.role !== undefined) target.role = change.role;
  if (change.status !== undefined) target.status = change.status;

  // resolveSession already refuses a deactivated user. Closing the sessions as
  // well keeps the store from holding logins that can never be used again.
  if (target.status === USER_STATUS.DEACTIVATED) {
    destroySessionsForUser(store, target.id);
  }

  return ok({ ...target });
}
