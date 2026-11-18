import { getCurrentUser } from "@/server/current-user";
import { jsonError } from "@/server/http";

export async function GET() {
  const user = await getCurrentUser();
  return user
    ? Response.json({ user })
    : jsonError(401, "UNAUTHENTICATED", "You are not logged in.");
}
