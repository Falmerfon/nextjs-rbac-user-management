import { requireUser } from "@/server/current-user";
import { respond } from "@/server/http";
import { getUser, updateUser } from "@/server/services/users";
import { getStore } from "@/server/store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/users/[id]">,
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  return respond(getUser(getStore(), auth.user, id), (user) => ({ user }));
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/users/[id]">,
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => undefined);
  return respond(updateUser(getStore(), auth.user, id, body), (user) => ({ user }));
}
