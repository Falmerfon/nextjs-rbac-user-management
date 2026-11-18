import "server-only";
import { forbidden, notFound, redirect } from "next/navigation";
import type { User } from "@/domain/user";
import type { Actor, Decision } from "@/permissions/policy";
import { getCurrentUser } from "./current-user";
import type { ServiceResult } from "./services/result";

/**
 * What every protected page starts with. Not a layout: a layout is not rendered
 * again on client-side navigation, so a check there would not run on every
 * route change. Each page calls one of these itself.
 */

/** The logged-in user, or a redirect to /login. */
export async function requirePageUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The logged-in user, if the policy allows this page. Someone who is logged in
 * but not allowed gets the 403 page. They are not redirected anywhere, so there
 * is no loop to get stuck in.
 */
export async function requireAllowed(
  authorize: (actor: Actor) => Decision,
): Promise<User> {
  const user = await requirePageUser();
  if (!authorize(user).allowed) forbidden();
  return user;
}

/** The value of a service result, or the 404 or 403 page for a failure. */
export function orInterrupt<T>(result: ServiceResult<T>): T {
  if (result.ok) return result.value;
  if (result.code === "NOT_FOUND") notFound();
  forbidden();
}
