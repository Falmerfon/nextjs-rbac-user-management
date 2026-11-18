import "server-only";
import type { User } from "@/domain/user";
import { authorizeContentView, type Actor } from "@/permissions/policy";
import type { Store } from "../store";
import { currentActor } from "./actor";
import { fail, ok, refusal, type ServiceResult } from "./result";

export interface MyProfile {
  user: User;
  /** Full name of the user's manager, or null when nobody manages them. */
  managerName: string | null;
}

/**
 * The /content/me page. It is one of the "content pages", so the same
 * permission as the client table applies. IT has no profile page.
 */
export function getMyProfile(store: Store, snapshot: Actor): ServiceResult<MyProfile> {
  const actor = currentActor(store, snapshot);
  const gate = refusal(authorizeContentView(actor));
  if (gate) return gate;

  const user = store.users.get(actor.id);
  if (!user) return fail("NOT_FOUND", "User not found.");

  const manager = user.managerId ? store.users.get(user.managerId) : undefined;
  return ok({ user: { ...user }, managerName: manager?.fullName ?? null });
}
