import { z } from "zod";
import { isRole, type Role } from "@/permissions/roles";
import { USER_STATUS, type UserStatus } from "./user";

const fullName = z.string().trim().min(1, "Full name is required").max(100);

/** Trimmed and lower-cased, so "Anna@Example.com " and "anna@example.com" match. */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));

const role = z.custom<Role>(isRole, "Unknown role");

const status = z.custom<UserStatus>(
  (value) => Object.values(USER_STATUS).some((known) => known === value),
  "Unknown status",
);

/**
 * Strict on purpose: a key that is not listed, such as `id`, `status` or
 * `password` on an update, is rejected instead of silently ignored.
 */
export const createUserSchema = z.strictObject({
  fullName,
  email,
  password: z.string().min(6, "Password needs at least 6 characters").max(128),
  role,
  managerId: z.string().min(1).nullable().default(null),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * The only fields an update can touch. managerId is not one of them: the task
 * gives nobody the right to reassign a user.
 */
export const updateUserSchema = z
  .strictObject({
    fullName: fullName.optional(),
    email: email.optional(),
    role: role.optional(),
    status: status.optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), {
    message: "Provide at least one field to change",
  });

export type UserUpdateInput = z.infer<typeof updateUserSchema>;

/** Turns a zod error into short "field: message" lines for an API response. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}
