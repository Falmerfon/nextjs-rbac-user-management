import { requireUser } from "@/server/current-user";
import { respond } from "@/server/http";
import { createUser, listUsers } from "@/server/services/users";
import { getStore } from "@/server/store";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  return respond(listUsers(getStore(), auth.user), (users) => ({ users }));
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // The service validates the body itself, so malformed JSON just becomes
  // `undefined` and fails validation there.
  const body: unknown = await request.json().catch(() => undefined);
  return respond(createUser(getStore(), auth.user, body), (user) => ({ user }), 201);
}
