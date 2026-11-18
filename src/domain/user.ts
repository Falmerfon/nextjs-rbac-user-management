import type { Role } from "@/permissions/roles";

export const USER_STATUS = {
  ACTIVE: "active",
  DEACTIVATED: "deactivated",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

/** Someone who logs into this app. Not to be confused with a Client. */
export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
  /** The user who manages this person, or null when nobody does. */
  managerId: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
}
