import { USER_STATUS, type User } from "@/domain/user";
import { ROLES } from "./roles";

let counter = 0;

/** Builds a User for tests. Defaults to an active, unassigned user. */
export function makeUser(overrides: Partial<User> = {}): User {
  counter += 1;
  const id = overrides.id ?? `user-${counter}`;
  return {
    id,
    fullName: `Person ${id}`,
    email: `${id}@example.test`,
    role: ROLES.USER,
    status: USER_STATUS.ACTIVE,
    managerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
