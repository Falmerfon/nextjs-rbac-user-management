import { requireUser } from "@/server/current-user";
import { respond } from "@/server/http";
import { listClients } from "@/server/services/clients";
import { getStore } from "@/server/store";

/** GET /api/clients?page=1&limit=25: one page of clients plus the total. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const query = Object.fromEntries(new URL(request.url).searchParams);
  return respond(listClients(getStore(), auth.user, query), (page) => page);
}
