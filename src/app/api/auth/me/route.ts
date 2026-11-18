import { requireUser } from "@/server/current-user";
import { json } from "@/server/http";

export async function GET() {
  const auth = await requireUser();
  return auth.ok ? json({ user: auth.user }) : auth.response;
}
