/**
 * The only file that names roles. To add a role, add it to ROLES and give it
 * an entry in ROLE_DEFINITIONS. ROLE_DEFINITIONS is a Record<Role, ...>, so the
 * compiler rejects a role without a definition.
 *
 * Roles are not hierarchical: a role has exactly the capabilities listed for
 * it and nothing is inherited.
 */
export const ROLES = {
  IT: "it",
  MANAGER: "manager",
  USER: "user",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return ALL_ROLES.some((role) => role === value);
}

/**
 * What a role may do. The `:all` and `:reports` pairs differ only in scope.
 * `:reports` means direct reports, the users whose managerId is the actor's id.
 */
export type Capability =
  | "content:view"
  | "users:create"
  | "users:read:all"
  | "users:read:reports"
  | "users:edit-profile:all"
  | "users:edit-profile:reports"
  | "users:change-role"
  | "users:change-status";

export interface RoleDefinition {
  /** Shown in the UI and in error messages. */
  label: string;
  /** Where the user lands after login. */
  homePath: string;
  capabilities: readonly Capability[];
  /**
   * The system must always keep at least this many active accounts with the
   * role. Anything that would remove the last one is refused.
   */
  minActiveAccounts: number;
  /**
   * Whether someone whose edit rights stop at their direct reports may edit an
   * account with this role. The task says a manager edits their own reports,
   * "not other managers". IT can change a report's role and `managerId` stays,
   * so a manager can be left with a "report" who is a manager or IT. That
   * account is then edited by IT only.
   */
  editableAsReport: boolean;
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  [ROLES.IT]: {
    label: "IT",
    homePath: "/manage-users",
    capabilities: [
      "users:create",
      "users:read:all",
      "users:edit-profile:all",
      "users:change-role",
      "users:change-status",
    ],
    minActiveAccounts: 1,
    editableAsReport: false,
  },
  [ROLES.MANAGER]: {
    label: "Manager",
    homePath: "/content",
    capabilities: [
      "content:view",
      "users:read:reports",
      "users:edit-profile:reports",
    ],
    minActiveAccounts: 0,
    editableAsReport: false,
  },
  [ROLES.USER]: {
    label: "User",
    homePath: "/content",
    capabilities: ["content:view"],
    minActiveAccounts: 0,
    editableAsReport: true,
  },
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_DEFINITIONS[role].capabilities.includes(capability);
}
