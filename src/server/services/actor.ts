import "server-only";
import { USER_STATUS } from "@/domain/user";
import type { Actor } from "@/permissions/policy";
import type { Store } from "../store";

/**
 * The acting user as the store has them right now.
 *
 * A route reads the session, then awaits (for the request body, for params)
 * before it calls a service. A deactivation or a role change can land in that
 * gap, and the snapshot the route holds is then out of date. Services call this
 * first, in the same synchronous run as the policy decision and the write, so no
 * decision uses an older picture of who is acting.
 *
 * An actor the store does not know counts as deactivated.
 */
export function currentActor(store: Store, snapshot: Actor): Actor {
  const stored = store.users.get(snapshot.id);
  return stored
    ? { id: stored.id, role: stored.role, status: stored.status }
    : { ...snapshot, status: USER_STATUS.DEACTIVATED };
}
