import { requireUser } from "@/server/current-user";
import { respond } from "@/server/http";
import { getClient } from "@/server/services/clients";
import { getStore } from "@/server/store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/clients/[id]">,
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  return respond(getClient(getStore(), auth.user, id), (client) => ({ client }));
}
